"""
Ball and Plate (Top ve Plaka) Gymnasium Ortamı
Gerçekçi SAC eğitimi için fizik ortamı.
"""

import math
import numpy as np
import gymnasium as gym
from gymnasium import spaces


class BallPlateEnv(gym.Env):
    """
    Ball and Plate Environment
    Gözlem (8): [x_err, y_err, vx, vy, tilt_x, tilt_y, target_vx, target_vy]
    Aksiyon (2): [cmd_x, cmd_y] [-1, 1] -> [-max_tilt, max_tilt]
    """

    metadata = {"render_modes": ["human"], "render_fps": 30}

    def __init__(self, render_mode=None):
        super().__init__()

        self.dt = 1.0 / 30.0                     # 30 Hz zaman adımı
        self.g = 9.81                             # m/s^2
        self.L = 0.15                             # Plaka yarı boyutu (15 cm)
        self.ball_radius = 0.018                  # Top yarıçapı
        self.max_tilt = math.radians(12.0)        # Max eğim: 12 derece (~0.2094 rad)
        self.servo_rate = 0.25                    # Servo gecikmesi (0.25 filtre katsayısı)
        self.damping = 0.995                      # Sönümleme
        self.max_steps = 300                      # 10 saniye (300 adım)

        # Gözlem uzayı: 8 boyutlu Box
        obs_high = np.array([1.0, 1.0, 5.0, 5.0, self.max_tilt * 2, self.max_tilt * 2, 2.0, 2.0], dtype=np.float32)
        self.observation_space = spaces.Box(-obs_high, obs_high, dtype=np.float32)

        # Eylem uzayı: [-1, 1]
        self.action_space = spaces.Box(low=-1.0, high=1.0, shape=(2,), dtype=np.float32)

        self.render_mode = render_mode
        self.t = 0

        self.pos = np.zeros(2, dtype=np.float32)
        self.vel = np.zeros(2, dtype=np.float32)
        self.tilt = np.zeros(2, dtype=np.float32)
        self.target = np.zeros(2, dtype=np.float32)
        self.target_vel = np.zeros(2, dtype=np.float32)

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.t = 0

        # Başlangıç durumu: Top rastgele konumda [-0.08, 0.08]
        if options and "pos" in options:
            self.pos = np.array(options["pos"], dtype=np.float32)
        else:
            self.pos = self.np_random.uniform(-0.08, 0.08, size=2).astype(np.float32)

        if options and "vel" in options:
            self.vel = np.array(options["vel"], dtype=np.float32)
        else:
            self.vel = self.np_random.uniform(-0.01, 0.01, size=2).astype(np.float32)

        self.tilt = np.zeros(2, dtype=np.float32)

        # Hedef merkez veya merkeze çok yakın
        if options and "target" in options:
            self.target = np.array(options["target"], dtype=np.float32)
        else:
            self.target = np.zeros(2, dtype=np.float32)

        self.target_vel = np.zeros(2, dtype=np.float32)

        return self._get_obs(), {}

    def step(self, action):
        action = np.clip(action, -1.0, 1.0)
        cmd = action * self.max_tilt

        # 1. Servo gecikmesi (1. derece aktüatör dinamiği)
        self.tilt += (cmd - self.tilt) * self.servo_rate

        # 2. İvme: a = (5/7) * g * sin(tilt)
        # tilt[0] -> X ivmesi, tilt[1] -> Y ivmesi
        acc = (5.0 / 7.0) * self.g * np.sin(self.tilt)

        # 3. Hız ve Konum (Euler entegrasyonu + sönümleme)
        self.vel = (self.vel + acc * self.dt) * self.damping
        self.pos += self.vel * self.dt
        self.t += 1

        # 4. Hata ve Ödül (Dengelemeyi teşvik eden, erken intiharı önleyen ödül)
        err = self.pos - self.target
        dist = float(np.linalg.norm(err))
        speed = float(np.linalg.norm(self.vel))

        # Canlı kalma + merkeze yakınlık ödülü - hız sönümleme
        reward = 1.0 - 5.0 * dist - 0.1 * speed

        # 5. Düşme / Sınır kontrolü (Plaka yarı boyutu L = 0.15 m)
        fell = bool(np.any(np.abs(self.pos) > self.L))
        if fell:
            reward -= 50.0

        terminated = fell
        truncated = (self.t >= self.max_steps)

        return self._get_obs(), reward, terminated, truncated, {"dist": dist, "fell": fell}

    def _get_obs(self):
        err = self.pos - self.target
        # Donanıma benzer küçük sensör gürültüsü
        noise = self.np_random.normal(0.0, 0.001, size=2).astype(np.float32)
        noisy_err = err + noise

        obs = np.array([
            noisy_err[0],
            noisy_err[1],
            self.vel[0],
            self.vel[1],
            self.tilt[0],
            self.tilt[1],
            self.target_vel[0],
            self.target_vel[1]
        ], dtype=np.float32)
        return obs
