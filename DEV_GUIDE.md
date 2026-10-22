# 🛠️ Developer Guide & Quick Reference

This document provides a concise reference for developers working on the repository, summarizing frequently used commands, architectural contracts, and parameter flow.

---

## ⚡ 1. Frequently Used Commands

| Task | Command | Description |
| :--- | :--- | :--- |
| **Run Unit Tests** | `python -m unittest discover -s hover/tests` | Runs all physics, balance, and Python-to-JS parity tests. |
| **Benchmark Model** | `python hover/evaluate_trained_model.py` | Measures landing success rates across Level 0, 1, and 2 scenarios. |
| **Train & Export Model** | `python hover/train.py` | Trains the policy with SAC / DAgger and exports weights to `trained_policy.json`. |
| **Physics Synchronization** | `python hover/sim/export_physics_config.py` | Syncs `physics_config.json` directly to `physics_config.js`. |
| **Start Web Visualizer** | `python -m http.server 8080` | Access the simulation at `http://localhost:8080/hover/web/index.html`. |

---

## 📐 2. Single Source of Truth Architecture

Flight dynamics and vehicle parameters are managed from a single central JSON file:

```
[ hover/sim/physics_config.json ]  <--- CANONICAL TRUTH
               │
       ┌───────┴────────────────────────┐
       ▼                                ▼
[ hover/sim/params.py ]    [ hover/web/js/physics_config.js ]
(Python Simulation)         (Auto-generated JS Constants)
       │                                │
       ▼                                ▼
[ dynamics.py & env.py ]    [ hover/web/js/physics.js ]
```

> [!IMPORTANT]
> **Rule:** Whenever changing mass, gravity, maximum thrust, aerodynamic drag, or ground effect coefficients, **only** edit `hover/sim/physics_config.json` and then execute `python hover/sim/export_physics_config.py`. Never hardcode numerical physics constants into `physics.js` by hand!

---

## 🧠 3. Neural Network Architecture & Dimensions

The system uses a continuous Multilayer Perceptron (MLP) actor policy:

$$\mathbf{x} \in \mathbb{R}^{12} \xrightarrow{\text{Linear} + \text{ReLU}} \mathbf{h}_1 \in \mathbb{R}^{32} \xrightarrow{\text{Linear} + \text{ReLU}} \mathbf{h}_2 \in \mathbb{R}^{32} \xrightarrow{\text{Linear} + \text{Tanh}} \mathbf{a} \in [-1, +1]^8$$

* **Input Layer (12 Continuous States):**
  * `[0]` Target X error normalized: $(x - x_{target}) / 45$
  * `[1]` Altitude normalized: $h / 30$
  * `[2]` Horizontal velocity normalized: $v_x / 20$
  * `[3]` Vertical velocity normalized: $v_z / 15$
  * `[4, 5]` $\sin(\theta), \cos(\theta)$ (Pitch angle trigonometric components)
  * `[6, 7]` $\sin(\phi), \cos(\phi)$ (Roll angle trigonometric components)
  * `[8]` Roll angular rate: $\omega_{roll} / 6$
  * `[9]` Pitch angular rate: $\omega / 3$
  * `[10]` Desired vertical descent glideslope velocity
  * `[11]` Actuator total thrust normalization ratio
* **Output Layer (8 Normalized Actuators):**
  * `[0..3]` 4 Bottom Main Thrusters (`T-FL`, `T-FR`, `T-RL`, `T-RR`)
  * `[4..7]` 4 Lateral Cold-Gas RCS Jets (`RCS-LF`, `RCS-LR`, `RCS-RF`, `RCS-RR`)

---

## 🛡️ 4. Flight Envelope Protection (FEP)

Safety guardrails to protect the vehicle in extreme out-of-distribution scenarios:
1. **Inverted Thrust Lock ($u_z < 0.20$):** While the vehicle is inverted during a roll recovery, bottom main thrusters are clamped to zero thrust to prevent driving the craft directly into the ground. RCS thrusters orient the body upright first.
2. **Zoom Climb Prevention:** If altitude exceeds $15\text{ m}$ with positive vertical climb velocity ($v_z > 1.5\text{ m/s}$), main thruster throttle is bounded below hover thrust (85%) to avoid runaway climbs.

---

## 📁 5. Directory Map

```
hover/
├── sim/
│   ├── physics_config.json      # Canonical physics parameters
│   ├── export_physics_config.py # Parameter sync script
│   ├── dynamics.py              # 120Hz rigid-body Newton dynamics
│   ├── env.py                   # Gymnasium RL environment
│   ├── expert.py                # Reference controller
│   └── launch.py                # C-Loop ramp kinematics
├── web/
│   ├── index.html               # 3D Viewport & HUD display
│   └── js/
│       ├── physics_config.js    # Auto-generated JS constants
│       ├── physics.js           # 120Hz client-side physics engine
│       ├── policy_net_3d.js     # 3D live synapse/neuron visualizer
│       └── app.js               # Application loop & Three.js scene
├── tests/
│   ├── test_dynamics.py         # Static & dynamic balance unit tests
│   ├── test_env8.py             # Gymnasium integration test
│   └── test_physics_parity.py   # Python-to-JS parity test
├── train.py                     # SAC training pipeline
├── train_dagger.py              # DAgger recovery training
└── evaluate_trained_model.py    # Benchmark evaluation tool
```
