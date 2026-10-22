/**
 * audio.js - Web Audio SFX & Dynamic Jet Engine Synthesizer
 * Clean Architecture - Audio Adapter Layer
 */

let audioCtx = null;
let masterCompressor = null;
let masterGain = null;

// NASA Rocket Thrust Looper
let rocketThrustBuffer = null;
let thrustSource = null;
let thrustGain = null;
let thrustFilter = null;
let thrustPanner = null;

// RCS & Ignition Buffers
let rcsBuffer = null;
let igniteBuffer = null;

// Synthetic Sub-Bass Rumble
let rumbleOsc = null;
let rumbleGain = null;

let prevThrustNorm = 0.0;
let isEngineIgnited = false;
let lastRcsPuffTime = 0;
let soundActive = true;

async function loadAudioSample(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.warn('Audio sample load failed:', url, err);
    return null;
  }
}

export async function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    // 1. Studio Master Dynamic Compressor
    masterCompressor = audioCtx.createDynamicsCompressor();
    masterCompressor.threshold.setValueAtTime(-14, audioCtx.currentTime);
    masterCompressor.knee.setValueAtTime(12, audioCtx.currentTime);
    masterCompressor.ratio.setValueAtTime(4.5, audioCtx.currentTime);
    masterCompressor.attack.setValueAtTime(0.005, audioCtx.currentTime);
    masterCompressor.release.setValueAtTime(0.09, audioCtx.currentTime);

    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(soundActive ? 1.0 : 0.0, audioCtx.currentTime);

    masterCompressor.connect(masterGain);
    masterGain.connect(audioCtx.destination);

    // 2. Rocket Motor Thrust Channel
    thrustGain = audioCtx.createGain();
    thrustGain.gain.setValueAtTime(0.0, audioCtx.currentTime);

    thrustFilter = audioCtx.createBiquadFilter();
    thrustFilter.type = 'lowpass';
    thrustFilter.frequency.setValueAtTime(280, audioCtx.currentTime);
    thrustFilter.Q.setValueAtTime(1.2, audioCtx.currentTime);

    thrustPanner = (audioCtx.createStereoPanner) ? audioCtx.createStereoPanner() : null;

    if (thrustPanner) {
      thrustGain.connect(thrustFilter);
      thrustFilter.connect(thrustPanner);
      thrustPanner.connect(masterCompressor);
    } else {
      thrustGain.connect(thrustFilter);
      thrustFilter.connect(masterCompressor);
    }

    // 3. Synthetic Sub-Bass Rumble (42Hz)
    rumbleOsc = audioCtx.createOscillator();
    rumbleOsc.type = 'sine';
    rumbleOsc.frequency.setValueAtTime(42, audioCtx.currentTime);
    rumbleGain = audioCtx.createGain();
    rumbleGain.gain.setValueAtTime(0.0, audioCtx.currentTime);

    const subFilter = audioCtx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(95, audioCtx.currentTime);

    rumbleOsc.connect(subFilter);
    subFilter.connect(rumbleGain);
    rumbleGain.connect(masterCompressor);
    rumbleOsc.start();

    // 4. Background Load Real Audio Samples
    const thrustUrl = new URL('../assets/audio/rocket_thrust_loop.mp3', import.meta.url).href;
    const rcsUrl = new URL('../assets/audio/rcs_puff.mp3', import.meta.url).href;
    const igniteUrl = new URL('../assets/audio/rocket_ignite.mp3', import.meta.url).href;

    loadAudioSample(thrustUrl).then(buf => {
      if (!buf || !audioCtx) return;
      rocketThrustBuffer = buf;
      startRocketThrustLoop();
    });

    loadAudioSample(rcsUrl).then(buf => { rcsBuffer = buf; });
    loadAudioSample(igniteUrl).then(buf => { igniteBuffer = buf; });

  } catch (e) {
    console.warn('Audio init error:', e);
  }
}

function startRocketThrustLoop() {
  if (!audioCtx || !rocketThrustBuffer || thrustSource) return;
  try {
    thrustSource = audioCtx.createBufferSource();
    thrustSource.buffer = rocketThrustBuffer;
    thrustSource.loop = true;
    thrustSource.playbackRate.setValueAtTime(1.0, audioCtx.currentTime);
    thrustSource.connect(thrustGain);
    thrustSource.start(0);
  } catch (err) {
    console.warn('Thrust loop start error:', err);
  }
}

