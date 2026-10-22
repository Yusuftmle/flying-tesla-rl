"""
Unit Tests for Rocket Vehicle Dynamics V3
1. Denge asılı kalma: T = mg/4 (4 motor), RCS=0 -> ax=0, az=0, alpha=0.
2. RCS Roll Torku: Sol +FR, Sağ -FR -> güçlü pozitif roll açısal ivmesi (alpha_roll > 0).
3. Havada 360 derece burgu (roll): roll = 180 derece havada asla bölümü bitirmez (terminal=False).
4. Zemin yumuşak iniş: vz=-1.0, vx=0.5, theta=3 deg, roll=2 deg -> soft_landed=True, terminal=True.
5. Zemin sert çarpma: vz=-5.0 -> crashed=True, terminal=True.
6. Tepe Kemeri Rampa çıkış durumu: theta ~ 196.1 derece (-16.1 deg burun aşağı), z ~ 28.5m, vx ~ -20.9 m/s.
"""

import unittest
import numpy as np
import math
from hover.sim import params
from hover.sim.dynamics import VehicleState, step_physics, step_control, wrap_angle
from hover.sim.launch import get_launch_state

class TestVehicleDynamicsV3(unittest.TestCase):

    def test_hover_equilibrium(self):
        """T = mg/4 her 4 iticide ve theta=0, roll=0 iken araç yerinde asılı kalmalıdır (Statik Denge)."""
        t_eq = (params.MASS * params.GRAVITY) / 4.0
        state = VehicleState(
            x=0.0, z=15.0, vx=0.0, vz=0.0, theta=0.0, omega=0.0, roll=0.0, omega_roll=0.0,
            thrusters=[t_eq, t_eq, t_eq, t_eq], rcs=[0.0, 0.0, 0.0, 0.0]
        )
        t_cmds = np.array([t_eq, t_eq, t_eq, t_eq], dtype=np.float32)
        r_cmds = np.array([0.0, 0.0, 0.0, 0.0], dtype=np.float32)

        for _ in range(120):
            step_physics(state, t_cmds, r_cmds, dt=params.DT_PHYSICS, consume_fuel=False)

        self.assertAlmostEqual(state.z, 15.0, places=4)
        self.assertAlmostEqual(state.x, 0.0, places=4)
        self.assertAlmostEqual(state.vx, 0.0, places=4)
        self.assertAlmostEqual(state.vz, 0.0, places=4)
        self.assertAlmostEqual(state.theta, 0.0, places=4)
        self.assertAlmostEqual(state.roll, 0.0, places=4)
        self.assertFalse(state.terminal)

    def test_dynamic_hover_with_fuel_burn(self):
        """Dinamik yakıt tüketimi altında otopilot kütleye göre itkiyi ayarlayarak irtifasını korur."""
        t_eq_init = (params.MASS * params.GRAVITY) / 4.0
        state = VehicleState(
            x=0.0, z=15.0, vx=0.0, vz=0.0, theta=0.0, omega=0.0, roll=0.0, omega_roll=0.0,
            thrusters=[t_eq_init, t_eq_init, t_eq_init, t_eq_init], rcs=[0.0, 0.0, 0.0, 0.0]
        )
        r_cmds = np.array([0.0, 0.0, 0.0, 0.0], dtype=np.float32)

        for _ in range(120):
            # Uçuş kontrolcüsü anlık kütleye göre itkiyi regüle eder
            t_eq_cur = (state.mass * params.GRAVITY) / 4.0
            t_cmds = np.array([t_eq_cur, t_eq_cur, t_eq_cur, t_eq_cur], dtype=np.float32)
            step_physics(state, t_cmds, r_cmds, dt=params.DT_PHYSICS, consume_fuel=True)

        self.assertAlmostEqual(state.z, 15.0, places=2)
        self.assertLess(state.fuel_mass, params.INITIAL_FUEL_MASS)
        self.assertFalse(state.terminal)

    def test_rcs_roll_torque(self):
        """RCS Sol motorlar +FR, Sağ motorlar -FR iken güçlü pozitif roll açısal ivme üretmelidir."""
        state = VehicleState(
            x=0.0, z=20.0, vx=0.0, vz=0.0, theta=0.0, omega=0.0, roll=0.0, omega_roll=0.0,
            thrusters=[0.0, 0.0, 0.0, 0.0], rcs=[params.FR_MAX, params.FR_MAX, -params.FR_MAX, -params.FR_MAX]
        )
        t_cmds = np.zeros(4, dtype=np.float32)
        r_cmds = np.array([params.FR_MAX, params.FR_MAX, -params.FR_MAX, -params.FR_MAX], dtype=np.float32)

        for _ in range(10):
            step_physics(state, t_cmds, r_cmds, dt=params.DT_PHYSICS)

        self.assertGreater(state.omega_roll, 0.0)
        self.assertGreater(state.roll, 0.0)

    def test_airborne_inverted_never_terminates(self):
        """Araç havada ters dönerse (roll=180 derece veya theta=196 derece) BÖLÜM BİTMEMELİDİR."""
        state = VehicleState(x=0.0, z=25.0, vx=-15.0, vz=-2.0, theta=math.radians(196.0), omega=0.0, roll=math.pi, omega_roll=0.0)
        t_cmds = np.zeros(4, dtype=np.float32)
        r_cmds = np.zeros(4, dtype=np.float32)

        for _ in range(10):
            step_physics(state, t_cmds, r_cmds, dt=params.DT_PHYSICS)

        self.assertFalse(state.terminal)
        self.assertFalse(state.crashed)

    def test_soft_landing(self):
        """Zemine düşük hız ve açıyla iniş yumuşak iniş sayılmalıdır."""
        state = VehicleState(
            x=-45.0, z=params.GROUND_Z + 0.02, vx=0.5, vz=-1.0,
            theta=math.radians(4.0), roll=math.radians(3.0)
        )
        t_cmds = np.zeros(4, dtype=np.float32)
        r_cmds = np.zeros(4, dtype=np.float32)

        for _ in range(20):
            step_physics(state, t_cmds, r_cmds, dt=params.DT_PHYSICS)
            if state.terminal:
                break

        self.assertTrue(state.soft_landed)
        self.assertFalse(state.crashed)
        self.assertEqual(state.terminal_reason, "soft_landing")

    def test_ground_crash(self):
        """Zemine yüksek dikey hızla iniş çarpma sayılmalıdır."""
        state = VehicleState(x=-45.0, z=params.GROUND_Z + 0.05, vx=0.0, vz=-5.0, theta=0.0, roll=0.0)
        t_cmds = np.zeros(4, dtype=np.float32)
        r_cmds = np.zeros(4, dtype=np.float32)

        for _ in range(20):
            step_physics(state, t_cmds, r_cmds, dt=params.DT_PHYSICS)
            if state.terminal:
                break

        self.assertTrue(state.crashed)
        self.assertFalse(state.soft_landed)
        self.assertEqual(state.terminal_reason, "ground_crash")

    def test_crest_ramp_exit_state(self):
        """C-Loop rampa çıkışında araç forward-downward (-16.1 deg) fırlamalıdır."""
        init = get_launch_state(deterministic=True)
        deg = math.degrees(init["theta"])
        self.assertAlmostEqual(deg, -16.1, places=1)
        self.assertAlmostEqual(init["x"], -3.7, places=0)
        self.assertGreater(init["z"], 25.0)
        self.assertLess(init["vx"], -18.0)  # İleri doğru hızlı savrulma
        self.assertLess(init["vz"], 0.0)    # Aşağı doğru yönelim

if __name__ == '__main__':
    unittest.main()
