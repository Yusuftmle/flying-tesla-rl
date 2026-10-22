/* =========================================================================
   PLATE (BALL AND PLATE) SAC RL - 120Hz MODÜLER UYGULAMA MERKEZİ (APP.JS)
   ========================================================================= */

import {
  initAudio,
  updateServoSound,
  updateRollingRumble,
  playRimImpact,
  playPlateLand,
  toggleSound,
  isSoundEnabled,
  getAudioDest
} from './audio.js';

import {
  createArenaState,
  stepArenaPhysicsFixed,
  resetArenaAccumulator,
  predictAIPolicy
} from './physics.js';

import { initScene3D } from './scene_3d.js';
import { createMonitor2D } from './monitor_2d.js';
import { drawHUD, drawAimingVector } from './hud_2d.js';
import { initInteraction } from './interaction.js';
import { initRecorder } from './recorder.js';

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
const CHECKPOINT_STEPS = [0, 100, 250, 400, 500];

let currentAppMode = 'arena'; // Varsayılan olarak Canlı 120Hz Arena ile başla!
const LOGS = {};
let timelineLog = null;
let isTimelineMode = false;
let activeStep = 500;
let currentTrajectory = [];
let currentWeights = null;
let playbackIdx = 0;
let isPlaying = true;

let aiWeights120 = null;
let aiWeights500 = null;

// 1. Canlı Arena Durumu (120Hz RK2)
const arenaState = createArenaState();

// 2. 2D Monitör Dokusu
const { monitorCanvas, monitorTexture, drawMonitorContent } = createMonitor2D({ THREE });

// 3. 3D Sahne & Mekanik Plaka
const threeCanvas = document.getElementById('three-canvas');
const {
  scene,
  camera,
  renderer,
  plateGroup,
  ballMesh,
  ballShadow,
  bumperGroup,
  setTargetPose,
  setBumperVisible,
  triggerCameraTrauma,
  updateCameraShake,
  updateMechanicalLinkage,
  updateBallPose
} = initScene3D({
  THREE,
  threeCanvas,
  monitorTexture,
  CANVAS_WIDTH,
  CANVAS_HEIGHT
});

// 4. Master 1080x1920 Tuval
const masterCanvas = document.getElementById('master-canvas');
const masterCtx = masterCanvas.getContext('2d');

// 5. İnteraktif Fare/Dokunma Sapan Kontrolcüsü
const interaction = initInteraction({
  THREE,
  masterCanvas,
  camera,
  plateGroup,
  getAppMode: () => currentAppMode,
  arenaState,
  initAudio,
  showToast
});

// 6. Video Kayıt Motoru
const recorder = initRecorder({
  masterCanvas,
  getAudioDest,
  initAudio,
  getAppMode: () => currentAppMode,
  isTimelineMode: () => isTimelineMode,
  getActiveStep: () => activeStep,
  showToast,
  resetPlayback: () => {
    playbackIdx = 0;
    isPlaying = true;
  }
});

// Toast Bildirimi
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.innerText = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2000);
}

