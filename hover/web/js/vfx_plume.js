/* =========================================================================
   GERÇEK FİZİKSEL NAVIER-STOKES ROKET PLUME VE ZEMİN ETKİLEŞİMİ (PSI)
   ========================================================================= */

export function initPlumeVFX({ THREE, scene, camera, GROUND_Z }) {
  // 1. Organik Çok Katmanlı Fraktal Duman Pufu Dokusu
  function createOrganicSmokeTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = 128; cvs.height = 128;
    const ctx = cvs.getContext('2d');
    const cx = 64, cy = 64, maxR = 60;
    const imgData = ctx.createImageData(128, 128);
    const data = imgData.data;

    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const dx = x - cx, dy = y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r >= maxR) continue;

        const normR = r / maxR;
        // Süper yumuşak kübik sönüm (sınırda tam 0.0, asla keskin kenar yok!)
        const polyFalloff = Math.pow(Math.max(0.0, 1.0 - normR * normR), 2.2);

        // 3 Harmonik fraktal türbülans dalgaları
        const ang = Math.atan2(dy, dx);
        const turb = 0.72 + 0.18 * Math.sin(ang * 4.0 + normR * 6.0) +
                            0.10 * Math.sin(ang * 7.0 - normR * 9.0);

        const alpha = Math.min(255, Math.max(0, Math.floor(polyFalloff * turb * 255)));
        const idx = (y * 128 + x) * 4;
        // Hafif sıcak kül grisi / duman tonu (RGB: 218, 226, 236)
        data[idx] = 218;
        data[idx + 1] = 226;
        data[idx + 2] = 236;
        data[idx + 3] = alpha;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return new THREE.CanvasTexture(cvs);
  }

  // 2. Tarmac Üzerinde Genişleyen Yatay Şok Halka Dalgası Dokusu (Ground Wall-Jet Sheet)
  function createGroundShockTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = 128; cvs.height = 128;
    const ctx = cvs.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 62);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
    grad.addColorStop(0.35, 'rgba(235, 245, 255, 0.55)');
    grad.addColorStop(0.65, 'rgba(200, 220, 245, 0.35)');
    grad.addColorStop(0.92, 'rgba(170, 195, 230, 0.08)');
    grad.addColorStop(1.0, 'rgba(170, 195, 230, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cvs);
  }

  const smokeTexture = createOrganicSmokeTexture();
  const shockTexture = createGroundShockTexture();

  // KATMAN 1: Tarmac Yüzeyinde Radyal Yayılan Yatay Şok Diskleri (Ground Shock Sheets)
  const SHOCK_POOL_SIZE = 16;
  const shockRingGeo = new THREE.PlaneGeometry(1.0, 1.0);
  shockRingGeo.rotateX(-Math.PI / 2); // XZ düzlemine tam paralel!
  const shockMat = new THREE.MeshBasicMaterial({
    map: shockTexture,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const groundShocks = [];
  for (let i = 0; i < SHOCK_POOL_SIZE; i++) {
    const m = new THREE.Mesh(shockRingGeo, shockMat.clone());
    m.position.set(0, -999, 0);
    scene.add(m);
    groundShocks.push({ mesh: m, life: 0.0, maxLife: 0.65, speed: 0.0, baseScale: 1.0 });
  }

  // KATMAN 2: Hacimsel Girdap Pufu Parçacıkları (Vortex Ring Roll-up & Thermal Plume)
  const PUFF_POOL_SIZE = 80;
  const puffGeo = new THREE.PlaneGeometry(1.0, 1.0);
  const puffMat = new THREE.MeshBasicMaterial({
    map: smokeTexture,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.NormalBlending
  });
  const vortexPuffs = [];
  for (let i = 0; i < PUFF_POOL_SIZE; i++) {
    const m = new THREE.Mesh(puffGeo, puffMat.clone());
    m.position.set(0, -999, 0);
    scene.add(m);
    vortexPuffs.push({
      mesh: m,
      life: 0.0,
      maxLife: 1.2,
      vx: 0.0,
      vy: 0.0,
      vz: 0.0,
      rot: Math.random() * Math.PI * 2,
      rotSpd: (Math.random() - 0.5) * 1.8,
      baseScale: 1.0
    });
  }

  // KATMAN 3: Yüksek Hızlı Pnömatik Yoğuşma & Zemin Mikro-Ejektası (Cold-Gas Blast Ice & Dust)
  const SPARK_POOL_SIZE = 36;
  const sparkGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const sparkMat = new THREE.MeshBasicMaterial({
    color: 0xdbeafe,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending
  });
  const blastSparks = [];
  for (let i = 0; i < SPARK_POOL_SIZE; i++) {
    const sm = new THREE.Mesh(sparkGeo, sparkMat.clone());
    sm.position.set(0, -999, 0);
    scene.add(sm);
    blastSparks.push({ mesh: sm, life: 0.0, maxLife: 0.45, vx: 0.0, vy: 0.0, vz: 0.0 });
  }

  // Fiziksel İtki Plume Tetikleme (Her Nozul İçin Bireysel Zemin Çarpışması)
  function triggerPlumeImpact(worldX, worldY, worldZ, thrustPct) {
    const h = Math.max(0.0, worldY - GROUND_Z);
    if (h > 6.2 || thrustPct < 0.05) return;

    // Zemin Yakınlık ve İtki Şiddeti Faktörü (Impression Pressure)
    const groundFactor = Math.exp(-h / 1.6);
    const intensity = thrustPct * groundFactor;
    if (intensity < 0.04) return;

    // 1. Yatay Şok Dalgası Püskürt
    if (Math.random() < 0.35 + intensity * 0.45) {
      for (let i = 0; i < groundShocks.length; i++) {
        const s = groundShocks[i];
        if (s.life <= 0.0) {
          s.life = 0.55 + Math.random() * 0.25;
          s.maxLife = s.life;
          s.mesh.position.set(worldX, 0.035, worldZ);
          s.speed = (10.0 + 16.0 * intensity);
          s.baseScale = 0.6 + Math.random() * 0.5;
          break;
        }
      }
    }

    // 2. Girdaplı Hacimsel Duman Pufu Üret
    const puffSpawnCount = Math.floor(1 + 3.0 * intensity);
    for (let k = 0; k < puffSpawnCount; k++) {
      for (let i = 0; i < vortexPuffs.length; i++) {
        const p = vortexPuffs[i];
        if (p.life <= 0.0) {
          const maxL = 0.85 + Math.random() * 0.55;
          p.life = maxL;
          p.maxLife = maxL;

          const ang = Math.random() * Math.PI * 2;
          const rInit = 0.2 + Math.random() * 0.6;
          p.mesh.position.set(
            worldX + Math.cos(ang) * rInit,
            0.25 + Math.random() * 0.2,
            worldZ + Math.sin(ang) * rInit
          );

          // Navier-Stokes Radyal Duvar Jeti Hız Vektörü
          const vBlast = (9.0 + 15.0 * intensity) * (0.8 + Math.random() * 0.4);
          p.vx = Math.cos(ang) * vBlast;
          p.vz = Math.sin(ang) * vBlast;
          // Başlangıç dikey sıçrama hızı
          p.vy = 0.3 + Math.random() * 0.6;

          p.baseScale = 0.7 + Math.random() * 0.6;
          p.rot = Math.random() * Math.PI * 2;
          p.rotSpd = (Math.random() - 0.5) * 2.2;
          break;
        }
      }
    }

    // 3. Sıcak Balistik Kıvılcımlar
    if (intensity > 0.25) {
      for (let i = 0; i < blastSparks.length; i++) {
        const sp = blastSparks[i];
        if (sp.life <= 0.0) {
          sp.life = 0.22 + Math.random() * 0.22;
          sp.maxLife = sp.life;
          sp.mesh.position.set(worldX, 0.08, worldZ);
          const ang = Math.random() * Math.PI * 2;
          const sSpeed = 16.0 + Math.random() * 14.0;
          sp.vx = Math.cos(ang) * sSpeed;
          sp.vz = Math.sin(ang) * sSpeed;
          sp.vy = 2.0 + Math.random() * 4.0;
          break;
        }
      }
    }
  }

  // Navier-Stokes Akışkan Parçacık Fizik Entegratörü
  function updateFluidPlumeSimulation(dt) {
    // 1. Yatay Şok Disklerini Güncelle
    groundShocks.forEach(s => {
      if (s.life > 0.0) {
        s.life -= dt;
        const prog = Math.max(0.0, Math.min(1.0, 1.0 - s.life / s.maxLife));
        const scale = s.baseScale + s.speed * prog * 0.28;
        s.mesh.scale.set(scale, scale, scale);
        const alpha = Math.sin(prog * Math.PI) * (1.0 - prog * 0.7);
        s.mesh.material.opacity = Math.max(0.0, alpha * 0.48);
      } else {
        s.mesh.position.y = -999;
        s.mesh.material.opacity = 0.0;
      }
    });

    // 2. Hacimsel Girdap Purlarını Güncelle
    vortexPuffs.forEach(p => {
      if (p.life > 0.0) {
        p.life -= dt;
        const prog = Math.max(0.0, Math.min(1.0, 1.0 - p.life / p.maxLife));

        // A) Aerodinamik Hava Direnci (Stokes Viscous Drag)
        p.vx *= Math.exp(-3.4 * dt);
        p.vz *= Math.exp(-3.4 * dt);

        // B) Kelvin-Helmholtz Girdabı ve Termal Kaldırma Kuvveti
        const buoyancy = 2.4 * Math.exp(-prog * 1.5);
        p.vy += (buoyancy - 1.2 * p.vy) * dt;

        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;

        // C) Yere Gömülmeyi Kesinlikle Önle (No Floor Intersection Bug!)
        const curScale = p.baseScale * (1.0 + 2.5 * Math.sqrt(prog));
        const minSafeY = curScale * 0.38 + 0.05;
        if (p.mesh.position.y < minSafeY) {
          p.mesh.position.y = minSafeY;
          p.vy = Math.max(0.1, p.vy * 0.5);
        }

        // D) 3D Billboard ve İçsel Türbülans Dönmesi
        p.mesh.quaternion.copy(camera.quaternion);
        p.rot += p.rotSpd * dt;
        p.mesh.rotateZ(p.rot);
        p.mesh.scale.set(curScale, curScale, curScale);

        // E) Pürüzsüz Organik Saydamlık Eğrisi
        const alphaCurve = Math.sin(prog * Math.PI) * (1.0 - prog * 0.35);
        p.mesh.material.opacity = Math.max(0.0, alphaCurve * 0.44);
      } else {
        p.mesh.position.y = -999;
        p.mesh.material.opacity = 0.0;
      }
    });

    // 3. Balistik Kıvılcımları Güncelle
    blastSparks.forEach(sp => {
      if (sp.life > 0.0) {
        sp.life -= dt;
        const prog = Math.max(0.0, Math.min(1.0, 1.0 - sp.life / sp.maxLife));
        sp.vy -= 9.81 * dt; // Yerçekimi
        sp.mesh.position.x += sp.vx * dt;
        sp.mesh.position.y += sp.vy * dt;
        sp.mesh.position.z += sp.vz * dt;

        // Zemin Sekmesi
        if (sp.mesh.position.y < 0.03) {
          sp.mesh.position.y = 0.03;
          sp.vy = -sp.vy * 0.42;
          sp.vx *= 0.75;
          sp.vz *= 0.75;
        }

        sp.mesh.material.opacity = Math.max(0.0, (1.0 - prog) * 0.95);
      } else {
        sp.mesh.position.y = -999;
        sp.mesh.material.opacity = 0.0;
      }
    });
  }

  return {
    triggerPlumeImpact,
    updateFluidPlumeSimulation
  };
}
