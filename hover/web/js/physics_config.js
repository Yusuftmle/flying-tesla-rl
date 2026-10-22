/**
 * Auto-generated from hover/sim/physics_config.json
 * DO NOT EDIT DIRECTLY. Run `python hover/sim/export_physics_config.py` to regenerate.
 * Single Source of Truth for 120Hz Physics & Aerospace Dynamics.
 */

export const PHYSICS_CONFIG = {
  "_comment": "Canonical Single Source of Truth for Rocket Vehicle Physics & Flight Dynamics",
  "version": "4.1.0",
  "mass": {
    "dry_mass_kg": 1800.0,
    "initial_fuel_mass_kg": 45.0,
    "total_mass_kg": 1845.0
  },
  "geometry": {
    "length_m": 4.8,
    "width_m": 2.2,
    "height_m": 1.4,
    "arm_main_lon_m": 1.8,
    "arm_main_lat_m": 0.75,
    "arm_rcs_lon_m": 2.0,
    "arm_rcs_lat_m": 1.15,
    "wheelbase_half_m": 1.48,
    "ground_z_contact_m": 0.7,
    "target_x_pad_m": -45.0
  },
  "inertia": {
    "pitch_inertia_yy": 3750.0,
    "roll_inertia_xx": 650.0
  },
  "environment": {
    "gravity_mps2": 9.81,
    "air_density_rho": 1.225,
    "drag_area_cd_x": 0.85,
    "drag_area_cd_z": 1.65,
    "ceiling_z_m": 65.0,
    "stage_x_min_m": -95.0,
    "stage_x_max_m": 70.0
  },
  "thrusters": {
    "isp_main_sec": 260.0,
    "isp_rcs_sec": 180.0,
    "twr_per_motor": 0.55,
    "total_twr": 2.2,
    "t_max_per_motor_n": 9969.39,
    "total_max_thrust_n": 38847.6,
    "fr_max_rcs_n": 6500.0,
    "tau_main_sec": 0.08,
    "tau_rcs_sec": 0.025
  },
  "ground_contact": {
    "ground_effect_gain": 0.18,
    "ground_effect_h_ref_m": 0.85,
    "tire_coulomb_mu": 1.15,
    "suspension_spring_k": 58000.0,
    "suspension_damper_c": 4800.0,
    "roof_spring_k": 80000.0,
    "roof_damper_c": 6000.0
  },
  "timing": {
    "physics_freq_hz": 120,
    "control_freq_hz": 30,
    "dt_physics_sec": 0.008333333333333333,
    "dt_control_sec": 0.03333333333333333,
    "sub_steps": 4,
    "max_episode_steps": 450
  },
  "safety_envelope": {
    "enabled": true,
    "uz_min_thrust": 0.2,
    "max_climb_speed_mps": 1.5,
    "max_climb_altitude_m": 15.0,
    "soft_land_vz_max_mps": 1.5,
    "soft_land_vx_max_mps": 3.0,
    "soft_land_theta_max_rad": 0.174533,
    "soft_land_roll_max_rad": 0.174533
  }
};

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