// Log ve Model Ağırlıklarını Yükle
async function loadLogsAndModel() {
  showToast('120Hz AI Modelleri Yükleniyor...');

  // 1. Canlı 120Hz Model Ağırlıklarını Yükle (weights_120hz.json)
  try {
    const w120Url = new URL('../../logs/weights_120hz.json', import.meta.url).href;
    const w120Resp = await fetch(w120Url);
    if (w120Resp.ok) {
      aiWeights120 = await w120Resp.json();
      currentWeights = aiWeights120.synapses || aiWeights120;
      console.log("✅ 120Hz Sub-Stepping AI Modeli Başarıyla Yüklendi!");
    }
  } catch (e) {
    console.warn("120Hz weights load error:", e);
  }

  // 2. 500 Adımlık Model Ağırlıklarını Yükle (weights_500.json - Fallback)
  try {
    const w500Url = new URL('../../logs/weights_500.json', import.meta.url).href;
    const w500Resp = await fetch(w500Url);
    if (w500Resp.ok) {
      aiWeights500 = await w500Resp.json();
      if (!aiWeights120) currentWeights = aiWeights500.synapses;
      console.log("✅ 500 Adımlık Yedek AI Modeli Yüklendi!");
    }
  } catch (e) {
    console.warn("Weights 500 load error:", e);
  }

  // 3. Kontrol Noktaları Logları: 0, 100, 250, 400, 500
  await Promise.all(CHECKPOINT_STEPS.map(async (s) => {
    try {
      const sUrl = new URL(`../../logs/log_${s}.json`, import.meta.url).href;
      const resp = await fetch(sUrl);
      if (resp.ok) LOGS[s] = await resp.json();
    } catch (e) {
      console.error("Error loading step:", s, e);
    }
  }));

  // 4. 500 Adımlık Zaman Tüneli (timeline_500.json)
  try {
    const tUrl = new URL('../../logs/timeline_500.json', import.meta.url).href;
    const tResp = await fetch(tUrl);
    if (tResp.ok) {
      timelineLog = await tResp.json();
    }
  } catch (e) {
    console.warn("Timeline log error:", e);
  }

  // Başlangıç modunu ayarla
  switchMainMode('arena');
  showToast('⚡ 120Hz Aktif Fizik & Derin RL Hazır!');
}

function selectStep(step) {
  isTimelineMode = false;
  const modeBtn = document.getElementById('btn-mode-toggle');
  if (modeBtn) {
    modeBtn.classList.remove('active');
    modeBtn.style.background = 'rgba(255, 255, 255, 0.08)';
    modeBtn.style.color = '#e2e8f0';
  }

  if (!LOGS[step]) return;
  activeStep = step;
  currentTrajectory = LOGS[step].trajectory || [];
  currentWeights = LOGS[step].weights || null;
  playbackIdx = 0;

  document.querySelectorAll('.stage-row .btn-chip').forEach(b => {
    const bStep = parseInt(b.id.replace('btn-step-', ''));
    b.classList.toggle('active', bStep === step);
  });

  const slider = document.getElementById('slider-frame');
  if (slider) {
    slider.max = Math.max(0, currentTrajectory.length - 1);
    slider.value = 0;
  }
  showToast(`Adım ${step.toLocaleString()} Yüklendi`);
}

function activateTimelineMode() {
  if (!timelineLog || !timelineLog.trajectory) {
    showToast('Zaman tüneli bulunamadı!');
    return;
  }
  isTimelineMode = true;
  const modeBtn = document.getElementById('btn-mode-toggle');
  if (modeBtn) {
    modeBtn.classList.add('active');
    modeBtn.style.background = '#fbbf24';
    modeBtn.style.color = '#000000';
  }

  document.querySelectorAll('.stage-row .btn-chip').forEach(b => b.classList.remove('active'));

  currentTrajectory = timelineLog.trajectory;
  playbackIdx = 0;
  isPlaying = true;

  const slider = document.getElementById('slider-frame');
  if (slider) {
    slider.max = Math.max(0, currentTrajectory.length - 1);
    slider.value = 0;
  }
}

function switchMainMode(mode) {
  initAudio();
  currentAppMode = mode;

  const tabReels = document.getElementById('tab-reels');
  const tabArena = document.getElementById('tab-arena');
  const reelsGroup = document.getElementById('reels-controls-group');
  const controlsOverlay = document.querySelector('.controls-overlay');

  if (mode === 'reels') {
    if (tabReels) tabReels.classList.add('active');
    if (tabArena) tabArena.classList.remove('active');
    if (controlsOverlay) controlsOverlay.style.display = 'flex';
    if (reelsGroup) reelsGroup.style.display = 'flex';
    activateTimelineMode();
    showToast('🎬 0-500 Eğitim Reels Modu');
  } else {
    if (tabArena) tabArena.classList.add('active');
    if (tabReels) tabReels.classList.remove('active');
    if (controlsOverlay) controlsOverlay.style.display = 'none'; // Arena modunda alt panel tamamen gizlenir, tertemiz ekran!
    resetArenaAccumulator();
    arenaResetCenter();
    showToast('🎮 Topu fareyle tutup 3D havaya kaldırabilir ve fırlatabilirsin!');
  }
}

