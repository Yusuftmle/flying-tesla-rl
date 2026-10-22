/* =========================================================================
   120Hz ULTRA-GERÇEKÇİ SABİT ADIMLI FİZİK MOTORU & SİNİR AĞI ÇIKARIMI
   ========================================================================= */

export const SUB_DT = 1.0 / 120.0; // 120Hz sabit zaman adımı (8.33 ms)
export const MAX_SUBSTEPS = 8;
export const MAX_TILT = 16.0 * Math.PI / 180.0; // 16 derece (~0.279 rad)
export const PLATE_RADIUS = 0.148; // 14.8 cm yarıçaplı dairesel köşesiz plaka
export const BALL_RADIUS = 0.018; // 1.8 cm
export const RIM_RADIUS = PLATE_RADIUS - BALL_RADIUS; // 0.130 m (Dairesel çeper sınırı)

let accumulator = 0.0;

export function resetArenaAccumulator() {
  accumulator = 0.0;
}

// 8 -> 16 -> 16 -> 2 Yüksek Hızlı Sinir Ağı İleri Geçişi
export function predictAIPolicy(obs, weights) {
  if (!weights) {
    // Analitik Uzman Kontrolcü Fallback
    const ex = obs[0], ey = obs[1], vx = obs[2], vy = obs[3], tx = obs[4], ty = obs[5], tvx = obs[6], tvy = obs[7];
    const scale = (5.0 / 7.0) * 9.81;
    const kp = 7.8, kd = 3.4, kt = 0.45;
    const des_ax = -kp * ex - kd * (vx - tvx);
    const des_ay = -kp * ey - kd * (vy - tvy);
    const des_tx = Math.max(-MAX_TILT, Math.min(MAX_TILT, des_ax / scale));
    const des_ty = Math.max(-MAX_TILT, Math.min(MAX_TILT, des_ay / scale));
    const cx = Math.max(-1.0, Math.min(1.0, (des_tx + kt * (des_tx - tx)) / MAX_TILT));
    const cy = Math.max(-1.0, Math.min(1.0, (des_ty + kt * (des_ty - ty)) / MAX_TILT));
    return {
      action: [cx, cy],
      h1: new Float32Array(16).fill(0.1),
      h2: new Float32Array(16).fill(0.1)
    };
  }

  const { w1, b1, w2, b2, w3, b3 } = weights;
  const inSize = 8;
  const h1Size = w1.length;
  const h2Size = w2.length;

  // Layer 1: ReLU(W1 * obs + b1)
  const h1 = new Float32Array(h1Size);
  for (let i = 0; i < h1Size; i++) {
    let sum = b1[i];
    const row = w1[i];
    for (let j = 0; j < inSize; j++) sum += row[j] * obs[j];
    h1[i] = sum > 0 ? sum : 0;
  }

  // Layer 2: ReLU(W2 * h1 + b2)
  const h2 = new Float32Array(h2Size);
  for (let i = 0; i < h2Size; i++) {
    let sum = b2[i];
    const row = w2[i];
    for (let j = 0; j < h1Size; j++) sum += row[j] * h1[j];
    h2[i] = sum > 0 ? sum : 0;
  }

  // Layer 3: Tanh(W3 * h2 + b3)
  const action = new Float32Array(2);
  for (let i = 0; i < 2; i++) {
    let sum = b3[i];
    const row = w3[i];
    for (let j = 0; j < h2Size; j++) sum += row[j] * h2[j];
    action[i] = Math.tanh(sum);
  }

  return { action, h1, h2 };
}

export function createArenaState() {
  return {
    x: 0.0,
    y: 0.0,
    zHeight: 0.0, // Topun havadaki 3D yüksekliği
    vx: 0.0,
    vy: 0.0,
    tiltX: 0.0,
    tiltY: 0.0,
    tiltVx: 0.0,
    tiltVy: 0.0,
    cmdX: 0.0,
    cmdY: 0.0,
    targetX: 0.0,
    targetY: 0.0,
    targetVx: 0.0,
    targetVy: 0.0,
    targetMode: 'center', // 'center' | 'circle' | 'figure8' | 'mouse'
    targetTimer: 0.0,
    borderMode: 'bumper', // 'bumper' (dairesel elastik bariyer) | 'open' (dairesel kenardan düşüş)
    fepMode: 'pure_rl',   // 'pure_rl' | 'fep_safe'
    state: 'rolling',     // 'rolling' | 'held' (elle havada tutuluyor) | 'falling' | 'respawning'
    fallVy: 0.0,
    maxTilt: MAX_TILT,
    plateRadius: PLATE_RADIUS,
    rimRadius: RIM_RADIUS,
    activations: {
      inputs: new Float32Array(8),
      hidden1: new Float32Array(16),
      hidden2: new Float32Array(16),
      outputs: [0, 0]
    }
  };
}

