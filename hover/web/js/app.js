/* =========================================================================
   ROCKET LANDING AI - MODÜLER ES6 UYGULAMA MERKEZİ (APP.JS)
   ========================================================================= */

import { PolicyNet3D } from './policy_net_3d.js?v=10';
import { RampLaunch } from './ramp_launch.js';
import { AircraftHUD } from './aircraft_hud.js';
import {
  initAudio,
  updateAudio,
  toggleSound,
  playRocketIgnite,
  playRCSPuff,
  isSoundActive
} from './audio.js';
import { wrapAngle } from './flight_controller.js';
import {
  currentLang,
  isVideoMode,
  I18N,
  applyLanguage,
  toggleLanguage,
  toggleVideoMode,
  toggleVideoHUD,
  toggleHamburgerMenu,
  getI18nTitle,
  updateHTMLHUD,
  setActuatorBar,
  showToast
} from './hud_presenter.js';
import {
  MASS,
  INERTIA,
  GRAVITY,
  T_MAX,
  FR_MAX,
  ARM_MAIN,
  ARM_RCS,
  SUB_DT,
  TAU_MAIN,
  TAU_RCS,
  TARGET_X,
  GROUND_Z,
  createArenaState,
  predictAIPolicyV2,
  getRampClimbTForPos,
  stepArenaRampClimb,
  stepArenaSingleSubstep,
  stepArenaPhysicsFixed,
  resetArenaAccumulator
} from './physics.js';
import { createVehicleModel } from './vehicle_model.js';
import { initEnvironment } from './environment.js';
import { initPlumeVFX } from './vfx_plume.js';
import { initMouseInteraction } from './interaction.js';

// Rampa Geometrisi ve Durum Değişkenleri
const rampSys = new RampLaunch({
  R: 14.0,
  exitDeg: 196.0,
  L_flat: 18.0,
  hCom: 0.70,
  vExit: 21.8,
  groundY: 0.70
});

let currentMode = 'arena';
let isPlaying = true;
let activeStep = 1000000;
let currentFrameIdx = 0;
let activeWeights = null;
let currentTrajectory = [];
const cachedLogs = {};

// 1. Üç Boyutlu Sahne, Kamera ve Çevre Kurulumu
const canvas = document.getElementById('three-viewport');
const {
  renderer,
  scene,
  camera,
  controls,
  composer,
  bloomPass,
  addCameraTrauma,
  getCameraTrauma,
  decayCameraTrauma,
  resetCameraView,
  onWindowResize
} = initEnvironment({
  canvas,
  THREE,
  rampSys,
  TARGET_X,
  showToast
});

// 1.5. Profesyonel Taktik Askeri Uçak / NASA Spacecraft HUD Göstergesi
const aircraftHudCanvas = document.getElementById('aircraft-hud-canvas');
const aircraftHUD = new AircraftHUD({
  canvas: aircraftHudCanvas,
  camera,
  THREE
});

// 2. 3D Sinir Ağı Görselleştirmesi
const net3D = new PolicyNet3D({ THREE });
net3D.group.position.set(-36.0, 22.0, -15.0);
scene.add(net3D.group);

// 3. 3D Araç Modeli Kurulumu
const {
  vehicleGroup,
  carWheels,
  thrusterFlames,
  thrusterNozzles,
  thrusterLights,
  rcsFlames
} = createVehicleModel({
  THREE,
  ARM_MAIN,
  ARM_RCS
});
scene.add(vehicleGroup);

const bottomPositions = [
  { id: 'FL', x: +ARM_MAIN, z: -0.75 },
  { id: 'FR', x: +ARM_MAIN, z: +0.75 },
  { id: 'RL', x: -ARM_MAIN, z: -0.75 },
  { id: 'RR', x: -ARM_MAIN, z: +0.75 }
];

// 4. Parçacık ve Plume Efektleri
const {
  triggerPlumeImpact,
  updateFluidPlumeSimulation
} = initPlumeVFX({
  THREE,
  scene,
  camera,
  GROUND_Z
});

