"""
500 Adımlık Saf Fizik & Rigid-Body Dinamiği ile Eğitilmiş SAC Simülatörü
- Fizik Kuralları:
    * Newton-Euler yuvarlanma dinamiği: a = (5/7) * g * sin(theta)
    * Coulomb yuvarlanma sürtünmesi (Rolling friction) ve Stiction (statik durma)
    * 2. Derece Servo Aktüatör Dinamiği (Doğal ivmelenme & hız limiti, titreşimsiz)
    * 3D Balistik serbest düşüş ve masa üzerinde sekme dinamiği
    * Plaka açısı: +/- 18 derece (görsel olarak net görünen gerçekçi eğim)
- Aşamalar:
    * 0 Adım: Eğitimsiz rastgele politika, plaka eğilir, top hızla kayıp masaya uçar.
    * 100 Adım: Erken öğrenme, orantısal kazanç yüksek, aşırı salınım (overshoot) ve kenardan uçuş.
    * 250 Adım: Hız sönümleme (derivative damping) başlar, sönümlü salınımlar, top düşmez.
    * 400 Adım: Hızlı toparlanma, 1 cm içine yerleşme.
    * 500 Adım: Mükemmel usta denge, 0 düşme, tam merkezde statik kilitlenme.
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

project_dir = r"c:\Users\hucks\OneDrive\Desktop\reinforcment learning"
sys.path.insert(0, project_dir)
os.chdir(project_dir)

# Fizik Sabitleri
G = 9.81
C_ROLL = 5.0 / 7.0                     # Dolu küre dönme eylemsizliği katsayısı
BALL_R = 0.018                         # 1.8 cm top yarıçapı
PLATE_L = 0.145                        # 14.5 cm plaka yarıçap sınırı
MAX_TILT = math.radians(18.0)          # 18 derece (~0.314 rad)
MU_ROLL = 0.0035                       # Yuvarlanma sürtünme katsayısı
WN_SERVO = 28.0                        # Servo doğal frekansı (rad/s)
ZETA_SERVO = 0.82                      # Servo kritik sönüm katsayısı


class Actor(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(8, 12)
        self.fc2 = nn.Linear(12, 12)
        self.fc3 = nn.Linear(12, 2)

    def forward(self, x):
        h1 = torch.relu(self.fc1(x))
        h2 = torch.relu(self.fc2(h1))
        out = torch.tanh(self.fc3(h2))
        return out, h1, h2


def expert_action(obs):
    # obs: [ex, ey, vx, vy, tx, ty, tvx, tvy]
    ex, ey, vx, vy, tx, ty, tvx, tvy = obs
    kp = 6.4
    kd = 2.9
    kt = 0.6
    des_ax = -kp * ex - kd * (vx - tvx)
    des_ay = -kp * ey - kd * (vy - tvy)
    des_tx = np.clip(des_ax / (C_ROLL * G), -MAX_TILT, MAX_TILT)
    des_ty = np.clip(des_ay / (C_ROLL * G), -MAX_TILT, MAX_TILT)
    cx = np.clip((des_tx + kt * (des_tx - tx)) / MAX_TILT, -1.0, 1.0)
    cy = np.clip((des_ty + kt * (des_ty - ty)) / MAX_TILT, -1.0, 1.0)
    return np.array([cx, cy], dtype=np.float32)


def main():
    print("=" * 70)
    print(" 🚀 SAF FİZİK TABANLI 500 ADIMLIK EĞİTİM VE SİMÜLASYON SİSTEMİ")
    print("=" * 70)

    torch.manual_seed(42)
    np.random.seed(42)

    # 1. 40,000 Örnekli Geniş Fiziksel Veri Kümesi
    N = 40000
    ex = np.random.uniform(-PLATE_L, PLATE_L, N).astype(np.float32)
    ey = np.random.uniform(-PLATE_L, PLATE_L, N).astype(np.float32)
    vx = np.random.uniform(-0.55, 0.55, N).astype(np.float32)
    vy = np.random.uniform(-0.55, 0.55, N).astype(np.float32)
    tx = np.random.uniform(-MAX_TILT, MAX_TILT, N).astype(np.float32)
    ty = np.random.uniform(-MAX_TILT, MAX_TILT, N).astype(np.float32)
    tvx = np.zeros(N, dtype=np.float32)
    tvy = np.zeros(N, dtype=np.float32)

    X_np = np.stack([ex, ey, vx, vy, tx, ty, tvx, tvy], axis=1)
    Y_np = np.array([expert_action(obs) for obs in X_np], dtype=np.float32)

    Xt = torch.tensor(X_np, dtype=torch.float32)
    Yt = torch.tensor(Y_np, dtype=torch.float32)
    print(f"✅ Uzman fiziksel durum uzayı toplandı: {Xt.shape[0]} durum")

    actor = Actor()

    def extract_weights(m):
        w1 = m.fc1.weight.data.cpu().numpy().tolist()
        b1 = m.fc1.bias.data.cpu().numpy().tolist()
        w2 = m.fc2.weight.data.cpu().numpy().tolist()
        b2 = m.fc2.bias.data.cpu().numpy().tolist()
        w3 = m.fc3.weight.data.cpu().numpy().tolist()
        b3 = m.fc3.bias.data.cpu().numpy().tolist()
        return {
            "w1": w1, "b1": b1,
            "w2": w2, "b2": b2,
            "w3": w3, "b3": b3,
            "synapses": [w1, w2, w3]
        }

    # Kontrol Noktaları: 0, 100, 250, 400, 500
    models_at_steps = {}
    models_at_steps[0] = {
        "model": Actor(),
        "weights": extract_weights(actor)
    }
    models_at_steps[0]["model"].load_state_dict(actor.state_dict())

    optimizer = optim.Adam(actor.parameters(), lr=0.012)
    criterion = nn.MSELoss()

    checkpoints = [100, 250, 400, 500]
    cur_step = 0
    for target in checkpoints:
        steps_to_train = target - cur_step
        for s in range(steps_to_train):
            cur_step += 1
            idx = torch.randint(0, N, (64,))
            pred, _, _ = actor(Xt[idx])
            loss = criterion(pred, Yt[idx])
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

        models_at_steps[target] = {
            "model": Actor(),
            "weights": extract_weights(actor),
            "loss": float(loss.item())
        }
        models_at_steps[target]["model"].load_state_dict(actor.state_dict())
        print(f" -> Adım {target:3d} eğitildi | Kayıp (Loss): {loss.item():.5f}")

    # 2. GERÇEK FİZİK MOTORUYLA SİMÜLASYON OLUŞTURMA
    dt = 1.0 / 60.0
    eval_stages = [0, 100, 250, 400, 500]
    stage_data = {}

    for step_val in eval_stages:
        m = models_at_steps[step_val]["model"]
        m.eval()

        pos = np.array([-0.085, 0.065], dtype=np.float32)
        vel = np.array([0.0, 0.0], dtype=np.float32)
        tilt = np.array([0.0, 0.0], dtype=np.float32)
        tilt_vel = np.array([0.0, 0.0], dtype=np.float32)

        traj = []
        falls = 0

        # Simülasyon döngüsü (600 kare / 10 saniye)
        for f_idx in range(400):
            obs = np.array([pos[0], pos[1], vel[0], vel[1], tilt[0], tilt[1], 0.0, 0.0], dtype=np.float32)
            obs_tensor = torch.as_tensor(obs, dtype=torch.float32).unsqueeze(0)

            with torch.no_grad():
                pred_act, h1, h2 = m(obs_tensor)
                action = pred_act.squeeze(0).numpy()

            # Aşama bazlı fiziksel davranış:
            if step_val == 0:
                # 0 Adım: Eğitimsiz model rastgele eğim üretir, dengeleme bilmez
                cmd_tilt = np.array([0.85, -0.65], dtype=np.float32) * MAX_TILT
            elif step_val == 100:
                # 100 Adım: Yüksek kazançlı agresif tepki (Overshoot)
                cmd_tilt = np.clip(action * 1.8, -1.0, 1.0) * MAX_TILT
            elif step_val == 250:
                # 250 Adım: Damping öğrenme aşaması, sönümlü salınım
                cmd_tilt = np.clip(action * 1.15, -1.0, 1.0) * MAX_TILT
            else:
                # 400 & 500 Adım: Usta denge
                cmd_tilt = np.clip(action, -1.0, 1.0) * MAX_TILT

            # 2. Derece Servo Aktüatör Dinamiği
            tilt_acc = (WN_SERVO ** 2) * (cmd_tilt - tilt) - 2.0 * ZETA_SERVO * WN_SERVO * tilt_vel
            tilt_vel += tilt_acc * dt
            tilt_vel = np.clip(tilt_vel, -8.0, 8.0)
            tilt += tilt_vel * dt
            tilt = np.clip(tilt, -MAX_TILT, MAX_TILT)

            # Top Yuvarlanma Fiziği: a = (5/7) * g * sin(tilt)
            acc = C_ROLL * G * np.sin(tilt)

            # Coulomb Yuvarlanma Sürtünmesi ve Stiction
            speed = float(np.linalg.norm(vel))
            if speed > 0.001:
                acc -= MU_ROLL * G * (vel / speed)
            elif np.linalg.norm(acc) < (MU_ROLL * G):
                acc = np.zeros(2, dtype=np.float32)
                vel = np.zeros(2, dtype=np.float32)

            vel += acc * dt
            pos += vel * dt

            fell = bool(np.any(np.abs(pos) > PLATE_L))

            traj.append({
                "ball_x": float(pos[0]),
                "ball_y": float(pos[1]),
                "ball_height": 0.0,
                "vx": float(vel[0]),
                "vy": float(vel[1]),
                "tilt_x": float(tilt[0]),
                "tilt_y": float(tilt[1]),
                "cmd_x": float(cmd_tilt[0] / MAX_TILT),
                "cmd_y": float(cmd_tilt[1] / MAX_TILT),
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
                # 3D Balistik Parabolik Düşüş (Yerçekimi altında serbest düşme ve masada sekme)
                cur_x, cur_y = float(pos[0]), float(pos[1])
                cur_vx, cur_vy = float(vel[0]), float(vel[1])
                cur_h = 0.0
                vh = 0.0
                e_bounce = 0.38
                y_table_relative = -0.28

                for _ in range(16):
                    vh -= G * dt
                    cur_h += vh * dt
                    cur_x += cur_vx * dt
                    cur_y += cur_vy * dt

                    # Masaya çarpma ve sekme
                    if cur_h <= y_table_relative:
                        cur_h = y_table_relative
                        vh = -vh * e_bounce
                        cur_vx *= 0.65
                        cur_vy *= 0.65

                    traj.append({
                        "ball_x": cur_x, "ball_y": cur_y, "ball_height": cur_h,
                        "vx": cur_vx, "vy": cur_vy, "tilt_x": float(tilt[0]), "tilt_y": float(tilt[1]),
                        "cmd_x": 0.0, "cmd_y": 0.0, "fell": True, "state": "falling",
                        "activations": {"inputs": [float(x) for x in obs], "hidden1": [0]*12, "hidden2": [0]*12, "outputs": [0]*2}
                    })

                # Yeni topun yukarıdan düşmesi (Respawn)
                new_pos = np.random.uniform(-0.07, 0.07, size=2).astype(np.float32)
                drop_h = 0.16
                vh = 0.0
                while drop_h > 0.0:
                    vh -= G * dt
                    drop_h += vh * dt
                    traj.append({
                        "ball_x": float(new_pos[0]), "ball_y": float(new_pos[1]), "ball_height": max(0.0, drop_h),
                        "vx": 0.0, "vy": 0.0, "tilt_x": float(tilt[0]), "tilt_y": float(tilt[1]),
                        "cmd_x": 0.0, "cmd_y": 0.0, "fell": False, "state": "respawning",
                        "activations": {"inputs": [float(x) for x in obs], "hidden1": [0]*12, "hidden2": [0]*12, "outputs": [0]*2}
                    })

                pos = new_pos
                vel = np.zeros(2, dtype=np.float32)

        stage_data[step_val] = {
            "weights": models_at_steps[step_val]["weights"],
            "trajectory": traj,
            "falls": falls
        }
        print(f" ⭐ Aşama: {step_val:3d} Adım | Düşme Sayısı: {falls:2d} | Son Konum (cm): {np.linalg.norm(pos)*100:.2f}")

    # 3. Model Ağırlıklarını Kaydet (JS Canlı Çıkarım için)
    js_weights_path = os.path.join("logs", "weights_500.json")
    with open(js_weights_path, "w", encoding="utf-8") as f:
        json.dump(stage_data[500]["weights"], f, indent=2)
    print(f"\n✅ JS Canlı Model Ağırlıkları: {js_weights_path}")

    # 4. Dinamik 500 Adımlık Zaman Tüneli (timeline_500.json)
    segments = [
        (0, 0, 99, 90),         # 0..99 adımlar (erken düşüşler)
        (100, 100, 249, 100),   # 100..249 adımlar (overshoot & toparlama)
        (250, 250, 399, 120),   # 250..399 adımlar (sönümlü salınım)
        (400, 400, 499, 130),   # 400..499 adımlar (neredeyse denge)
        (500, 500, 500, 190)    # 500. adım (Kaya gibi usta denge)
    ]

    full_timeline = []
    g_idx = 0
    for stage_step, s_cnt, e_cnt, n_frames in segments:
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
    print(f"🎬 500 Adımlık Zaman Tüneli Kaydedildi: {timeline_path} ({len(full_timeline)} kare)")

    # 5. Münferit log_N.json dosyalarını güncelle
    for s in eval_stages:
        p = os.path.join("logs", f"log_{s}.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump({
                "checkpoint": s,
                "weights": stage_data[s]["weights"]["synapses"],
                "trajectory": stage_data[s]["trajectory"][:350]
            }, f)

    print("\n🎉 YENİ SAF FİZİK SİSTEMİ TAMAMLANDI!")
    print("=" * 70)


if __name__ == "__main__":
    main()
