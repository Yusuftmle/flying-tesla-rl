"""
Gelişmiş SAC Log Üretici (Gerçek Düşme Fizigi, Respawn ve Dinamik Zaman Tüneli)
Tüm checkpoint'leri (0, 500, 2000, 5000, 10000) simüle eder.
Top kenardan düştüğünde:
- Serbest düşme fiziği (gravity drop) kaydeder.
- Ardından yeni top plakaya yukarıdan düşerek respawn olur.
- Bireysel log_N.json dosyalarını ve birleşik timeline_log.json dosyasını üretir.
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

from env import BallPlateEnv


def run_episode_with_falls(model, actor, env, total_frames=300, seed=42, fixed_start=None):
    """
    300 karelik bir simülasyon üretir.
    Top kenardan düştüğünde gerçek düşüş animasyonu (falling) ve respawn üretir.
    """
    np.random.seed(seed)
    torch.manual_seed(seed)

    if fixed_start:
        obs, _ = env.reset(seed=seed, options=fixed_start)
    else:
        obs, _ = env.reset(seed=seed, options={"pos": [-0.075, 0.055], "vel": [0.0, 0.0]})

    trajectory = []
    frame_idx = 0
    total_reward = 0.0
    fall_count = 0
    episode_idx = 1

    L_plate = env.L - env.ball_radius # 0.15 - 0.018 = 0.132 m

    while frame_idx < total_frames:
        # 1. Forward geçiş ve aktivasyonlar
        obs_tensor = torch.as_tensor(obs, dtype=torch.float32).unsqueeze(0)
        with torch.no_grad():
            h1 = torch.relu(actor.latent_pi[0](obs_tensor))
            h2 = torch.relu(actor.latent_pi[2](h1))
            mu = actor.mu(h2)
            action_tensor = torch.tanh(mu)

        action = action_tensor.squeeze(0).numpy()

        activations = {
            "inputs": [float(x) for x in obs],
            "hidden1": [float(x) for x in h1.squeeze(0).numpy()],
            "hidden2": [float(x) for x in h2.squeeze(0).numpy()],
            "outputs": [float(x) for x in action]
        }

        # 2. Adım ilerle
        next_obs, reward, terminated, truncated, info = env.step(action)
        total_reward += reward

        ball_x = float(env.pos[0])
        ball_y = float(env.pos[1])
        fell = bool(info.get("fell", False) or abs(ball_x) > L_plate or abs(ball_y) > L_plate)

        rec = {
            "step": frame_idx,
            "ball_x": ball_x,
            "ball_y": ball_y,
            "ball_height": 0.0, # Normal yüzeyde
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
            "episode": episode_idx
        }
        trajectory.append(rec)
        frame_idx += 1

        if frame_idx >= total_frames:
            break

        # 3. Eğer top kenarı aştıysa -> Düşüş ve Respawn sekansı
        if fell:
            fall_count += 1
            last_x = ball_x
            last_y = ball_y
            last_vx = float(env.vel[0])
            last_vy = float(env.vel[1])

            # 6 karelik serbest düşme (yerçekimiyle masaya düşüş)
            dt = 1.0 / 30.0
            cur_fall_x = last_x
            cur_fall_y = last_y
            cur_fall_h = 0.0
            cur_vy_down = 0.0

            for fall_step in range(6):
                if frame_idx >= total_frames:
                    break
                cur_fall_x += last_vx * dt * 1.2
                cur_fall_y += last_vy * dt * 1.2
                cur_vy_down -= 9.81 * dt
                cur_fall_h += cur_vy_down * dt

                trajectory.append({
                    "step": frame_idx,
                    "ball_x": cur_fall_x,
                    "ball_y": cur_fall_y,
                    "ball_height": cur_fall_h, # Negatif (aşağı düşüyor)
                    "vx": last_vx,
                    "vy": last_vy,
                    "tilt_x": float(env.tilt[0]),
                    "tilt_y": float(env.tilt[1]),
                    "cmd_x": float(action[0]),
                    "cmd_y": float(action[1]),
                    "reward": -50.0,
                    "activations": activations,
                    "fell": True,
                    "state": "falling",
                    "episode": episode_idx
                })
                frame_idx += 1

            if frame_idx >= total_frames:
                break

            # 4. Respawn (Yeni top yukarıdan plakaya tık diye düşer)
            episode_idx += 1
            # Rastgele yeni başlangıç noktası (kenardan uzakta [-0.07, 0.07])
            new_pos = np.random.uniform(-0.065, 0.065, size=2).astype(np.float32)
            obs, _ = env.reset(options={"pos": new_pos, "vel": [0.0, 0.0]})

            # 4 karelik yukarıdan düşüp konma animasyonu
            drop_heights = [0.08, 0.04, 0.01, 0.0]
            for dh in drop_heights:
                if frame_idx >= total_frames:
                    break
                trajectory.append({
                    "step": frame_idx,
                    "ball_x": float(new_pos[0]),
                    "ball_y": float(new_pos[1]),
                    "ball_height": dh, # Pozitif (yukarıdan düşüyor)
                    "vx": 0.0,
                    "vy": 0.0,
                    "tilt_x": float(env.tilt[0]),
                    "tilt_y": float(env.tilt[1]),
                    "cmd_x": 0.0,
                    "cmd_y": 0.0,
                    "reward": 0.0,
                    "activations": activations,
                    "fell": False,
                    "state": "respawning",
                    "episode": episode_idx
                })
                frame_idx += 1
        else:
            obs = next_obs

    return trajectory, total_reward, fall_count


def generate_all_logs():
    os.makedirs("logs", exist_ok=True)
    checkpoints = [0, 500, 2000, 5000, 10000]

    all_checkpoint_data = {}
    timeline_frames = []

    print("=" * 60)
    print(" 🚀 Gerçekçi SAC Logları ve Dinamik Zaman Tüneli Üretiliyor")
    print("=" * 60)

    for ckpt_step in checkpoints:
        ckpt_path = f"ckpt_{ckpt_step}.zip"
        if not os.path.exists(ckpt_path):
            print(f"❌ {ckpt_path} bulunamadı!")
            return False

        print(f"\n[Model] {ckpt_path} yükleniyor...")
        model = SAC.load(ckpt_path, device="cpu")
        actor = model.policy.actor
        actor.eval()

        w1 = actor.latent_pi[0].weight.data.cpu().numpy().tolist()
        w2 = actor.latent_pi[2].weight.data.cpu().numpy().tolist()
        w3 = actor.mu.weight.data.cpu().numpy().tolist()

        env = BallPlateEnv()
        # Her checkpoint için 300 kare (10 saniye) üret
        traj, total_reward, falls = run_episode_with_falls(
            model, actor, env, total_frames=300, seed=100 + ckpt_step
        )

        log_data = {
            "checkpoint": ckpt_step,
            "weights": [w1, w2, w3],
            "total_reward": round(total_reward, 2),
            "falls": falls,
            "trajectory_length": len(traj),
            "trajectory": traj
        }
        all_checkpoint_data[ckpt_step] = log_data

        out_file = os.path.join("logs", f"log_{ckpt_step}.json")
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(log_data, f)

        print(f" -> {out_file} oluşturuldu (Kare: {len(traj)}, Düşme: {falls}, Ödül: {total_reward:.1f})")

    # -------------------------------------------------------------
    # DİNAMİK EĞİTİM ZAMAN TÜNELİ (TIMELINE): 0 -> 500 -> 2k -> 5k -> 10k
    # -------------------------------------------------------------
    # 0 Adım: 80 kare (erken düşüşler)
    # 500 Adım: 100 kare (overshoots)
    # 2000 Adım: 120 kare (reaksiyon ve toparlanma)
    # 5000 Adım: 150 kare (stabilizasyon)
    # 10000 Adım: 180 kare (mükemmel merkezleme)
    timeline_segments = [
        (0, 90),
        (500, 110),
        (2000, 130),
        (5000, 160),
        (10000, 180)
    ]

    global_step = 0
    full_timeline = []

    for ckpt_step, seg_frames in timeline_segments:
        src_traj = all_checkpoint_data[ckpt_step]["trajectory"]
        weights = all_checkpoint_data[ckpt_step]["weights"]

        for i in range(min(seg_frames, len(src_traj))):
            frame = dict(src_traj[i])
            # Sayacın dinamik artışı
            # 0'dan 10,000'e yumuşak geçiş
            pct = i / seg_frames
            if ckpt_step == 0:
                current_training_step = int(0 + pct * 490)
            elif ckpt_step == 500:
                current_training_step = int(500 + pct * 1490)
            elif ckpt_step == 2000:
                current_training_step = int(2000 + pct * 2990)
            elif ckpt_step == 5000:
                current_training_step = int(5000 + pct * 4990)
            else:
                current_training_step = 10000

            frame["training_step"] = current_training_step
            frame["checkpoint_stage"] = ckpt_step
            frame["weights"] = weights
            frame["timeline_index"] = global_step
            full_timeline.append(frame)
            global_step += 1

    timeline_data = {
        "total_frames": len(full_timeline),
        "trajectory": full_timeline
    }

    timeline_file = os.path.join("logs", "timeline_log.json")
    with open(timeline_file, "w", encoding="utf-8") as f:
        json.dump(timeline_data, f)

    print(f"\n🌟 Birleşik Dinamik Zaman Tüneli: {timeline_file} ({len(full_timeline)} kare - ~22 saniyelik eksiksiz Reels!)")
    print("=" * 60)
    return True


if __name__ == "__main__":
    generate_all_logs()
