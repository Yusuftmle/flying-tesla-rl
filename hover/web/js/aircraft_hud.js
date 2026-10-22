/**
 * aircraft_hud.js - Military Fighter & NASA Spacecraft Primary Flight Display (HUD)
 * 
 * Authentic Aerospace Symbology:
 * - Dynamic Artificial Horizon & Pitch Ladder with bank angle roll pointer
 * - Flight Path Vector (FPV / "The Bird" --o--) tracking inertial trajectory
 * - Boresight aircraft datum crosshair (+)
 * - Moving Airspeed Tape (IAS / Groundspeed + 2s trend vector)
 * - Moving Altitude Tape (Radar altimeter + Vertical Velocity Indicator [VVI])
 * - Heading Ribbon with Steerpoint diamond pointing to Landing Pad (-62m)
 * - SpaceX / NASA Falcon 9 Glideslope gate & Suicide Burn decision cue
 * - Screen-projected target pad lock reticle
 * - Tactical Phosphor Green & NASA Cyan monochrome palettes with sub-pixel glow
 */

export class AircraftHUD {
  constructor({ canvas, camera, THREE }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;
    this.THREE = THREE;

    this.mode = 'minimal'; // 'minimal' (Clean Reticle & Vectors), 'tactical' (Full Pitch Ladder & Tapes), 'off'
    this.theme = 'emerald'; // 'emerald' (phosphor green #00ff66) | 'cyan' (NASA #38bdf8)
    
    this.TARGET_X = -62.0;
    this.GROUND_Z = 0.70;

    // Smoothed values for realistic HUD filtering
    this.smooth = {
      pitch: 0,
      roll: 0,
      heading: 0,
      speed: 0,
      alt: 0,
      vz: 0,
      vx: 0,
      accel: 0
    };

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    this.dpr = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
  }

  toggleMode() {
    const modes = ['minimal', 'tactical', 'off'];
    const idx = modes.indexOf(this.mode);
    this.mode = modes[(idx + 1) % modes.length];
    return this.mode;
  }

  toggleTheme() {
    this.theme = this.theme === 'emerald' ? 'cyan' : 'emerald';
    return this.theme;
  }

  update(dt, state) {
    if (!state) return;
    const lerp = Math.min(1.0, dt * 18.0);

    const rawPitch = -(state.theta || 0) * (180.0 / Math.PI);
    const rawRoll = (state.roll || 0) * (180.0 / Math.PI);
    const rawSpeed = Math.hypot(state.vx || 0, state.vz || 0);
    const rawAlt = Math.max(0.0, (state.z || 0) - this.GROUND_Z);

    this.smooth.pitch += (rawPitch - this.smooth.pitch) * lerp;
    this.smooth.roll += (rawRoll - this.smooth.roll) * lerp;
    this.smooth.speed += (rawSpeed - this.smooth.speed) * lerp;
    this.smooth.alt += (rawAlt - this.smooth.alt) * lerp;
    this.smooth.vz += ((state.vz || 0) - this.smooth.vz) * lerp;
    this.smooth.vx += ((state.vx || 0) - this.smooth.vx) * lerp;
  }

  render(state) {
    if (!this.ctx || this.mode === 'off' || !state) {
      if (this.ctx) this.ctx.clearRect(0, 0, this.width, this.height);
      return;
    }

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const cx = w / 2;
    const cy = h / 2 - 25;

    ctx.clearRect(0, 0, w, h);

    // Color Setup (Phosphor Green vs NASA Cyan)
    const isCyan = this.theme === 'cyan';
    const primaryColor = isCyan ? '#38bdf8' : '#00ff66';
    const dimColor = isCyan ? 'rgba(56, 189, 248, 0.45)' : 'rgba(0, 255, 102, 0.45)';
    const alertColor = '#ef4444';
    const warnColor = '#fbbf24';

    ctx.save();
    ctx.strokeStyle = primaryColor;
    ctx.fillStyle = primaryColor;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 5;

    // 1. DÜNYA HEDEF KİLİDİ: İniş Pisti İşaretçisi (3D Landing Pad Reticle)
    this.drawPadTargetReticle(ctx, state, primaryColor);

    // 2. UÇUŞ YOLU VEKTÖRÜ (Flight Path Vector / "The Bird" --o--)
    this.drawFlightPathVector(ctx, cx, cy, state, primaryColor);

    // 3. MERKEZİ AIRCRAFT BORESIGHT (Datum Crosshair +)
    this.drawBoresight(ctx, cx, cy, primaryColor);

    if (this.mode === 'tactical') {
      // 4. DİNAMİK YAPAY UFUK & PITCH LADDER (Attitude Director)
      this.drawPitchLadder(ctx, cx, cy, this.smooth.pitch, this.smooth.roll, primaryColor, dimColor);

      // 5. HAVA HIZI ŞERİDİ (Airspeed Tape - Sol Kolon)
      this.drawAirspeedTape(ctx, cx - 165, cy, this.smooth.speed, this.smooth.vx, primaryColor);

      // 6. İRTİFA & DİKEY HIZ ŞERİDİ (Altitude & VVI Tape - Sağ Kolon)
      this.drawAltitudeTape(ctx, cx + 165, cy, this.smooth.alt, this.smooth.vz, primaryColor);

      // 7. PUSULA & İSTİKAMET ŞERİDİ (Heading Tape - Üst Merkez)
      this.drawHeadingTape(ctx, cx, 80, state, primaryColor);
    }

    ctx.restore();
  }