// 5. Arena Durumu & Fizik Geri Bildirimleri
const arenaState = createArenaState();
window.arenaState = arenaState;
window.currentMode = currentMode;

const vfxCallbacks = {
  triggerPlumeImpact: (x, z, y, p) => triggerPlumeImpact(x, z, y, p),
  addCameraTrauma: (amt) => addCameraTrauma(amt),
  playRocketIgnite: (vol) => playRocketIgnite(vol),
  showToast: (msg) => showToast(msg),
  onRespawn: () => {
    if (currentMode === 'arena' && arenaState.crashed) {
      arenaLaunchRamp();
    }
  }
};

// 6. Mouse Etkileşimi
initMouseInteraction({
  canvas,
  THREE,
  scene,
  camera,
  controls,
  vehicleGroup,
  rampSys,
  arenaState,
  getMode: () => currentMode,
  playRocketIgnite,
  initAudio,
  showToast,
  getCurrentLang: () => currentLang,
  GROUND_Z,
  resetArenaAccumulator,
  getRampClimbTForPos
});

// Arena Aksiyonları
function arenaLaunchRamp() {
  initAudio();
  resetArenaAccumulator();
  arenaState.climbingRamp = true;
  arenaState.climbT = 0.0;
  const p0 = rampSys.poseAtTime(0);
  arenaState.x = p0.x;
  arenaState.z = p0.y;
  arenaState.theta = p0.theta;
  arenaState.roll = 0.0;
  arenaState.omega = 0.0;
  arenaState.omegaRoll = 0.0;
  arenaState.vx = p0.speed;
  arenaState.vz = 0.0;
  arenaState.thrusters = [0, 0, 0, 0];
  arenaState.rcs = [0, 0, 0, 0];
  arenaState.fuelMass = 45.0;
  arenaState.mass = 1845.0;
  arenaState.gForce = 1.0;
  arenaState.maxGForce = 1.0;
  arenaState.softLanded = false;
  arenaState.crashed = false;
  arenaState.terminal = false;
  showToast(currentLang === 'tr' ? 'C-Loop Rampasından Fırlatılıyor...' : 'Launching from Inverted C-Loop Ramp...');
}

function arenaDropHigh() {
  initAudio();
  resetArenaAccumulator();
  arenaState.climbingRamp = false;
  arenaState.x = -62.0 + (Math.random() - 0.5) * 6.0;
  arenaState.z = 24.0 + Math.random() * 4.0;
  arenaState.vx = (Math.random() - 0.5) * 2.0;
  arenaState.vz = -1.0;
  arenaState.theta = Math.PI * 0.90;
  arenaState.roll = 0.4;
  arenaState.omega = (Math.random() - 0.5) * 0.5;
  arenaState.omegaRoll = (Math.random() - 0.5) * 0.5;
  arenaState.thrusters = [0, 0, 0, 0];
  arenaState.rcs = [0, 0, 0, 0];
  arenaState.fuelMass = 45.0;
  arenaState.mass = 1845.0;
  arenaState.gForce = 1.0;
  arenaState.maxGForce = 1.0;
  arenaState.softLanded = false;
  arenaState.crashed = false;
  arenaState.terminal = false;
  showToast(currentLang === 'tr' ? 'Ters Bırakıldı: Serbest Düşüş' : 'Inverted Drop: Free Fall & Recovery');
}

function arenaRandomFling() {
  initAudio();
  playRocketIgnite(0.9);
  resetArenaAccumulator();
  arenaState.climbingRamp = false;
  arenaState.x = -55.0 + Math.random() * 45.0;
  arenaState.z = 18.0 + Math.random() * 15.0;
  arenaState.vx = (Math.random() - 0.5) * 25.0;
  arenaState.vz = -4.0 + Math.random() * 15.0;
  arenaState.theta = (Math.random() - 0.5) * 0.8;
  arenaState.roll = (Math.random() - 0.5) * 1.0;
  arenaState.omega = (Math.random() - 0.5) * 2.0;
  arenaState.omegaRoll = (Math.random() - 0.5) * 2.5;
  arenaState.thrusters = [0, 0, 0, 0];
  arenaState.rcs = [0, 0, 0, 0];
  arenaState.fuelMass = 45.0;
  arenaState.mass = 1845.0;
  arenaState.gForce = 1.0;
  arenaState.maxGForce = 1.0;
  arenaState.softLanded = false;
  arenaState.crashed = false;
  arenaState.terminal = false;
  showToast(currentLang === 'tr' ? 'Kaotik Fırlatma Başlatıldı' : 'Chaotic Fling Initialized');
}

