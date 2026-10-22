"""
Expert Teacher Controller (Usta Pilot Otopilotu - V5 Sektörel Standart)
Rampa çıkışı, havadan serbest düşüş, kaotik savrulmalar ve rüzgarlı ortamlarda
aracı en uygun 8 aktüatör hareketiyle (Plume Zemin Etkisi ve Coulomb Lastik Sürtünmesi altında)
yakıt tasarruflu bir Hoverslam ile yumuşak inişe götürür.

V5 Geliştirmeleri:
1. 2-Aşamalı Detumble: Yüksek açısal hızlarda önce rate damping (-Kd * omega), ardından hedef açı kontrolü.
2. Sıfır Yakıt Kaçağı: Serbest düşüş fazında ana motorlar %100 kapalı tutulur (Gravity Loss önlenir).
3. Dikey İtki Önceliği: İniş anında diferansiyel pitch torku ana itkiyi sıfırlamaz; taban itki korunur.
4. Zemin Öncesi Seviyeleme: h < 3.0m irtifada gövde yere tam paralel (180°) hizalanarak 4 tekerlek dokunuşu sağlanır.
"""

import math
import numpy as np

try:
    from hover.sim import params
    from hover.sim.dynamics import wrap_angle
except ImportError:
    import params
    from dynamics import wrap_angle