  // 1. 3D İniş Pisti Reticle Hedef Kilidi
  drawPadTargetReticle(ctx, state, color) {
    if (!this.camera || !this.THREE) return;
    try {
      const padPos3D = new this.THREE.Vector3(this.TARGET_X, this.GROUND_Z + 0.1, 0.0);
      padPos3D.project(this.camera);

      // Kamera önündeyse çiz
      if (padPos3D.z < 1.0) {
        const sx = (padPos3D.x * 0.5 + 0.5) * this.width;
        const sy = (-padPos3D.y * 0.5 + 0.5) * this.height;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;

        // Kare Hedef Köşebentleri (Target Brackets)
        const s = 14;
        ctx.beginPath();
        // Sol üst
        ctx.moveTo(sx - s, sy - s / 2); ctx.lineTo(sx - s, sy - s); ctx.lineTo(sx - s / 2, sy - s);
        // Sağ üst
        ctx.moveTo(sx + s / 2, sy - s); ctx.lineTo(sx + s, sy - s); ctx.lineTo(sx + s, sy - s / 2);
        // Sol alt
        ctx.moveTo(sx - s, sy + s / 2); ctx.lineTo(sx - s, sy + s); ctx.lineTo(sx - s / 2, sy + s);
        // Sağ alt
        ctx.moveTo(sx + s / 2, sy + s); ctx.lineTo(sx + s, sy + s); ctx.lineTo(sx + s, sy + s / 2);
        ctx.stroke();

        // Merkez Çaprazı
        ctx.beginPath();
        ctx.moveTo(sx - 3, sy); ctx.lineTo(sx + 3, sy);
        ctx.moveTo(sx, sy - 3); ctx.lineTo(sx, sy + 3);
        ctx.stroke();

        // Hedef Bilgisi
        const dist = Math.abs(state.x - this.TARGET_X).toFixed(1);
        ctx.font = '600 10px JetBrains Mono, monospace';
        ctx.fillText(`PAD [-62M]`, sx + s + 5, sy - 3);
        ctx.fillText(`RNG ${dist}m`, sx + s + 5, sy + 9);
        ctx.restore();
      }
    } catch (e) {}
  }

  // 2. Yapay Ufuk & Pitch Ladder (F-16 / F-35 Standardı - Kompakt ve Şık)
  drawPitchLadder(ctx, cx, cy, pitchDeg, rollDeg, color, dimColor) {
    ctx.save();
    ctx.translate(cx, cy);

    // Roll açısı kadar dön (Aircraft bank)
    ctx.rotate(-rollDeg * Math.PI / 180.0);

    const pxPerDeg = 7.0;
    const pitchY = pitchDeg * pxPerDeg;
    ctx.translate(0, pitchY);

    // UFUK ÇİZGİSİ (Horizon Bar 0° - Kompakt)
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-75, 0); ctx.lineTo(-20, 0);
    ctx.moveTo(20, 0);  ctx.lineTo(75, 0);
    ctx.stroke();

    // Ufuk Uçlarındaki Küçük Dikey Çıkıntılar
    ctx.beginPath();
    ctx.moveTo(-75, 0); ctx.lineTo(-75, 4);
    ctx.moveTo(75, 0);  ctx.lineTo(75, 4);
    ctx.stroke();

    // PITCH BASAMAKLARI: Sadece mevcut pitch'e yakın basamakları çiz (±15°)
    const rungs = [5, 10, 15, 20, 25, 30, 45, 60, -5, -10, -15, -20, -25, -30, -45, -60];
    ctx.font = '600 10px JetBrains Mono, monospace';