// =========================================================================
// ARENA AKSİYONLARI & ETKİLEŞİM FONKSİYONLARI (KLAVYE & BUTONLAR)
// =========================================================================

// [1] Fiske Vur / Fırlat
function arenaThrowBall() {
  initAudio();
  arenaState.state = 'rolling';
  arenaState.zHeight = 0.0;
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.30 + Math.random() * 0.12;
  arenaState.vx = Math.cos(angle) * speed;
  arenaState.vy = Math.sin(angle) * speed;
  triggerCameraTrauma(0.2);
  showToast('⚡ Fiske Vuruldu! (Hız: ' + speed.toFixed(2) + ' m/s)');
}

// [2] Kenar Bariyerine Doğru Sert At (Bumper Flick)
function arenaBumperFlick() {
  initAudio();
  arenaState.state = 'rolling';
  arenaState.zHeight = 0.0;
  const angles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
  const chosenAngle = angles[Math.floor(Math.random() * angles.length)] + (Math.random() - 0.5) * 0.4;
  const speed = 0.38;
  arenaState.vx = Math.cos(chosenAngle) * speed;
  arenaState.vy = Math.sin(chosenAngle) * speed;
  triggerCameraTrauma(0.25);
  showToast('💥 Kenar Bariyerine Fırlatıldı!');
}

// [3] Merkeze Bırak
function arenaResetCenter() {
  initAudio();
  arenaState.state = 'rolling';
  arenaState.x = 0.0;
  arenaState.y = 0.0;
  arenaState.vx = 0.0;
  arenaState.vy = 0.0;
  arenaState.zHeight = 0.0;
  showToast('🎯 Merkeze Sabitlendi');
}

// [4] Rastgele Yüksekten Düşür
function arenaDropRandom() {
  initAudio();
  arenaState.state = 'respawning';
  arenaState.x = (Math.random() - 0.5) * 0.20;
  arenaState.y = (Math.random() - 0.5) * 0.20;
  arenaState.vx = 0.0;
  arenaState.vy = 0.0;
  arenaState.zHeight = 0.16;
  arenaState.fallVy = 0.0;
  showToast('🎲 Rastgele Yüksekten Bırakıldı!');
}

// [5] Dinamik Hedef Takip Modunu Değiştir (Merkez -> Daire -> Sekiz -> Fare)
function arenaCycleTargetMode() {
  initAudio();
  const modes = ['center', 'circle', 'figure8', 'mouse'];
  const curIdx = modes.indexOf(arenaState.targetMode);
  const nextMode = modes[(curIdx + 1) % modes.length];
  arenaState.targetMode = nextMode;
  arenaState.targetTimer = 0.0;

  const labels = {
    center: '🎯 Sabit Merkez',
    circle: '🔄 Dairesel Devriye',
    figure8: '♾️ Sonsuzluk (Figure-8)',
    mouse: '🖱️ Fare İmleci Takibi'
  };

  const btn = document.getElementById('btn-target-mode');
  if (btn) btn.innerHTML = `<span>🎯 HEDEF: ${nextMode.toUpperCase()}</span>`;
  showToast(`Hedef Modu: ${labels[nextMode]}`);
}

// [6] Kenar Tipini Değiştir (Bumper / Açık Düşüş)
function arenaToggleBorderMode() {
  initAudio();
  arenaState.borderMode = arenaState.borderMode === 'bumper' ? 'open' : 'bumper';
  const isBumper = arenaState.borderMode === 'bumper';
  setBumperVisible(isBumper);

  const btn = document.getElementById('btn-border-mode');
  if (btn) btn.innerHTML = `<span>🛡️ KENAR: ${isBumper ? 'BARİYER' : 'AÇIK DÜŞÜŞ'}</span>`;
  showToast(isBumper ? '🛡️ Elastik Kenar Bariyeri Aktif' : '⚠️ Açık Kenar (Düşüş) Aktif');
}

