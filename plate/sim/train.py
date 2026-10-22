"""
SAC Eğitimi ve Kademeli Checkpoint Scripti
Stable-Baselines3 kullanarak BallPlateEnv üzerinde Soft Actor-Critic eğitir.
0, 500, 2000 ve 5000 adımlarında model checkpoint'lerini kaydeder.
Eğitim ödüllerini rewards.csv dosyasına yazar.
"""

import os
import sys
import csv
import argparse

# Windows console encoding uyumluluğu
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
import numpy as np
import torch
from stable_baselines3 import SAC
from stable_baselines3.common.callbacks import BaseCallback

from env import BallPlateEnv


class RewardLoggerCallback(BaseCallback):
    """Her bölüm bittiğinde ödülü rewards.csv dosyasına kaydeder."""

    def __init__(self, filename="rewards.csv", verbose=0):
        super().__init__(verbose)
        self.filename = filename
        self.episode_count = 0
        self.current_reward = 0.0
        self.current_length = 0

    def _on_training_start(self):
        # CSV dosyasını oluştur ve başlığı yaz
        if not os.path.exists(self.filename) or self.num_timesteps == 0:
            with open(self.filename, mode="w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(["episode", "total_steps", "reward", "length"])

    def _on_step(self) -> bool:
        rewards = self.locals.get("rewards")
        dones = self.locals.get("dones")

        if rewards is not None:
            self.current_reward += float(rewards[0])
            self.current_length += 1

        if dones is not None and dones[0]:
            self.episode_count += 1
            with open(self.filename, mode="a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow([
                    self.episode_count,
                    self.num_timesteps,
                    f"{self.current_reward:.2f}",
                    self.current_length
                ])
            print(f"Bölüm {self.episode_count:3d} | Toplam Adım: {self.num_timesteps:5d} | Ödül: {self.current_reward:7.2f} | Uzunluk: {self.current_length:3d}")
            self.current_reward = 0.0
            self.current_length = 0

        return True


def train_sac(seed=42):
    print("=" * 60)
    print(" 🎯 SAC Top-Plaka Dengeleme Eğitimi Başlatılıyor")
    print(f" Seed: {seed} | Mimari: MLP [12, 12]")
    print("=" * 60)

    # Ortam ve seed
    np.random.seed(seed)
    torch.manual_seed(seed)

    env = BallPlateEnv()
    env.reset(seed=seed)

    # Ağ Mimarisi: 8 Girdi -> 12 Gizli -> 12 Gizli -> 2 Çıktı
    policy_kwargs = dict(
        net_arch=[12, 12]
    )

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
        verbose=0
    )

    callback = RewardLoggerCallback(filename="rewards.csv")

    # --- 1. Adım 0 Checkpoint ---
    print("\n[Checkpoint] 0 Adım (Untrained) kaydediliyor...")
    model.save("ckpt_0")

    # --- 2. 500 Adıma Kadar Eğit ---
    print("\n[Eğitim] 0 -> 500 adım eğitiliyor...")
    model.learn(total_timesteps=500, reset_num_timesteps=False, callback=callback)
    model.save("ckpt_500")
    print("[Checkpoint] 500 Adım kaydedildi: ckpt_500.zip")

    # --- 3. 2000 Adıma Kadar Eğit ---
    print("\n[Eğitim] 500 -> 2000 adım eğitiliyor...")
    model.learn(total_timesteps=1500, reset_num_timesteps=False, callback=callback)
    model.save("ckpt_2000")
    print("[Checkpoint] 2000 Adım kaydedildi: ckpt_2000.zip")

    # --- 4. 5000 Adıma Kadar Eğit ---
    print("\n[Eğitim] 2000 -> 5000 adım eğitiliyor...")
    model.learn(total_timesteps=3000, reset_num_timesteps=False, callback=callback)
    model.save("ckpt_5000")
    print("[Checkpoint] 5000 Adım kaydedildi: ckpt_5000.zip")

    # --- 5. 10000 Adıma Kadar Eğit (Tam Dengeleme / Mastery) ---
    print("\n[Eğitim] 5000 -> 10000 adım eğitiliyor (Tam Dengeleme)...")
    model.learn(total_timesteps=5000, reset_num_timesteps=False, callback=callback)
    model.save("ckpt_10000")
    print("[Checkpoint] 10000 Adım kaydedildi: ckpt_10000.zip")

    print("\n" + "=" * 60)
    print(" ✅ Tüm checkpoint'ler başarıyla kaydedildi: 0, 500, 2000, 5000, 10000!")
    print(" Ödül günlüğü: rewards.csv")
    print("=" * 60)


if __name__ == "__main__":
    train_sac()