export function playRCSPuff(panVal, intensity) {
  if (!audioCtx || !soundActive || !rcsBuffer) return;
  const now = performance.now();
  if (now - lastRcsPuffTime < 95) return;
  lastRcsPuffTime = now;

  try {
    const src = audioCtx.createBufferSource();
    src.buffer = rcsBuffer;
    src.playbackRate.setValueAtTime(0.95 + Math.random() * 0.15, audioCtx.currentTime);

    const pGain = audioCtx.createGain();
    const vol = Math.min(0.24, Math.max(0.05, intensity * 0.22));
    pGain.gain.setValueAtTime(vol, audioCtx.currentTime);

    if (audioCtx.createStereoPanner) {
      const pan = audioCtx.createStereoPanner();
      pan.pan.setValueAtTime(Math.max(-0.8, Math.min(0.8, panVal)), audioCtx.currentTime);
      src.connect(pGain);
      pGain.connect(pan);
      pan.connect(masterCompressor);
    } else {
      src.connect(pGain);
      pGain.connect(masterCompressor);
    }
    src.start(0);
  } catch (e) {}
}

export function playRocketIgnite(vol = 0.8) {
  if (!soundActive) return;
  initAudio();
  if (!audioCtx) return;
  if (!igniteBuffer) {
    const igniteUrl = new URL('../assets/audio/rocket_ignite.mp3', import.meta.url).href;
    loadAudioSample(igniteUrl).then(buf => {
      if (buf) {
        igniteBuffer = buf;
        playRocketIgnite(vol);
      }
    });
    return;
  }
  try {
    const src = audioCtx.createBufferSource();
    src.buffer = igniteBuffer;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(Math.min(0.48, Math.max(0.12, vol * 0.42)), audioCtx.currentTime);
    src.connect(g);
    g.connect(masterCompressor);
    src.start(0);
  } catch (e) {}
}

export function updateAudio(totalThrustNorm, thrusterPcts, rcsPcts, carX) {
  if (!audioCtx || !soundActive) return;
  if (audioCtx.state === 'suspended') return;

  const tNorm = Math.min(1.0, Math.max(0.0, totalThrustNorm || 0.0));

  if (tNorm < 0.08) {
    isEngineIgnited = false;
  } else if (tNorm > 0.22 && !isEngineIgnited) {
    isEngineIgnited = true;
    playRocketIgnite(Math.max(0.75, tNorm));
  }
  prevThrustNorm = tNorm;

  const filterFreq = 260 + Math.pow(tNorm, 1.3) * 1940;
  const targetGain = Math.pow(tNorm, 1.25) * 0.38;
  const pRate = 0.94 + tNorm * 0.14;

  const curT = audioCtx.currentTime;
  if (thrustGain) thrustGain.gain.setTargetAtTime(targetGain, curT, 0.04);
  if (thrustFilter) thrustFilter.frequency.setTargetAtTime(filterFreq, curT, 0.04);
  if (thrustSource) thrustSource.playbackRate.setTargetAtTime(pRate, curT, 0.05);

  if (thrustPanner && carX !== undefined) {
    const panX = Math.max(-0.65, Math.min(0.65, (carX - (-28.0)) / 45.0));
    thrustPanner.pan.setTargetAtTime(panX, curT, 0.08);
  }

  if (rumbleGain) {
    const subGain = Math.min(0.18, tNorm * 0.16);
    rumbleGain.gain.setTargetAtTime(subGain, curT, 0.04);
  }
  if (rumbleOsc) {
    rumbleOsc.frequency.setTargetAtTime(38 + tNorm * 44, curT, 0.05);
  }

  if (rcsPcts && rcsPcts.length >= 4) {
    const maxR = Math.max(...rcsPcts.map(r => Math.abs(r || 0)));
    if (maxR > 0.18) {
      const leftP = (Math.abs(rcsPcts[0] || 0) + Math.abs(rcsPcts[1] || 0)) * 0.5;
      const rightP = (Math.abs(rcsPcts[2] || 0) + Math.abs(rcsPcts[3] || 0)) * 0.5;
      const pan = rightP > leftP ? 0.45 : -0.45;
      playRCSPuff(pan, maxR);
    }
  }
}

export function toggleSound(currentLang = 'tr') {
  initAudio();
  soundActive = !soundActive;
  const txt = soundActive ? (currentLang === 'tr' ? 'SES: AÇIK' : 'SOUND: ON') : (currentLang === 'tr' ? 'SES: KAPALI' : 'SOUND: OFF');
  const btn = document.getElementById('btn-sound-toggle');
  if (btn) btn.innerText = txt;
  const dBtn = document.getElementById('d-btn-sound-toggle');
  if (dBtn) dBtn.innerText = txt;

  if (masterGain && audioCtx) {
    masterGain.gain.setTargetAtTime(soundActive ? 1.0 : 0.0, audioCtx.currentTime, 0.05);
  }
  return soundActive;
}

export function isSoundActive() {
  return soundActive;
}
