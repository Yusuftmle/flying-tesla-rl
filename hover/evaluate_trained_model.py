"""
Eğitilen Yeni Sinir Ağını 4 Tekerlekli Fizik Ortamında Test Eden Script
Tüm Müfredat Seviyelerinde (Level 0, Level 1, Level 2) 100 test uçuşu simüle eder ve
%100 Saf Modelin başarı oranını, iniş hızlarını ve açılarını raporlar.
"""

import sys
import os
import math
import numpy as np
import torch

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from hover.sim.env import RocketHoverEnv
from hover.train_expert_policy import RocketCarPolicy
from hover.sim import params

def evaluate_model(model_path="hover/logs/best_policy.pth", num_tests=50):
    if not os.path.exists(model_path):
        print(f"Model dosyası bulunamadı: {model_path}")
        return

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = RocketCarPolicy().to(device)
    model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
    model.eval()

    print(f"🤖 Eğitilen Sinir Ağı (%100 Saf Model) 4 Tekerlekli Fizik ile Test Ediliyor ({num_tests} Uçuş/Seviye)...")

    overall_results = {}

    for lvl in [0, 1, 2]:
        env = RocketHoverEnv(curriculum_level=lvl, deterministic_reset=False)
        soft_landings = 0
        crashes = 0
        touchdown_vzs = []
        touchdown_vxs = []
        x_errors = []
        fuels = []
        reasons = {}

        for i in range(num_tests):
            obs, _ = env.reset(seed=i + 500)
            done = False

            while not done:
                obs_tensor = torch.FloatTensor(obs).unsqueeze(0).to(device)
                with torch.no_grad():
                    action = model(obs_tensor).cpu().numpy()[0]

                obs, reward, terminated, truncated, info = env.step(action)
                done = terminated or truncated

            if env.state.soft_landed:
                soft_landings += 1
                touchdown_vzs.append(abs(env.state.vz))
                touchdown_vxs.append(abs(env.state.vx))
                x_errors.append(abs(env.state.x - params.TARGET_X))
                fuels.append(env.state.fuel_mass)
            else:
                crashes += 1

            r = env.state.terminal_reason or ("soft_landing" if env.state.soft_landed else "timeout")
            reasons[r] = reasons.get(r, 0) + 1

        success_rate = (soft_landings / num_tests) * 100.0
        overall_results[lvl] = {
            "success_rate": success_rate,
            "soft_landings": soft_landings,
            "crashes": crashes,
            "avg_vz": np.mean(touchdown_vzs) if touchdown_vzs else 0.0,
            "avg_vx": np.mean(touchdown_vxs) if touchdown_vxs else 0.0,
            "avg_fuel": np.mean(fuels) if fuels else 0.0,
            "reasons": reasons
        }

        print(f"\n📊 Seviye {lvl} Test Sonuçları:")
        print(f"  Başarılı Yumuşak İniş: {soft_landings} / {num_tests} (%{success_rate:.1f})")
        print(f"  Sonuç Dağılımı: {reasons}")
        if soft_landings > 0:
            print(f"  Ortalama Dikey İniş Hızı (VZ): {np.mean(touchdown_vzs):.2f} m/s (Limit: ≤ 1.5 m/s)")
            print(f"  Ortalama Yatay İniş Hızı (VX): {np.mean(touchdown_vxs):.2f} m/s (Limit: ≤ 2.2 m/s)")
            print(f"  Ortalama Kalan Yakıt: {np.mean(fuels):.2f} kg / 45.0 kg")

    return overall_results

if __name__ == "__main__":
    evaluate_model()
