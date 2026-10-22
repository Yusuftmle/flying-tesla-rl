"""
Rigid Body 3D Flight & Roll Dynamics (V3)
Tepe Kemeri Rampa Çıkışı, 360 Derece Sağa Barrel Roll (Roll Ekseni), Süpersonik Frenleme ve Yumuşak İniş.
"""

import numpy as np
import math

try:
    from hover.sim import params
except ImportError:
    import params

def wrap_angle(a):
    return (a + math.pi) % (2.0 * math.pi) - math.pi

class VehicleState:
    def __init__(self, x=0.0, z=params.RAMP_H + params.GROUND_Z, vx=0.0, vz=0.0, theta=0.0, omega=0.0, roll=0.0, omega_roll=0.0, thrusters=None, rcs=None, fuel_mass=None):
        self.x = float(x)
        self.z = float(z)
        self.vx = float(vx)
        self.vz = float(vz)
        self.theta = float(theta)         # Pitch açısı (burun yukarı/aşağı)
        self.omega = float(omega)         # Pitch açısal hızı
        self.roll = float(roll)           # Roll açısı (360 derece burgu)
        self.omega_roll = float(omega_roll) # Roll açısal hızı
        
        # 4 Alt İtici: [Ön-Sol, Ön-Sağ, Arka-Sol, Arka-Sağ]
        self.thrusters = np.zeros(4, dtype=np.float32) if thrusters is None else np.array(thrusters, dtype=np.float32)
        # 4 Yan RCS: [Sol-Ön, Sol-Arka, Sağ-Ön, Sağ-Arka]
        self.rcs = np.zeros(4, dtype=np.float32) if rcs is None else np.array(rcs, dtype=np.float32)
        
        # Dinamik Yakıt ve Kütle (V4)
        self.fuel_mass = float(params.INITIAL_FUEL_MASS if fuel_mass is None else fuel_mass)
        self.mass = float(params.DRY_MASS + self.fuel_mass)

        self.crashed = False
        self.soft_landed = False
        self.terminal = False
        self.terminal_reason = ""

    def copy(self):
        s = VehicleState(self.x, self.z, self.vx, self.vz, self.theta, self.omega, self.roll, self.omega_roll, self.thrusters.copy(), self.rcs.copy(), fuel_mass=self.fuel_mass)
        s.crashed = self.crashed
        s.soft_landed = self.soft_landed
        s.terminal = self.terminal
        s.terminal_reason = self.terminal_reason
        return s

    def to_dict(self):
        return {
            "x": float(self.x),
            "z": float(self.z),
            "vx": float(self.vx),
            "vz": float(self.vz),
            "theta": float(self.theta),
            "theta_deg": float(math.degrees(wrap_angle(self.theta))),
            "omega": float(self.omega),
            "roll": float(self.roll),
            "roll_deg": float(math.degrees(wrap_angle(self.roll))),
            "omega_roll": float(self.omega_roll),
            "thrusters": [float(t) for t in self.thrusters],
            "rcs": [float(r) for r in self.rcs],
            "fuel_mass": float(self.fuel_mass),
            "mass": float(self.mass),
            "crashed": bool(self.crashed),
            "soft_landed": bool(self.soft_landed),
            "terminal": bool(self.terminal),
            "terminal_reason": str(self.terminal_reason)
        }

