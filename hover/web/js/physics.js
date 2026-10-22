/**
 * physics.js - 120Hz Rigid-Body Newton Physics, Aerodynamics & Ground Contact Engine
 * Clean Architecture - Core Domain Layer
 */

import { wrapAngle } from './flight_controller.js';
import {
  PHYSICS_CONFIG,
  MASS,
  DRY_MASS,
  INITIAL_FUEL_MASS,
  TOTAL_MASS,
  INERTIA,
  INERTIA_XX,
  GRAVITY,
  T_MAX,
  TOTAL_MAX_THRUST,
  FR_MAX,
  ARM_MAIN,
  ARM_MAIN_LAT,
  ARM_RCS,
  ARM_RCS_LAT,
  SUB_DT,
  TAU_MAIN,
  TAU_RCS,
  TARGET_X,
  GROUND_Z,
  ISP_MAIN,
  ISP_RCS,
  GROUND_EFFECT_GAIN,
  GROUND_EFFECT_H_REF,
  TIRE_MU,
  SAFETY_ENVELOPE
} from './physics_config.js';

export {
  PHYSICS_CONFIG,
  MASS,
  DRY_MASS,
  INITIAL_FUEL_MASS,
  TOTAL_MASS,
  INERTIA,
  INERTIA_XX,
  GRAVITY,
  T_MAX,
  TOTAL_MAX_THRUST,
  FR_MAX,
  ARM_MAIN,
  ARM_MAIN_LAT,
  ARM_RCS,
  ARM_RCS_LAT,
  SUB_DT,
  TAU_MAIN,
  TAU_RCS,
  TARGET_X,
  GROUND_Z,
  ISP_MAIN,
  ISP_RCS,
  GROUND_EFFECT_GAIN,
  GROUND_EFFECT_H_REF,
  TIRE_MU,
  SAFETY_ENVELOPE
};

export function createArenaState() {
  return {
    x: 0.0,
    z: 28.5,
    vx: -20.9,
    vz: -5.8,
    theta: 196.1 * Math.PI / 180.0,
    omega: 0.0,
    roll: 0.0,
    omegaRoll: 0.0,
    thrusters: [0, 0, 0, 0],
    rcs: [0, 0, 0, 0],
    fuelMass: INITIAL_FUEL_MASS,
    mass: TOTAL_MASS,
    gForce: 1.0,
    maxGForce: 1.0,
    softLanded: false,
    crashed: false,
    terminal: false,
    windX: 0.0,
    activations: null,
    climbingRamp: false,
    climbT: 0.0,
    fepState: 'nominal',
    fepEnabled: false
  };
}

/**
 * Dynamic Multi-Layer Neural Network inference (Actor Policy).
 * Supports any layer dimensions: 12-in -> N -> M -> 8-out.
 */
export function predictAIPolicyV2(obs, activeWeights) {
  if (!activeWeights || !activeWeights.W1) {
    return { action: new Array(8).fill(0), activations: null };
  }
  const w1 = activeWeights.W1, b1 = activeWeights.b1 || [];
  const w2 = activeWeights.W2, b2 = activeWeights.b2 || [];
  const w3 = activeWeights.W3, b3 = activeWeights.b3 || [];

  const h1 = [];
  const dim1 = w1.length;
  for (let i = 0; i < dim1; i++) {
    let s = (b1 && b1[i] !== undefined) ? b1[i] : 0;
    const row = w1[i];
    if (row && obs) {
      for (let j = 0; j < obs.length; j++) {
        s += (row[j] || 0) * (obs[j] || 0);
      }
    }
    h1.push(Math.max(0, s));
  }

  const h2 = [];
  const dim2 = w2.length;
  for (let i = 0; i < dim2; i++) {
    let s = (b2 && b2[i] !== undefined) ? b2[i] : 0;
    const row = w2[i];
    if (row) {
      for (let j = 0; j < h1.length; j++) {
        s += (row[j] || 0) * h1[j];
      }
    }
    h2.push(Math.max(0, s));
  }

  const out = [];
  const dimOut = w3.length;
  for (let i = 0; i < dimOut; i++) {
    let s = (b3 && b3[i] !== undefined) ? b3[i] : 0;
    const row = w3[i];
    if (row) {
      for (let j = 0; j < h2.length; j++) {
        s += (row[j] || 0) * h2[j];
      }
    }
    out.push(Math.tanh(s));
  }

  return { action: out, activations: { inputs: obs, hidden1: h1, hidden2: h2, outputs: out } };
}

