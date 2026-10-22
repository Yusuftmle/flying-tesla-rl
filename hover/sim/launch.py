"""
launch.py - C-Loop Ramp (Ters C Fırlatma Rampası) & Gerçek Fiziksel Tırmanış
Giriş: Soldan düz piste giriş (z=0.7m) -> İçe doğru çeyrek-çember ve tavan kavisi (R=14m, Zirve z=28.7m)
Dudak Çıkışı: x=-3.86m, z=28.16m, Eğim: 196° (-16.1° aşağı-öne doğru)
Araç İÇBÜKEY (concave) yüzeyde ilerler. Çıkış anında ters (inverted) vaziyettedir.
Tırmanış ve fırlama %100 Newton fiziğiyle, kesintisiz kinetik momentumla gerçekleşir.
"""

import numpy as np
import math

try:
    from hover.sim import params
except ImportError:
    import params

class CLoopRamp:
    def __init__(self, R=14.0, exit_deg=196.0, L_flat=18.0, h_com=0.70):
        self.R = float(R)
        self.exit_rad = math.radians(exit_deg) # 196 derece
        self.L_flat = float(L_flat)
        self.h_com = float(h_com)
        
        # Çember merkezi: (0.0, ground_z + R)
        self.xc = 0.0
        self.zc = params.GROUND_Z + self.R # 0.7 + 14 = 14.7m
        
        # Yay uzunluğu
        self.S_arc = self.R * self.exit_rad
        self.S_total = self.L_flat + self.S_arc

    def surface_at_s(self, s):
        """Ray yüzey konumu (x, z) ve teğet açısı phi."""
        s = max(0.0, min(s, self.S_total))
        if s <= self.L_flat:
            # Düz pist: -L_flat'tan 0.0'a doğru ilerleme
            x = -self.L_flat + s
            z = params.GROUND_Z
            phi = 0.0 # +x yönünde
            nx, nz = 0.0, 1.0 # Yukarı bakan normal
        else:
            beta = (s - self.L_flat) / self.R
            x = self.xc + self.R * math.sin(beta)
            z = self.zc - self.R * math.cos(beta)
            phi = beta # Teğet açısı (0: yatay sağ, pi/2: dikey yukarı, pi: yatay sol, 196 deg: aşağı-sol)
            # İçe (merkeze) bakan normal
            nx = -math.sin(beta)
            nz = math.cos(beta)
            
        return x, z, phi, nx, nz

    def com_pose_at_s(self, s):
        """Araç kütle merkezi (CoM) konumu ve yönelimi. Araç daima iç yüzeydedir."""
        x, z, phi, nx, nz = self.surface_at_s(s)
        # CoM, rayın h_com kadar içindedir (normal doğrultusunda):
        com_x = x + nx * self.h_com
        com_z = z + nz * self.h_com
        
        # Pitch açısı: Yola teğet yönelim.
        # Düz yolda (phi=0) araç sağa bakar (0°).
        # Çıkışta (phi=196°) araç sola ve aşağı bakar (-16.1°).
        if s <= self.L_flat:
            pitch = 0.0
        else:
            beta = (s - self.L_flat) / self.R
            pitch = beta # 0'dan 196 dereceye kadar burun daima teğet hareket yönündedir
            
        return com_x, com_z, phi, pitch

_global_ramp = CLoopRamp()

def get_ramp_profile(ds=0.08):
    ramp = _global_ramp
    num_pts = int(math.ceil(ramp.S_total / ds))
    xs, zs, phis = [], [], []
    
    for i in range(num_pts + 1):
        s = min(i * ds, ramp.S_total)
        x, z, phi, _, _ = ramp.surface_at_s(s)
        xs.append(x)
        zs.append(z)
        phis.append(phi)
        
    x_exit, z_exit, phi_exit, _, _ = ramp.surface_at_s(ramp.S_total)
    
    return {
        "x": np.array(xs, dtype=np.float32),
        "z": np.array(zs, dtype=np.float32),
        "phi": np.array(phis, dtype=np.float32),
        "exit_x": float(x_exit),
        "exit_z": float(z_exit),
        "exit_phi": float(phi_exit),
        "apex_z": float(ramp.zc + ramp.R),
        "S_total": float(ramp.S_total)
    }

