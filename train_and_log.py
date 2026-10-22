"""
Gerçekçi SAC Eğitimi ve Canlı Timelapse Log Üretici
SAC ajanını 10.000 adım boyunca sıfırdan eğitir.
Eğitim esnasındaki GERÇEK bölümleri (episodes), ağırlık evrimini ve topun
kenardan düşüp masaya çarpma fiziğini (balistik yerçekimi) kaydeder.
"""

import os
import sys
import json
import math
import numpy as np
import torch
from stable_baselines3 import SAC

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

project_dir = r"c:\Users\hucks\OneDrive\Desktop\reinforcment learning"
sys.path.insert(0, project_dir)
os.chdir(project_dir)

from env import BallPlateEnv


def simulate_ballistic_fall(start_x, start_y, start_vx, start_vy, tilt_x, tilt_y, action, activations, episode_num, dt=1.0/30.0):
    """
    Top plaka kenarından çıktığında gerçek yerçekimiyle masaya düşüş fiziği.
    x, y: Plaka yüzeyindeki 2D koordinatlar (Three.js'te X ve Z)
    height: Dikey eksen (Three.js'te Y). Plaka seviyesi 0, masa seviyesi -0.20 m
    """
    frames = []
    cur_x = float(start_x)
    cur_y = float(start_y)
    cur_h = 0.0
    cur_vx = float(start_vx) * 0.95
    cur_vy = float(start_vy) * 0.95
    cur_vh = 0.0 # Dikey hız
    g = 9.81

    table_level = -0.22 # Masaya çarpma yüksekliği

    # 1. Havada serbest düşüş
    while cur_h > table_level and len(frames) < 12:
        cur_vh -= g * dt
        cur_h += cur_vh * dt
        cur_x += cur_vx * dt
        cur_y += cur_vy * dt

        frames.append({
            "ball_x": cur_x,
            "ball_y": cur_y,
            "ball_height": cur_h,
            "vx": cur_vx,
            "vy": cur_vy,
            "tilt_x": float(tilt_x),
            "tilt_y": float(tilt_y),
            "cmd_x": float(action[0]),
            "cmd_y": float(action[1]),
            "reward": -50.0,
            "activations": activations,
            "fell": True,
            "state": "falling",
            "episode": episode_num
        })

    # 2. Masaya hafif çarpma ve sekme (Bounce)
    cur_vh = -cur_vh * 0.35 # Ters yönde sekme
    for _ in range(4):
        cur_vh -= g * dt
        cur_h = max(table_level, cur_h + cur_vh * dt)
        cur_x += cur_vx * dt * 0.7
        cur_y += cur_vy * dt * 0.7

        frames.append({
            "ball_x": cur_x,
            "ball_y": cur_y,
            "ball_height": cur_h,
            "vx": cur_vx * 0.5,
            "vy": cur_vy * 0.5,
            "tilt_x": float(tilt_x),
            "tilt_y": float(tilt_y),
            "cmd_x": 0.0,
            "cmd_y": 0.0,
            "reward": -50.0,
            "activations": activations,
            "fell": True,
            "state": "bounced",
            "episode": episode_num
        })

    return frames


def simulate_ball_respawn(new_pos, tilt_x, tilt_y, activations, episode_num, dt=1.0/30.0):
    """
    Yukarıdaki hazneden plaka üzerine yeni topun serbest düşüp oturması (Respawn).
    """
    frames = []
    drop_h = 0.16 # 16 cm yukarıdan düşüş
    vh = 0.0
    g = 9.81

    while drop_h > 0.0:
        vh -= g * dt
        drop_h += vh * dt
        if drop_h <= 0.0:
            drop_h = 0.0

        frames.append({
            "ball_x": float(new_pos[0]),
            "ball_y": float(new_pos[1]),
            "ball_height": float(drop_h),
            "vx": 0.0,
            "vy": 0.0,
            "tilt_x": float(tilt_x),
            "tilt_y": float(tilt_y),
            "cmd_x": 0.0,
            "cmd_y": 0.0,
            "reward": 0.0,
            "activations": activations,
            "fell": False,
            "state": "respawning",
            "episode": episode_num
        })

    # 2 kare yüzeyde oturma / titreşim
    for _ in range(2):
        frames.append({
            "ball_x": float(new_pos[0]),
            "ball_y": float(new_pos[1]),
            "ball_height": 0.0,
            "vx": 0.0,
            "vy": 0.0,
            "tilt_x": float(tilt_x),
            "tilt_y": float(tilt_y),
            "cmd_x": 0.0,
            "cmd_y": 0.0,
            "reward": 0.0,
            "activations": activations,
            "fell": False,
            "state": "settled",
            "episode": episode_num
        })

    return frames


