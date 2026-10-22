"""
Ball and Plate (Top ve Plaka) Gymnasium Ortamı
Soft Actor-Critic (SAC) ve Pekiştirmeli Öğrenme (RL) için fizik simülasyonu.

Fiziksel Formül:
    a_x = (5/7) * g * sin(tilt_x)
    a_y = (5/7) * g * sin(tilt_y)
"""

import math
import numpy as np
import gymnasium as gym
from gymnasium import spaces


class BallPlateEnv(gym.Env):
    """
    2 Eksenli (X, Y) servo motorlu eğik plaka üzerinde top dengeleme ortamı.
    
    Gözlem Uzayı (Observation Space) - 8 Boyut:
        [0]: x_err = x - target_x (m)
        [1]: y_err = y - target_y (m)
        [2]: vx = topun x hızı (m/s)
        [3]: vy = topun y hızı (m/s)
        [4]: tilt_x = plakanın x ekseni eğimi (rad)
        [5]: tilt_y = plakanın y ekseni eğimi (rad)
        [6]: target_vx = hedefin x hızı (m/s)
        [7]: target_vy = hedefin y hızı (m/s)
        
    Eylem Uzayı (Action Space) - 2 Boyut:
        [0]: cmd_x = servo x hedef eğim komutu [-1, 1] -> [-max_tilt, max_tilt]
        [1]: cmd_y = servo y hedef eğim komutu [-1, 1] -> [-max_tilt, max_tilt]
    """

    metadata = {"render_modes": ["human", "rgb_array"], "render_fps": 60}

    def __init__(self, render_mode=None):
        super().__init__()

        # Fizik Parametreleri
        self.dt = 1.0 / 60.0                     # 60 Hz zaman adımı
        self.g = 9.81                             # Yerçekimi ivmesi (m/s^2)
        self.plate_size = 0.30                    # Plaka boyutu: 30 cm x 30 cm
        self.limit = self.plate_size / 2.0        # Merkezden kenara mesafe (0.15 m)
        self.ball_radius = 0.018                  # Top yarıçapı: 1.8 cm
        self.coeff_rolling = 5.0 / 7.0            # Dolu küre için kaymadan yuvarlanma katsayısı
        self.damping = 0.994                      # Sürtünme ve sönümleme
        self.max_tilt = math.radians(14.0)        # Maksimum plaka eğimi (~0.244 rad / 14 derece)
        self.servo_speed = 0.22                   # 1. derece servo gecikme faktörü

        # Alan Tanımları
        # Gözlem: [x_err, y_err, vx, vy, tilt_x, tilt_y, target_vx, target_vy]
        obs_high = np.array([0.5, 0.5, 2.0, 2.0, self.max_tilt * 1.5, self.max_tilt * 1.5, 1.0, 1.0], dtype=np.float32)
        self.observation_space = spaces.Box(-obs_high, obs_high, dtype=np.float32)

        # Eylem: [-1, 1] aralığında sürekli servo komutları
        self.action_space = spaces.Box(low=-1.0, high=1.0, shape=(2,), dtype=np.float32)

        self.render_mode = render_mode
        self.step_count = 0
        self.max_steps = 600                      # 10 saniyelik bölümler (episodes)

        # Durum Değişkenleri
        self.pos = np.zeros(2, dtype=np.float32)
        self.vel = np.zeros(2, dtype=np.float32)
        self.tilt = np.zeros(2, dtype=np.float32)
        self.target = np.zeros(2, dtype=np.float32)
        self.target_vel = np.zeros(2, dtype=np.float32)

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.step_count = 0

        # Başlangıçta topu merkeze yakın rastgele bir noktaya koy
        self.pos = self.np_random.uniform(-0.08, 0.08, size=2).astype(np.float32)
        self.vel = self.np_random.uniform(-0.02, 0.02, size=2).astype(np.float32)
        self.tilt = np.zeros(2, dtype=np.float32)

        # Hedef: Merkezde veya hafif sapmalı
        self.target = np.zeros(2, dtype=np.float32)
        self.target_vel = np.zeros(2, dtype=np.float32)

        return self._get_obs(), {}

    def step(self, action):
        self.step_count += 1

        # 1. Eylemi kırp ve açıya dönüştür
        cmd = np.clip(action, -1.0, 1.0) * self.max_tilt

        # 2. Servo Gecikmesi (Aktüatör Dinamiği)
        self.tilt += (cmd - self.tilt) * self.servo_speed

        # 3. İvme Hesabı (a = (5/7) * g * sin(theta))
        # X yönü eğimi tilt[1] ile, Y yönü eğimi tilt[0] ile kontrol edilir
        acc_x = -self.coeff_rolling * self.g * math.sin(self.tilt[1])
        acc_y = self.coeff_rolling * self.g * math.sin(self.tilt[0])
        acc = np.array([acc_x, acc_y], dtype=np.float32)

        # 4. Hız ve Konum Entegrasyonu
        self.vel = (self.vel + acc * self.dt) * self.damping
        self.pos += self.vel * self.dt

        # 5. Hata ve Ödül Hesabı
        err = self.pos - self.target
        dist = float(np.linalg.norm(err))
        vel_mag = float(np.linalg.norm(self.vel))
        action_penalty = float(np.sum(np.square(action))) * 0.02

        # Ödül: Mesafe cezası + Hız cezası + Yumuşak hareket ödülü
        reward = - (dist * 12.0) - (vel_mag * 0.4) - action_penalty

        # Hedefe çok yakın kalma bonusu (Precision reward)
        if dist < 0.02:
            reward += 1.5
        elif dist < 0.04:
            reward += 0.5

        # 6. Sınır Kontrolü ve Bölüm Sonu (Termination / Truncation)
        fell_off = bool(np.any(np.abs(self.pos) > (self.limit - self.ball_radius)))
        terminated = False

        if fell_off:
            reward -= 100.0   # Büyük Düşme Cezası (Heavy falling penalty)
            terminated = True

        truncated = (self.step_count >= self.max_steps)

        return self._get_obs(), reward, terminated, truncated, {"dist": dist, "fell_off": fell_off}

    def _get_obs(self):
        err = self.pos - self.target
        obs = np.array([
            err[0],
            err[1],
            self.vel[0],
            self.vel[1],
            self.tilt[0],
            self.tilt[1],
            self.target_vel[0],
            self.target_vel[1]
        ], dtype=np.float32)
        return obs
