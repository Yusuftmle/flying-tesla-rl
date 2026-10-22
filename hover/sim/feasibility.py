"""
Feasibility Analysis for Rocket Car Hover Task
Eğitim öncesi analitik fizibilite doğrulaması:
TWR = 1.8 ile maksimum dikey düşüş hızında dikey durma mesafesi ve kontrol edilebilirlik testi.
"""

import numpy as np
try:
    from hover.sim import params
except ImportError:
    import params

def check_feasibility(verbose=True):
    # 1. Net durdurma ivmesi (Dikey eksen, tüm iticiler %100 yukarı)
    # TWR = 1.8 -> a_net = (TWR - 1.0) * g
    twr_total = params.TWR_PER_MOTOR * 3.0
    a_net_up = (twr_total - 1.0) * params.GRAVITY  # 0.8 * g = 7.848 m/s^2

    # 2. Maksimum fırlatma hızında (örneğin 12 m/s tamamen aşağı yönelse bile) durma mesafesi
    v_max = params.LAUNCH_SPEED_MAX
    stopping_distance_vmax = (v_max**2) / (2.0 * a_net_up)

    # 3. Mevcut irtifa payı (Rampa çıkış irtifası - zemin irtifası)
    available_height_to_ground = params.RAMP_EXIT_Z - params.GROUND_Z
    available_height_to_target = params.RAMP_EXIT_Z - params.TARGET_Z

    # 4. Açısal tork ve dönüş ivmesi (Front +100%, Rear 0%)
    # Maksimum tork = T_max * d_front - 0 = 10594.8 * 1.8 = 19070 N*m
    max_torque = params.T_MAX_PER_MOTOR * params.THRUSTER_DISTANCES[0]
    alpha_max = max_torque / params.INERTIA  # ~5.08 rad/s^2

    # 25 derecelik açıyı (0.436 rad) ters çevirme süresi
    theta_max = params.LAUNCH_PITCH_MAX
    # t_recover ≈ sqrt(2 * theta_max / alpha_max)
    t_pitch_recovery = np.sqrt(2.0 * theta_max / alpha_max)

    # İtici gecikmesi (tau = 0.08 s)
    t_lag = params.THRUSTER_TAU * 3.0  # %95 yerleşme süresi ≈ 0.24 s
    total_effective_recovery_time = t_pitch_recovery + t_lag

    is_feasible = (stopping_distance_vmax < available_height_to_ground) and (alpha_max > 2.0)

    if verbose:
        print("=" * 65)
        print("   ROKET ARAÇ HAVADA DENGE GÖREVİ - FİZİBİLİTE TEST RAPORU")
        print("=" * 65)
        print(f"Araç Kütlesi:              {params.MASS:.1f} kg")
        print(f"Eylemsizlik Momenti (Iyy): {params.INERTIA:.1f} kg*m^2")
        print(f"Toplam TWR (3 İtici):      {twr_total:.2f} g ({twr_total * params.MASS * params.GRAVITY / 1000:.1f} kN)")
        print(f"Net Yukarı İvme:           {a_net_up:.3f} m/s^2 ({a_net_up / params.GRAVITY:.2f} g)")
        print(f"Rampa Çıkış İrtifası:      {params.RAMP_EXIT_Z:.2f} m")
        print(f"Hedef Hover İrtifası:      {params.TARGET_Z:.2f} m")
        print(f"Zemin İrtifası:            {params.GROUND_Z:.2f} m")
        print("-" * 65)
        print(f"En Kötü Senaryo Düşüş Hızı: {v_max:.1f} m/s")
        print(f"Teorik Durma Mesafesi:     {stopping_distance_vmax:.2f} m")
        print(f"Zemine Kalan Boşluk:       {available_height_to_ground:.2f} m")
        print(f"Maksimum Açısal İvme:      {alpha_max:.2f} rad/s^2")
        print(f"Pitch Düzeltme Süresi:     {total_effective_recovery_time:.3f} s")
        print("-" * 65)
        if is_feasible:
            print("[PASS] FIZIBILITE TESTI GECTI: Gorev analitik olarak cozulebilir.")
            print("       Arac zemine carpmadan once durabilecek yukseklik marjina sahiptir.")
        else:
            print("[FAIL] FIZIBILITE TESTI BASARISIZ: TWR veya rampa yuksekligi yetersiz!")
        print("=" * 65)

    return {
        "is_feasible": is_feasible,
        "a_net_up": a_net_up,
        "stopping_distance_vmax": stopping_distance_vmax,
        "available_height_to_ground": available_height_to_ground,
        "alpha_max": alpha_max,
        "total_recovery_time": total_effective_recovery_time
    }

if __name__ == "__main__":
    check_feasibility(verbose=True)
