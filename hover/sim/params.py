"""
Rocket Vehicle Hover & Soft Landing Simulation Parameters (V2)
Rampadan ters fırlama -> Takla toparlama (RCS) -> Ana İtici Frenleme -> Yumuşak İniş
"""

import json
from pathlib import Path
import numpy as np

# Load Canonical Single Source of Truth
_CONFIG_FILE = Path(__file__).resolve().parent / "physics_config.json"
if _CONFIG_FILE.exists():
    with open(_CONFIG_FILE, "r", encoding="utf-8") as _f:
        CONFIG = json.load(_f)
else:
    CONFIG = {}

# --- Kütle ve Eylemsizlik (V4 Dinamik Yakıt Modeli) ---
DRY_MASS = CONFIG.get("mass", {}).get("dry_mass_kg", 1800.0)
INITIAL_FUEL_MASS = CONFIG.get("mass", {}).get("initial_fuel_mass_kg", 45.0)
MASS = CONFIG.get("mass", {}).get("total_mass_kg", DRY_MASS + INITIAL_FUEL_MASS)
LENGTH = CONFIG.get("geometry", {}).get("length_m", 4.8)
HEIGHT = CONFIG.get("geometry", {}).get("height_m", 1.4)
WIDTH = CONFIG.get("geometry", {}).get("width_m", 2.2)
INERTIA = CONFIG.get("inertia", {}).get("pitch_inertia_yy", 3750.0)
INERTIA_XX = CONFIG.get("inertia", {}).get("roll_inertia_xx", 650.0)
GRAVITY = CONFIG.get("environment", {}).get("gravity_mps2", 9.81)

# --- Termodinamik ve Nozul İmpulsu (I_sp) ---
ISP_MAIN = CONFIG.get("thrusters", {}).get("isp_main_sec", 260.0)
ISP_RCS = CONFIG.get("thrusters", {}).get("isp_rcs_sec", 180.0)

# --- Zemin Etkisi ve Lastik Dinamiği ---
GROUND_EFFECT_GAIN = CONFIG.get("ground_contact", {}).get("ground_effect_gain", 0.18)
GROUND_EFFECT_H_REF = CONFIG.get("ground_contact", {}).get("ground_effect_h_ref_m", 0.85)
TIRE_MU = CONFIG.get("ground_contact", {}).get("tire_coulomb_mu", 1.15)

# --- Aktüatörler (8 Adet: 4 Alt İtici + 4 Yan RCS) ---
ARM_MAIN = CONFIG.get("geometry", {}).get("arm_main_lon_m", 1.8)
ARM_MAIN_LAT = CONFIG.get("geometry", {}).get("arm_main_lat_m", 0.75)
TWR_PER_MOTOR = CONFIG.get("thrusters", {}).get("twr_per_motor", 0.55)
T_MAX_PER_MOTOR = CONFIG.get("thrusters", {}).get("t_max_per_motor_n", TWR_PER_MOTOR * MASS * GRAVITY)
TOTAL_MAX_THRUST = CONFIG.get("thrusters", {}).get("total_max_thrust_n", 4.0 * T_MAX_PER_MOTOR)
TAU_MAIN = CONFIG.get("thrusters", {}).get("tau_main_sec", 0.08)

ARM_RCS = CONFIG.get("geometry", {}).get("arm_rcs_lon_m", 2.0)
ARM_RCS_LAT = CONFIG.get("geometry", {}).get("arm_rcs_lat_m", 1.15)
FR_MAX = CONFIG.get("thrusters", {}).get("fr_max_rcs_n", 6500.0)
TAU_RCS = CONFIG.get("thrusters", {}).get("tau_rcs_sec", 0.025)

# --- Zamanlama ve Entegrasyon ---
PHYSICS_FREQ = CONFIG.get("timing", {}).get("physics_freq_hz", 120)
CONTROL_FREQ = 30      # Hz (dt_ctrl = 1/30 s)
SUB_STEPS = PHYSICS_FREQ // CONTROL_FREQ  # 4 alt adım
DT_PHYSICS = 1.0 / PHYSICS_FREQ           # 0.008333 s
DT_CONTROL = 1.0 / CONTROL_FREQ           # 0.03333 s
MAX_EPISODE_STEPS = 450                   # 15.0 saniye

# --- Rampa Geometrisi (V3: Tepe Kemeri / Overhang Crest) ---
RAMP_H = 30.0          # metre (tepe yüksekliği)
RAMP_L0 = 20.0         # metre (zemin düz hat)
RAMP_R1 = 14.0         # metre (tırmanış yayı)
RAMP_L1 = 10.0         # metre (dik tırmanış hattı)
RAMP_R2 = 18.0         # metre (tepe kemeri yayı, yere doğru eğim alır)
RAMP_EXIT_ANGLE = np.radians(196.0) # 196° (-16° aşağı-ileri iniş vektörü)
RAMP_WIDTH = 4.3       # metre

# --- Fırlatma Dağılımı (Kinetik Momentum) ---
LAUNCH_SPEED_NOMINAL = 22.0  # m/s (~80 km/h)
LAUNCH_SPEED_MIN = 20.0      # m/s
LAUNCH_SPEED_MAX = 24.0      # m/s
LAUNCH_THETA_NOMINAL = np.radians(196.0) # ~16° aşağıya doğru teğet
LAUNCH_THETA_NOISE = np.radians(3.0)
LAUNCH_OMEGA_NOISE = 0.10

# --- Hedef İniş Konumu (Landing Target Pad) ---
TARGET_X = -45.0       # metre (rampadan sola açılan iniş noktası)
TARGET_Z = 0.7         # metre (zemin seviyesi)
GROUND_Z = 0.7         # metre (Z_G: temas yüksekliği)

# --- Sınırlar ve Eşik Değerler ---
CEILING_Z = 65.0       # metre
STAGE_X_MIN = -95.0    # metre
STAGE_X_MAX = 70.0     # metre

# Yumuşak İniş Kriterleri
SOFT_LAND_VZ_MAX = 1.5                # m/s
SOFT_LAND_VX_MAX = 3.0                # m/s
SOFT_LAND_THETA_MAX = np.radians(10.0) # 10 derece pitch
SOFT_LAND_ROLL_MAX = np.radians(10.0)  # 10 derece roll