export function getRampClimbTForPos(x, z, rampSys) {
  if (!rampSys) return 0;
  const rdx = x - 0.0;
  const rdz = z - 14.7;
  let rbeta = Math.atan2(rdx, -rdz);
  if (rbeta < 0.0) rbeta += 2.0 * Math.PI;
  if (rbeta > 3.42) rbeta = 3.42;

  let s = rampSys.L_flat + rampSys.R * rbeta;
  if (x < 0.0 && z <= 1.2) {
    s = Math.max(0.0, Math.min(rampSys.L_flat, rampSys.L_flat + x));
  }
  if (rampSys.tab && rampSys.tab.length > 1) {
    for (let i = 0; i < rampSys.tab.length - 1; i++) {
      if (s <= rampSys.tab[i + 1][1]) {
        return rampSys.tab[i][0];
      }
    }
  }
  return rampSys.climbTime * 0.95;
}

export function stepArenaRampClimb(dt, arenaState, rampSys, vfx) {
  arenaState.climbT += dt;
  if (rampSys && arenaState.climbT < rampSys.climbTime) {
    const p = rampSys.poseAtTime(arenaState.climbT);
    arenaState.x = p.x;
    arenaState.z = p.y;
    arenaState.theta = p.theta;
    arenaState.roll = 0.0;
    arenaState.omegaRoll = 0.0;
    arenaState.vx = p.speed * Math.cos(p.theta);
    arenaState.vz = p.speed * Math.sin(p.theta);
    arenaState.omega = p.speed / rampSys.R;
    arenaState.thrusters = [0, 0, 0, 0];
    arenaState.rcs = [0, 0, 0, 0];
    if (vfx && vfx.addCameraTrauma) vfx.addCameraTrauma(0.005);
  } else if (rampSys) {
    arenaState.climbingRamp = false;
    const launch = rampSys.launchState();
    arenaState.x = launch.x;
    arenaState.z = launch.z;
    arenaState.vx = -24.8;
    arenaState.vz = -6.2;
    arenaState.theta = 196.0 * Math.PI / 180.0;
    arenaState.omega = 0.0;
    arenaState.roll = 0.0;
    arenaState.omegaRoll = 0.0;
    arenaState.thrusters = [0, 0, 0, 0];
    arenaState.rcs = [0, 0, 0, 0];
    if (vfx && vfx.playRocketIgnite) vfx.playRocketIgnite(1.0);
    if (vfx && vfx.showToast) vfx.showToast('Rampa Tepesinden Atladı! Geri Dönüş Başladı');
  }
}

/**
 * Executes a single 120Hz physics sub-step.
 */