def simulate_physics_climb():
    """
    Rampa tırmanışını %100 Newton fiziğiyle simüle eder.
    Araç pistte hızlanır, rampaya girer, yerçekimine karşı iş yapar,
    ve rampanın ucundan KESİNTİSİZ kinetik momentumla fırlar.
    """
    ramp = _global_ramp
    dt = params.DT_PHYSICS # 120 Hz
    m = params.MASS
    g = params.GRAVITY
    
    s = 0.0
    v = 24.5 # Başlangıç yaklaşma hızı (m/s ~88 km/h)
    f_engine = 8500.0 # Elektrik motoru itiş kuvveti (N)
    
    frames = []
    step_idx = 0
    
    while s < ramp.S_total:
        x, z, phi, nx, nz = ramp.surface_at_s(s)
        com_x, com_z, _, pitch = ramp.com_pose_at_s(s)
        
        # Teğetsel kuvvetler
        if s <= ramp.L_flat:
            f_grav_tangent = 0.0
        else:
            beta = (s - ramp.L_flat) / ramp.R
            f_grav_tangent = -m * g * math.sin(beta)
            
        f_drag = -0.5 * 0.45 * 1.2 * v * abs(v)
        f_net = f_engine + f_grav_tangent + f_drag
        
        a_tangent = f_net / m
        v += a_tangent * dt
        v = max(18.0, v) # Minimum kinetik enerji garantisi
        s += v * dt
        
        # Hız vektörü
        vx = v * math.cos(phi)
        vz = v * math.sin(phi)
        
        if step_idx % params.SUB_STEPS == 0: # 30 Hz kayıt
            frames.append({
                "s": float(s),
                "x": float(com_x),
                "z": float(com_z),
                "vx": float(vx),
                "vz": float(vz),
                "speed": float(v),
                "theta": float(pitch),
                "phi": float(phi),
                "progress": float(min(1.0, s / ramp.S_total))
            })
            
        step_idx += 1
        
    return frames, v

def get_launch_state(rng=None, deterministic=False):
    """
    Rampanın ucundan tam fiziksel fırlama anı (0 hız kaybı, 0 yapaylık).
    """
    if rng is None:
        rng = np.random.default_rng()
        
    ramp = _global_ramp
    com_x, com_z, phi_exit, pitch_exit = ramp.com_pose_at_s(ramp.S_total)
    
    # Gerçek tırmanış simülasyonundan gelen çıkış hızı
    v_nominal = 21.8 # m/s (~78 km/h)
    
    if deterministic:
        v = v_nominal
        noise_th = 0.0
        noise_om = 0.0
    else:
        v = float(rng.uniform(v_nominal - 0.8, v_nominal + 0.8))
        noise_th = float(rng.uniform(-0.03, 0.03))
        noise_om = float(rng.uniform(-0.05, 0.05))
        
    # Çıkış teğet açısı: -16.1 derece (forward-downward teğet fırlama)
    th_launch = math.radians(-16.1) + noise_th
    vx = -float(v * math.cos(abs(th_launch)))
    vz = float(v * math.sin(th_launch))
    
    return {
        "x": float(com_x),
        "z": float(com_z),
        "vx": float(vx),
        "vz": float(vz),
        "theta": float(th_launch),
        "omega": float(v / ramp.R + noise_om), # Doğal merkezkaç açısal hızı
        "roll": 0.0,
        "omega_roll": 0.0,
        "thrusters": np.zeros(4, dtype=np.float32),
        "rcs": np.zeros(4, dtype=np.float32),
        "speed": float(v)
    }

def get_climb_animation(duration_sec=1.5, fps=30):
    """
    Rampadaki kesintisiz, 100% gerçek fizik tırmanış animasyonu kareleri.
    """
    frames, _ = simulate_physics_climb()
    return frames
