"""
DAgger (Dataset Aggregation) Recovery Training - V4
Modele kaotik durumlardan, aşırı spinlerden, rüzgar savrulmalarından
ve rampa çıkışından sonra inişe geçiş reflekslerini (Recovery Maneuvers) öğretir.
"""

import sys
import os
import math
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import TensorDataset, DataLoader
import numpy as np
import json

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from hover.sim.env import RocketHoverEnv
from hover.sim.expert import ExpertPilot
from hover.sim.launch import get_launch_state
from hover.sim.dynamics import VehicleState
from hover.sim import params
from hover.train_expert_policy import RocketCarPolicy

def run_dagger_iteration(num_rollouts=1200, epochs=30):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = RocketCarPolicy().to(device)
    model.load_state_dict(torch.load("hover/logs/best_policy.pth", map_location=device, weights_only=True))

    expert = ExpertPilot()
    env = RocketHoverEnv(curriculum_level=2, deterministic_reset=False)

    data = np.load("hover/logs/expert_dataset.npz")
    existing_obs = list(data["observations"])
    existing_acts = list(data["actions"])
    initial_len = len(existing_obs)

    print(f"🔄 DAgger Refleks Toplama Başlıyor ({num_rollouts} Uçuş)...")
    new_obs = []
    new_acts = []
    soft_count = 0

    for ep in range(num_rollouts):
        obs, _ = env.reset()

        done = False
        while not done:
            # Model kendi aksiyonuyla uçar
            obs_tensor = torch.FloatTensor(obs).unsqueeze(0).to(device)
            with torch.no_grad():
                model_act = model(obs_tensor).cpu().numpy()[0]

            # Ama usta pilotun o anki doğru refleksini de kaydederiz
            expert_act = expert.compute_action(env.state, obs=obs, wind_x=env.wind_x)

            new_obs.append(obs)
            new_acts.append(expert_act)

            # Çevreyi modelin kendi aksiyonuyla ilerlet
            obs, r, term, trunc, _ = env.step(model_act)
            done = term or trunc

        if env.state.soft_landed:
            soft_count += 1

    print(f"  DAgger Uçuşlarında Doğrudan Model Başarısı: {soft_count} / {num_rollouts} (%{(soft_count/num_rollouts)*100:.1f})")
    print(f"  Toplanan Yeni Kurtarma Verisi: {len(new_obs):,} adım")

    # Verileri birleştir
    all_X = np.array(existing_obs + new_obs, dtype=np.float32)
    all_Y = np.array(existing_acts + new_acts, dtype=np.float32)
    print(f"  Toplam Eğitim Verisi: {all_X.shape[0]:,} adım")

    np.savez_compressed("hover/logs/expert_dataset.npz", observations=all_X, actions=all_Y)

    # Modeli yeni verilerle eğit
    num_samples = all_X.shape[0]
    indices = np.random.permutation(num_samples)
    split = int(0.85 * num_samples)
    train_idx, val_idx = indices[:split], indices[split:]

    train_loader = DataLoader(
        TensorDataset(torch.FloatTensor(all_X[train_idx]), torch.FloatTensor(all_Y[train_idx])),
        batch_size=256, shuffle=True
    )
    val_loader = DataLoader(
        TensorDataset(torch.FloatTensor(all_X[val_idx]), torch.FloatTensor(all_Y[val_idx])),
        batch_size=512, shuffle=False
    )

    criterion = nn.SmoothL1Loss()
    optimizer = optim.AdamW(model.parameters(), lr=1.8e-3, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=5e-5)

    print(f"🧠 DAgger ile Güçlendirilmiş Model Eğitiliyor ({epochs} Epoch)...")
    best_loss = float("inf")

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        for bx, by in train_loader:
            bx, by = bx.to(device), by.to(device)
            optimizer.zero_grad()
            pred = model(bx)
            loss = criterion(pred, by)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * bx.size(0)

        scheduler.step()
        train_loss /= len(train_loader.dataset)

        model.eval()
        val_loss = 0.0
        val_mae = 0.0
        with torch.no_grad():
            for bx, by in val_loader:
                bx, by = bx.to(device), by.to(device)
                pred = model(bx)
                val_loss += criterion(pred, by).item() * bx.size(0)
                val_mae += torch.mean(torch.abs(pred - by)).item() * bx.size(0)

        val_loss /= len(val_loader.dataset)
        val_mae /= len(val_loader.dataset)

        if val_loss < best_loss:
            best_loss = val_loss
            torch.save(model.state_dict(), "hover/logs/best_policy.pth")

        if epoch % 5 == 0 or epoch == epochs:
            print(f"  [Epoch {epoch:02d}/{epochs}] Train Loss: {train_loss:.5f} | Val Loss: {val_loss:.5f} | Doğruluk: %{(1.0 - val_mae)*100:.1f}")

    # En iyi modeli JSON'a aktar
    model.load_state_dict(torch.load("hover/logs/best_policy.pth", weights_only=True))
    model.eval()

    W1 = model.fc1.weight.detach().cpu().numpy().tolist()
    b1 = model.fc1.bias.detach().cpu().numpy().tolist()
    W2 = model.fc2.weight.detach().cpu().numpy().tolist()
    b2 = model.fc2.bias.detach().cpu().numpy().tolist()
    W3 = model.fc3.weight.detach().cpu().numpy().tolist()
    b3 = model.fc3.bias.detach().cpu().numpy().tolist()

    export_data = {
        "architecture": [12, 16, 16, 8],
        "activations": ["relu", "relu", "tanh"],
        "val_loss": float(best_loss),
        "weights": {"W1": W1, "b1": b1, "W2": W2, "b2": b2, "W3": W3, "b3": b3}
    }

    with open("hover/logs/trained_policy.json", "w", encoding="utf-8") as f:
        json.dump(export_data, f, indent=2)

    with open("hover/logs/log_1000000.json", "r", encoding="utf-8") as f:
        log_data = json.load(f)
    log_data["network"]["weights"] = export_data["weights"]
    log_data["network"]["val_loss"] = export_data["val_loss"]
    with open("hover/logs/log_1000000.json", "w", encoding="utf-8") as f:
        json.dump(log_data, f)

    print("🎉 DAgger Eğitimi Tamamlandı! Ağırlıklar güncellendi.")

if __name__ == "__main__":
    run_dagger_iteration(num_rollouts=1000, epochs=25)
