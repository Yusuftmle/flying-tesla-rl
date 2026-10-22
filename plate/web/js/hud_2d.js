/* =========================================================================
   MASTER 1080x1920 CANVAS 2D HUD VE NİŞAN VEKTÖRÜ ÇİZİCİ
   ========================================================================= */

export function getStageMeta(step) {
  if (step < 70) return { label: 'barely moves', color: '#ef4444' };
  if (step < 200) return { label: 'overshoots', color: '#f97316' };
  if (step < 360) return { label: 'dampens error', color: '#fbbf24' };
  if (step < 480) return { label: 'near balance', color: '#38bdf8' };
  return { label: 'balanced', color: '#10b981' };
}

export function drawHUD(ctx, { currentAppMode, stepNum, arenaState, CANVAS_WIDTH, CANVAS_HEIGHT }) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  if (currentAppMode === 'reels') {
    // --- 0-500 REELS MODU HUD ---
    // 1. Büyük Adım Numarası (Y: 205)
    ctx.fillStyle = '#f59e0b';
    ctx.font = '900 120px Outfit, sans-serif';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 25;
    ctx.fillText((stepNum !== undefined ? stepNum : 0).toLocaleString(), CANVAS_WIDTH / 2, 205);

    // 2. Alt Başlık: time steps of training (Y: 250)
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 34px Outfit, sans-serif';
    ctx.shadowBlur = 15;
    ctx.fillText('time steps of training', CANVAS_WIDTH / 2, 250);

    // 3. İlerleme Çubuğu (Y: 285)
    const trackX = 180;
    const trackY = 285;
    const trackW = 720;
    const trackH = 12;

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.roundRect(trackX, trackY, trackW, trackH, 6);
    ctx.fill();

    // Checkpoint Çentikleri: 0, 100, 250, 400, 500
    const ticks = [0, 100, 250, 400, 500];
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 3;
    ticks.forEach(tVal => {
      const tx = trackX + (tVal / 500) * trackW;
      ctx.beginPath();
      ctx.moveTo(tx, trackY - 6);
      ctx.lineTo(tx, trackY + trackH + 6);
      ctx.stroke();
    });

    // Dolu Bölüm (0 to 500)
    const fillPct = Math.min(1.0, Math.max(0.015, (stepNum || 0) / 500));
    const fillW = fillPct * trackW;
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.roundRect(trackX, trackY, fillW, trackH, 6);
    ctx.fill();

    // 4. Durum Yazısı (Y: 960) - Monitör ile plaka arasında
    const meta = getStageMeta(stepNum || 0);
    ctx.textAlign = 'center';
    ctx.fillStyle = meta.color;
    ctx.font = '800 64px Outfit, sans-serif';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 30;
    ctx.fillText(meta.label, CANVAS_WIDTH / 2, 960);
    ctx.shadowBlur = 0;

  } else {
    // --- ARENA MODU: ULTRA-TEMİZ & SADE DİZAYN ---
    // Eğer top havada tutuluyorsa sadece zarif bir yükseklik göstergesi ver, aksi halde ekranı tamamen temiz tut
    if (arenaState.state === 'held' || (arenaState.state === 'falling' && arenaState.zHeight > 0.02)) {
      const heightCM = (arenaState.zHeight * 100).toFixed(0);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = '700 24px JetBrains Mono, monospace';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 12;
      ctx.fillText(`Yükseklik: ${heightCM} cm`, CANVAS_WIDTH / 2, 220);
      ctx.shadowBlur = 0;
    }
  }
}

export function drawAimingVector(ctx, { THREE, isDragging, dragStartPos, dragCurrentPos, plateGroup, camera, CANVAS_WIDTH, CANVAS_HEIGHT }) {
  if (!isDragging || !dragStartPos || !dragCurrentPos) return;

  const pStart3D = new THREE.Vector3(dragStartPos.x, 0.02, dragStartPos.y).applyEuler(plateGroup.rotation).add(plateGroup.position);
  const pEnd3D = new THREE.Vector3(dragCurrentPos.x, 0.02, dragCurrentPos.y).applyEuler(plateGroup.rotation).add(plateGroup.position);

  pStart3D.project(camera);
  pEnd3D.project(camera);

  const sX = (pStart3D.x * 0.5 + 0.5) * CANVAS_WIDTH;
  const sY = (-pStart3D.y * 0.5 + 0.5) * CANVAS_HEIGHT;
  const eX = (pEnd3D.x * 0.5 + 0.5) * CANVAS_WIDTH;
  const eY = (-pEnd3D.y * 0.5 + 0.5) * CANVAS_HEIGHT;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sX, sY);
  ctx.lineTo(eX, eY);
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 6;
  ctx.shadowColor = '#06b6d4';
  ctx.shadowBlur = 15;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(eX, eY, 12, 0, Math.PI * 2);
  ctx.fillStyle = '#67e8f9';
  ctx.fill();
  ctx.restore();
}
