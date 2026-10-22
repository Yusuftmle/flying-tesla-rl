"""
Script to synchronize physics configuration between Python and JavaScript.
Reads hover/sim/physics_config.json and writes hover/web/js/physics_config.js.
"""

import json
import sys
from pathlib import Path

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def sync_physics_config():
    root = Path(__file__).resolve().parent
    json_path = root / "physics_config.json"
    js_path = root.parent / "web" / "js" / "physics_config.js"

    with open(json_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    js_content = f"""/**
 * Auto-generated from hover/sim/physics_config.json
 * DO NOT EDIT DIRECTLY. Run `python hover/sim/export_physics_config.py` to regenerate.
 * Single Source of Truth for 120Hz Physics & Aerospace Dynamics.
 */

export const PHYSICS_CONFIG = {json.dumps(cfg, indent=2)};

// Top-level convenience constants
export const MASS = PHYSICS_CONFIG.mass.dry_mass_kg;
export const DRY_MASS = PHYSICS_CONFIG.mass.dry_mass_kg;
export const INITIAL_FUEL_MASS = PHYSICS_CONFIG.mass.initial_fuel_mass_kg;
export const TOTAL_MASS = PHYSICS_CONFIG.mass.total_mass_kg;

export const INERTIA = PHYSICS_CONFIG.inertia.pitch_inertia_yy;
export const INERTIA_XX = PHYSICS_CONFIG.inertia.roll_inertia_xx;
export const GRAVITY = PHYSICS_CONFIG.environment.gravity_mps2;

export const T_MAX = PHYSICS_CONFIG.thrusters.t_max_per_motor_n;
export const TOTAL_MAX_THRUST = PHYSICS_CONFIG.thrusters.total_max_thrust_n;
export const FR_MAX = PHYSICS_CONFIG.thrusters.fr_max_rcs_n;

export const ARM_MAIN = PHYSICS_CONFIG.geometry.arm_main_lon_m;
export const ARM_MAIN_LAT = PHYSICS_CONFIG.geometry.arm_main_lat_m;
export const ARM_RCS = PHYSICS_CONFIG.geometry.arm_rcs_lon_m;
export const ARM_RCS_LAT = PHYSICS_CONFIG.geometry.arm_rcs_lat_m;

export const SUB_DT = PHYSICS_CONFIG.timing.dt_physics_sec;
export const TAU_MAIN = PHYSICS_CONFIG.thrusters.tau_main_sec;
export const TAU_RCS = PHYSICS_CONFIG.thrusters.tau_rcs_sec;

export const TARGET_X = PHYSICS_CONFIG.geometry.target_x_pad_m;
export const GROUND_Z = PHYSICS_CONFIG.geometry.ground_z_contact_m;

export const ISP_MAIN = PHYSICS_CONFIG.thrusters.isp_main_sec;
export const ISP_RCS = PHYSICS_CONFIG.thrusters.isp_rcs_sec;

export const GROUND_EFFECT_GAIN = PHYSICS_CONFIG.ground_contact.ground_effect_gain;
export const GROUND_EFFECT_H_REF = PHYSICS_CONFIG.ground_contact.ground_effect_h_ref_m;
export const TIRE_MU = PHYSICS_CONFIG.ground_contact.tire_coulomb_mu;

export const SAFETY_ENVELOPE = PHYSICS_CONFIG.safety_envelope;
"""

    js_path.parent.mkdir(parents=True, exist_ok=True)
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"✅ Physics configuration synchronized to: {js_path}")

if __name__ == "__main__":
    sync_physics_config()