export function stepArenaSingleSubstep(dt, arenaState, activeWeights, rampSys, vfx) {
  if (arenaState.terminal) return;

  const sn = Math.sin(arenaState.theta);
  const cs = Math.cos(arenaState.theta);
  const sr = Math.sin(arenaState.roll);
  const cr = Math.cos(arenaState.roll);
  const uz = cs * cr; // +1.0 = upright, -1.0 = inverted
  const h = Math.max(0.0, arenaState.z - GROUND_Z);
  const curMass = 1800.0 + (arenaState.fuelMass || 0.0);
  const TARMAC_Y = 0.0;

  // 4 Wheels & Roof contacts
  const zWheelF = arenaState.z + 1.48 * sn - 0.70 * uz;
  const zWheelR = arenaState.z - 1.48 * sn - 0.70 * uz;
  const zRoofF = arenaState.z + 1.48 * sn + 0.70 * uz;
  const zRoofR = arenaState.z - 1.48 * sn + 0.70 * uz;
  const minLowestZ = Math.min(zWheelF, zWheelR, zRoofF, zRoofR);

  const pitchTilt = (cs >= 0) ? Math.abs(wrapAngle(arenaState.theta)) : Math.abs(wrapAngle(arenaState.theta - Math.PI));
  const rollTilt = (cs >= 0) ? Math.abs(wrapAngle(arenaState.roll)) : Math.abs(wrapAngle(arenaState.roll - Math.PI));

  // 1. Zemin Süspansiyon Yay-Sönüm & Kaldıraç Torku
  let fNormalTotal = 0.0;
  let fF = 0.0, fR = 0.0;

  if (zWheelF < TARMAC_Y) {
    const penF = TARMAC_Y - zWheelF;
    const vWheelF = arenaState.vz + 1.48 * arenaState.omega;
    fF = Math.max(0.0, 58000.0 * penF - 4800.0 * vWheelF);
    fNormalTotal += fF;
  }
  if (zWheelR < TARMAC_Y) {
    const penR = TARMAC_Y - zWheelR;
    const vWheelR = arenaState.vz - 1.48 * arenaState.omega;
    fR = Math.max(0.0, 58000.0 * penR - 4800.0 * vWheelR);
    fNormalTotal += fR;
  }

  // Tavan teması
  if (zRoofF < TARMAC_Y || zRoofR < TARMAC_Y) {
    const penRoof = TARMAC_Y - Math.min(zRoofF, zRoofR);
    const fRoof = Math.max(0.0, 80000.0 * penRoof - 6000.0 * arenaState.vz);
    fNormalTotal += fRoof;
    if (!arenaState.softLanded) arenaState.crashed = true;
  }

  const headingSign = (cs >= 0) ? 1.0 : -1.0;
  const tauGroundPitch = headingSign * (fF * 1.48 - fR * 1.48);

  // 2. Touchdown / Soft Landing Kontrolü
  const isTouchdownContact = (zWheelF <= TARMAC_Y + 0.14 || zWheelR <= TARMAC_Y + 0.14 || h < 0.20);
  const isLevel = (pitchTilt < 0.35) && (rollTilt < 0.35) && (uz > 0.60);
  const isTouchSpeedSafe = Math.abs(arenaState.vz) < 2.0 && Math.abs(arenaState.vx) < 4.5;

  if (isTouchdownContact && isLevel && isTouchSpeedSafe && !arenaState.crashed) {
    arenaState.softLanded = true;
  } else if (h > 1.2) {
    arenaState.softLanded = false;
  }

  // 3. 12-D Gözlem ve NN Forward Pass
  const xErr = arenaState.x - TARGET_X;
  const vDesire = -(0.5 + 0.8 * Math.sqrt(Math.max(0.0, 2.0 * 2.8 * h)));
  const totThrustNorm = (arenaState.thrusters[0] + arenaState.thrusters[1] + arenaState.thrusters[2] + arenaState.thrusters[3]) / (4.0 * T_MAX);

  const arenaObs = [
    Math.max(-2.0, Math.min(2.0, xErr / 45.0)),
    Math.max(0.0, Math.min(2.0, h / 30.0)),
    Math.max(-2.0, Math.min(2.0, arenaState.vx / 20.0)),
    Math.max(-2.0, Math.min(2.0, arenaState.vz / 15.0)),
    sn,
    cs,
    sr,
    cr,
    Math.max(-2.0, Math.min(2.0, arenaState.omegaRoll / 6.0)),
    Math.max(-2.0, Math.min(2.0, arenaState.omega / 3.0)),
    Math.max(-2.0, Math.min(2.0, vDesire / 15.0)),
    Math.max(0.0, Math.min(1.0, totThrustNorm))
  ];

  const aiPred = predictAIPolicyV2(arenaObs, activeWeights);
  arenaState.activations = aiPred.activations;
  arenaState.action_cmds = aiPred.action;

  let tCmd = [0, 0, 0, 0];
  let rCmd = [0, 0, 0, 0];

  if (!arenaState.softLanded && arenaState.fuelMass > 0.0) {
    for (let i = 0; i < 4; i++) {
      const actM = Math.max(-1.0, Math.min(1.0, (aiPred.action && aiPred.action[i] !== undefined) ? aiPred.action[i] : -1.0));
      tCmd[i] = (actM + 1.0) * 0.5 * T_MAX;
    }
    for (let i = 0; i < 4; i++) {
      const actR = Math.max(-1.0, Math.min(1.0, (aiPred.action && aiPred.action[4 + i] !== undefined) ? aiPred.action[4 + i] : 0.0));
      rCmd[i] = actR * FR_MAX;
    }

    // Safety Envelope (Uçuş Emniyet Filtresi):
    if (SAFETY_ENVELOPE && SAFETY_ENVELOPE.enabled) {
      // 1. Araç tersken (uz < 0.20) ana motorları kapat, yere bastırma! Önce RCS ile taklayı düzelt.
      if (uz < SAFETY_ENVELOPE.uz_min_thrust) {
        tCmd = [0, 0, 0, 0];
        arenaState.fepState = 'attitude_recovery';
      }
      // 2. Yüksekte kontrolsüz tırmanışı önle (Zoom Climb önleme):
      else if (h > SAFETY_ENVELOPE.max_climb_altitude_m && arenaState.vz > SAFETY_ENVELOPE.max_climb_speed_mps) {
        const hoverClamp = (curMass * GRAVITY) / 4.0 * 0.85;
        for (let i = 0; i < 4; i++) tCmd[i] = Math.min(tCmd[i], hoverClamp);
        arenaState.fepState = 'climb_mitigation';
      } else {
        arenaState.fepState = 'nominal';
      }
    } else {
      arenaState.fepState = 'nominal';
    }
  }

  // Aktüatör Gecikmeleri (Tau Filtreleri)
  const lagM = 1.0 - Math.exp(-dt / TAU_MAIN);
  for (let i = 0; i < 4; i++) arenaState.thrusters[i] += (tCmd[i] - arenaState.thrusters[i]) * lagM;
  const lagR = 1.0 - Math.exp(-dt / TAU_RCS);
  for (let i = 0; i < 4; i++) arenaState.rcs[i] += (rCmd[i] - arenaState.rcs[i]) * lagR;

  // Yakıt Tüketimi
  const tMainSum = arenaState.thrusters[0] + arenaState.thrusters[1] + arenaState.thrusters[2] + arenaState.thrusters[3];
  const tRcsSum = Math.abs(arenaState.rcs[0]) + Math.abs(arenaState.rcs[1]) + Math.abs(arenaState.rcs[2]) + Math.abs(arenaState.rcs[3]);
  const mDotMain = tMainSum / (GRAVITY * ISP_MAIN);
  const mDotRcs = tRcsSum / (GRAVITY * ISP_RCS);
  const dmFuel = (mDotMain + mDotRcs) * dt;

  if (arenaState.fuelMass > 0.0) {
    arenaState.fuelMass = Math.max(0.0, arenaState.fuelMass - dmFuel);
  } else {
    for (let i = 0; i < 4; i++) arenaState.thrusters[i] = 0.0;
    for (let i = 0; i < 4; i++) arenaState.rcs[i] = 0.0;
  }
  arenaState.mass = DRY_MASS + arenaState.fuelMass;

  let fFront = arenaState.thrusters[0] + arenaState.thrusters[1];
  let fRear = arenaState.thrusters[2] + arenaState.thrusters[3];
  const totLift = fFront + fRear;

  const tauRoll = (arenaState.rcs[0] + arenaState.rcs[1] - arenaState.rcs[2] - arenaState.rcs[3]) * ARM_RCS_LAT;
  const rNose = arenaState.rcs[0] - arenaState.rcs[2];
  const rTail = arenaState.rcs[1] - arenaState.rcs[3];
  const tauPitch = (fFront * ARM_MAIN - fRear * ARM_MAIN) + (rNose - rTail) * ARM_RCS;

  // Aerodinamik Sürükleme
  const relVx = arenaState.vx - arenaState.windX;
  const aeroDragX = 0.5 * 0.45 * 1.2 * relVx * Math.abs(relVx);
  const aeroDragZ = 0.5 * 0.70 * 1.2 * arenaState.vz * Math.abs(arenaState.vz);

  // Plume Zemin Etkisi
  let geMult = 1.0;
  if (h < 1.80 && uz > 0.15) {
    geMult = 1.0 + GROUND_EFFECT_GAIN * Math.exp(-h / GROUND_EFFECT_H_REF) * Math.min(1.0, uz);
  }
  const totLiftEffective = totLift * geMult;

  const liftZ = Math.max(0.0, cs * cr);
  let fx = -totLiftEffective * sn * cr - aeroDragX;
  let fz = totLiftEffective * liftZ + fNormalTotal - aeroDragZ - curMass * GRAVITY;

  const ax = fx / curMass;
  const az = fz / curMass;
  arenaState.vx += ax * dt;
  arenaState.vz += az * dt;

  // Canlı G-Kuvveti
  const instG = Math.sqrt(ax * ax + (az + GRAVITY) * (az + GRAVITY)) / GRAVITY;
  arenaState.gForce = arenaState.gForce * 0.90 + instG * 0.10;
  if (arenaState.gForce > arenaState.maxGForce) arenaState.maxGForce = arenaState.gForce;

  // Zemin Freni / Sürtünme
  const isWheelTouching = (zWheelF <= TARMAC_Y + 0.08 || zWheelR <= TARMAC_Y + 0.08);
  if (arenaState.softLanded) {
    const brakeDecel = 22.0;
    const curSpeedX = Math.abs(arenaState.vx);
    if (curSpeedX > 0.001) {
      const deltaV = Math.min(curSpeedX, brakeDecel * dt);
      arenaState.vx -= Math.sign(arenaState.vx) * deltaV;
    }
    arenaState.omega *= 0.82;
    arenaState.omegaRoll *= 0.82;
  } else if (isWheelTouching || fNormalTotal > 50.0) {
    const fNAvail = Math.max(fNormalTotal, isWheelTouching ? 350.0 : 0.0);
    const maxFric = TIRE_MU * fNAvail;
    const brakeDecel = Math.min(16.0, Math.max(0.8, maxFric / curMass));
    const curSpeedX = Math.abs(arenaState.vx);
    if (curSpeedX > 0.001) {
      const deltaV = Math.min(curSpeedX, brakeDecel * dt);
      arenaState.vx -= Math.sign(arenaState.vx) * deltaV;
    }
    arenaState.omega *= 0.88;
    arenaState.omegaRoll *= 0.88;
  }

  const alphaRoll = (tauRoll - 180.0 * arenaState.omegaRoll) / INERTIA_XX;
  const alphaPitch = (tauPitch + tauGroundPitch - 900.0 * arenaState.omega) / INERTIA;

  arenaState.x += arenaState.vx * dt;
  arenaState.z += arenaState.vz * dt;

  arenaState.omega += alphaPitch * dt;
  arenaState.theta += arenaState.omega * dt;

  arenaState.omegaRoll += alphaRoll * dt;
  arenaState.roll += arenaState.omegaRoll * dt;

  // Sert Asfalt Taban Sınırı
  if (minLowestZ < TARMAC_Y) {
    arenaState.z += (TARMAC_Y - minLowestZ);
    if (arenaState.vz < 0.0) arenaState.vz = 0.0;
  }

  // Park Pozisyonu
  if (arenaState.softLanded) {
    arenaState.vx *= 0.60;
    if (Math.abs(arenaState.vx) < 0.02) arenaState.vx = 0.0;
    arenaState.vz = 0.0;
    arenaState.omega = 0.0;
    arenaState.omegaRoll = 0.0;
    arenaState.z = GROUND_Z;
    const targetPitchRest = (cs >= 0) ? 0.0 : Math.PI;
    arenaState.theta += wrapAngle(targetPitchRest - arenaState.theta) * 0.25;
    const targetRollRest = (cs >= 0) ? 0.0 : Math.PI;
    arenaState.roll += wrapAngle(targetRollRest - arenaState.roll) * 0.25;
    for (let i = 0; i < 4; i++) {
      arenaState.thrusters[i] = 0.0;
      arenaState.rcs[i] = 0.0;
    }
  }

  // Katı C-Loop Rampa & İskele Çarpışma Fiziği
  if (arenaState.x >= 13.65 && arenaState.x <= 18.25 && arenaState.z <= 30.5) {
    const penLeft = arenaState.x - 13.65;
    const penRight = 18.25 - arenaState.x;
    const penTop = 30.5 - arenaState.z;
    if (penTop < Math.min(penLeft, penRight) && arenaState.vz < 0.0) {
      arenaState.z = 30.55;
      arenaState.vz = -0.30 * arenaState.vz;
    } else if (penLeft < penRight) {
      arenaState.x = 13.64;
      if (arenaState.vx > 0.0) arenaState.vx = -0.38 * arenaState.vx;
    } else {
      arenaState.x = 18.26;
      if (arenaState.vx < 0.0) arenaState.vx = -0.38 * arenaState.vx;
    }
    arenaState.omega += (Math.random() - 0.5) * 2.5;
    if (vfx && vfx.triggerPlumeImpact) vfx.triggerPlumeImpact(arenaState.x, arenaState.z, 0.0, 0.7);
    if (vfx && vfx.addCameraTrauma) vfx.addCameraTrauma(0.15);
  }

  // Düz Rampa Giriş Pisti
  if (arenaState.x >= -18.0 && arenaState.x <= 0.0 && arenaState.z <= 1.40) {
    const penFlat = 1.40 - arenaState.z;
    if (penFlat > 0.0) {
      arenaState.z = 1.40;
      if (arenaState.vz < 0.0) arenaState.vz = 0.0;
      arenaState.theta += wrapAngle(0.0 - arenaState.theta) * 0.25;
      arenaState.omega *= 0.85;
    }
  }

  // C-Loop Dairesel Yay
  const rdx = arenaState.x - 0.0;
  const rdz = arenaState.z - 14.7;
  const rd = Math.hypot(rdx, rdz);
  let rbeta = Math.atan2(rdx, -rdz);
  if (rbeta < 0.0) rbeta += 2.0 * Math.PI;

  if (rbeta >= 0.0 && rbeta <= 3.43) {
    const R_COM = 13.30;
    const R_OUT = 14.85;

    if (rd < 14.0) {
      if (rd > R_COM) {
        // Rampa yüzeyi ile çarpışma: serbest uçuşta sadece sektir, arabayı zorla fırlatma ucuna ışınlama
        const urx = rdx / rd, urz = rdz / rd;
        const vr = arenaState.vx * urx + arenaState.vz * urz;
        if (vr > 0.0) {
          arenaState.x = urx * R_COM;
          arenaState.z = 14.7 + urz * R_COM;
          arenaState.vx -= 1.35 * vr * urx;
          arenaState.vz -= 1.35 * vr * urz;
          arenaState.omega += (Math.random() - 0.5) * 2.0;
        }
        if (Math.abs(vr) > 6.0 && vfx && vfx.triggerPlumeImpact) {
          vfx.triggerPlumeImpact(arenaState.x, arenaState.z, 0.0, 0.4);
        }
      }
    } else if (rd >= 14.0 && rd < R_OUT) {
      const urx = rdx / rd, urz = rdz / rd;
      const vr = arenaState.vx * urx + arenaState.vz * urz;
      if (vr < 0.0) {
        arenaState.x = urx * R_OUT;
        arenaState.z = 14.7 + urz * R_OUT;
        arenaState.vx -= 1.35 * vr * urx;
        arenaState.vz -= 1.35 * vr * urz;
        arenaState.omega += (Math.random() - 0.5) * 3.5;
        if (vfx && vfx.triggerPlumeImpact) vfx.triggerPlumeImpact(arenaState.x, arenaState.z, 0.0, 0.6);
        if (vfx && vfx.addCameraTrauma) vfx.addCameraTrauma(0.2);
      }
    }
  }

  // Şiddetli Çarpışma & Kaza Değerlendirmesi
  if (fNormalTotal > 3000.0) {
    const tiltDeg = Math.acos(Math.max(-1.0, Math.min(1.0, uz))) * 180.0 / Math.PI;
    const isViolentCrash = Math.abs(arenaState.vz) > 4.2 || Math.abs(arenaState.vx) > 12.0 || tiltDeg > 38.0 || uz < 0.20;
    if (isViolentCrash && !arenaState.softLanded && !arenaState.crashed) {
      arenaState.crashed = true;
      arenaState.fepState = 'crashed';
      arenaState.thrusters = [0, 0, 0, 0];
      arenaState.rcs = [0, 0, 0, 0];
      if (vfx && vfx.addCameraTrauma) vfx.addCameraTrauma(0.65);
      if (vfx && vfx.triggerPlumeImpact) vfx.triggerPlumeImpact(arenaState.x, arenaState.z, 0.0, 1.2);
      if (vfx && vfx.showToast) vfx.showToast('Sert Temas! Yeniden Başlatmak İçin [R] veya [1] Tuşuna Basın');
    }
  }
}

let arenaAccumulator = 0.0;
export function stepArenaPhysicsFixed(frameDt, arenaState, activeWeights, rampSys, vfx) {
  if (arenaState.terminal) return;
  if (arenaState.climbingRamp) {
    stepArenaRampClimb(frameDt, arenaState, rampSys, vfx);
    return;
  }
  arenaAccumulator += Math.min(0.05, frameDt);
  let count = 0;
  while (arenaAccumulator >= SUB_DT && count < 6) {
    stepArenaSingleSubstep(SUB_DT, arenaState, activeWeights, rampSys, vfx);
    arenaAccumulator -= SUB_DT;
    count++;
  }
}

export function resetArenaAccumulator() {
  arenaAccumulator = 0.0;
}