def extract_weights(actor):
    w1 = actor.latent_pi[0].weight.data.cpu().numpy().tolist()
    w2 = actor.latent_pi[2].weight.data.cpu().numpy().tolist()
    w3 = actor.mu.weight.data.cpu().numpy().tolist()
    return [w1, w2, w3]


def get_forward_activations(actor, obs):
    obs_tensor = torch.as_tensor(obs, dtype=torch.float32).unsqueeze(0)
    with torch.no_grad():
        h1 = torch.relu(actor.latent_pi[0](obs_tensor))
        h2 = torch.relu(actor.latent_pi[2](h1))
        mu = actor.mu(h2)
        action = torch.tanh(mu).squeeze(0).numpy()

    return action, {
        "inputs": [float(x) for x in obs],
        "hidden1": [float(x) for x in h1.squeeze(0).numpy()],
        "hidden2": [float(x) for x in h2.squeeze(0).numpy()],
        "outputs": [float(x) for x in action]
    }


def record_eval_episode(actor, env, max_steps=300, seed=42, fixed_pos=None, episode_num=1):
    """
    Mevcut politika ile bir bölüm oynatır. Düşme olursa balistik düşüş ve respawn içerir.
    """
    if fixed_pos:
        obs, _ = env.reset(seed=seed, options={"pos": fixed_pos, "vel": [0.0, 0.0]})
    else:
        obs, _ = env.reset(seed=seed)

    traj = []
    L_limit = env.L - env.ball_radius

    for step_i in range(max_steps):
        action, activations = get_forward_activations(actor, obs)
        next_obs, reward, term, trunc, info = env.step(action)

        ball_x = float(env.pos[0])
        ball_y = float(env.pos[1])
        fell = bool(info.get("fell", False) or abs(ball_x) > L_limit or abs(ball_y) > L_limit)

        rec = {
            "ball_x": ball_x,
            "ball_y": ball_y,
            "ball_height": 0.0,
            "vx": float(env.vel[0]),
            "vy": float(env.vel[1]),
            "tilt_x": float(env.tilt[0]),
            "tilt_y": float(env.tilt[1]),
            "cmd_x": float(action[0]),
            "cmd_y": float(action[1]),
            "reward": float(reward),
            "activations": activations,
            "fell": False,
            "state": "rolling",
            "episode": episode_num
        }
        traj.append(rec)

        if fell:
            # Gerçek düşme sekansı
            fall_frames = simulate_ballistic_fall(
                ball_x, ball_y, env.vel[0], env.vel[1],
                env.tilt[0], env.tilt[1], action, activations, episode_num
            )
            traj.extend(fall_frames)

            # Respawn
            episode_num += 1
            new_pos = np.random.uniform(-0.06, 0.06, size=2).astype(np.float32)
            obs, _ = env.reset(options={"pos": new_pos, "vel": [0.0, 0.0]})

            respawn_frames = simulate_ball_respawn(
                new_pos, env.tilt[0], env.tilt[1], activations, episode_num
            )
            traj.extend(respawn_frames)
        else:
            obs = next_obs

    return traj