function arenaTriggerWind() {
  initAudio();
  arenaState.windX = (Math.random() > 0.5 ? 1 : -1) * (14.0 + Math.random() * 8.0);
  showToast(currentLang === 'tr' ? `${Math.round(arenaState.windX * 3.6)} km/s Yan Rüzgar` : `${Math.round(arenaState.windX * 3.6)} km/h Crosswind`);
}



// Video Kaydı (MediaRecorder)
let mediaRecorder = null, recordedChunks = [];
function toggleRecording() {
  initAudio();
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    setRecordBtnUI(false);
    return;
  }
  const stream = canvas.captureStream(30);
  let opt = { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 16000000 };
  if (!MediaRecorder.isTypeSupported(opt.mimeType)) opt = { mimeType: 'video/webm' };
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, opt);
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const b = new Blob(recordedChunks, { type: 'video/webm' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b);
    a.download = `simulation_${activeStep}.webm`; a.click();
    showToast(currentLang === 'tr' ? 'Video İndirildi' : 'Video Saved');
    setRecordBtnUI(false);
  };
  mediaRecorder.start();
  setRecordBtnUI(true);
  showToast(currentLang === 'tr' ? 'Video Kaydı Başladı...' : 'Recording Started...');
  if (currentMode === 'journey') currentFrameIdx = 0;
}

function setRecordBtnUI(rec) {
  const btn = document.getElementById('btn-record');
  const text = document.getElementById('rec-label');
  const dot = document.getElementById('rec-dot');
  const isTr = (currentLang === 'tr');
  if (rec) {
    btn.style.background = '#dc2626';
    text.innerText = isTr ? 'DURDUR & İNDİR' : 'STOP & SAVE';
    dot.style.display = 'inline-block';
  } else {
    btn.style.background = 'linear-gradient(135deg, #0284c7, #0369a1)';
    text.innerText = isTr ? 'VİDEO KAYDET' : 'RECORD VIDEO';
    dot.style.display = 'none';
  }
}

// Veri Yükleme ve Checkpoint Değişimi
async function loadStepLog(step) {
  if (cachedLogs[step]) return cachedLogs[step];
  try {
    const res = await fetch(`../logs/log_${step}.json?v=${Date.now()}`);
    if (!res.ok) throw new Error('Not found');
    const d = await res.json();
    cachedLogs[step] = d;
    return d;
  } catch (e) { return null; }
}

async function selectStep(step) {
  initAudio();
  activeStep = step;

  document.querySelectorAll('.ckpt-chip').forEach(c => c.classList.remove('active'));
  const chip = document.getElementById(`chip-${step}`);
  if (chip) chip.classList.add('active');

  const logData = await loadStepLog(step);
  if (logData && logData.trajectory) {
    currentTrajectory = logData.trajectory;
    currentFrameIdx = 0;
    if (logData.network && logData.network.weights) {
      activeWeights = logData.network.weights;
      net3D.setWeights([activeWeights.W1, activeWeights.W2, activeWeights.W3]);
      net3D.setStep(step);
    }
    const s = document.getElementById('frame-slider');
    s.max = currentTrajectory.length - 1; s.value = 0;
    showToast(`${step.toLocaleString('tr-TR')} Adım Yüklendi`);
  } else {
    showToast(`${step.toLocaleString('tr-TR')} Henüz Hazır Değil`);
  }
}

