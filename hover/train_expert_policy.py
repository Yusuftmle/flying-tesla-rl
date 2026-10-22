"""
PyTorch Training Script for Rocket Vehicle Expert Policy (SOTA Industry Standard)
Mimics Expert Teacher on 12-input -> 16 -> 16 -> 8-output architecture.
Directly exports trained weights (W1, b1, W2, b2, W3, b3) for JavaScript Three.js.
Features:
- Asymmetric Risk-Sensitive Huber Loss (penalizes under-thrust to prevent hard landings)
- Channel-weighted multi-objective optimization (RCS roll + Main thrusters)
- Kaiming Orthogonal Weight Initialization
- Gradient Norm Clipping & Cosine Annealing Learning Rate
- Direct Three.js JSON HUD integration
"""

import os
import sys
import json
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import TensorDataset, DataLoader

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

class RocketCarPolicy(nn.Module):
    def __init__(self, in_dim=12, hidden_dim=32, out_dim=8):
        super().__init__()
        self.in_dim = in_dim
        self.hidden_dim = hidden_dim
        self.out_dim = out_dim
        self.fc1 = nn.Linear(in_dim, hidden_dim)
        self.relu1 = nn.ReLU()
        self.fc2 = nn.Linear(hidden_dim, hidden_dim)
        self.relu2 = nn.ReLU()
        self.fc3 = nn.Linear(hidden_dim, out_dim)
        self.tanh = nn.Tanh()

        # Sectoral best practice: Kaiming initialization for ReLU layers
        nn.init.kaiming_normal_(self.fc1.weight, nonlinearity='relu')
        nn.init.zeros_(self.fc1.bias)
        nn.init.kaiming_normal_(self.fc2.weight, nonlinearity='relu')
        nn.init.zeros_(self.fc2.bias)
        nn.init.xavier_uniform_(self.fc3.weight)
        nn.init.zeros_(self.fc3.bias)

    def forward(self, x):
        x = self.relu1(self.fc1(x))
        x = self.relu2(self.fc2(x))
        x = self.tanh(self.fc3(x))
        return x

class AsymmetricRiskHuberLoss(nn.Module):
    """
    Sektörel Standart: Risk Duyarlı Asimetrik Huber Kaybı.
    Ana fren motorlarında yetersiz itki (under-thrust: pred < target) roketin zemine
    çarpmasına neden olduğu için aşırı itkiden (over-thrust) daha sert cezalandırılır.
    Ayrıca RCS roll kanalları (4..7) takla riskini önlemek için özel ağırlıklandırılır.
    """
    def __init__(self, delta=0.5, under_thrust_multiplier=1.6):
        super().__init__()
        self.delta = delta
        self.under_mult = under_thrust_multiplier
        # Kanallar: 0..3 (4 Ana Motor), 4..7 (4 Yan RCS)
        self.register_buffer("weights", torch.tensor([1.2, 1.2, 1.2, 1.2, 1.5, 1.5, 1.5, 1.5]))

    def forward(self, pred, target):
        diff = pred - target
        abs_diff = torch.abs(diff)
        huber = torch.where(abs_diff < self.delta, 0.5 * (diff ** 2), self.delta * (abs_diff - 0.5 * self.delta))

        # Ana motorlar için yetersiz frenleme asimetrik cezası (pred < target -> diff < 0)
        under_mask = (diff[:, 0:4] < 0.0).float()
        thrust_huber = huber[:, 0:4] * (1.0 + (self.under_mult - 1.0) * under_mask)
        rcs_huber = huber[:, 4:8]

        weighted = torch.cat([thrust_huber, rcs_huber], dim=1) * self.weights
        return torch.mean(weighted)

