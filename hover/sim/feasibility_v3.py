"""
feasibility_v3.py - True Intuitive Coordinate System
Car heads in -X direction. Roof is +Z (up).
Pitch: 0 = level, >0 = nose up, <0 = nose down.
Roll: 0 = upright, 2*pi = 360° completed barrel roll.
Launch: x=0, z=28.5m, vx=-20.9 m/s, vz=-5.8 m/s, pitch=-16.1 deg, roll=0.
"""

import math
import numpy as np

def test_v3_clean():
    m = 1800.0
    g = 9.81
    I_xx = 650.0   # Roll inertia
    I_yy = 3750.0  # Pitch inertia
    
    # 4 Bottom Thrusters (Total 2.2 TWR = 38,847 N)
    T_max_total = 2.2 * m * g
    T_max_each = T_max_total / 4.0
    
    # 4 RCS Thrusters
    FR_max = 6500.0
    arm_rcs_lat = 1.15
    arm_pitch = 1.8
    
    # Launch State at Lip
    pitch_exit = math.radians(-16.1)
    v_exit = 22.0
    
    x = 0.0
    z = 28.5
    vx = -v_exit * math.cos(abs(pitch_exit)) # -21.1 m/s
    vz = -v_exit * math.sin(abs(pitch_exit)) # -6.1 m/s
    pitch = pitch_exit
    omega_pitch = 0.0
    roll = 0.0
    omega_roll = 0.0
    
    dt = 1.0 / 120.0
    T_roll = 1.05  # Roll duration
    
    for step in range(1200):
        t = step * dt
        
        # 1. 360° Lateral Roll Control (Rightward Barrel Roll)
        if t < T_roll:
            tau = t / T_roll
            phi_des = 2.0 * math.pi * (10.0 * tau**3 - 15.0 * tau**4 + 6.0 * tau**5)
            om_des = 2.0 * math.pi * (30.0 * tau**2 - 60.0 * tau**3 + 30.0 * tau**4) / T_roll
        else:
            phi_des = 2.0 * math.pi
            om_des = 0.0
            
        e_phi = phi_des - roll
        e_om = om_des - omega_roll
        rcs_roll_cmd = np.clip(16.0 * e_phi + 3.8 * e_om, -1.0, 1.0)
        
        # 2 Left jets push up, 2 Right jets push down -> Roll torque
        tau_roll = 2.0 * (rcs_roll_cmd * FR_max) * arm_rcs_lat
        alpha_roll = (tau_roll - 180.0 * omega_roll) / I_xx
        
        # 2. Pitch Control
        # Once roll reaches completion (t > 0.95s), pitch up to +22 deg to brake horizontal vx, then level out near ground
        roll_level = (t >= 0.95 and abs(roll - 2.0 * math.pi) < math.radians(25.0)) or (t >= T_roll)
        h = max(0.0, z - 0.7)
        
        if roll_level and vx < -1.5 and h > 0.8:
            target_pitch = math.radians(30.0) # Maximum supersonic pitch braking!
        elif roll_level:
            target_pitch = 0.0 # Level out perfectly for touchdown
        else:
            target_pitch = pitch_exit
            
        e_p = target_pitch - pitch
        tau_pitch = np.clip(35000.0 * e_p - 6000.0 * omega_pitch, -30000.0, 30000.0)
        alpha_pitch = (tau_pitch - 900.0 * omega_pitch) / I_yy
        
        # 3. Bottom Thrusters (Supersonic Braking & Soft Landing)
        h = max(0.0, z - 0.7)
        if roll_level and t > 0.95:
            # Desired descent velocity curve
            v_des = -(0.5 + 0.8 * math.sqrt(max(0.0, 2.0 * 2.8 * h))) if h > 1.2 else -0.8
            vz_err = v_des - vz
            f_lift_cmd = np.clip((m * g + m * (3.5 * vz_err)) / max(0.2, math.cos(pitch)), 0.0, T_max_total)
            if abs(vx) > 2.0:
                f_lift_cmd = min(T_max_total, f_lift_cmd + 4000.0)
        else:
            f_lift_cmd = 0.0
            
        # Thrust vectors
        eff_lift = f_lift_cmd * max(0.0, math.cos(roll))
        fx = eff_lift * math.sin(pitch) - 0.5 * 0.45 * 1.2 * vx * abs(vx)
        fz = eff_lift * math.cos(pitch) - 0.5 * 0.70 * 1.2 * vz * abs(vz) - m * g
        
        vx += (fx / m) * dt
        vz += (fz / m) * dt
        x += vx * dt
        z += vz * dt
        
        omega_roll += alpha_roll * dt
        roll += omega_roll * dt
        
        omega_pitch += alpha_pitch * dt
        pitch += omega_pitch * dt
        
        if z <= 0.70 and t > 1.2:
            z = 0.70
            break
            
    print(f"=== V3 TEMİZ KOORDİNAT FİZİK SONUCU ===")
    print(f"Toplam Uçuş Süresi: {t:.2f} saniye")
    print(f"İniş Konumu: x={x:.2f}m, z={z:.2f}m")
    print(f"İniş Hızları: vx={vx:.2f} m/s, vz={vz:.2f} m/s")
    print(f"İniş Açıları: Roll={math.degrees(roll)%360.0:.1f} deg, Pitch={math.degrees(pitch):.1f} deg")
    
    roll_err_deg = abs((math.degrees(roll) % 360.0))
    if roll_err_deg > 180: roll_err_deg = 360 - roll_err_deg
    pitch_deg = abs(math.degrees(pitch))
    
    soft = (abs(vz) <= 1.5 and abs(vx) <= 2.5 and pitch_deg <= 8.0 and roll_err_deg <= 8.0)
    print(f"YUMUŞAK İNİŞ BAŞARILI MI: {soft}")
    return soft

if __name__ == "__main__":
    test_v3_clean()
