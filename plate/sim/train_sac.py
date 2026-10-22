"""
PyTorch ile Sıfırdan Soft Actor-Critic (SAC) Eğitimi
Harici ağır kütüphanelere gerek duymadan doğrudan PyTorch (CUDA uyumlu) ile çalışır.

Kullanım:
    python train_sac.py --steps 5000 --cuda
"""

import os
import sys
import json
import random
import argparse
from collections import deque

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.distributions import Normal

from ball_plate_env import BallPlateEnv


# ==========================================
# 1. Sinir Ağı Mimarileri (Actor & Twin Critics)
# ==========================================

class ReplayBuffer:
    def __init__(self, capacity=50000):
        self.buffer = deque(maxlen=capacity)

    def push(self, state, action, reward, next_state, done):
        self.buffer.append((state, action, reward, next_state, done))

    def sample(self, batch_size):
        batch = random.sample(self.buffer, batch_size)
        state, action, reward, next_state, done = zip(*batch)
        return (
            torch.FloatTensor(np.array(state)),
            torch.FloatTensor(np.array(action)),
            torch.FloatTensor(np.array(reward)).unsqueeze(1),
            torch.FloatTensor(np.array(next_state)),
            torch.FloatTensor(np.array(done)).unsqueeze(1)
        )

    def __len__(self):
        return len(self.buffer)


class GaussianActor(nn.Module):
    """
    Politika Ağı: Durumu alır, eylem için ortalama (mu) ve standart sapma (log_std) üretir.
    Tanh dönüşümü ile [-1, 1] aralığına sıkıştırır (Enforcing Action Bounds).
    """
    def __init__(self, state_dim=8, action_dim=2, hidden_dim=64):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU()
        )
        self.mu_head = nn.Linear(hidden_dim, action_dim)
        self.log_std_head = nn.Linear(hidden_dim, action_dim)

    def forward(self, state):
        feat = self.net(state)
        mu = self.mu_head(feat)
        log_std = self.log_std_head(feat)
        log_std = torch.clamp(log_std, -20, 2)
        return mu, log_std

    def sample(self, state):
        mu, log_std = self.forward(state)
        std = log_std.exp()
        normal = Normal(mu, std)
        x_t = normal.rsample()  # Reparameterization trick
        action = torch.tanh(x_t)

        # Log olasılığı ve tanh düzeltmesi
        log_prob = normal.log_prob(x_t)
        log_prob -= torch.log(1.0 - action.pow(2) + 1e-6)
        log_prob = log_prob.sum(dim=-1, keepdim=True)
        return action, log_prob


class TwinCritic(nn.Module):
    """
    İkiz Eleştirmen Ağı (Q1 ve Q2): Aşırı iyimser değer tahminlerini önler (Clipped Double Q-Learning).
    """
    def __init__(self, state_dim=8, action_dim=2, hidden_dim=64):
        super().__init__()
        # Q1 Ağı
        self.q1 = nn.Sequential(
            nn.Linear(state_dim + action_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1)
        )
        # Q2 Ağı
        self.q2 = nn.Sequential(
            nn.Linear(state_dim + action_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1)
        )

    def forward(self, state, action):
        sa = torch.cat([state, action], dim=-1)
        return self.q1(sa), self.q2(sa)


# ==========================================
# 2. SAC Eğitmeni (Soft Actor-Critic Engine)
# ==========================================

