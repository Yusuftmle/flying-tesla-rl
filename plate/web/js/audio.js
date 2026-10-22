/* =========================================================================
   WEB AUDIO SERVO SESİ SENTEZLEYİCİ (DUAL SAWTOOTH + BANDPASS)
   ========================================================================= */

let audioCtx = null;
let audioDest = null;
let osc1 = null;
let osc2 = null;
let filter = null;
let gainNode = null;

// Top Yuvarlanma Sesi (Low Rumble)
let rollOsc = null;
let rollFilter = null;
let rollGain = null;

let soundEnabled = true;
let lastCmdX = 0;
let lastCmdY = 0;

export function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return;
  }
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    audioDest = audioCtx.createMediaStreamDestination();

    // 1. Servo Motor Sentezi (Dual Sawtooth)
    osc1 = audioCtx.createOscillator();
    osc1.type = 'sawtooth';

    osc2 = audioCtx.createOscillator();
    osc2.type = 'sawtooth';

    filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 5.0;

    gainNode = audioCtx.createGain();
    gainNode.gain.value = 0;

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gainNode);

    gainNode.connect(audioCtx.destination);
    gainNode.connect(audioDest);

    osc1.start();
    osc2.start();

    // 2. Fiziksel Yuvarlanma Titreşimi (Rolling Rumble)
    rollOsc = audioCtx.createOscillator();
    rollOsc.type = 'triangle';
    rollOsc.frequency.value = 75;

    rollFilter = audioCtx.createBiquadFilter();
    rollFilter.type = 'lowpass';
    rollFilter.frequency.value = 160;

    rollGain = audioCtx.createGain();
    rollGain.gain.value = 0;

    rollOsc.connect(rollFilter);
    rollFilter.connect(rollGain);
    rollGain.connect(audioCtx.destination);
    rollGain.connect(audioDest);

    rollOsc.start();
  } catch (e) {
    console.warn("Audio init error:", e);
  }
}

export function updateServoSound(cmdX, cmdY) {
  if (!audioCtx || !soundEnabled) return;

  const speed = Math.abs(cmdX - lastCmdX) + Math.abs(cmdY - lastCmdY);
  lastCmdX = cmdX;
  lastCmdY = cmdY;

  const s = Math.min(speed * 30.0, 1.0);
  const t = audioCtx.currentTime;

  const baseFreq = 160 + s * 320;
  osc1.frequency.setTargetAtTime(baseFreq, t, 0.02);
  osc2.frequency.setTargetAtTime(baseFreq * 2.01, t, 0.02);
  filter.frequency.setTargetAtTime(800 + s * 2400, t, 0.02);

  const targetGain = s * 0.16;
  gainNode.gain.setTargetAtTime(targetGain, t, 0.02);
}

// 120Hz Gerçekçi Top Yuvarlanma Uğultusu
export function updateRollingRumble(speed) {
  if (!audioCtx || !soundEnabled || !rollGain) return;
  const t = audioCtx.currentTime;
  const sNorm = Math.min(Math.max((speed - 0.01) / 0.45, 0.0), 1.0);
  const targetGain = sNorm * 0.14;
  rollGain.gain.setTargetAtTime(targetGain, t, 0.03);
  rollOsc.frequency.setTargetAtTime(65 + sNorm * 120, t, 0.03);
  rollFilter.frequency.setTargetAtTime(120 + sNorm * 380, t, 0.03);
}

// Metalik Kenar Bariyeri Çarpma Tınısı (Rim Impact Clink)
export function playRimImpact(impactSpeed = 0.2) {
  if (!audioCtx || !soundEnabled) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    const vol = Math.min(Math.max(impactSpeed * 1.5, 0.05), 0.35);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1450 + Math.random() * 250, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.09);

    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

    osc.connect(g);
    g.connect(audioCtx.destination);
    g.connect(audioDest);

    osc.start(t);
    osc.stop(t + 0.10);
  } catch (e) {
    // ignore
  }
}

// Plakaya Düşüş Tok Sesi
export function playPlateLand() {
  if (!audioCtx || !soundEnabled) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);

    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

    osc.connect(g);
    g.connect(audioCtx.destination);
    g.connect(audioDest);

    osc.start(t);
    osc.stop(t + 0.13);
  } catch (e) {}
}

export function toggleSound() {
  initAudio();
  soundEnabled = !soundEnabled;
  if (!soundEnabled && gainNode && audioCtx) {
    gainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.02);
    if (rollGain) rollGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.02);
  }
  return soundEnabled;
}

export function isSoundEnabled() {
  return soundEnabled;
}

export function getAudioDest() {
  return audioDest;
}