function switchAppMode(mode) {
  initAudio();
  currentMode = mode;
  window.currentMode = mode;
  const btnJ = document.getElementById('btn-tab-journey');
  const btnA = document.getElementById('btn-tab-arena');
  if (btnJ) btnJ.classList.toggle('active', mode === 'journey');
  if (btnA) btnA.classList.toggle('active', mode === 'arena');
  const jc = document.getElementById('journey-controls');
  const ac = document.getElementById('arena-controls');
  const sw = document.getElementById('slider-wrap');
  if (jc) jc.style.display = mode === 'journey' ? 'flex' : 'none';
  if (ac) ac.style.display = mode === 'arena' ? 'flex' : 'none';
  if (sw) sw.style.display = mode === 'journey' ? 'flex' : 'none';

  const dJ = document.getElementById('d-btn-tab-journey');
  const dA = document.getElementById('d-btn-tab-arena');
  if (dJ && dA) {
    dJ.classList.toggle('active-tab', mode === 'journey');
    dA.classList.toggle('active-tab', mode === 'arena');
  }
  const dArenaSec = document.getElementById('d-arena-section');
  const dJourSec = document.getElementById('d-journey-section');
  if (dArenaSec) dArenaSec.style.display = (mode === 'arena') ? 'block' : 'none';
  if (dJourSec) dJourSec.style.display = (mode === 'journey') ? 'block' : 'none';

  if (mode === 'arena') {
    if (!activeWeights) {
      loadStepLog(1000000).then(logData => {
        if (logData && logData.network && logData.network.weights) {
          activeWeights = logData.network.weights;
          net3D.setWeights([activeWeights.W1, activeWeights.W2, activeWeights.W3]);
          net3D.setStep(1000000);
        }
      });
    }
    arenaLaunchRamp();
  } else {
    selectStep(activeStep);
  }
}

function togglePlayPause() {
  isPlaying = !isPlaying;
  const txt = isPlaying ? (currentLang === 'tr' ? 'DURAKLAT' : 'PAUSE') : (currentLang === 'tr' ? 'OYNAT' : 'PLAY');
  const p1 = document.getElementById('btn-play');
  const p2 = document.getElementById('d-btn-play');
  if (p1) p1.innerText = txt;
  if (p2) p2.innerText = txt;
}

function handleToggleSound() {
  toggleSound(currentLang);
}

function onSliderMove(val) {
  currentFrameIdx = parseInt(val);
}

// 7. Ana Çizim ve Render Döngüsü
let lastFrameTime = performance.now();
let journeyTimer = 0.0;