// [7] FEP / Saf RL Modunu Değiştir
function arenaToggleFEP() {
  initAudio();
  arenaState.fepMode = arenaState.fepMode === 'pure_rl' ? 'fep_safe' : 'pure_rl';
  const isPure = arenaState.fepMode === 'pure_rl';

  const btn = document.getElementById('btn-fep-mode');
  if (btn) btn.innerHTML = `<span>🧠 POLİTİKA: ${isPure ? 'SAF RL' : 'FEP GÜVENLİK'}</span>`;
  showToast(isPure ? '🧠 %100 Saf Pekiştirmeli Öğrenme' : '🛡️ FEP Güvenlik Sınırlandırıcı Aktif');
}

// Klavye Kısayolları (R, Space, 1, 2, 3, M, S)
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key.toLowerCase() === 'r' || e.key === '3') {
    arenaResetCenter();
  } else if (e.key === '1') {
    arenaThrowBall();
  } else if (e.key === '2') {
    arenaBumperFlick();
  } else if (e.key === '4') {
    arenaCycleTargetMode();
  } else if (e.key === '5') {
    arenaToggleBorderMode();
  } else if (e.key === '6') {
    arenaToggleFEP();
  } else if (e.key === ' ') {
    e.preventDefault();
    if (currentAppMode === 'reels') handlePlayPauseClick();
    else arenaResetCenter();
  } else if (e.key.toLowerCase() === 'm') {
    switchMainMode(currentAppMode === 'reels' ? 'arena' : 'reels');
  } else if (e.key.toLowerCase() === 's') {
    handleSoundClick();
  }
});

// UI Tıklama Dinleyicileri
function handleRecordClick() {
  recorder.startRecordingFlow();
}

function handleTimelineToggle() {
  initAudio();
  if (!isTimelineMode) {
    activateTimelineMode();
    showToast('⚡ 0-500 Zaman Tüneli Aktif');
  } else {
    selectStep(500);
  }
}

function handleStepClick(step) {
  initAudio();
  selectStep(step);
}

function handlePlayPauseClick() {
  isPlaying = !isPlaying;
  const btn = document.getElementById('btn-play-pause');
  if (btn) btn.innerText = isPlaying ? 'DURAKLAT' : 'OYNAT';
}

function handleSoundClick() {
  const enabled = toggleSound();
  const btn = document.getElementById('btn-sound-toggle');
  if (btn) btn.innerText = enabled ? 'SES: AÇIK' : 'SES: KAPALI';
}

function handleSliderInput(val) {
  playbackIdx = parseInt(val);
}

// Global Window Export (Inline onclick Uyumluluğu)
window.switchMainMode = switchMainMode;
window.handleRecordClick = handleRecordClick;
window.handleTimelineToggle = handleTimelineToggle;
window.handleStepClick = handleStepClick;
window.handlePlayPauseClick = handlePlayPauseClick;
window.handleSoundClick = handleSoundClick;
window.handleSliderInput = handleSliderInput;
window.arenaThrowBall = arenaThrowBall;
window.arenaBumperFlick = arenaBumperFlick;
window.arenaDropRandom = arenaDropRandom;
window.arenaResetCenter = arenaResetCenter;
window.arenaCycleTargetMode = arenaCycleTargetMode;
window.arenaToggleBorderMode = arenaToggleBorderMode;
window.arenaToggleFEP = arenaToggleFEP;

// VFX Ses ve Titreşim Geri Çağrıları
const vfxCallbacks = {
  onRimHit: (impactSpeed) => {
    playRimImpact(impactSpeed);
    triggerCameraTrauma(Math.min(0.55, impactSpeed * 1.1));
  },
  onTableHit: (fallSpeed) => {
    triggerCameraTrauma(0.35);
  },
  onPlateLand: () => {
    playPlateLand();
    triggerCameraTrauma(0.22);
  },
  onFallOff: () => {
    triggerCameraTrauma(0.28);
  }
};