def step_physics(state, thruster_cmds, rcs_cmds, dt=params.DT_PHYSICS, wind_x=0.0, consume_fuel=True):
    """
    Tek bir 120 Hz fizik alt adımı.
    thruster_cmds: [T_FL, T_FR, T_RL, T_RR] in [0, T_MAX_PER_MOTOR]
    rcs_cmds: [R_LF, R_LR, R_RF, R_RR] in [-FR_MAX, +FR_MAX]
    consume_fuel: True ise dinamik roket yakıtı tüketimi (Isp) hesaplanır.
    """
    if state.terminal:
        return state

    # 1. Aktüatör Gecikmeleri (1. Derece Low-Pass Filtre)
    lag_main = 1.0 - math.exp(-dt / params.TAU_MAIN)
    t_clipped = np.clip(thruster_cmds, 0.0, params.T_MAX_PER_MOTOR)
    state.thrusters += (t_clipped - state.thrusters) * lag_main
    state.thrusters = np.clip(state.thrusters, 0.0, params.T_MAX_PER_MOTOR)

    lag_rcs = 1.0 - math.exp(-dt / params.TAU_RCS)
    r_clipped = np.clip(rcs_cmds, -params.FR_MAX, params.FR_MAX)
    state.rcs += (r_clipped - state.rcs) * lag_rcs
    state.rcs = np.clip(state.rcs, -params.FR_MAX, params.FR_MAX)

    # 1b. Yakıt Tüketimi ve Motor Alev Sönmesi (Flameout - V4)
    if consume_fuel:
        t_main_sum = float(np.sum(state.thrusters))
        t_rcs_sum = float(np.sum(np.abs(state.rcs)))
        m_dot_main = t_main_sum / (params.GRAVITY * params.ISP_MAIN)
        m_dot_rcs = t_rcs_sum / (params.GRAVITY * params.ISP_RCS)
        dm_fuel = (m_dot_main + m_dot_rcs) * dt

        if state.fuel_mass > 0.0:
            state.fuel_mass = max(0.0, state.fuel_mass - dm_fuel)
        else:
            # Yakıt bitti (Flameout - iticiler kesilir)
            state.thrusters *= 0.0
            state.rcs *= 0.0

        state.mass = params.DRY_MASS + state.fuel_mass
    cur_mass = state.mass

    # 2. Kuvvetler ve Torklar
    # Alt motorlar (Ön vs Arka Pitch dengesi)
    f_front = float(state.thrusters[0] + state.thrusters[1])
    f_rear = float(state.thrusters[2] + state.thrusters[3])
    tot_lift = f_front + f_rear

    # Yan RCS Jetleri (Sol vs Sağ Roll Torku)
    # Sol taraf (LF, LR) pozitif üflerse sağa roll torku üretir
    r_left = float(state.rcs[0] + state.rcs[1])
    r_right = float(state.rcs[2] + state.rcs[3])
    tau_roll = (r_left - r_right) * params.ARM_RCS_LAT

    # Pitch Torku (Alt motorlar + Yan RCS Burun/Kuyruk farkı)
    r_nose = float(state.rcs[0] - state.rcs[2])
    r_tail = float(state.rcs[1] - state.rcs[3])
    tau_pitch = (f_front * params.ARM_MAIN - f_rear * params.ARM_MAIN) + (r_nose - r_tail) * params.ARM_RCS

    # Sönümlemeli Açısal İvmeler
    alpha_roll = (tau_roll - 180.0 * state.omega_roll) / params.INERTIA_XX
    alpha_pitch = (tau_pitch - 900.0 * state.omega) / params.INERTIA

    # Doğrusal Kuvvetler (3D Vektörel İtki ve Aerodinamik Sürükleme)
    sn = math.sin(state.theta)
    cs = math.cos(state.theta)
    cr = math.cos(state.roll)
    sr = math.sin(state.roll)
    uz = cs * cr  # +1.0 = dik tekerlekler yerde, -1.0 = baş aşağı ters
    TARMAC_Y = 0.0

    # 4 Tekerlek ve tavanın anlık dikey zemin seviyeleri
    z_wheel_f = state.z + 1.48 * sn - 0.70 * uz
    z_wheel_r = state.z - 1.48 * sn - 0.70 * uz
    z_roof_f = state.z + 1.48 * sn + 0.70 * uz
    z_roof_r = state.z - 1.48 * sn + 0.70 * uz
    min_lowest_z = min(z_wheel_f, z_wheel_r, z_roof_f, z_roof_r)

    # 1. 4 Tekerlek Zemin Yay-Sönüm ve Kaldıraç Torku
    f_normal_total = 0.0
    f_f = 0.0
    f_r = 0.0

    if z_wheel_f < TARMAC_Y:
        pen_f = TARMAC_Y - z_wheel_f
        v_wheel_f = state.vz + 1.48 * state.omega
        f_f = max(0.0, 58000.0 * pen_f - 4800.0 * v_wheel_f)
        f_normal_total += f_f

    if z_wheel_r < TARMAC_Y:
        pen_r = TARMAC_Y - z_wheel_r
        v_wheel_r = state.vz - 1.48 * state.omega
        f_r = max(0.0, 58000.0 * pen_r - 4800.0 * v_wheel_r)
        f_normal_total += f_r

    # Tavan zemin teması (Ters kaza)
    f_roof = 0.0
    if z_roof_f < TARMAC_Y or z_roof_r < TARMAC_Y:
        pen_roof = TARMAC_Y - min(z_roof_f, z_roof_r)
        f_roof = max(0.0, 80000.0 * pen_roof - 6000.0 * state.vz)
        f_normal_total += f_roof
        if not state.soft_landed:
            state.crashed = True

    # DOĞRU YER TEPKİ TORKU:
    # Ön tekerlek yere çarparsa burnu YUKARI iter, arka tekerlek çarparsa arkayı YUKARI iter
    heading_sign = 1.0 if cs >= 0 else -1.0
    tau_ground_pitch = heading_sign * (f_f * 1.48 - f_r * 1.48)

    # Toplam Açısal İvmeler (RCS + Motor Diferansiyeli + Zemin Tepki Torku)
    alpha_roll = (tau_roll - 180.0 * state.omega_roll) / params.INERTIA_XX
    alpha_pitch = (tau_pitch + tau_ground_pitch - 900.0 * state.omega) / params.INERTIA

    rel_vx = state.vx - wind_x
    aero_drag_x = 0.5 * 0.45 * 1.2 * rel_vx * abs(rel_vx)
    aero_drag_z = 0.5 * 0.70 * 1.2 * state.vz * abs(state.vz)

    # ZEMİN ETKİSİ (Ground Effect / Plume Ground Cushion - V4)
    # Nozul zemine 1.8 metreden fazla yaklaştığında tabana basan gaz yastığı kaldırması (+18% max)
    h_ground = max(0.0, state.z - params.GROUND_Z)
    ge_multiplier = 1.0
    if h_ground < 1.80 and uz > 0.15:
        ge_multiplier = 1.0 + params.GROUND_EFFECT_GAIN * math.exp(-h_ground / params.GROUND_EFFECT_H_REF) * min(1.0, uz)
    tot_lift_effective = tot_lift * ge_multiplier

    # İtki vektörü dünya koordinatlarında
    lift_z = max(0.0, uz)
    fx = -tot_lift_effective * sn * cr - aero_drag_x
    fz = tot_lift_effective * lift_z + f_normal_total - aero_drag_z - cur_mass * params.GRAVITY

    ax = fx / cur_mass
    az = fz / cur_mass

    # 3. Yarı-Örtük Euler Entegrasyonu
    state.vx += ax * dt
    state.vz += az * dt

    # Zemin sürtünmesi (Coulomb Normal Kuvvet Modeli - V4)
    is_wheel_touching = (z_wheel_f <= TARMAC_Y + 0.08 or z_wheel_r <= TARMAC_Y + 0.08)
    both_wheels_touching = (z_wheel_f <= TARMAC_Y + 0.08 and z_wheel_r <= TARMAC_Y + 0.08)
    if state.soft_landed:
        brake_decel = 22.0  # Mekanik park freni
        cur_speed_x = abs(state.vx)
        if cur_speed_x > 0.001:
            delta_v = min(cur_speed_x, brake_decel * dt)
            state.vx -= math.copysign(delta_v, state.vx)
        state.omega *= 0.82
        state.omega_roll *= 0.82
    elif is_wheel_touching or f_normal_total > 50.0:
        f_n_avail = max(f_normal_total, 350.0 if is_wheel_touching else 0.0)
        max_fric_force = params.TIRE_MU * f_n_avail
        brake_decel = min(16.0, max(0.8, max_fric_force / cur_mass))
        cur_speed_x = abs(state.vx)
        if cur_speed_x > 0.001:
            delta_v = min(cur_speed_x, brake_decel * dt)
            state.vx -= math.copysign(delta_v, state.vx)
        if both_wheels_touching:
            state.omega *= 0.88
            state.omega_roll *= 0.88

    state.x += state.vx * dt
    state.z += state.vz * dt

    state.omega += alpha_pitch * dt
    state.theta += state.omega * dt

    state.omega_roll += alpha_roll * dt
    state.roll += state.omega_roll * dt

    # Sert Geometrik Zemin Sınırı (Şasi taban vurma sınırı)
    MAX_SUSPENSION_TRAVEL = -0.22
    if min_lowest_z < MAX_SUSPENSION_TRAVEL:
        state.z += (MAX_SUSPENSION_TRAVEL - min_lowest_z)
        if state.vz < 0.0:
            state.vz = 0.0

    # 4. Sayısal Güvenlik Kontrolü
    if not (np.isfinite(state.x) and np.isfinite(state.z) and np.isfinite(state.vx) and np.isfinite(state.vz)):
        state.crashed = True
        state.terminal = True
        state.terminal_reason = "numerical_nan"
        return state

    # 5. Bitiş Koşulları
    # a) 4 Tekerlek Zemin Teması ve Soft Landing Kontrolü
    pitch_tilt = abs(wrap_angle(state.theta)) if cs >= 0 else abs(wrap_angle(state.theta - math.pi))
    roll_tilt = abs(wrap_angle(state.roll)) if cs >= 0 else abs(wrap_angle(state.roll - math.pi))
    is_both_wheels_on_ground = (abs(z_wheel_f - TARMAC_Y) < 0.22) and (abs(z_wheel_r - TARMAC_Y) < 0.22)
    is_level = (pitch_tilt < 0.25) and (roll_tilt < 0.30) and (uz > 0.60)
    is_stopped_on_pavement = is_both_wheels_on_ground and is_level and abs(state.vz) < 1.2 and abs(state.vx) < 2.2

    if is_stopped_on_pavement and not state.crashed:
        state.soft_landed = True
        state.terminal = True
        state.terminal_reason = "soft_landing"
        state.vx = 0.0
        state.vz = 0.0
        state.omega = 0.0
        state.omega_roll = 0.0
        return state

    # Sert çarpışma / Kaza kontrolü
    if f_normal_total > 3000.0 and not state.soft_landed:
        tilt_deg = math.acos(float(np.clip(uz, -1.0, 1.0))) * 180.0 / math.pi
        is_violent = abs(state.vz) > 4.2 or abs(state.vx) > 12.0 or tilt_deg > 38.0 or uz < 0.20
        if is_violent:
            state.crashed = True
            state.terminal = True
            state.terminal_reason = "ground_crash"
            return state

    # b) Rampa ve İskele Kulesi Çarpışması
    # Rampa x > 0 bölgesindedir; çıkış x = 0'dadır.
    # Eğer araç geriye (+x yönünde) sapıp rampaya girerse çarpar:
    if state.z <= 29.5 and state.x >= 0.35:
        state.crashed = True
        state.terminal = True
        state.terminal_reason = "ramp_crash"
        return state

    # c) Tavan veya Sahne Sınırları
    if state.z >= params.CEILING_Z:
        state.crashed = True
        state.terminal = True
        state.terminal_reason = "ceiling_limit"
        return state

    if state.x <= params.STAGE_X_MIN or state.x >= params.STAGE_X_MAX:
        state.crashed = True
        state.terminal = True
        state.terminal_reason = "stage_boundary"
        return state

    return state