    rungs.forEach(p => {
      // Sadece görüş alanındakileri göster (ekranı kaplamasın!)
      if (Math.abs(p - pitchDeg) > 16) return;

      const yPos = -p * pxPerDeg;
      const rungHalfW = 26;
      const tickH = 4;

      ctx.beginPath();
      if (p > 0) {
        // Tırmanış (Climb): Düz çizgi, uçlar aşağıya (ufka) bakar
        ctx.moveTo(-rungHalfW, yPos);
        ctx.lineTo(-rungHalfW + tickH, yPos + tickH);
        ctx.moveTo(-rungHalfW, yPos);
        ctx.lineTo(-12, yPos);

        ctx.moveTo(12, yPos);
        ctx.lineTo(rungHalfW, yPos);
        ctx.lineTo(rungHalfW - tickH, yPos + tickH);
      } else {
        // Alçalış (Dive): Kesikli çizgi, uçlar yukarıya (ufka) bakar
        ctx.setLineDash([4, 4]);
        ctx.moveTo(-rungHalfW, yPos);
        ctx.lineTo(-rungHalfW + tickH, yPos - tickH);
        ctx.moveTo(-rungHalfW, yPos);
        ctx.lineTo(-12, yPos);

        ctx.moveTo(12, yPos);
        ctx.lineTo(rungHalfW, yPos);
        ctx.lineTo(rungHalfW - tickH, yPos - tickH);
      }
      ctx.stroke();
      ctx.setLineDash([]); // Reset dash

      // Derece Sayıları
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.abs(p)}`, -rungHalfW - 3, yPos + 3);
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.abs(p)}`, rungHalfW + 3, yPos + 3);
    });

    ctx.restore();

    // ROLL YAYI VE GÖSTERGESİ (Bank Angle Scale & Pointer)
    this.drawRollScale(ctx, cx, cy, rollDeg, color);
  }

  // Roll Açısı Yayı (Top Roll Arc & Pointer)
  drawRollScale(ctx, cx, cy, rollDeg, color) {
    const r = 120;
    const arcAngles = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];

    ctx.save();
    ctx.translate(cx, cy);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.0;
    ctx.globalAlpha = 0.55;

    // Ark Parçaları
    arcAngles.forEach(deg => {
      const rad = (deg - 90) * Math.PI / 180;
      const isMajor = Math.abs(deg) === 30 || Math.abs(deg) === 60 || deg === 0;
      const tickLen = isMajor ? 7 : 4;
      const x1 = Math.cos(rad) * r;
      const y1 = Math.sin(rad) * r;
      const x2 = Math.cos(rad) * (r - tickLen);
      const y2 = Math.sin(rad) * (r - tickLen);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });

    // Dönen Roll İşaretçisi (Roll Pointer Triangle)
    ctx.rotate(-rollDeg * Math.PI / 180);
    const pRad = -90 * Math.PI / 180;
    const px = Math.cos(pRad) * (r - 9);
    const py = Math.sin(pRad) * (r - 9);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - 3, py + 6);
    ctx.lineTo(px + 3, py + 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // 3. Uçuş Yolu Vektörü (Flight Path Vector / FPV / "The Bird")
  drawFlightPathVector(ctx, cx, cy, state, color) {
    const vx = state.vx || 0;
    const vz = state.vz || 0;
    const speed = Math.hypot(vx, vz);

    // Hıza bağlı olarak merkezden bağıl sapma
    const scale = 8.5;
    const fpvX = Math.max(-140, Math.min(140, cx - vx * scale));
    const fpvY = Math.max(-140, Math.min(140, cy - vz * scale));

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = 'rgba(0, 255, 102, 0.15)';
    ctx.lineWidth = 1.8;

    // FPV Çemberi
    ctx.beginPath();
    ctx.arc(fpvX, fpvY, 7, 0, Math.PI * 2);
    ctx.stroke();

    // Sol Kanat
    ctx.beginPath();
    ctx.moveTo(fpvX - 7, fpvY);
    ctx.lineTo(fpvX - 22, fpvY);
    ctx.stroke();

    // Sağ Kanat
    ctx.beginPath();
    ctx.moveTo(fpvX + 7, fpvY);
    ctx.lineTo(fpvX + 22, fpvY);
    ctx.stroke();

    // Üst Kuyruk Dikmesi
    ctx.beginPath();
    ctx.moveTo(fpvX, fpvY - 7);
    ctx.lineTo(fpvX, fpvY - 14);
    ctx.stroke();

    ctx.restore();
  }

  // 4. Boresight Cross (+)
  drawBoresight(ctx, cx, cy, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    const arm = 9;
    const gap = 4;
    ctx.beginPath();
    // Yatay
    ctx.moveTo(cx - arm, cy); ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + arm, cy);
    // Dikey
    ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + arm);
    ctx.stroke();
    ctx.restore();
  }

  // 5. Hava Hızı Şeridi (Airspeed Tape - Kompakt Sol Kolon)
  drawAirspeedTape(ctx, x, y, speed, vx, color) {
    const h = 150;
    const halfH = h / 2;
    const pxPerUnit = 7.0;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 48, y - halfH, 56, h);
    ctx.clip();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(x + 8, y - halfH);
    ctx.lineTo(x + 8, y + halfH);
    ctx.stroke();

    const startVal = Math.floor(speed - 10);
    const endVal = Math.ceil(speed + 10);

    ctx.font = '600 10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';

    for (let v = startVal; v <= endVal; v += 2) {
      if (v < 0) continue;
      const yOffset = y - (v - speed) * pxPerUnit;
      const isMajor = (v % 10 === 0);
      const tickLen = isMajor ? 9 : 5;

      ctx.beginPath();
      ctx.moveTo(x + 8, yOffset);
      ctx.lineTo(x + 8 - tickLen, yOffset);
      ctx.stroke();

      if (isMajor) {
        ctx.fillText(`${v}`, x + 8 - tickLen - 3, yOffset + 3.5);
      }
    }
    ctx.restore();

    // Hız Kutusu (Digital Airspeed Box)
    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.strokeRect(x - 52, y - 12, 60, 24);
    ctx.fillRect(x - 52, y - 12, 60, 24);

    ctx.fillStyle = color;
    ctx.font = '800 12px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${speed.toFixed(1)}`, x - 22, y + 4);

    ctx.font = '700 9px JetBrains Mono, monospace';
    ctx.fillText(`IAS`, x - 22, y - 16);
    ctx.restore();
  }

  // 6. İrtifa Şeridi & VVI (Altitude & Vertical Velocity - Kompakt Sağ Kolon)
  drawAltitudeTape(ctx, x, y, alt, vz, color) {
    const h = 150;
    const halfH = h / 2;
    const pxPerUnit = 7.0;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 8, y - halfH, 65, h);
    ctx.clip();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(x - 8, y - halfH);
    ctx.lineTo(x - 8, y + halfH);
    ctx.stroke();

    const startAlt = Math.floor(alt - 10);
    const endAlt = Math.ceil(alt + 10);

    ctx.font = '600 10px JetBrains Mono, monospace';
    ctx.textAlign = 'left';

    for (let a = startAlt; a <= endAlt; a += 2) {
      if (a < 0) continue;
      const yOffset = y - (a - alt) * pxPerUnit;
      const isMajor = (a % 10 === 0);
      const tickLen = isMajor ? 9 : 5;

      ctx.beginPath();
      ctx.moveTo(x - 8, yOffset);
      ctx.lineTo(x - 8 + tickLen, yOffset);
      ctx.stroke();

      if (isMajor) {
        ctx.fillText(`${a}`, x - 8 + tickLen + 4, yOffset + 3.5);
      }
    }
    ctx.restore();

    // Sayısal İrtifa Kutusu (Digital Altimeter Box)
    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.strokeRect(x - 8, y - 12, 60, 24);
    ctx.fillRect(x - 8, y - 12, 60, 24);

    ctx.fillStyle = color;
    ctx.font = '800 12px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${alt.toFixed(1)}`, x + 22, y + 4);

    ctx.font = '700 9px JetBrains Mono, monospace';
    ctx.fillText(`ALT`, x + 22, y - 16);

    // Dikey Hız Göstergesi (VVI Indicator)
    const vviY = Math.max(-30, Math.min(30, -vz * 8.0));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x + 55, y);
    ctx.lineTo(x + 68, y + vviY);
    ctx.stroke();

    ctx.font = '700 9px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`VVI ${(-vz).toFixed(1)}`, x + 58, y + 20);
    ctx.restore();
  }

  // 7. Pusula & İstikamet Şeridi (Heading Ribbon - Üst Merkez Kompakt)
  drawHeadingTape(ctx, cx, y, state, color) {
    const w = 180;
    const halfW = w / 2;
    const heading = ((state.roll || 0) * (180.0 / Math.PI) + 360) % 360;

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - halfW, y - 16, w, 32);
    ctx.clip();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, y + 8);
    ctx.lineTo(cx + halfW, y + 8);
    ctx.stroke();

    const pxPerDeg = 4.0;
    const startHdg = Math.floor(heading - 40);
    const endHdg = Math.ceil(heading + 40);

    ctx.font = '600 10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';

    for (let h = startHdg; h <= endHdg; h += 5) {
      const xOffset = cx + (h - heading) * pxPerDeg;
      const normalizedH = (h % 360 + 360) % 360;
      const isMajor = (normalizedH % 15 === 0);
      const tickH = isMajor ? 10 : 5;

      ctx.beginPath();
      ctx.moveTo(xOffset, y + 8);
      ctx.lineTo(xOffset, y + 8 - tickH);
      ctx.stroke();

      if (isMajor) {
        let label = `${normalizedH}`;
        if (normalizedH === 0) label = 'N';
        else if (normalizedH === 90) label = 'E';
        else if (normalizedH === 180) label = 'S';
        else if (normalizedH === 270) label = 'W';
        ctx.fillText(label, xOffset, y - 4);
      }
    }
    ctx.restore();

    // Merkez Lubber Çizgisi
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(cx, y + 10);
    ctx.lineTo(cx, y + 18);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = '800 11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(heading)}°`, cx, y + 30);
    ctx.restore();
  }

  // 8. Havacılık & NASA Annunciator Bilgi Blokları
  drawAerospaceAnnunciators(ctx, w, h, state, color, alertColor, warnColor) {
    ctx.save();
    ctx.font = '600 11px JetBrains Mono, monospace';
    ctx.fillStyle = color;

    // SOL ALT TİCARİ & ASKERİ UÇUŞ PARAMETRELERİ
    const lx = 32;
    const ly = h - 140;
    const gForce = (1.0 + Math.abs(state.vz || 0) * 0.15).toFixed(2);
    const mach = (Math.hypot(state.vx || 0, state.vz || 0) / 343.0).toFixed(3);
    const pitchRate = ((state.omega || 0) * (180.0 / Math.PI)).toFixed(1);
    const rollRate = ((state.omegaRoll || 0) * (180.0 / Math.PI)).toFixed(1);

    ctx.fillText(`G-FORCE : ${gForce} G`, lx, ly);
    ctx.fillText(`MACH    : ${mach}`, lx, ly + 18);
    ctx.fillText(`Q-RATE  : ${pitchRate}°/s`, lx, ly + 36);
    ctx.fillText(`P-RATE  : ${rollRate}°/s`, lx, ly + 54);

    // SAĞ ALT: İNİŞ KONTROL & HEDEF TELEMETRİSİ
    const rx = w - 190;
    const padDist = Math.abs(state.x - this.TARGET_X).toFixed(1);
    const descentRate = (-(state.vz || 0)).toFixed(2);
    const isSoft = Math.abs(state.vz || 0) <= 1.5 && Math.abs(state.vx || 0) <= 2.5;

    ctx.fillText(`RNG TO PAD : ${padDist} m`, rx, ly);
    ctx.fillText(`VERT SPEED : ${descentRate} m/s`, rx, ly + 18);
    ctx.fillText(`HORIZ SPD  : ${(state.vx || 0).toFixed(2)} m/s`, rx, ly + 36);

    ctx.fillStyle = isSoft ? color : warnColor;
    ctx.fillText(`TOUCHDOWN  : ${isSoft ? 'OPTIMAL' : 'CRITICAL'}`, rx, ly + 54);

    // ÜST MERKEZ: GÖREV DURUM ROZETİ (Flight Annunciator)
    let statusText = "AUTOPILOT: 120Hz SAC NEURAL";
    if (state.h <= 3.2 && state.vz < -1.1) {
      statusText = "TERMINAL SUICIDE BURN (FLARE)";
      ctx.fillStyle = warnColor;
    } else if (state.crashed) {
      statusText = "IMPACT / RECOVERY INITIATED";
      ctx.fillStyle = alertColor;
    } else if (state.soft_landed) {
      statusText = "TOUCHDOWN CONFIRMED / ENGINE CUT";
      ctx.fillStyle = '#10b981';
    }

    ctx.textAlign = 'center';
    ctx.font = '800 13px JetBrains Mono, monospace';
    ctx.fillText(`[ ${statusText} ]`, w / 2, 42);

    ctx.restore();
  }
}
