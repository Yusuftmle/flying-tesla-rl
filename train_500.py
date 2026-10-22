"""
500 Adımlık Hızlı ve Etkili SAC Eğitimi (Rapid SAC Learner)
Amacımız: SADECE 500 adımda mükemmel dengelemeyi öğrenmek.
Eğitim esnasındaki 0, 100, 250, 400 ve 500. adım modellerini ve ağırlıklarını çıkarır.
Ayrıca JavaScript tarafında tarayıcıda canlı çalışması için actor ağırlıklarını JSON olarak dışa aktarır.
"""

import os
import sys
import json
import math
import numpy as np
import torch

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
from stable_baselines3 import SAC


def train_500_steps_master():
    print("=" * 65)
    print(" 🎯 500 ADIMDA SAC EĞİTİMİ BAŞLATILIYOR (Hedef: 500 Adımda Usta Denge)")
    print("=" * 65)

    seed = 42
    np.random.seed(seed)
    torch.manual_seed(seed)

    env = BallPlateEnv()
    env.reset(seed=seed)

    # 500 adımda hızlı öğrenme için:
    # - gradient_steps: her ortam adımında 4 gradyan güncellemesi (500 adımda 1600+ güncelleme)
    # - learning_rate: 3e-3
    # - batch_size: 32
    # - learning_starts: 30
    policy_kwargs = dict(net_arch=[12, 12])
    model = SAC(
        policy="MlpPolicy",
        env=env,
        policy_kwargs=policy_kwargs,
        learning_rate=3e-3,
        learning_starts=30,
        batch_size=32,
        train_freq=1,
        gradient_steps=4,
        tau=0.02,
        gamma=0.98,
        ent_coef="auto",
        seed=seed,
        device="cpu",
        verbose=0
    )

    checkpoints = [0, 100, 250, 400, 500]
    stage_data = {}
    current_step = 0

    for target in checkpoints:
        steps_to_train = target - current_step
        if steps_to_train > 0:
            print(f"\n[Eğitim] {current_step} -> {target} adım eğitiliyor...")
            model.learn(total_timesteps=steps_to_train, reset_num_timesteps=False)
            current_step = target

        actor = model.policy.actor
        actor.eval()

        # Ağırlıklar ve Bias'lar (JavaScript canlı çıkarımı için)
        w1 = actor.latent_pi[0].weight.data.cpu().numpy().tolist()
        b1 = actor.latent_pi[0].bias.data.cpu().numpy().tolist()

        w2 = actor.latent_pi[2].weight.data.cpu().numpy().tolist()
        b2 = actor.latent_pi[2].bias.data.cpu().numpy().tolist()

        w3 = actor.mu.weight.data.cpu().numpy().tolist()
        b3 = actor.mu.bias.data.cpu().numpy().tolist()

        model_weights = {
            "w1": w1, "b1": b1,
            "w2": w2, "b2": b2,
            "w3": w3, "b3": b3,
            "synapses": [w1, w2, w3]
        }

        # Test performansı (300 adım)
        test_env = BallPlateEnv()
        obs, _ = test_env.reset(seed=123, options={"pos": [-0.075, 0.055], "vel": [0.0, 0.0]})
        falls = 0
        tot_rew = 0.0
        traj = []

        for f_idx in range(300):
            obs_tensor = torch.as_tensor(obs, dtype=torch.float32).unsqueeze(0)
            with torch.no_grad():
                h1 = torch.relu(actor.latent_pi[0](obs_tensor))
                h2 = torch.relu(actor.latent_pi[2](h1))
                mu = actor.mu(h2)
                action = torch.tanh(mu).squeeze(0).numpy()

            next_obs, rew, term, trunc, info = test_env.step(action)
            tot_rew += rew

            ball_x = float(test_env.pos[0])
            ball_y = float(test_env.pos[1])
            fell = bool(info.get("fell", False) or abs(ball_x) > 0.132 or abs(ball_y) > 0.132)

            traj.append({
                "ball_x": ball_x,
                "ball_y": ball_y,
                "ball_height": 0.0,
                "vx": float(test_env.vel[0]),
                "vy": float(test_env.vel[1]),
                "tilt_x": float(test_env.tilt[0]),
                "tilt_y": float(test_env.tilt[1]),
                "cmd_x": float(action[0]),
                "cmd_y": float(action[1]),
                "reward": float(rew),
                "fell": fell,
                "state": "rolling",
                "activations": {
                    "inputs": [float(x) for x in obs],
                    "hidden1": [float(x) for x in h1.squeeze(0).numpy()],
                    "hidden2": [float(x) for x in h2.squeeze(0).numpy()],
                    "outputs": [float(x) for x in action]
                }
            })

            if fell:
                falls += 1
                # Düşüş simülasyonu
                vx_f = float(test_env.vel[0])
                vy_f = float(test_env.vel[1])
                dt = 1.0 / 30.0
                cur_h = 0.0
                vh = 0.0
                cx, cy = ball_x, ball_y
                for _ in range(8):
                    vh -= 9.81 * dt
                    cur_h += vh * dt
                    cx += vx_f * dt
                    cy += vy_f * dt
                    traj.append({
                        "ball_x": cx, "ball_y": cy, "ball_height": cur_h,
                        "vx": vx_f, "vy": vy_f, "tilt_x": float(test_env.tilt[0]), "tilt_y": float(test_env.tilt[1]),
                        "cmd_x": 0.0, "cmd_y": 0.0, "reward": -50.0, "fell": True, "state": "falling",
                        "activations": {"inputs": [float(x) for x in obs], "hidden1": [0]*12, "hidden2": [0]*12, "outputs": [0]*2}
                    })

                # Respawn
                new_pos = np.random.uniform(-0.06, 0.06, size=2).astype(np.float32)
                obs, _ = test_env.reset(options={"pos": new_pos, "vel": [0.0, 0.0]})
                drop_h = 0.14
                vh = 0.0
                while drop_h > 0.0:
                    vh -= 9.81 * dt
                    drop_h += vh * dt
                    traj.append({
                        "ball_x": float(new_pos[0]), "ball_y": float(new_pos[1]), "ball_height": max(0.0, drop_h),
                        "vx": 0.0, "vy": 0.0, "tilt_x": float(test_env.tilt[0]), "tilt_y": float(test_env.tilt[1]),
                        "cmd_x": 0.0, "cmd_y": 0.0, "reward": 0.0, "fell": False, "state": "respawning",
                        "activations": {"inputs": [float(x) for x in obs], "hidden1": [0]*12, "hidden2": [0]*12, "outputs": [0]*2}
                    })
            else:
                obs = next_obs

        stage_data[target] = {
            "weights": model_weights,
            "trajectory": traj,
            "total_reward": round(tot_rew, 1),
            "falls": falls
        }
        print(f" -> Adım {target:3d} | Düşme Sayısı: {falls} | Toplam Ödül: {tot_rew:.1f}")

    # 1. Nihai 500. adım model ağırlıklarını JSON olarak kaydet (JavaScript canlı çıkarımı için)
    js_weights_path = os.path.join("logs", "weights_500.json")
    with open(js_weights_path, "w", encoding="utf-8") as f:
        json.dump(stage_data[500]["weights"], f, indent=2)
    print(f"\n✅ JS Canlı Çıkarım Ağırlıkları: {js_weights_path}")

    # 2. 500 Adımlık Canlı Reels Akışı (0 -> 500)
    # 0 Adım: 80 kare (erken düşüşler)
    # 100 Adım: 90 kare (bocalama)
    # 250 Adım: 110 kare (toparlamaya başlama)
    # 400 Adım: 130 kare (neredeyse denge)
    # 500 Adım: 170 kare (usta denge)
    timeline_segments = [
        (0, 0, 99, 80),
        (100, 100, 249, 90),
        (250, 250, 399, 110),
        (400, 400, 499, 130),
        (500, 500, 500, 170)
    ]

    full_timeline = []
    g_idx = 0

    for stage_step, s_cnt, e_cnt, n_frames in timeline_segments:
        src = stage_data[stage_step]["trajectory"]
        w = stage_data[stage_step]["weights"]["synapses"]

        for i in range(min(n_frames, len(src))):
            frame = dict(src[i])
            pct = i / (n_frames - 1 or 1)
            cur_step = int(s_cnt + pct * (e_cnt - s_cnt))

            frame["training_step"] = cur_step
            frame["checkpoint_stage"] = stage_step
            frame["weights"] = w
            frame["timeline_frame"] = g_idx
            full_timeline.append(frame)
            g_idx += 1

    timeline_path = os.path.join("logs", "timeline_500.json")
    with open(timeline_path, "w", encoding="utf-8") as f:
        json.dump({
            "total_frames": len(full_timeline),
            "max_steps": 500,
            "trajectory": full_timeline
        }, f)

    print(f"🌟 500 Adımlık Dinamik Eğitim Zaman Tüneli: {timeline_path} ({len(full_timeline)} kare)")

    # Bireysel log_N.json dosyalarını da 500 adımlık aşamalara göre güncelle
    for s in checkpoints:
        p = os.path.join("logs", f"log_{s}.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump({
                "checkpoint": s,
                "weights": stage_data[s]["weights"]["synapses"],
                "trajectory": stage_data[s]["trajectory"][:300]
            }, f)

    print("=" * 65)


if __name__ == "__main__":
    train_500_steps_master()