function renderLoop(now) {
  requestAnimationFrame(renderLoop);
  try {
    controls.update();

    const frameDt = Math.min(0.05, (now - lastFrameTime) * 0.001);
    lastFrameTime = now;
    const dt = frameDt;

    let cur = null;
    let displayStep = activeStep;
    let stageTitle = "tumbles";

    if (currentMode === 'journey') {
      if (currentTrajectory && currentTrajectory.length > 0) {
        if (isPlaying) {
          journeyTimer += frameDt;
          if (journeyTimer >= 1.0 / 30.0) {
            currentFrameIdx = (currentFrameIdx + 1) % currentTrajectory.length;
            journeyTimer = 0.0;
          }
        }
        cur = currentTrajectory[currentFrameIdx];
        const logData = cachedLogs[activeStep];
        if (cur && cur.state === 'ramp_climb') {
          stageTitle = "ramp launch";
        } else {
          stageTitle = logData ? (logData.title || "tumbles") : "tumbles";
        }
      }
    } else {
      stepArenaPhysicsFixed(frameDt, arenaState, activeWeights, rampSys, vfxCallbacks);
      cur = {
        x: arenaState.x,
        z: arenaState.z,
        vx: arenaState.vx,
        vz: arenaState.vz,
        theta: arenaState.theta,
        omega: arenaState.omega,
        roll: arenaState.roll,
        omega_roll: arenaState.omegaRoll,
        thruster_pcts: arenaState.thrusters.map(t => t / T_MAX),
        rcs_pcts: arenaState.rcs.map(r => r / FR_MAX),
        smoke: (!arenaState.softLanded && arenaState.z < 6.0 && arenaState.thrusters.reduce((a, b) => a + b, 0) > 1000),
        action_cmds: arenaState.action_cmds || new Array(8).fill(0),
        activations: arenaState.activations,
        fuelMass: arenaState.fuelMass,
        fuel_mass: arenaState.fuelMass,
        gforce: arenaState.gForce
      };
      displayStep = 1000000;
      stageTitle = arenaState.climbingRamp
        ? "ramp launch"
        : (arenaState.softLanded ? "soft landing" : (arenaState.crashed ? "flips but crashes" : "in flight"));
    }

    // 3D Araç Güncelleme
    if (cur) {
      vehicleGroup.position.set(cur.x, Math.max(GROUND_Z, cur.z), 0.0);
      vehicleGroup.rotation.order = 'ZYX';
      vehicleGroup.rotation.z = cur.theta;
      vehicleGroup.rotation.x = cur.roll || 0.0;

      let totT = 0;
      for (let i = 0; i < 4; i++) {
        const p = (cur.thruster_pcts && cur.thruster_pcts[i] !== undefined) ? Number(cur.thruster_pcts[i]) : 0.0;
        totT += p;
        const isFiring = (p > 0.02);
        const len = isFiring ? (0.35 + 2.8 * p + (Math.random() - 0.5) * 0.08) : 0.0;
        thrusterFlames[i].scale.set(isFiring ? (1.0 + p * 0.35) : 0.001, len, isFiring ? (1.0 + p * 0.35) : 0.001);
        thrusterFlames[i].material.uniforms.uThrust.value = isFiring ? p : 0.0;
        thrusterFlames[i].material.uniforms.uTime.value = now * 0.005;

        // Akışkan slipstream alev eğilmesi: yatay hız alevin ucunu geriye büker
        const deflectX = Math.max(-0.35, Math.min(0.35, -(cur.vx || 0.0) * 0.012));
        const deflectZ = Math.max(-0.25, Math.min(0.25, (cur.vz || 0.0) * 0.008));
        thrusterFlames[i].material.uniforms.uDeflectX.value = deflectX;
        thrusterFlames[i].material.uniforms.uDeflectZ.value = deflectZ;

        // Metal nozul akkorluğu (incandescent glow)
        if (thrusterNozzles[i] && thrusterNozzles[i].material) {
          const emissiveIntensity = Math.min(1.0, p * 1.5);
          thrusterNozzles[i].material.emissive.setRGB(emissiveIntensity * 1.0, emissiveIntensity * 0.32, emissiveIntensity * 0.04);
        }

        // Dinamik zemin ve gövde ışığı
        thrusterLights[i].intensity = p * 4.5;
        if (p > 0.6) thrusterLights[i].color.setHex(0xa5f3fc);
        else thrusterLights[i].color.setHex(0x38bdf8);
      }

      // Karakteristik RCS Püskürtmeleri (Pulsed Cold-Gas Cryogenic Jets)
      for (let i = 0; i < 4; i++) {
        const rVal = (cur.rcs_pcts && cur.rcs_pcts[i] !== undefined) ? Math.abs(Number(cur.rcs_pcts[i])) : 0.0;
        const isPulsing = (Math.sin(now * 0.065 + i * 2.1) > -0.1);
        const pulseFactor = isPulsing ? 1.0 : 0.2;
        const activeAlpha = rVal > 0.04 ? Math.min(1.0, (0.45 + rVal * 0.55) * pulseFactor) : 0.0;
        rcsFlames[i].material.opacity = activeAlpha;
        rcsFlames[i].scale.set(1.0 + rVal * 0.9, (0.5 + rVal * 1.5) * (isPulsing ? 1.0 : 0.4), 1.0 + rVal * 0.9);
      }

      // Gövde Isısı & İvme Titreşimi (Camera & Thrust Rumble)
      const thrustNorm = totT / 4.0;
      if (thrustNorm > 0.35) {
        const rumbleMag = (thrustNorm - 0.35) * 0.04;
        const rx = (Math.random() - 0.5) * rumbleMag;
        const ry = (Math.random() - 0.5) * rumbleMag;
        vehicleGroup.position.x += rx;
        vehicleGroup.position.y += ry;
        camera.position.x += rx * 0.45;
        camera.position.y += ry * 0.45;
        addCameraTrauma(0.015 * (thrustNorm - 0.35));
      }

      // 4 Alt Nozul İçin Bireysel Navier-Stokes Zemin Çarpışması (PSI Plume Interaction)
      for (let i = 0; i < 4; i++) {
        const nw = vehicleGroup.localToWorld(new THREE.Vector3(
          bottomPositions[i].x, -0.45, bottomPositions[i].z
        ));
        const p = (cur.thruster_pcts && cur.thruster_pcts[i] !== undefined) ? Number(cur.thruster_pcts[i]) : 0.0;
        triggerPlumeImpact(nw.x, nw.y, nw.z, p);
      }

      // Tekerleklerin Z Ekseninde Fiziksel Dönüşü
      const rollSpeed = (cur.vx || 0.0) / 0.44;
      carWheels.forEach(w => {
        if (w.userData && w.userData.rotatingHub) {
          w.userData.rotatingHub.rotation.z -= rollSpeed * dt;
        }
      });

      updateAudio(totT / 4.0, cur.thruster_pcts, cur.rcs_pcts, cur.x);
      updateHTMLHUD(displayStep, stageTitle, cur);
    }

    // 3D Sinir Ağını Güncelle (PolicyNet3D)
    if (cur && cur.activations) {
      net3D.setFrame([
        cur.activations.inputs || [],
        cur.activations.hidden1 || [],
        cur.activations.hidden2 || [],
        cur.activations.outputs || []
      ]);
    }
    net3D.update(dt);

    // Ağ Çıkış Nöronları -> 8 İtici Nozul Işık Yayları (4 Alt + 4 Yan)
    const nozzlesLocal = [
      new THREE.Vector3(+ARM_MAIN, -0.45, -0.75), // T-FL
      new THREE.Vector3(+ARM_MAIN, -0.45, +0.75), // T-FR
      new THREE.Vector3(-ARM_MAIN, -0.45, -0.75), // T-RL
      new THREE.Vector3(-ARM_MAIN, -0.45, +0.75), // T-RR
      new THREE.Vector3(+ARM_RCS, 0.05, -1.14),   // RCS-LF
      new THREE.Vector3(-ARM_RCS, 0.05, -1.14),   // RCS-LR
      new THREE.Vector3(+ARM_RCS, 0.05, +1.14),   // RCS-RF
      new THREE.Vector3(-ARM_RCS, 0.05, +1.14)    // RCS-RR
    ];
    const nozzlesWorld = nozzlesLocal.map(p => vehicleGroup.localToWorld(p.clone()));
    const cmds = cur ? (cur.action_cmds || new Array(8).fill(0)) : new Array(8).fill(0);
    net3D.updateLinks(nozzlesWorld, cmds);

    if (cur) {
      // Yumuşak dinamik sinematik drone kamera takibi
      const camTargetX = Math.max(-130.0, Math.min(12.0, cur.x * 0.88 - 2.0));
      const camTargetY = Math.max(4.0, Math.min(28.0, cur.z * 0.55 + 4.5));
      const deltaX = (camTargetX - controls.target.x) * 0.08;
      controls.target.x += deltaX;
      camera.position.x += deltaX;
      controls.target.y += (camTargetY - controls.target.y) * 0.06;
    }

    // Prosedürel Dinamik Kamera Sarsıntısı (Screen Shake)
    const curTrauma = getCameraTrauma();
    if (curTrauma > 0.001) {
      const shake = curTrauma * curTrauma;
      const sX = (Math.random() - 0.5) * 0.42 * shake;
      const sY = (Math.random() - 0.5) * 0.42 * shake;
      camera.position.x += sX;
      camera.position.y += sY;
      decayCameraTrauma(dt);
    }

    updateFluidPlumeSimulation(dt);
    if (composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }

    // Profesyonel Taktik Askeri Uçak / NASA Spacecraft HUD Gösterimi
    if (aircraftHUD && cur) {
      aircraftHUD.update(dt, cur);
      aircraftHUD.render(cur);
    }

    // Slider ve Zaman Göstergesi
    const s = document.getElementById('frame-slider');
    if (s && currentMode === 'journey') {
      s.value = currentFrameIdx;
      const cnt = document.getElementById('frame-time-display');
      if (cnt && currentTrajectory.length > 0) {
        const tSec = (currentFrameIdx / 30.0).toFixed(2);
        cnt.innerText = `Kare: ${currentFrameIdx} / ${currentTrajectory.length - 1} (${tSec}s)`;
      }
    }
  } catch (err) {
    console.error("renderLoop caught error:", err);
  }
}