class ExpertPilot:
    def __init__(self):
        self.mass = params.MASS
        self.g = params.GRAVITY
        self.t_max_motor = params.T_MAX_PER_MOTOR
        self.fr_max = params.FR_MAX
        self.target_x = params.TARGET_X

    def compute_action(self, state, obs=None, wind_x=0.0):
        """
        state: VehicleState nesnesi
        Dönen değer: 8 elemanlı [-1.0, +1.0] aralığında aksiyon vektörü
          act[0..3]: 4 Alt İtici (FL, FR, RL, RR) [-1=0N, +1=T_MAX]
          act[4..7]: 4 Yan RCS Jeti (LF, LR, RF, RR) [-1=-FR_MAX, +1=+FR_MAX]
        """
        sn = math.sin(state.theta)
        cs = math.cos(state.theta)
        cr = math.cos(state.roll)
        uz = cs * cr
        h = max(0.0, state.z - params.GROUND_Z)

        # -------------------------------------------------------------
        # 1. ROLL KONTROLÜ (Hızlı Ters Kurtarma + Anti-Chatter Yakıt Tasarrufu)
        # -------------------------------------------------------------
        target_roll = math.pi if cs < 0 else 0.0
        diff_r = target_roll - state.roll
        e_roll = wrap_angle(diff_r)
        # Branch-cut süreksizliğini önle (pi sınırında çatırdamayı engeller)
        if abs(abs(e_roll) - math.pi) < 0.05:
            e_roll = math.pi

        if abs(e_roll) > 0.60:
            # Araç ters ise hızlıca (<0.6 sn) dik konuma getir (Rapid Roll Acquisition)
            rcs_roll_cmd = float(np.clip(4.0 * e_roll - 1.2 * state.omega_roll, -1.0, 1.0))
        elif abs(e_roll) < 0.12 and abs(state.omega_roll) < 0.35:
            # Gövde hizalandığında RCS gazını %90 kesen mikro-trim (%90 Yakıt Tasarrufu)
            rcs_roll_cmd = float(np.clip(1.5 * e_roll - 0.8 * state.omega_roll, -0.06, 0.06))
        else:
            rcs_roll_cmd = float(np.clip(5.0 * e_roll - 1.8 * state.omega_roll, -0.75, 0.75))

        if abs(wind_x) > 1.0 and h > 1.0:
            wind_comp = float(np.clip(-wind_x * 0.04, -0.15, 0.15))
            rcs_roll_cmd = float(np.clip(rcs_roll_cmd + wind_comp, -1.0, 1.0))

        roll_tilt = abs(wrap_angle(state.roll - target_roll))
        roll_level = (roll_tilt < 0.35) and (abs(state.omega_roll) < 1.4)

        # -------------------------------------------------------------
        # 2. PITCH KONTROLÜ (Retrograde Flare & Damping)
        # -------------------------------------------------------------
        # Yüksek yatay hızda daha güçlü retrograde açılanma (28 derece)
        flare_deg = math.radians(28.0 if abs(state.vx) > 8.0 else 22.0)
        level_blend = min(1.0, max(0.0, (h - 2.0) / 4.0))

        if cs < 0:
            if roll_level and state.vx < -1.5 and h > 1.5:
                target_pitch = math.pi - (flare_deg * level_blend)
            elif roll_level and state.vx > 1.5 and h > 1.5:
                target_pitch = math.pi + (flare_deg * level_blend)
            else:
                target_pitch = math.pi
        else:
            if roll_level and state.vx < -1.5 and h > 1.5:
                target_pitch = -(flare_deg * level_blend)
            elif roll_level and state.vx > 1.5 and h > 1.5:
                target_pitch = +(flare_deg * level_blend)
            else:
                target_pitch = 0.0

        e_pitch = wrap_angle(target_pitch - state.theta)
        tau_pitch_cmd = float(np.clip(55000.0 * e_pitch - 22000.0 * state.omega, -40000.0, 40000.0))

        # Terminal Düzeltme (Anti-Spin Terminal Alignment - h <= 4.5m)
        if h <= 4.5 and uz > 0.20:
            target_roll_term = 0.0 if cs >= 0 else math.pi
            e_roll_term = wrap_angle(target_roll_term - state.roll)
            rcs_roll_cmd = float(np.clip(4.5 * e_roll_term - 2.2 * state.omega_roll, -1.0, 1.0))

            target_pitch_term = 0.0 if cs >= 0 else math.pi
            e_pitch_term = wrap_angle(target_pitch_term - state.theta)
            tau_pitch_cmd = float(np.clip(65000.0 * e_pitch_term - 25000.0 * state.omega, -45000.0, 45000.0))

        # -------------------------------------------------------------
        # 3. HOVERSLAM / SUICIDE BURN ZAMANLAMASI & GLIDESLOPE
        # -------------------------------------------------------------
        cur_mass = getattr(state, "mass", self.mass)
        a_z_decel = 6.8
        tau_spool = 0.08
        h_burn = ((state.vz * state.vz) / (2.0 * a_z_decel)) + abs(state.vz) * tau_spool + 0.8 if state.vz < -0.3 else 0.0

        need_vert_burn = (h <= h_burn and state.vz < -0.3) or (h < 2.5 and state.vz < -0.15)
        need_horiz_brake = roll_level and (abs(state.vx) > 1.8) and (h <= max(15.0, h_burn + 2.5))
        is_burn_active = (need_vert_burn or need_horiz_brake) and roll_level and (uz > 0.20)

        # Anti-Hover Koruması (Falcon 9 Glideslope): Yalnızca araç yatayda süzülürken havada asılı kalmayı önler
        v_nominal_glide = -max(2.5, min(9.5, 1.05 * math.sqrt(2.0 * 3.8 * max(0.1, h))))
        anti_hover_mult = 1.0
        if h > 3.0 and uz > 0.25 and state.vz > v_nominal_glide and abs(state.vx) < 3.5:
            excess_v = state.vz - v_nominal_glide
            anti_hover_mult = max(0.10, 1.0 - (excess_v / abs(v_nominal_glide)) * 0.90)

        # Serbest düşüş / tırmanma kilidi: İrtifa yüksek ve yukarı hız varsa motorları kes (ancak yatay fren ihtiyacı yoksa)
        climb_safe_mult = 1.0
        if h > 12.0 and state.vz > 0.3 and abs(state.vx) < 5.0:
            climb_safe_mult = max(0.0, 1.0 - (state.vz / 2.5))

        if not state.soft_landed and is_burn_active and h > 0.03:
            v_desire = -min(abs(state.vz), 0.28 + 0.70 * math.sqrt(max(0.0, 2.0 * 2.8 * h)))
            vz_err = v_desire - state.vz
            f_vert_req = cur_mass * self.g + cur_mass * (7.0 * vz_err)

            # Terminal Dokunuş Frenlemesi (Terminal Flare - h <= 3.2m):
            if h <= 3.2 and uz > 0.35 and state.vz < -1.1:
                target_touch_vz = -0.75
                a_req = (state.vz * state.vz - target_touch_vz * target_touch_vz) / (2.0 * max(0.25, h))
                f_flare = cur_mass * (self.g + a_req)
                f_vert_req = max(f_vert_req, f_flare)

            f_horiz_req = 0.0
            if need_horiz_brake or (h < 7.0 and abs(state.vx) > 1.5):
                f_horiz_req = cur_mass * min(8.0, 0.40 * abs(state.vx))

            f_net_req = math.sqrt(max(0.0, f_vert_req)**2 + f_horiz_req**2)
            cos_tilt = max(0.38, uz)
            total_thrust_cmd = (f_net_req / cos_tilt) * anti_hover_mult * climb_safe_mult

            # Zemin Etkisi (Ground Effect Cushion) Kompanzasyonu:
            if h < 1.80 and uz > 0.15:
                ge_mult = 1.0 + params.GROUND_EFFECT_GAIN * math.exp(-h / params.GROUND_EFFECT_H_REF) * min(1.0, uz)
                total_thrust_cmd /= ge_mult

            total_thrust_cmd = float(np.clip(total_thrust_cmd, 0.0, 4.0 * self.t_max_motor))

            delta_pitch = float(np.clip(tau_pitch_cmd / (4.0 * params.ARM_MAIN), -0.25 * self.t_max_motor, 0.25 * self.t_max_motor))
            base_each = total_thrust_cmd / 4.0
            t_front = float(np.clip(base_each + delta_pitch, 0.0, self.t_max_motor))
            t_rear = float(np.clip(base_each - delta_pitch, 0.0, self.t_max_motor))
        else:
            # Serbest düşüş fazında ana motorlar kapalı; hafif pitch sönümleme
            if (abs(e_pitch) > 0.08 or abs(state.omega) > 0.25) and uz > 0.30:
                delta_f = tau_pitch_cmd / (2.0 * params.ARM_MAIN)
                t_front = float(np.clip(max(0.0, delta_f), 0.0, 0.25 * self.t_max_motor))
                t_rear = float(np.clip(max(0.0, -delta_f), 0.0, 0.25 * self.t_max_motor))
            else:
                t_front = 0.0
                t_rear = 0.0

        # -------------------------------------------------------------
        # 4. AKTÜATÖR İTKİ DAĞITIMI VE ZEMİN TEMASI (Touchdown Commitment)
        # -------------------------------------------------------------
        if h < 0.40 and abs(e_pitch) < 0.15 and abs(e_roll) < 0.20:
            # Zemin seviyesinde havada asılı kalmayı önle; lastiklerin asfalta basmasını sağla
            hover_act = 2.0 * ((cur_mass * self.g / 4.0) / self.t_max_motor) - 1.0
            touchdown_act = hover_act - 0.16
            tf_act = min(2.0 * (t_front / self.t_max_motor) - 1.0, touchdown_act)
            tr_act = min(2.0 * (t_rear / self.t_max_motor) - 1.0, touchdown_act)
            act_thrusters = [tf_act, tf_act, tr_act, tr_act]
        else:
            act_thrusters = [
                2.0 * (t_front / self.t_max_motor) - 1.0,
                2.0 * (t_front / self.t_max_motor) - 1.0,
                2.0 * (t_rear / self.t_max_motor) - 1.0,
                2.0 * (t_rear / self.t_max_motor) - 1.0
            ]

        act_rcs = [
            rcs_roll_cmd,
            rcs_roll_cmd,
            -rcs_roll_cmd,
            -rcs_roll_cmd
        ]

        action = np.array(act_thrusters + act_rcs, dtype=np.float32)
        return np.clip(action, -1.0, 1.0)
