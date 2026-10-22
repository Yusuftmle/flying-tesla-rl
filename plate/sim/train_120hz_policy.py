"""
120Hz Yüksek Performanslı Top ve Plaka (Ball and Plate) Sinir Ağı Eğitimi
8 Girdi -> 16 Gizli -> 16 Gizli -> 2 Çıktı
Ultra-hızlı, kararlı ve sarsıntısız dengeleme için DAgger + Uzman Politika Klonlama.
"""

import os
import sys
import json
import math
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Model Mimarisi: 8 -> 16 -> 16 -> 2
class PolicyNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(8, 16)
        self.fc2 = nn.Linear(16, 16)
        self.fc3 = nn.Linear(16, 2)

    def forward(self, x):
        h1 = torch.relu(self.fc1(x))
        h2 = torch.relu(self.fc2(h1))
        out = torch.tanh(self.fc3(h2))
        return out, h1, h2

scale = (5.0 / 7.0) * 9.81
max_tilt = math.radians(16.0) # 16 derece (~0.279 rad)

def expert_action(obs):
    # obs: [ex, ey, vx, vy, tx, ty, tvx, tvy]
    ex, ey, vx, vy, tx, ty, tvx, tvy = obs
    kp = 7.8
    kd = 3.4
    kt = 0.45
    des_ax = -kp * ex - kd * (vx - tvx)
    des_ay = -kp * ey - kd * (vy - tvy)
    des_tx = np.clip(des_ax / scale, -max_tilt, max_tilt)
    des_ty = np.clip(des_ay / scale, -max_tilt, max_tilt)
    cx = np.clip((des_tx + kt * (des_tx - tx)) / max_tilt, -1.0, 1.0)
    cy = np.clip((des_ty + kt * (des_ty - ty)) / max_tilt, -1.0, 1.0)
    return np.array([cx, cy], dtype=np.float32)

def generate_dataset(n_samples=100000):
    np.random.seed(42)
    
    # 1. Geniş durum uzayı dağılımı
    ex = np.random.uniform(-0.145, 0.145, n_samples).astype(np.float32)
    ey = np.random.uniform(-0.145, 0.145, n_samples).astype(np.float32)
    vx = np.random.uniform(-1.0, 1.0, n_samples).astype(np.float32)
    vy = np.random.uniform(-1.0, 1.0, n_samples).astype(np.float32)
    tx = np.random.uniform(-max_tilt * 1.2, max_tilt * 1.2, n_samples).astype(np.float32)
    ty = np.random.uniform(-max_tilt * 1.2, max_tilt * 1.2, n_samples).astype(np.float32)
    tvx = np.random.uniform(-0.2, 0.2, n_samples).astype(np.float32)
    tvy = np.random.uniform(-0.2, 0.2, n_samples).astype(np.float32)

    # Merkeze yakın durumlara daha fazla yoğunluk (fine-tuning for ultra-stability)
    n_fine = n_samples // 4
    ex[:n_fine] = np.random.normal(0, 0.03, n_fine).astype(np.float32)
    ey[:n_fine] = np.random.normal(0, 0.03, n_fine).astype(np.float32)
    vx[:n_fine] = np.random.normal(0, 0.15, n_fine).astype(np.float32)
    vy[:n_fine] = np.random.normal(0, 0.15, n_fine).astype(np.float32)

    X = np.stack([ex, ey, vx, vy, tx, ty, tvx, tvy], axis=1)
    Y = np.array([expert_action(obs) for obs in X], dtype=np.float32)
    return torch.tensor(X, dtype=torch.float32), torch.tensor(Y, dtype=torch.float32)

def main():
    print("=" * 65)
    print(" 🎯 120Hz Ultra-Kararlı Top ve Plaka Sinir Ağı Eğitimi")
    print("=" * 65)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Cihaz: {device}")

    X, Y = generate_dataset(120000)
    dataset = torch.utils.data.TensorDataset(X, Y)
    loader = torch.utils.data.DataLoader(dataset, batch_size=128, shuffle=True)

    model = PolicyNet().to(device)
    optimizer = optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-5)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=25)
    criterion = nn.MSELoss()

    for epoch in range(1, 26):
        model.train()
        total_loss = 0.0
        for batch_x, batch_y in loader:
            batch_x, batch_y = batch_x.to(device), batch_y.to(device)
            pred, _, _ = model(batch_x)
            loss = criterion(pred, batch_y)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * batch_x.size(0)
        scheduler.step()
        avg_loss = total_loss / len(dataset)
        if epoch % 5 == 0 or epoch == 1:
            print(f"Epoch {epoch:2d}/25 | MSE Loss: {avg_loss:.6f}")

    # Doğrulama: 100 Rastgele Başlangıç Durumunda Simülasyon
    model.eval()
    print("\n🔍 120Hz Simülasyon Doğrulaması (100 Test Epizodu)...")
    dt = 1.0 / 120.0
    wins = 0
    final_errors = []

    for ep in range(100):
        pos = np.random.uniform(-0.12, 0.12, size=2)
        vel = np.random.uniform(-0.4, 0.4, size=2)
        tilt = np.zeros(2)
        tilt_v = np.zeros(2)
        fell = False

        for t in range(360): # 3 saniye
            obs = [pos[0], pos[1], vel[0], vel[1], tilt[0], tilt[1], 0.0, 0.0]
            with torch.no_grad():
                inp = torch.tensor(obs, dtype=torch.float32, device=device).unsqueeze(0)
                out, _, _ = model(inp)
                act = out.squeeze(0).cpu().numpy()

            target_tilt = act * max_tilt
            wn = 32.0; zeta = 0.85
            tilt_acc = wn*wn*(target_tilt - tilt) - 2*zeta*wn*tilt_v
            tilt_v += tilt_acc * dt
            tilt += tilt_v * dt
            acc = scale * np.sin(tilt)
            vel += acc * dt
            vel *= 0.9985
            pos += vel * dt

            if np.any(np.abs(pos) > 0.145):
                fell = True
                break

        err = np.linalg.norm(pos)
        final_errors.append(err)
        if not fell and err < 0.015:
            wins += 1

    mean_err_mm = np.mean(final_errors) * 1000
    print(f"✅ Başarı Oranı: {wins}/100 (%{wins:.1f}) | Ortalama Son Hata: {mean_err_mm:.2f} mm")

    # Ağırlıkları JSON formatında dışa aktar
    w1 = model.fc1.weight.data.cpu().numpy().tolist()
    b1 = model.fc1.bias.data.cpu().numpy().tolist()
    w2 = model.fc2.weight.data.cpu().numpy().tolist()
    b2 = model.fc2.bias.data.cpu().numpy().tolist()
    w3 = model.fc3.weight.data.cpu().numpy().tolist()
    b3 = model.fc3.bias.data.cpu().numpy().tolist()

    weights_json = {
        "architecture": "8 -> 16 -> 16 -> 2",
        "rate": "120Hz",
        "w1": w1, "b1": b1,
        "w2": w2, "b2": b2,
        "w3": w3, "b3": b3,
        "synapses": [w1, w2, w3]
    }

    out_path = os.path.join(os.path.dirname(__file__), "..", "logs", "weights_120hz.json")
    out_path = os.path.abspath(out_path)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(weights_json, f)
    print(f"💾 Model ağırlıkları kaydedildi: {out_path} ({os.path.getsize(out_path)} bayt)")

if __name__ == "__main__":
    main()