// Profesyonel HUD Modu ve Palet Kontrolleri
function toggleAircraftHUD() {
  const m = aircraftHUD.toggleMode();
  const label = m === 'tactical' ? 'HUD: TAKTİK' : (m === 'minimal' ? 'HUD: MİNİMAL' : 'HUD: KAPALI');
  const btn1 = document.getElementById('btn-hud-toggle');
  const btn2 = document.getElementById('txt-d-hud');
  if (btn1) btn1.innerText = label;
  if (btn2) btn2.innerText = label;
  showToast(`HUD Modu: ${m.toUpperCase()}`);
}

function toggleAircraftHUDTheme() {
  const t = aircraftHUD.toggleTheme();
  const label = t === 'emerald' ? 'RENK: YEŞİL' : 'RENK: NASA MAVİ';
  const btn1 = document.getElementById('btn-hud-theme');
  const btn2 = document.getElementById('txt-d-hud-theme');
  if (btn1) btn1.innerText = label;
  if (btn2) btn2.innerText = label;

  const mfd = document.getElementById('mfd-telemetry-panel');
  if (mfd) {
    if (t === 'cyan') {
      mfd.classList.add('theme-cyan');
    } else {
      mfd.classList.remove('theme-cyan');
    }
  }

  showToast(`HUD Paleti: ${t === 'emerald' ? 'Taktik Fosfor Yeşil' : 'NASA Camgöbeği'}`);
}

