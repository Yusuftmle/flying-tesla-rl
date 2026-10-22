/* =========================================================================
   2D SİNİR AĞI & MONİTÖR EKRANI ÇİZİCİ (1280x720 Canvas Texture)
   ========================================================================= */

export function createMonitor2D({ THREE }) {
  const monitorCanvas = document.createElement('canvas');
  monitorCanvas.width = 1280;
  monitorCanvas.height = 720;
  const mCtx = monitorCanvas.getContext('2d');
  const monitorTexture = new THREE.CanvasTexture(monitorCanvas);
  monitorTexture.anisotropy = 8;

  const servoHistory = [];
  const maxHistory = 100;

  function drawMonitorContent(frame, weights, stepNum, currentAppMode) {
    const w = 1280;
    const h = 720;

    mCtx.fillStyle = '#080d16';
    mCtx.fillRect(0, 0, w, h);

    mCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    mCtx.lineWidth = 3;
    mCtx.strokeRect(12, 12, w - 24, h - 24);

    mCtx.fillStyle = '#ffffff';
    mCtx.font = 'bold 30px Outfit, sans-serif';
    mCtx.textAlign = 'left';
    mCtx.fillText(currentAppMode === 'arena' ? 'SAC policy (LIVE ARENA)' : 'SAC policy', 36, 54);

    mCtx.fillStyle = '#94a3b8';
    mCtx.font = '500 24px Outfit, sans-serif';
    mCtx.textAlign = 'right';
    mCtx.fillText(currentAppMode === 'arena' ? 'trained steps' : 'training steps', w - 170, 54);

    mCtx.fillStyle = currentAppMode === 'arena' ? '#06b6d4' : '#f59e0b';
    mCtx.font = '900 34px Outfit, sans-serif';
    mCtx.fillText(currentAppMode === 'arena' ? '500' : (stepNum !== undefined ? stepNum.toLocaleString() : '0'), w - 36, 54);

    // SOL ÜST: plate (top view)
    const box1X = 36, box1Y = 82, box1W = 340, box1H = 340;
    mCtx.fillStyle = '#0d1322';
    mCtx.fillRect(box1X, box1Y, box1W, box1H);
    mCtx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    mCtx.lineWidth = 1.5;
    mCtx.strokeRect(box1X, box1Y, box1W, box1H);

    mCtx.fillStyle = '#94a3b8';
    mCtx.font = '600 17px Outfit, sans-serif';
    mCtx.textAlign = 'left';
    mCtx.fillText('plate (top view)', box1X + 16, box1Y + 30);

    const viewX = box1X + 35, viewY = box1Y + 45, viewSize = 270;
    mCtx.fillStyle = '#070a12';
    mCtx.fillRect(viewX, viewY, viewSize, viewSize);
    mCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    mCtx.strokeRect(viewX, viewY, viewSize, viewSize);

    const centerX = viewX + viewSize / 2;
    const centerY = viewY + viewSize / 2;
    mCtx.beginPath();
    mCtx.arc(centerX, centerY, 18, 0, Math.PI * 2);
    mCtx.strokeStyle = '#3b82f6';
    mCtx.lineWidth = 3;
    mCtx.stroke();
    mCtx.beginPath();
    mCtx.arc(centerX, centerY, 7, 0, Math.PI * 2);
    mCtx.fillStyle = '#3b82f6';
    mCtx.fill();

    if (frame) {
      const scale = (viewSize / 2) / 0.15;
      const bX = centerX + Math.max(-viewSize/2 + 8, Math.min(viewSize/2 - 8, frame.ball_x * scale));
      const bY = centerY + Math.max(-viewSize/2 + 8, Math.min(viewSize/2 - 8, frame.ball_y * scale));

      if (frame.fell) {
        mCtx.fillStyle = 'rgba(239, 68, 68, 0.90)';
        mCtx.font = '900 24px Outfit, sans-serif';
        mCtx.textAlign = 'center';
        mCtx.fillText('DROPPED!', centerX, centerY + 65);
      } else {
        mCtx.beginPath();
        mCtx.moveTo(bX, bY);
        mCtx.lineTo(bX + frame.vx * scale * 0.12, bY + frame.vy * scale * 0.12);
        mCtx.strokeStyle = '#f59e0b';
        mCtx.lineWidth = 2.5;
        mCtx.stroke();

        mCtx.beginPath();
        mCtx.arc(bX, bY, 10, 0, Math.PI * 2);
        mCtx.fillStyle = '#f97316';
        mCtx.fill();
        mCtx.strokeStyle = '#ffffff';
        mCtx.lineWidth = 2;
        mCtx.stroke();
      }
    }

    // SOL ALT: servo commands
    const box2X = 36, box2Y = 442, box2W = 340, box2H = 240;
    mCtx.fillStyle = '#0d1322';
    mCtx.fillRect(box2X, box2Y, box2W, box2H);
    mCtx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    mCtx.strokeRect(box2X, box2Y, box2W, box2H);

    mCtx.fillStyle = '#94a3b8';
    mCtx.font = '600 17px Outfit, sans-serif';
    mCtx.textAlign = 'left';
    mCtx.fillText('servo commands', box2X + 16, box2Y + 28);

    mCtx.fillStyle = '#f59e0b';
    mCtx.font = 'bold 16px Outfit, sans-serif';
    mCtx.fillText('x', box2X + 270, box2Y + 28);
    mCtx.fillStyle = '#38bdf8';
    mCtx.fillText('y', box2X + 300, box2Y + 28);

    const oscX = box2X + 20, oscY = box2Y + 48, oscW = 300, oscH = 168;
    mCtx.fillStyle = '#070a12';
    mCtx.fillRect(oscX, oscY, oscW, oscH);
    mCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    mCtx.strokeRect(oscX, oscY, oscW, oscH);

    mCtx.beginPath();
    mCtx.moveTo(oscX, oscY + oscH / 2);
    mCtx.lineTo(oscX + oscW, oscY + oscH / 2);
    mCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    mCtx.lineWidth = 1;
    mCtx.stroke();

    if (frame) {
      servoHistory.push({ x: frame.cmd_x, y: frame.cmd_y });
      if (servoHistory.length > maxHistory) servoHistory.shift();
    }

    if (servoHistory.length > 1) {
      mCtx.beginPath();
      for (let i = 0; i < servoHistory.length; i++) {
        const px = oscX + (i / maxHistory) * oscW;
        const py = oscY + oscH / 2 - (servoHistory[i].x * (oscH * 0.42));
        if (i === 0) mCtx.moveTo(px, py); else mCtx.lineTo(px, py);
      }
      mCtx.strokeStyle = '#f59e0b';
      mCtx.lineWidth = 2.5;
      mCtx.stroke();

      mCtx.beginPath();
      for (let i = 0; i < servoHistory.length; i++) {
        const px = oscX + (i / maxHistory) * oscW;
        const py = oscY + oscH / 2 - (servoHistory[i].y * (oscH * 0.42));
        if (i === 0) mCtx.moveTo(px, py); else mCtx.lineTo(px, py);
      }
      mCtx.strokeStyle = '#38bdf8';
      mCtx.lineWidth = 2.5;
      mCtx.stroke();
    }

    // SAĞ: neural network
    const nnX = 400, nnY = 82, nnW = 844, nnH = 600;
    mCtx.fillStyle = '#0d1322';
    mCtx.fillRect(nnX, nnY, nnW, nnH);
    mCtx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    mCtx.strokeRect(nnX, nnY, nnW, nnH);

    mCtx.fillStyle = '#94a3b8';
    mCtx.font = '600 17px Outfit, sans-serif';
    mCtx.textAlign = 'left';
    mCtx.fillText('neural network (8 -> 12 -> 12 -> 2)', nnX + 20, nnY + 30);

    const layers = [
      { count: 8, x: nnX + 115, acts: frame?.activations?.inputs },
      { count: 12, x: nnX + 315, acts: frame?.activations?.hidden1 },
      { count: 12, x: nnX + 515, acts: frame?.activations?.hidden2 },
      { count: 2, x: nnX + 715, acts: frame?.activations?.outputs }
    ];

    const inputNames = ['x err', 'y err', 'vx', 'vy', 'tilt x', 'tilt y', 'target vx', 'target vy'];
    const outputNames = ['servo x', 'servo y'];

    for (let l = 0; l < layers.length - 1; l++) {
      const l1 = layers[l];
      const l2 = layers[l + 1];

      for (let i = 0; i < l1.count; i++) {
        const y1 = nnY + 80 + (i / (l1.count - 1 || 1)) * (nnH - 140);
        for (let j = 0; j < l2.count; j++) {
          const y2 = nnY + 80 + (j / (l2.count - 1 || 1)) * (nnH - 140);

          let wVal = 0.5;
          if (weights && weights[l] && weights[l][j] && weights[l][j][i] !== undefined) {
            wVal = weights[l][j][i];
          }

          const isPos = wVal >= 0;
          const alpha = 0.05 + Math.min(0.40, Math.abs(wVal) * 0.28);
          mCtx.beginPath();
          mCtx.moveTo(l1.x, y1);
          mCtx.lineTo(l2.x, y2);
          mCtx.strokeStyle = isPos ? `rgba(245, 158, 11, ${alpha})` : `rgba(56, 189, 248, ${alpha})`;
          mCtx.lineWidth = 1 + Math.abs(wVal) * 1.3;
          mCtx.stroke();
        }
      }
    }

    for (let l = 0; l < layers.length; l++) {
      const layer = layers[l];
      for (let i = 0; i < layer.count; i++) {
        const ny = nnY + 80 + (i / (layer.count - 1 || 1)) * (nnH - 140);
        const act = layer.acts ? Math.abs(layer.acts[i] || 0) : 0;
        const mag = Math.min(1.0, act);

        if (mag > 0.15) {
          mCtx.beginPath();
          mCtx.arc(layer.x, ny, 10 + mag * 10, 0, Math.PI * 2);
          mCtx.fillStyle = (l === 3 && i === 1) ? `rgba(56, 189, 248, ${mag * 0.55})` : `rgba(245, 158, 11, ${mag * 0.55})`;
          mCtx.fill();
        }

        mCtx.beginPath();
        mCtx.arc(layer.x, ny, 8, 0, Math.PI * 2);
        mCtx.fillStyle = (l === 3 && i === 1) ? '#38bdf8' : '#fbbf24';
        mCtx.fill();
        mCtx.strokeStyle = '#ffffff';
        mCtx.lineWidth = 2;
        mCtx.stroke();

        mCtx.fillStyle = '#94a3b8';
        mCtx.font = '13px JetBrains Mono';
        if (l === 0) {
          mCtx.textAlign = 'right';
          mCtx.fillText(inputNames[i] || '', layer.x - 14, ny + 4);
        } else if (l === 3) {
          mCtx.textAlign = 'left';
          mCtx.fillStyle = (i === 0) ? '#f59e0b' : '#38bdf8';
          mCtx.fillText(outputNames[i] || '', layer.x + 14, ny + 4);
        }
      }
    }

    monitorTexture.needsUpdate = true;
  }

  return {
    monitorCanvas,
    monitorTexture,
    drawMonitorContent
  };
}