class SACAgent:
    def __init__(self, state_dim=8, action_dim=2, device='cpu', lr=3e-4, gamma=0.99, tau=0.005):
        self.device = torch.device(device)
        self.gamma = gamma
        self.tau = tau

        # Ağlar
        self.actor = GaussianActor(state_dim, action_dim).to(self.device)
        self.critic = TwinCritic(state_dim, action_dim).to(self.device)
        self.critic_target = TwinCritic(state_dim, action_dim).to(self.device)
        self.critic_target.load_state_dict(self.critic.state_dict())

        # İyileştiriciler
        self.actor_opt = optim.Adam(self.actor.parameters(), lr=lr)
        self.critic_opt = optim.Adam(self.critic.parameters(), lr=lr)

        # Otomatik Entropi Ayarı (Alpha Tuning)
        self.target_entropy = -float(action_dim)
        self.log_alpha = torch.zeros(1, requires_grad=True, device=self.device)
        self.alpha_opt = optim.Adam([self.log_alpha], lr=lr)

        self.buffer = ReplayBuffer()

    @property
    def alpha(self):
        return self.log_alpha.exp()

    def select_action(self, state, evaluate=False):
        state_t = torch.FloatTensor(state).unsqueeze(0).to(self.device)
        with torch.no_grad():
            if evaluate:
                mu, _ = self.actor(state_t)
                action = torch.tanh(mu)
            else:
                action, _ = self.actor.sample(state_t)
        return action.cpu().numpy()[0]

    def update_parameters(self, batch_size=64):
        if len(self.buffer) < batch_size:
            return

        states, actions, rewards, next_states, dones = [x.to(self.device) for x in self.buffer.sample(batch_size)]

        # --- 1. Critic Güncellemesi ---
        with torch.no_grad():
            next_actions, next_log_probs = self.actor.sample(next_states)
            q1_target, q2_target = self.critic_target(next_states, next_actions)
            min_q_target = torch.min(q1_target, q2_target) - self.alpha * next_log_probs
            q_target = rewards + (1.0 - dones) * self.gamma * min_q_target

        q1, q2 = self.critic(states, actions)
        critic_loss = nn.MSELoss()(q1, q_target) + nn.MSELoss()(q2, q_target)

        self.critic_opt.zero_grad()
        critic_loss.backward()
        self.critic_opt.step()

        # --- 2. Actor Güncellemesi ---
        actions_new, log_probs = self.actor.sample(states)
        q1_new, q2_new = self.critic(states, actions_new)
        min_q_new = torch.min(q1_new, q2_new)
        actor_loss = (self.alpha * log_probs - min_q_new).mean()

        self.actor_opt.zero_grad()
        actor_loss.backward()
        self.actor_opt.step()

        # --- 3. Sıcaklık Parametresi (Alpha) Güncellemesi ---
        alpha_loss = -(self.log_alpha * (log_probs + self.target_entropy).detach()).mean()
        self.alpha_opt.zero_grad()
        alpha_loss.backward()
        self.alpha_opt.step()

        # --- 4. Yumuşak Hedef Güncellemesi (Polyak Averaging) ---
        for param, target_param in zip(self.critic.parameters(), self.critic_target.parameters()):
            target_param.data.copy_(self.tau * param.data + (1.0 - self.tau) * target_param.data)


# ==========================================
# 3. Eğitim Döngüsü ve Log Çıktısı
# ==========================================

def train(total_steps=5000, use_cuda=True, export_log=True):
    device = "cuda" if (use_cuda and torch.cuda.is_available()) else "cpu"
    print(f"\n==========================================")
    print(f"SAC Eğitimi Başlatılıyor | Cihaz: {device.upper()}")
    print(f"Hedef Adım Sayısı: {total_steps}")
    print(f"==========================================\n")

    env = BallPlateEnv()
    agent = SACAgent(state_dim=8, action_dim=2, device=device)

    log_data = []
    state, _ = env.reset()
    ep_reward = 0
    ep_count = 0

    for step in range(1, total_steps + 1):
        # Isınma adımlarında rastgele keşif
        if step < 500:
            action = env.action_space.sample()
        else:
            action = agent.select_action(state, evaluate=False)

        next_state, reward, terminated, truncated, info = env.step(action)
        done = terminated or truncated

        agent.buffer.push(state, action, reward, next_state, float(terminated))
        state = next_state
        ep_reward += reward

        # Ağı güncelle
        if step >= 500:
            agent.update_parameters(batch_size=64)

        # Loglama
        if export_log and step % 2 == 0:
            log_data.append({
                "step": step,
                "ball_x": float(state[0]),
                "ball_y": float(state[1]),
                "vx": float(state[2]),
                "vy": float(state[3]),
                "tilt_x": float(state[4]),
                "tilt_y": float(state[5]),
                "action_x": float(action[0]),
                "action_y": float(action[1]),
                "reward": float(reward)
            })

        if done:
            ep_count += 1
            if ep_count % 5 == 0 or step >= total_steps:
                print(f"Adım: {step:5d} / {total_steps} | Bölüm: {ep_count:3d} | Son Ödül: {ep_reward:7.1f} | Top Mesafesi: {info['dist']*100:.1f} cm")
            state, _ = env.reset()
            ep_reward = 0

    # Modeli kaydet
    torch.save(agent.actor.state_dict(), "sac_actor_weights.pth")
    print("\n[OK] Model ağırlıkları kaydedildi: sac_actor_weights.pth")

    if export_log:
        with open("log.json", "w", encoding="utf-8") as f:
            json.dump(log_data[:1000], f, indent=2)
        print("[OK] Örnek 1000 adımlık yörünge kaydedildi: log.json")

    print("\nEğitim Başarıyla Tamamlandı!\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=5000, help="Toplam eğitim adım sayısı")
    parser.add_argument("--cuda", action="store_true", default=True, help="CUDA kullan")
    args = parser.parse_args()

    train(total_steps=args.steps, use_cuda=args.cuda)