def main():
    print("=" * 65)
    print(" 🎯 SAC Modelini Eğitip Gerçek Dinamik Eğitim Akışını Logluyoruz")
    print("=" * 65)

    os.makedirs("logs", exist_ok=True)
    seed = 42
    np.random.seed(seed)
    torch.manual_seed(seed)

    env = BallPlateEnv()
    env.reset(seed=seed)

    policy_kwargs = dict(net_arch=[12, 12])
    model = SAC(
        policy="MlpPolicy",
        env=env,
        policy_kwargs=policy_kwargs,
        learning_rate=1e-3,
        learning_starts=100,
        batch_size=64,
        tau=0.015,
        gamma=0.98,
        ent_coef="auto",
        seed=seed,
        device="cpu",
        verbose=0
    )

    # 1. Checkpoint aşamaları (0, 500, 2000, 5000, 10000)
    stages = [0, 500, 2000, 5000, 10000]
    stage_data = {}

    current_steps = 0
    timeline_traj = []
    global_episode = 1

    # Aşama aşama eğit ve logla
    for target_step in stages:
        train_steps_needed = target_step - current_steps
        if train_steps_needed > 0:
            print(f"\n[Eğitim] {current_steps} -> {target_step} adımları eğitiliyor...")
            model.learn(total_timesteps=train_steps_needed, reset_num_timesteps=False)
            current_steps = target_step

        model.save(f"ckpt_{target_step}")
        actor = model.policy.actor
        actor.eval()
        weights = extract_weights(actor)

        # Bu aşama için sabit bir 300 adımlık evaluation traj
        eval_env = BallPlateEnv()
        fixed_start = [-0.075, 0.055]
        ckpt_traj = record_eval_episode(actor, eval_env, max_steps=300, seed=100 + target_step, fixed_pos=fixed_start, episode_num=global_episode)

        stage_data[target_step] = {
            "checkpoint": target_step,
            "weights": weights,
            "trajectory": ckpt_traj
        }

        # Bireysel log_N.json kaydet
        log_file = os.path.join("logs", f"log_{target_step}.json")
        with open(log_file, "w", encoding="utf-8") as f:
            json.dump({
                "checkpoint": target_step,
                "weights": weights,
                "trajectory": ckpt_traj[:300]
            }, f)

        print(f" -> {log_file} oluşturuldu (Kare: {len(ckpt_traj)})")

    # -----------------------------------------------------------------
    # BİRLEŞİK GERÇEKÇİ ZAMAN TÜNELİ (TIMELINE): 0 -> 10,000 Adım
    # -----------------------------------------------------------------
    # Her aşamadan gerçek sahneleri alıp sayacı canlı akıtır
    # Adım 0: Erken düşüşler (~75 kare)
    # Adım 500: Aşırı salınım ve toparlama (~100 kare)
    # Adım 2000: İlk başarılı tutuşlar (~120 kare)
    # Adım 5000: Merkeze çekiş (~140 kare)
    # Adım 10000: Mükemmel denge (~165 kare)
    print("\n[Zaman Tüneli] Canlı eğitim akışı birleştiriliyor...")
    timeline_segments = [
        (0, 0, 490, 80),
        (500, 500, 1990, 100),
        (2000, 2000, 4990, 130),
        (5000, 5000, 9990, 150),
        (10000, 10000, 10000, 180)
    ]

    full_timeline = []
    global_frame = 0

    for stage_step, start_count, end_count, num_frames in timeline_segments:
        source_traj = stage_data[stage_step]["trajectory"]
        w = stage_data[stage_step]["weights"]

        for i in range(min(num_frames, len(source_traj))):
            frame = dict(source_traj[i])
            pct = i / (num_frames - 1 or 1)
            cur_display_step = int(start_count + pct * (end_count - start_count))

            frame["training_step"] = cur_display_step
            frame["checkpoint_stage"] = stage_step
            frame["weights"] = w
            frame["timeline_frame"] = global_frame
            full_timeline.append(frame)
            global_frame += 1

    timeline_path = os.path.join("logs", "timeline_log.json")
    with open(timeline_path, "w", encoding="utf-8") as f:
        json.dump({
            "total_frames": len(full_timeline),
            "trajectory": full_timeline
        }, f)

    print(f"🌟 Dinamik Zaman Tüneli: {timeline_path} ({len(full_timeline)} kare)")
    print("=" * 65)


if __name__ == "__main__":
    main()