// Global UI Fonksiyonları (Inline HTML onclick Uyumluluğu)
window.selectStep = selectStep;
window.switchAppMode = switchAppMode;
window.togglePlayPause = togglePlayPause;
window.toggleSound = handleToggleSound;
window.onSliderMove = onSliderMove;
window.toggleRecording = toggleRecording;
window.resetCameraView = resetCameraView;
window.arenaLaunchRamp = arenaLaunchRamp;
window.arenaDropHigh = arenaDropHigh;
window.arenaRandomFling = arenaRandomFling;
window.arenaTriggerWind = arenaTriggerWind;
window.toggleLanguage = toggleLanguage;
window.toggleVideoMode = toggleVideoMode;
window.toggleHamburgerMenu = toggleHamburgerMenu;
window.toggleVideoHUD = toggleVideoHUD;
window.toggleAircraftHUD = toggleAircraftHUD;
window.toggleAircraftHUDTheme = toggleAircraftHUDTheme;

window.addEventListener('resize', onWindowResize);

// Klavye Kısayolları (1..4, Space, M, H)
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === '1') { arenaLaunchRamp(); }
  else if (e.key === '2') { arenaDropHigh(); }
  else if (e.key === '3') { arenaRandomFling(); }
  else if (e.key === '4') { arenaTriggerWind(); }
  else if (e.key === 'h' || e.key === 'H') { toggleAircraftHUD(); }
  else if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); togglePlayPause(); }
  else if (e.key === 'm' || e.key === 'M') { toggleHamburgerMenu(); }
});

// Başlangıç Yükleyicisi
window.addEventListener('DOMContentLoaded', async () => {
  onWindowResize();
  const logData = await loadStepLog(1000000);
  if (logData && logData.network && logData.network.weights) {
    activeWeights = logData.network.weights;
    net3D.setWeights([activeWeights.W1, activeWeights.W2, activeWeights.W3]);
    net3D.setStep(1000000);
  }
  arenaLaunchRamp();
  requestAnimationFrame(renderLoop);
});
