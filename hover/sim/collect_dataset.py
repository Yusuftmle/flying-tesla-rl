"""
Usta Pilot Veri Seti Toplama Scripti (Expert Dataset Generator - V4)
Farklı rampa hızları, ters bırakma irtifaları, kaotik savrulmalar ve rüzgarlar altında
Usta Pilot (ExpertPilot) ile 2000 uçuş simüle eder ve (Gözlem, Aksiyon) çiftlerini kaydeder.
Plume Zemin Etkisi ve Coulomb Sürtünmesi içeren V4 fiziğiyle eğitilmek üzere veri üretir.
"""

import os
import sys
import math
import numpy as np

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from hover.sim.env import RocketHoverEnv
from hover.sim.expert import ExpertPilot
from hover.sim.launch import get_launch_state
from hover.sim.dynamics import VehicleState
from hover.sim import params

def collect_expert_demonstrations(target_successful=1200, save_path="hover/logs/expert_dataset.npz"):
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    env = RocketHoverEnv(curriculum_level=2, deterministic_reset=False)
    expert = ExpertPilot()

    all_obs = []
    all_next_obs = []
    all_acts = []
    all_rews = []
    all_dones = []
    soft_landings = 0
    episodes_attempted = 0
    fuels_left = []

    print(f"🚀 Usta Pilot ile V4 Veri Seti Toplanıyor ({target_successful} Başarılı Uçuş Hedefi)...")

    while soft_landings < target_successful:
        episodes_attempted += 1
        obs, _ = env.reset()

        done = False
        ep_obs = []
        ep_next_obs = []
        ep_acts = []
        ep_rews = []
        ep_dones = []

        while not done:
            act = expert.compute_action(env.state, obs=obs, wind_x=env.wind_x)
            next_obs, reward, terminated, truncated, info = env.step(act)
            done = terminated or truncated

            ep_obs.append(obs)
            ep_next_obs.append(next_obs)
            ep_acts.append(act)
            ep_rews.append(reward)
            ep_dones.append(done)

            obs = next_obs

        # Sektörel Standart: Survivor Bias (Hayatta Kalan Yanılgısı) tamamen kaldırıldı.
        # Bir bölüm kaza ile sonuçlansa bile, kaza anına kadar olan tüm adımlarda
        # uzman kontrolcünün ürettiği kurtarma ve düzeltme aksiyonları (Recovery States)
        # modelin Covariate Shift yaşamaması için hayati önem taşır.
        all_obs.extend(ep_obs)
        all_next_obs.extend(ep_next_obs)
        all_acts.extend(ep_acts)
        all_rews.extend(ep_rews)
        all_dones.extend(ep_dones)

        if env.state.soft_landed:
            soft_landings += 1
            fuels_left.append(env.state.fuel_mass)

        if episodes_attempted % 150 == 0 and len(all_obs) > 0:
            pct = (soft_landings / episodes_attempted) * 100.0
            avg_f = np.mean(fuels_left) if fuels_left else 0.0
            print(f"  [{episodes_attempted:4d} Uçuş] Başarılı İniş: {soft_landings} (%{pct:.1f}) | Kurtarma Dahil Toplam Adım: {len(all_obs):,} | Ort. Yakıt: {avg_f:.2f} kg")

    obs_arr = np.array(all_obs, dtype=np.float32)
    next_obs_arr = np.array(all_next_obs, dtype=np.float32)
    acts_arr = np.array(all_acts, dtype=np.float32)
    rews_arr = np.array(all_rews, dtype=np.float32)
    dones_arr = np.array(all_dones, dtype=bool)

    print(f"\n✅ Veri Seti Toplama Tamamlandı (Survivor Bias Yok - Tam Durum Uzayı Kapsamı):")
    print(f"  Toplam Uçuş: {episodes_attempted} | Başarılı Yumuşak İniş: {soft_landings} (%{(soft_landings / episodes_attempted)*100:.1f})")
    print(f"  Kurtarma ve Düzeltme Adımları Dahil Toplam Geçiş: {obs_arr.shape[0]:,}")
    print(f"  Ortalama Kalan Yakıt: {np.mean(fuels_left) if fuels_left else 0.0:.2f} kg (Depo: 45 kg)")
    print(f"  Gözlem Matrisi (X): {obs_arr.shape}")
    print(f"  Aksiyon Matrisi (Y): {acts_arr.shape}")

    np.savez_compressed(
        save_path,
        observations=obs_arr,
        next_observations=next_obs_arr,
        actions=acts_arr,
        rewards=rews_arr,
        dones=dones_arr
    )
    print(f"  💾 Veri seti kaydedildi: {save_path}")
    return save_path

if __name__ == "__main__":
    collect_expert_demonstrations(target_successful=1200)
