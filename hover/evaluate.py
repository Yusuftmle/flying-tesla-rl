"""
Evaluation & Automated Metric-Driven Title Classifier (V2)
100 bölümlük değerlendirme: Takla süresi, iniş temas hızları, RCS kullanımı,
ve kural tabanlı başlıklar ("tumbles", "flips but crashes", "lands hard", "soft landing").
"""

import sys
import os

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import numpy as np
import math

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from hover.sim import params
from hover.sim.env import RocketHoverEnv
from hover.sim.dynamics import wrap_angle

def classify_title_v2(metrics):
    """
    V3 Kural Tabanlı Otomatik Başlık Sınıflandırıcı:
    - "tumbles": Araç burguyu veya yönelimini toparlayamıyor
    - "flips but crashes": Araç 360° burguyu tamamlıyor ama dikey hızla zemine çakılıyor
    - "lands hard": Araç dik ve frenliyor ama dikey/yatay hız yumuşak iniş sınırını aşıyor
    - "soft landing": Kusursuz yumuşak iniş (|vz| <= 1.5, |vx| <= 2.5, |theta| <= 8 deg, |roll| <= 8 deg)
    """
    soft_rate = metrics["soft_landing_rate"]
    roll_rate = metrics.get("roll_completion_rate", 0.0)
    crash_rate = metrics["crash_rate"]
    vz_touch = metrics["mean_touch_vz"]

    if soft_rate >= 0.50:
        return "soft landing"
    elif roll_rate < 0.40:
        return "tumbles"
    elif crash_rate >= 0.65 or vz_touch > 3.5:
        return "flips but crashes"
    else:
        return "lands hard"

def evaluate_policy_v2(model_or_fn, num_episodes=100, seed_start=2000):
    """
    100 farklı rastgele fırlatma durumuyla politikayı test eder.
    """
    env = RocketHoverEnv(curriculum_level=2, deterministic_reset=False)

    ep_rewards = []
    ep_lens = []
    crashes = 0
    soft_landings = 0
    roll_completed = 0
    flip_recovered = 0
    tumble_times = []
    touch_vzs = []
    touch_vxs = []
    rcs_powers = []

    for ep in range(num_episodes):
        obs, _ = env.reset(seed=seed_start + ep)
        ep_reward = 0.0
        roll_step = None
        flip_step = None
        ep_rcs = []

        for step in range(params.MAX_EPISODE_STEPS):
            if hasattr(model_or_fn, "predict"):
                action, _ = model_or_fn.predict(obs, deterministic=True)
            elif callable(model_or_fn):
                action = model_or_fn(obs)
            else:
                action = np.zeros(8, dtype=np.float32)

            obs, reward, term, trunc, info = env.step(action)
            ep_reward += reward

            # 360 Derece Roll Tamamlama Tespiti
            roll_val = info.get("roll", 0.0)
            roll_deg = abs(info.get("roll_deg", 0.0))
            if (roll_val >= 5.8 or roll_deg < 15.0) and roll_val > 3.0 and roll_step is None:
                roll_step = step

            # Pitch düzleme tespiti: |theta| < 20 derece
            th_deg = abs(info["theta_deg"])
            if th_deg < 20.0 and flip_step is None:
                flip_step = step

            # RCS güç kullanımı
            rcs_p = float(np.mean(np.abs(info["rcs"])))
            ep_rcs.append(rcs_p)

            if term or trunc:
                touch_vzs.append(abs(info["vz"]))
                touch_vxs.append(abs(info["vx"]))
                break

        ep_lens.append(step + 1)
        ep_rewards.append(ep_reward)
        rcs_powers.append(np.mean(ep_rcs) if ep_rcs else 0.0)

        if roll_step is not None:
            roll_completed += 1
            tumble_times.append(roll_step / params.CONTROL_FREQ)
        elif flip_step is not None:
            flip_recovered += 1
            tumble_times.append(flip_step / params.CONTROL_FREQ)
        else:
            tumble_times.append(ep_lens[-1] / params.CONTROL_FREQ)

        if env.state.soft_landed:
            soft_landings += 1
        elif env.state.crashed:
            crashes += 1

    metrics = {
        "num_episodes": num_episodes,
        "mean_ep_len": float(np.mean(ep_lens)),
        "mean_reward": float(np.mean(ep_rewards)),
        "std_reward": float(np.std(ep_rewards)),
        "soft_landing_rate": float(soft_landings / num_episodes),
        "crash_rate": float(crashes / num_episodes),
        "roll_completion_rate": float(roll_completed / num_episodes),
        "flip_recovery_rate": float(flip_recovered / num_episodes),
        "mean_tumble_time_sec": float(np.mean(tumble_times)),
        "mean_touch_vz": float(np.mean(touch_vzs)) if touch_vzs else 0.0,
        "mean_touch_vx": float(np.mean(touch_vxs)) if touch_vxs else 0.0,
        "mean_rcs_usage_N": float(np.mean(rcs_powers))
    }

    metrics["title"] = classify_title_v2(metrics)
    return metrics

if __name__ == "__main__":
    from stable_baselines3 import SAC
    ckpt_dir = "hover/logs/checkpoints"
    steps = [0, 20000, 100000, 300000, 1000000]

    print("=" * 85)
    print("   ROKET ARAÇ V2 - 100 BÖLÜMLÜK CHECKPOINT DEĞERLENDİRMESİ")
    print("=" * 85)
    print(f"{'Adım':<9} | {'Yumuşak':<8} | {'Çarpma':<8} | {'Toparlama':<10} | {'Takla(s)':<9} | {'Temas Vz':<9} | {'Başlık':<18}")
    print("-" * 85)

    for st in steps:
        ckpt_path = os.path.join(ckpt_dir, f"ckpt_{st}.zip")
        if not os.path.exists(ckpt_path):
            continue

        if st == 0:
            m = evaluate_policy_v2(lambda obs: np.random.uniform(-1, 1, 8), num_episodes=100)
        else:
            env = RocketHoverEnv()
            model = SAC.load(ckpt_path, env=env, device="cpu")
            m = evaluate_policy_v2(model, num_episodes=100)

        print(f"{st:<9} | {m['soft_landing_rate']*100:>6.1f}% | {m['crash_rate']*100:>6.1f}% | {m['flip_recovery_rate']*100:>8.1f}% | {m['mean_tumble_time_sec']:>7.2f}s | {m['mean_touch_vz']:>7.2f}m/s | {m['title']:<18}")

    print("=" * 85)