// =========================================================================
// ANA ÇİZİM VE RENDER DÖNGÜSÜ (120Hz DESTEKLİ)
// =========================================================================
let lastTime = performance.now();

function renderLoop(now) {
  requestAnimationFrame(renderLoop);

  const frameDt = Math.min((now - lastTime) / 1000.0, 0.05);
  lastTime = now;

  let currentFrame = null;
  let displayStepNum = activeStep;

  // 1. Kamera Sarsıntısı (Trauma Decay)
  updateCameraShake(frameDt);

  if (currentAppMode === 'reels') {
    if (currentTrajectory && currentTrajectory.length > 0) {
      if (isPlaying) {
        playbackIdx = (playbackIdx + 1) % currentTrajectory.length;
      }
      currentFrame = currentTrajectory[playbackIdx];
      if (currentFrame) {
        if (isTimelineMode && currentFrame.training_step !== undefined) {
          displayStepNum = currentFrame.training_step;
          if (currentFrame.weights) {
            currentWeights = currentFrame.weights;
          }
        }
      }
    }
  } else {
    // 2. 120Hz Sabit Adım Akümülatör Fizik Motoru
    stepArenaPhysicsFixed(frameDt, arenaState, aiWeights120 || aiWeights500, vfxCallbacks);

    currentFrame = {
      ball_x: arenaState.x,
      ball_y: arenaState.y,
      ball_height: arenaState.zHeight,
      vx: arenaState.vx,
      vy: arenaState.vy,
      tilt_x: arenaState.tiltX,
      tilt_y: arenaState.tiltY,
      cmd_x: arenaState.cmdX,
      cmd_y: arenaState.cmdY,
      fell: arenaState.state === 'falling',
      state: arenaState.state,
      activations: arenaState.activations
    };
    displayStepNum = 500;
    if (aiWeights120) {
      currentWeights = aiWeights120.synapses || aiWeights120;
    } else if (aiWeights500) {
      currentWeights = aiWeights500.synapses;
    }
  }

  if (currentFrame) {
    // 3. Mekanik bağlantı & plaka eğimi
    updateMechanicalLinkage(currentFrame.tilt_x, currentFrame.tilt_y);

    // 4. Hedef Halkasının Konumunu Güncelle (Dynamic Target)
    setTargetPose(arenaState.targetX, arenaState.targetY);

    // 5. Bariyer Görünürlüğünü Güncelle
    setBumperVisible(arenaState.borderMode === 'bumper');

    // 6. Top konumu ve 120Hz yuvarlanma oryantasyonu
    updateBallPose(currentFrame, frameDt);

    // 7. Sesler: Servo + Fiziksel Yuvarlanma Uğultusu
    updateServoSound(currentFrame.cmd_x, currentFrame.cmd_y);
    if (currentAppMode === 'arena' && arenaState.state === 'rolling') {
      updateRollingRumble(Math.hypot(arenaState.vx, arenaState.vy));
    } else {
      updateRollingRumble(0);
    }

    // 8. 3D Monitör Dokusu
    drawMonitorContent(currentFrame, currentWeights, displayStepNum, currentAppMode);

    // 9. Slider Güncelle (Reels modunda)
    if (currentAppMode === 'reels') {
      const slider = document.getElementById('slider-frame');
      if (slider) slider.value = playbackIdx;
      const flabel = document.getElementById('frame-label');
      if (flabel) flabel.innerText = `${playbackIdx + 1} / ${currentTrajectory.length}`;
    }
  }

  // 10. 3D Sahneyi Çiz
  renderer.render(scene, camera);

  // 11. Master Canvas'a Aktar (1080x1920)
  masterCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  masterCtx.drawImage(threeCanvas, 0, 0);

  // 12. 2D HUD Katmanı
  drawHUD(masterCtx, {
    currentAppMode,
    stepNum: displayStepNum,
    arenaState,
    CANVAS_WIDTH,
    CANVAS_HEIGHT
  });
}

// Başlat
loadLogsAndModel();
renderLoop(performance.now());
