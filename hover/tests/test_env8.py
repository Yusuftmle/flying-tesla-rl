import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from hover.sim.env import RocketHoverEnv
import numpy as np

env = RocketHoverEnv(curriculum_level=2)
obs, info = env.reset(seed=123)
print('Observation shape:', obs.shape)
assert obs.shape == (12,), f'Expected (12,), got {obs.shape}'

for st in range(10):
    action = np.random.uniform(-1, 1, size=8).astype(np.float32)
    obs, r, term, trunc, info = env.step(action)
    print(f"Step {st+1}: z={info['z']:.2f}, vz={info['vz']:.2f}, r={r:.2f}, thrusters={info['thrusters'].shape}, rcs={info['rcs'].shape}")
print('ENV TEST PASSED SUCCESSFULLY!')
