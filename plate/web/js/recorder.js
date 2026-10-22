/* =========================================================================
   DAHİLİ KAYIT MOTORU (MediaRecorder -> 1080x1920 WebM)
   ========================================================================= */

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recStartTime = 0;
let recTimerInterval = null;

export function initRecorder({
  masterCanvas,
  getAudioDest,
  initAudio,
  getAppMode,
  isTimelineMode,
  getActiveStep,
  showToast,
  onRecordingStateChange,
  resetPlayback
}) {
  async function startRecordingFlow() {
    initAudio();

    if (isRecording) {
      stopRecording();
      return;
    }

    const stream = masterCanvas.captureStream(30);
    const audioDest = getAudioDest();
    if (audioDest && audioDest.stream) {
      const audioTracks = audioDest.stream.getAudioTracks();
      if (audioTracks.length > 0) {
        stream.addTrack(audioTracks[0]);
      }
    }

    let options = { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 16000000 };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm' };
    }

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const appMode = getAppMode();
      const activeStep = getActiveStep();
      const nameSuffix = appMode === 'arena' ? 'arena_live_test' : (isTimelineMode() ? 'timeline_0_to_500' : `${activeStep}_steps`);
      a.download = `reel_${nameSuffix}.webm`;
      a.click();
      showToast('🎉 reel.webm İndirildi!');
      setRecordingUI(false);
    };

    mediaRecorder.start();
    isRecording = true;
    setRecordingUI(true);
    showToast('🔴 1080x1920 Kayıt Başladı...');

    if (getAppMode() === 'reels' && resetPlayback) {
      resetPlayback();
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecording = false;
  }

  function setRecordingUI(recording) {
    const btn = document.getElementById('btn-record-reel');
    const text = document.getElementById('rec-btn-text');
    const ind = document.getElementById('rec-indicator');

    if (recording) {
      if (btn) btn.classList.add('recording');
      if (text) text.innerText = '⏹ DURDUR & İNDİR';
      if (ind) ind.classList.add('active');
      recStartTime = Date.now();
      recTimerInterval = setInterval(() => {
        const sec = Math.floor((Date.now() - recStartTime) / 1000);
        const m = String(Math.floor(sec / 60)).padStart(2, '0');
        const s = String(sec % 60).padStart(2, '0');
        const timeEl = document.getElementById('rec-time-text');
        if (timeEl) timeEl.innerText = `REC ${m}:${s}`;
      }, 1000);
    } else {
      if (btn) btn.classList.remove('recording');
      if (text) text.innerText = '🎬 REELS VİDEOSU KAYDET';
      if (ind) ind.classList.remove('active');
      clearInterval(recTimerInterval);
    }

    if (onRecordingStateChange) onRecordingStateChange(recording);
  }

  return {
    startRecordingFlow,
    stopRecording,
    isRecording: () => isRecording
  };
}