def step_control(state, action, sub_steps=params.SUB_STEPS, dt_sub=params.DT_PHYSICS, wind_x=0.0, consume_fuel=True, enable_fep=True):
    """
    30 Hz kontrol adımında 4 fizik alt adımı yürütür.
    action: 8 elemanlı [-1.0, 1.0] dizisi:
      action[0..3]: 4 Alt İtici -> [0, T_MAX_PER_MOTOR]
      action[4..7]: 4 Yan RCS Jeti -> [-FR_MAX, +FR_MAX]
    enable_fep: Flight Envelope Protection (Ters itki kilidi ve tırmanma emniyeti)
    """
    act = np.clip(np.array(action, dtype=np.float32), -1.0, 1.0)
    
    # [-1, 1] -> [0, T_MAX_PER_MOTOR]
    thruster_cmds = (act[0:4] + 1.0) * 0.5 * params.T_MAX_PER_MOTOR
    
    # [-1, 1] -> [-FR_MAX, +FR_MAX]
    rcs_cmds = act[4:8] * params.FR_MAX

    # Uçuş Emniyet Zarfı (Flight Envelope Protection - FEP)
    if enable_fep and not state.soft_landed and not state.crashed:
        h = max(0.0, state.z - params.GROUND_Z)
        uz = math.cos(state.theta) * math.cos(state.roll)
        
        # 1. Freefall Gate (Zoom Climb Önleme - Deney 1):
        if h > 12.0 and state.vz > 0.3:
            climb_safe = max(0.25, 1.0 - (state.vz / 2.5))
            thruster_cmds *= climb_safe

        # 2. Anti-Hover Yakıt Tuzağı Koruması (SpaceX Falcon 9 Glide Slope):
        if h > 3.0 and uz > 0.25:
            v_nom = -max(2.5, min(8.0, 0.85 * math.sqrt(2.0 * 3.5 * h)))
            if state.vz > v_nom:
                excess_v = state.vz - v_nom
                anti_hover = max(0.20, 1.0 - (excess_v / abs(v_nom)) * 0.80)
                thruster_cmds *= anti_hover

        # 3. Terminal Suicide Burn Dokunuş Frenlemesi (h <= 3.2m):
        if h <= 3.2 and uz > 0.45 and state.vz < -1.1:
            target_touch = -0.75
            a_req = (state.vz**2 - target_touch**2) / (2.0 * max(0.25, h))
            f_req = (params.DRY_MASS + state.fuel_mass) * (params.GRAVITY + a_req)
            t_motor = f_req / (4.0 * max(0.2, uz))
            mean_cmd = max(1.0, float(np.mean(thruster_cmds)))
            if t_motor > mean_cmd:
                flare = min(2.5, t_motor / mean_cmd)
                thruster_cmds = np.clip(thruster_cmds * flare, 0.0, params.T_MAX_PER_MOTOR)

    for _ in range(sub_steps):
        step_physics(state, thruster_cmds, rcs_cmds, dt=dt_sub, wind_x=wind_x, consume_fuel=consume_fuel)
        if state.terminal:
            break

    return state
