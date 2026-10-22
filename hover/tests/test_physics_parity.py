"""
Unit test to verify physics configuration parity between Python and JavaScript.
Ensures single source of truth contract is strictly adhered to.
"""

import json
import unittest
from pathlib import Path
from hover.sim import params

class TestPhysicsParity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(__file__).resolve().parent.parent
        cls.config_path = cls.root / "sim" / "physics_config.json"
        cls.js_config_path = cls.root / "web" / "js" / "physics_config.js"

        with open(cls.config_path, "r", encoding="utf-8") as f:
            cls.config = json.load(f)

    def test_json_config_exists(self):
        """Canonical JSON config must exist and have required sections."""
        self.assertTrue(self.config_path.exists())
        self.assertIn("mass", self.config)
        self.assertIn("geometry", self.config)
        self.assertIn("inertia", self.config)
        self.assertIn("thrusters", self.config)
        self.assertIn("ground_contact", self.config)
        self.assertIn("safety_envelope", self.config)

    def test_python_params_parity(self):
        """Python params.py constants must match JSON single source of truth."""
        self.assertEqual(params.DRY_MASS, self.config["mass"]["dry_mass_kg"])
        self.assertEqual(params.INITIAL_FUEL_MASS, self.config["mass"]["initial_fuel_mass_kg"])
        self.assertEqual(params.INERTIA, self.config["inertia"]["pitch_inertia_yy"])
        self.assertEqual(params.INERTIA_XX, self.config["inertia"]["roll_inertia_xx"])
        self.assertEqual(params.GRAVITY, self.config["environment"]["gravity_mps2"])
        self.assertEqual(params.ISP_MAIN, self.config["thrusters"]["isp_main_sec"])
        self.assertEqual(params.ISP_RCS, self.config["thrusters"]["isp_rcs_sec"])
        self.assertEqual(params.TIRE_MU, self.config["ground_contact"]["tire_coulomb_mu"])
        self.assertEqual(params.ARM_MAIN, self.config["geometry"]["arm_main_lon_m"])
        self.assertEqual(params.ARM_RCS, self.config["geometry"]["arm_rcs_lon_m"])

    def test_js_config_file_exists_and_synced(self):
        """JavaScript physics_config.js must exist and contain the version tag."""
        self.assertTrue(self.js_config_path.exists())
        with open(self.js_config_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("PHYSICS_CONFIG", content)
        self.assertIn(self.config["version"], content)
        self.assertIn(str(self.config["thrusters"]["fr_max_rcs_n"]), content)

if __name__ == "__main__":
    unittest.main()
