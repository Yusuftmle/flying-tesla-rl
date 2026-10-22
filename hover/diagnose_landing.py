import os
import sys
import numpy as np
import math

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from hover.sim import params
from hover.sim.env import RocketHoverEnv
from stable_baselines3 import SAC

ckpt_path = "hover/logs/checkpoints/ckpt_1000000.zip"
if not os.path.exists(ckpt_path):
    print("Checkpoint not found:", ckpt_path)
    sys.exit(1)

env = RocketHoverEnv(curriculum_level=2, deterministic_reset=False)
model = SAC.load(ckpt_path, env=env, device="cpu")

print("--- DIAGNOSTIC RUN: 20 EPISODES AT LEVEL 2 ---")
print(f"{'Ep':<4} | {'Steps':<6} | {'Touch Z':<8} | {'Touch Vz':<9} | {'Touch Vx':<9} | {'Pitch Deg':<10} | {'Touch X':<8} | {'Outcome'}")
print("-" * 80)

for ep in range(20):
    obs, _ = env.reset(seed=5000 + ep)
    for st in range(params.MAX_EPISODE_STEPS):
        action, _ = model.predict(obs, deterministic=True)
        obs, reward, term, trunc, info = env.step(action)
        if term or trunc:
            soft = info["soft_landed"]
            reason = info["terminal_reason"]
            vz = info["vz"]
            vx = info["vx"]
            th = info["theta_deg"]
            x = info["x"]
            z = info["z"]
            print(f"{ep:<4} | {st+1:<6} | {z:<8.2f} | {vz:<9.2f} | {vx:<9.2f} | {th:<10.2f} | {x:<8.2f} | {reason}")
            break