// 120Hz Tek Bir Alt Adım Entegrasyonu (Symplectic RK2)
export function stepSingleSubstep(dt, arenaState, activeWeights, vfxCallbacks) {
  // A) Elle Havada Tutulma Durumu (Hand Grab & Lift in Air)
  if (arenaState.state === 'held') {
    // Top kullanıcı tarafından 3D havada tutuluyor
    // AI plaka topun altındaki gölgeye yönelip inişi karşılamaya hazırlanır
    const obsHeld = [
      arenaState.x - arenaState.targetX,
      arenaState.y - arenaState.targetY,
      0, 0,
      arenaState.tiltX, arenaState.tiltY,
      0, 0
    ];
    const predHeld = predictAIPolicy(obsHeld, activeWeights);
    arenaState.cmdX = Math.max(-1.0, Math.min(1.0, predHeld.action[0]));
    arenaState.cmdY = Math.max(-1.0, Math.min(1.0, predHeld.action[1]));

    const wn = 28.0, zeta = 0.85;
    const targetTiltX = arenaState.cmdX * arenaState.maxTilt * 0.4;
    const targetTiltY = arenaState.cmdY * arenaState.maxTilt * 0.4;
    const accTiltX = (wn * wn) * (targetTiltX - arenaState.tiltX) - 2.0 * zeta * wn * arenaState.tiltVx;
    const accTiltY = (wn * wn) * (targetTiltY - arenaState.tiltY) - 2.0 * zeta * wn * arenaState.tiltVy;
    arenaState.tiltVx += accTiltX * dt;
    arenaState.tiltVy += accTiltY * dt;
    arenaState.tiltX += arenaState.tiltVx * dt;
    arenaState.tiltY += arenaState.tiltVy * dt;
    return;
  }

  // B) Havadan Düşüş veya Masada Sekme Durumu (Free Fall & Bounce)
  if (arenaState.state === 'falling') {
    arenaState.fallVy -= 9.81 * dt;
    arenaState.zHeight += arenaState.fallVy * dt;
    arenaState.x += arenaState.vx * dt;
    arenaState.y += arenaState.vy * dt;

    // Plaka Yüzeyine İniş Kontrolü (Z = 0)
    if (arenaState.zHeight <= 0.0) {
      const distFromCenter = Math.hypot(arenaState.x, arenaState.y);
      if (distFromCenter <= arenaState.plateRadius) {
        // Dairesel plaka yüzeyine çarptı!
        if (Math.abs(arenaState.fallVy) > 0.08) {
          // Elastik yüzey sekmesi
          arenaState.zHeight = 0.001;
          arenaState.fallVy = -arenaState.fallVy * 0.44;
          arenaState.vx *= 0.88;
          arenaState.vy *= 0.88;
          if (vfxCallbacks && vfxCallbacks.onPlateLand) {
            vfxCallbacks.onPlateLand(Math.abs(arenaState.fallVy));
          }
        } else {
          // Plakaya tamamen oturdu, yuvarlanmaya başla
          arenaState.zHeight = 0.0;
          arenaState.fallVy = 0.0;
          arenaState.state = 'rolling';
          if (vfxCallbacks && vfxCallbacks.onPlateLand) {
            vfxCallbacks.onPlateLand(0.1);
          }
        }
        return;
      }
    }

    // Plakayı ıskaladıysa alt masa seviyesine çarpma (-0.28m)
    if (arenaState.zHeight <= -0.28) {
      arenaState.zHeight = -0.28;
      arenaState.fallVy = -arenaState.fallVy * 0.38;
      arenaState.vx *= 0.65;
      arenaState.vy *= 0.65;
      if (vfxCallbacks && vfxCallbacks.onTableHit) {
        vfxCallbacks.onTableHit(Math.abs(arenaState.fallVy));
      }
    }

    // Masada hareketsiz kaldıysa merkeze yeniden doğ
    if (Math.abs(arenaState.fallVy) < 0.05 && arenaState.zHeight <= -0.275) {
      arenaState.state = 'respawning';
      arenaState.x = 0.0;
      arenaState.y = 0.0;
      arenaState.vx = 0.0;
      arenaState.vy = 0.0;
      arenaState.zHeight = 0.18;
      arenaState.fallVy = 0.0;
    }
    return;
  }

  if (arenaState.state === 'respawning') {
    arenaState.fallVy -= 9.81 * dt;
    arenaState.zHeight += arenaState.fallVy * dt;
    if (arenaState.zHeight <= 0.0) {
      arenaState.zHeight = 0.0;
      arenaState.fallVy = 0.0;
      arenaState.state = 'rolling';
      if (vfxCallbacks && vfxCallbacks.onPlateLand) {
        vfxCallbacks.onPlateLand(0.2);
      }
    }
    return;
  }

  // B) Dinamik Hedef Yörünge Güncellemesi
  arenaState.targetTimer += dt;
  if (arenaState.targetMode === 'circle') {
    const R = 0.075;
    const omega = 1.2; // rad/s
    arenaState.targetX = R * Math.cos(omega * arenaState.targetTimer);
    arenaState.targetY = R * Math.sin(omega * arenaState.targetTimer);
    arenaState.targetVx = -R * omega * Math.sin(omega * arenaState.targetTimer);
    arenaState.targetVy = R * omega * Math.cos(omega * arenaState.targetTimer);
  } else if (arenaState.targetMode === 'figure8') {
    const R = 0.075;
    const omega = 1.0;
    arenaState.targetX = R * Math.sin(omega * arenaState.targetTimer);
    arenaState.targetY = R * Math.sin(2.0 * omega * arenaState.targetTimer) * 0.55;
    arenaState.targetVx = R * omega * Math.cos(omega * arenaState.targetTimer);
    arenaState.targetVy = R * 1.1 * omega * Math.cos(2.0 * omega * arenaState.targetTimer);
  } else if (arenaState.targetMode === 'center') {
    arenaState.targetX = 0.0;
    arenaState.targetY = 0.0;
    arenaState.targetVx = 0.0;
    arenaState.targetVy = 0.0;
  }

  // C) Gözlem Vektörü (8 Eleman)
  const obs = [
    arenaState.x - arenaState.targetX,
    arenaState.y - arenaState.targetY,
    arenaState.vx,
    arenaState.vy,
    arenaState.tiltX,
    arenaState.tiltY,
    arenaState.targetVx,
    arenaState.targetVy
  ];

  // D) Sinir Ağı Çıkarımı
  const pred = predictAIPolicy(obs, activeWeights);
  let cmdX = Math.max(-1.0, Math.min(1.0, pred.action[0]));
  let cmdY = Math.max(-1.0, Math.min(1.0, pred.action[1]));

  // FEP / Havacılık Emniyet Modu Filtresi (Aşırı Eğim ve Ani Sarsıntı Koruması)
  if (arenaState.fepMode === 'fep_safe') {
    const spd = Math.hypot(arenaState.vx, arenaState.vy);
    if (spd > 0.6) {
      // Yüksek hızda aşırı tilt ters tepkiyi önlemek için yumuşat
      cmdX *= 0.75;
      cmdY *= 0.75;
    }
  }

  arenaState.cmdX = cmdX;
  arenaState.cmdY = cmdY;
  arenaState.activations = {
    inputs: obs,
    hidden1: pred.h1,
    hidden2: pred.h2,
    outputs: [cmdX, cmdY]
  };

  // E) 2. Derece Mekanik Servo Aktüatör Dinamiği (Kritik Sönümlü)
  const targetTiltX = cmdX * arenaState.maxTilt;
  const targetTiltY = cmdY * arenaState.maxTilt;
  const wn = 32.0;   // 32 rad/s doğal frekans (~5.1 Hz)
  const zeta = 0.85; // %85 kritik sönüm (sıfır titreşimli kusursuz mekanizma)

  const accTiltX = (wn * wn) * (targetTiltX - arenaState.tiltX) - 2.0 * zeta * wn * arenaState.tiltVx;
  const accTiltY = (wn * wn) * (targetTiltY - arenaState.tiltY) - 2.0 * zeta * wn * arenaState.tiltVy;

  arenaState.tiltVx += accTiltX * dt;
  arenaState.tiltVy += accTiltY * dt;
  arenaState.tiltVx = Math.max(-12.0, Math.min(12.0, arenaState.tiltVx));
  arenaState.tiltVy = Math.max(-12.0, Math.min(12.0, arenaState.tiltVy));

  arenaState.tiltX += arenaState.tiltVx * dt;
  arenaState.tiltY += arenaState.tiltVy * dt;
  arenaState.tiltX = Math.max(-arenaState.maxTilt, Math.min(arenaState.maxTilt, arenaState.tiltX));
  arenaState.tiltY = Math.max(-arenaState.maxTilt, Math.min(arenaState.maxTilt, arenaState.tiltY));

  // F) Newton-Euler Yuvarlanma İvmesi (a = (5/7) * g * sin(theta))
  const scale = (5.0 / 7.0) * 9.81;
  let accX = scale * Math.sin(arenaState.tiltX);
  let accY = scale * Math.sin(arenaState.tiltY);

  // G) Coulomb Yuvarlanma Sürtünmesi ve Stiction (Ölü Bölge Sabitlemesi)
  const spd = Math.hypot(arenaState.vx, arenaState.vy);
  const muRoll = 0.0035;
  if (spd > 0.002) {
    accX -= muRoll * 9.81 * (arenaState.vx / spd);
    accY -= muRoll * 9.81 * (arenaState.vy / spd);
  } else if (Math.hypot(accX, accY) < (muRoll * 9.81) && Math.hypot(arenaState.x - arenaState.targetX, arenaState.y - arenaState.targetY) < 0.005) {
    accX = 0;
    accY = 0;
    arenaState.vx = 0;
    arenaState.vy = 0;
  }

  // Symplectic RK2 Hız ve Konum Adımı
  arenaState.vx += accX * dt;
  arenaState.vy += accY * dt;
  arenaState.x += arenaState.vx * dt;
  arenaState.y += arenaState.vy * dt;

  // H) Dairesel (Köşesiz) Sınır ve Çarpışma Dinamiği
  const rBall = Math.hypot(arenaState.x, arenaState.y);

  if (arenaState.borderMode === 'bumper') {
    // Dairesel Elastik Bariyer (e = 0.70 + teğetsel sürtünme)
    const e = 0.70;
    const rLimit = arenaState.rimRadius; // 0.130 m

    if (rBall > rLimit) {
      const nx = arenaState.x / rBall;
      const ny = arenaState.y / rBall;
      const vn = arenaState.vx * nx + arenaState.vy * ny; // Çepere dik radyal hız

      if (vn > 0) {
        // Radyal geri sıçrama
        arenaState.vx -= (1 + e) * vn * nx;
        arenaState.vy -= (1 + e) * vn * ny;
        arenaState.vx *= 0.94;
        arenaState.vy *= 0.94;
        arenaState.x = nx * rLimit;
        arenaState.y = ny * rLimit;
        if (vfxCallbacks && vfxCallbacks.onRimHit) vfxCallbacks.onRimHit(vn);
      }
    }
  } else {
    // Dairesel Açık Kenar (Kenardan serbest parabolik düşüş)
    if (rBall > arenaState.plateRadius) {
      arenaState.state = 'falling';
      arenaState.fallVy = 0.0;
      if (vfxCallbacks && vfxCallbacks.onFallOff) {
        vfxCallbacks.onFallOff();
      }
    }
  }
}

// 120Hz Sabit Adım Akümülatör Motoru
export function stepArenaPhysicsFixed(frameDt, arenaState, activeWeights, vfxCallbacks) {
  accumulator += Math.min(frameDt, 0.1);
  let subSteps = 0;
  while (accumulator >= SUB_DT && subSteps < MAX_SUBSTEPS) {
    stepSingleSubstep(SUB_DT, arenaState, activeWeights, vfxCallbacks);
    accumulator -= SUB_DT;
    subSteps++;
  }
}