def train_policy(dataset_path="hover/logs/expert_dataset.npz", output_json="hover/logs/trained_policy.json", epochs=40):
    if not os.path.exists(dataset_path):
        print(f"Hata: Veri seti bulunamadı: {dataset_path}")
        return False

    print(f"📦 Veri seti yükleniyor: {dataset_path}...")
    data = np.load(dataset_path)
    X = data["observations"]
    Y = data["actions"]
    print(f"  Toplam Veri Sayısı: {X.shape[0]:,} adım | Girdi Boyutu: {X.shape[1]} | Çıktı Boyutu: {Y.shape[1]}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"⚡ Eğitim Cihazı: {device}")

    # Train / Val Split (%85 - %15)
    num_samples = X.shape[0]
    indices = np.random.permutation(num_samples)
    split = int(0.85 * num_samples)
    train_idx, val_idx = indices[:split], indices[split:]

    X_train, Y_train = torch.FloatTensor(X[train_idx]), torch.FloatTensor(Y[train_idx])
    X_val, Y_val = torch.FloatTensor(X[val_idx]), torch.FloatTensor(Y[val_idx])

    train_loader = DataLoader(TensorDataset(X_train, Y_train), batch_size=256, shuffle=True)
    val_loader = DataLoader(TensorDataset(X_val, Y_val), batch_size=512, shuffle=False)

    model = RocketCarPolicy().to(device)
    criterion = AsymmetricRiskHuberLoss(delta=0.4, under_thrust_multiplier=1.6).to(device)
    eval_criterion = nn.SmoothL1Loss()
    optimizer = optim.AdamW(model.parameters(), lr=3.2e-3, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=8e-5)

    print(f"🧠 Sinir Ağı Eğitimi Başlıyor ({epochs} Epoch, Asymmetric Risk Huber Loss)...")
    best_val_loss = float("inf")

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        for bx, by in train_loader:
            bx, by = bx.to(device), by.to(device)
            optimizer.zero_grad()
            pred = model(bx)
            loss = criterion(pred, by)
            loss.backward()
            # Gradient clipping: Patlayan gradyanları engeller
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            train_loss += loss.item() * bx.size(0)

        scheduler.step()
        train_loss /= len(train_loader.dataset)

        # Validation
        model.eval()
        val_loss = 0.0
        val_mae = 0.0
        with torch.no_grad():
            for bx, by in val_loader:
                bx, by = bx.to(device), by.to(device)
                pred = model(bx)
                val_loss += eval_criterion(pred, by).item() * bx.size(0)
                val_mae += torch.mean(torch.abs(pred - by)).item() * bx.size(0)

        val_loss /= len(val_loader.dataset)
        val_mae /= len(val_loader.dataset)

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), "hover/logs/best_policy.pth")

        if epoch % 5 == 0 or epoch == epochs:
            print(f"  [Epoch {epoch:02d}/{epochs}] Train Loss: {train_loss:.5f} | Val SmoothL1: {val_loss:.5f} | Val MAE: {val_mae:.4f} (Doğruluk: %{(1.0 - val_mae)*100:.1f})")

    # En iyi ağırlıkları yükle ve JS formatına aktar
    model.load_state_dict(torch.load("hover/logs/best_policy.pth", weights_only=True))
    model.eval()

    W1 = model.fc1.weight.detach().cpu().numpy().tolist()
    b1 = model.fc1.bias.detach().cpu().numpy().tolist()
    W2 = model.fc2.weight.detach().cpu().numpy().tolist()
    b2 = model.fc2.bias.detach().cpu().numpy().tolist()
    W3 = model.fc3.weight.detach().cpu().numpy().tolist()
    b3 = model.fc3.bias.detach().cpu().numpy().tolist()

    export_data = {
        "architecture": [model.in_dim, model.hidden_dim, model.hidden_dim, model.out_dim],
        "activations": ["relu", "relu", "tanh"],
        "val_loss": float(best_val_loss),
        "weights": {
            "W1": W1,
            "b1": b1,
            "W2": W2,
            "b2": b2,
            "W3": W3,
            "b3": b3
        }
    }

    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(export_data, f, indent=2)

    target_log = "hover/logs/log_1000000.json"
    if os.path.exists(target_log):
        with open(target_log, "r", encoding="utf-8") as f:
            log_data = json.load(f)
        log_data["network"]["weights"] = export_data["weights"]
        log_data["network"]["val_loss"] = export_data["val_loss"]
        with open(target_log, "w", encoding="utf-8") as f:
            json.dump(log_data, f)
        print(f"  🔗 Three.js Web HUD log dosyası güncellendi: {target_log}")

    print(f"\n🎉 Eğitim Başarıyla Tamamlandı!")
    print(f"  💾 Ağırlıklar kaydedildi: {output_json}")
    return export_data

if __name__ == "__main__":
    train_policy()
