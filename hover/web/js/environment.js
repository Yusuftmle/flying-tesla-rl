/* =========================================================================
   THREE.JS SAHNE, KAMERA, POST-PROCESSING & ÇEVRESEL ELEMANLAR
   ========================================================================= */

export function initEnvironment({ canvas, THREE, rampSys, TARGET_X, showToast }) {
  let screenW = window.innerWidth;
  let screenH = window.innerHeight;

  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(screenW, screenH);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020612);
  scene.fog = new THREE.FogExp2(0x020612, 0.007);

  // Geniş Açılı Masaüstü Perspektif Kamerası (C-Loop ve Uçuş Pistini Tam Kapsar)
  const camera = new THREE.PerspectiveCamera(45, screenW / screenH, 0.5, 450);
  camera.position.set(-24.0, 26.0, 78.0);
  camera.lookAt(-28.0, 14.0, 0.0);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(-28.0, 14.0, 0.0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI / 2 + 0.02;
  controls.minDistance = 12.0;
  controls.maxDistance = 180.0;

  // -------------------------------------------------------------------------
  // POST-PROCESSING (ZARİF & DENGELİ BLOOM)
  // -------------------------------------------------------------------------
  let composer = null;
  let bloomPass = null;
  if (THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass) {
    const renderScene = new THREE.RenderPass(scene, camera);
    bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(screenW, screenH),
      0.40, // bloom strength
      0.20, // bloom radius
      0.88  // bloom threshold
    );
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
  }

  // Kamera Sarsıntısı (Trauma Tabanlı Gerçekçi İtki / Çarpışma Titreşimi)
  let cameraTrauma = 0.0;
  function addCameraTrauma(amount) {
    cameraTrauma = Math.min(1.0, cameraTrauma + amount);
  }

  function getCameraTrauma() {
    return cameraTrauma;
  }

  function decayCameraTrauma(dt) {
    cameraTrauma = Math.max(0.0, cameraTrauma - dt * 2.2);
  }

  function resetCameraView() {
    camera.position.set(-24.0, 26.0, 78.0);
    controls.target.set(-28.0, 14.0, 0.0);
    controls.update();
    if (showToast) showToast('Kamera Pozisyonu Sıfırlandı');
  }

  // Aydınlatma: Karartılmış & Yüksek Kontrastlı Gece Test Sahası
  const ambLight = new THREE.AmbientLight(0x0f172a, 0.85);
  scene.add(ambLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.25);
  dirLight.position.set(25, 55, 30);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  scene.add(dirLight);

  const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.7);
  rimLight.position.set(-40, 22, -18);
  scene.add(rimLight);

  // İniş Bölgesi Projektörü (Target X = -62m)
  const padSpot = new THREE.SpotLight(0x38bdf8, 1.8, 45, Math.PI / 4, 0.35, 1.0);
  padSpot.position.set(TARGET_X, 22.0, 6.0);
  padSpot.target.position.set(TARGET_X, 0.0, 0.0);
  scene.add(padSpot);
  scene.add(padSpot.target);

  // Rampa Kulesi Projektörü (X = 16m)
  const towerLight = new THREE.PointLight(0x93c5fd, 1.3, 35, 1.2);
  towerLight.position.set(16.0, 20.0, 4.0);
  scene.add(towerLight);

  // Asfalt Zemin & Pist Çizgileri (Koyu Tarmac)
  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(350, 350),
    new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.1, color: 0x050914 })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // Pist Şerit Kaplaması (Runway Tarmac Strip: x=+20m'den x=-78m'ye kadar 105m kesintisiz pist)
  const runwayStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(105, 16),
    new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2, color: 0x0b1322 })
  );
  runwayStrip.rotation.x = -Math.PI / 2;
  runwayStrip.position.set(-28.0, 0.02, 0.0);
  scene.add(runwayStrip);

  // Pist Kesik Beyaz Orta Çizgisi
  for (let lx = 18; lx >= -75; lx -= 4.8) {
    const dash = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.35),
      new THREE.MeshBasicMaterial({ color: 0x94a3b8 })
    );
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(lx, 0.03, 0.0);
    scene.add(dash);
  }

  // Hedef İniş Bölgesi (Target X = -62.0m) - Bloom ile parlar
  const landingRing = new THREE.Mesh(
    new THREE.RingGeometry(2.5, 3.0, 48),
    new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0.95, toneMapped: false })
  );
  landingRing.rotation.x = -Math.PI / 2;
  landingRing.position.set(TARGET_X, 0.04, 0.0);
  scene.add(landingRing);

  const targetBullseye = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 1.0, 32),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.95, toneMapped: false })
  );
  targetBullseye.rotation.x = -Math.PI / 2;
  targetBullseye.position.set(TARGET_X, 0.045, 0.0);
  scene.add(targetBullseye);

  // İniş Pisti 4 Köşe Holografik İşaretçileri
  const padCorners = [
    { x: TARGET_X - 3.8, z: -3.8 },
    { x: TARGET_X + 3.8, z: -3.8 },
    { x: TARGET_X - 3.8, z: +3.8 },
    { x: TARGET_X + 3.8, z: +3.8 }
  ];
  padCorners.forEach(c => {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.12, 0.25),
      new THREE.MeshBasicMaterial({ color: 0x34d399, toneMapped: false })
    );
    b.position.set(c.x, 0.06, c.z);
    scene.add(b);
  });

  // Pist Kenarı LED Işıkları (Sol Pembe/Kırmızı, Sağ Neon Mavi - Bloom Uyumlu)
  const runwayLights = new THREE.Group();
  for (let rx = 18; rx >= -75; rx -= 3.5) {
    const bulbL = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff1e6d, toneMapped: false })
    );
    bulbL.position.set(rx, 0.12, -7.5);
    const bulbR = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, toneMapped: false })
    );
    bulbR.position.set(rx, 0.12, 7.5);
    runwayLights.add(bulbL, bulbR);
  }
  scene.add(runwayLights);

  // -------------------------------------------------------------------------
  // GERÇEKÇİ ÇELİK KAFES KULE & İÇBÜKEY C-LOOP FIRLATMA RAMPASI
  // -------------------------------------------------------------------------
  const rampGroup = rampSys.buildMesh(THREE, { width: 4.4 });
  scene.add(rampGroup);

  function buildRealisticScaffoldTower() {
    const g = new THREE.Group();
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.88, roughness: 0.28 });
    const barGeo = (len, r = 0.10) => new THREE.CylinderGeometry(r, r, len, 8);

    const tFront = 14.2, tBack = 17.8, tH = 30.0, zH = 2.8;
    const dx = tBack - tFront, dz = zH * 2.0;
    const diagSide = Math.sqrt(dx * dx + 3.5 * 3.5);
    const diagBack = Math.sqrt(dz * dz + 3.5 * 3.5);

    // 4 Dikey Ağır Çelik Kolon
    [
      [tFront, -zH], [tFront, zH],
      [tBack, -zH], [tBack, zH]
    ].forEach(([cx, cz]) => {
      const col = new THREE.Mesh(barGeo(tH, 0.24), trussMat);
      col.position.set(cx, tH / 2.0, cz);
      g.add(col);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 1.4), trussMat);
      base.position.set(cx, 0.3, cz);
      g.add(base);
    });

    // Yatay ve Çapraz Çelik Kafes Kirişleri
    for (let y = 3.5; y <= tH - 1.0; y += 3.5) {
      const h1 = new THREE.Mesh(barGeo(dz, 0.13), trussMat);
      h1.rotation.x = Math.PI / 2; h1.position.set(tFront, y, 0.0);
      const h2 = new THREE.Mesh(barGeo(dz, 0.13), trussMat);
      h2.rotation.x = Math.PI / 2; h2.position.set(tBack, y, 0.0);

      const h3 = new THREE.Mesh(barGeo(dx, 0.13), trussMat);
      h3.rotation.z = Math.PI / 2; h3.position.set((tFront + tBack) / 2.0, y, -zH);
      const h4 = new THREE.Mesh(barGeo(dx, 0.13), trussMat);
      h4.rotation.z = Math.PI / 2; h4.position.set((tFront + tBack) / 2.0, y, zH);
      g.add(h1, h2, h3, h4);

      const sDiag1 = new THREE.Mesh(barGeo(diagSide, 0.07), trussMat);
      sDiag1.rotation.z = Math.atan2(3.5, dx); sDiag1.position.set((tFront + tBack) / 2.0, y - 1.75, -zH);
      const sDiag2 = new THREE.Mesh(barGeo(diagSide, 0.07), trussMat);
      sDiag2.rotation.z = -Math.atan2(3.5, dx); sDiag2.position.set((tFront + tBack) / 2.0, y - 1.75, zH);
      g.add(sDiag1, sDiag2);

      const bDiag = new THREE.Mesh(barGeo(diagBack, 0.07), trussMat);
      bDiag.rotation.x = Math.atan2(3.5, dz); bDiag.position.set(tBack, y - 1.75, 0.0);
      g.add(bDiag);
    }

    // Kule Kolundan Rampanın Arkasına Uzanan Destek Kirişleri (Outriggers)
    [7.0, 14.7, 22.0, 28.5].forEach(hy => {
      [-2.0, 2.0].forEach(hz => {
        const strut = new THREE.Mesh(barGeo(2.8, 0.12), trussMat);
        strut.rotation.z = Math.PI / 2;
        strut.position.set(13.0, hy, hz);
        g.add(strut);
      });
    });

    // Rampanın Dış Yüzeyi Boyunca Uzanan Çift Çelik Omurga Kirişleri
    const underSpinePtsL = [];
    const underSpinePtsR = [];
    for (let s = 0; s <= rampSys.S; s += 0.5) {
      const pt = rampSys.surface(s);
      const xu = pt.x - 0.42 * pt.nx;
      const yu = pt.y - 0.42 * pt.ny;
      underSpinePtsL.push(new THREE.Vector3(xu, yu, -2.1));
      underSpinePtsR.push(new THREE.Vector3(xu, yu, 2.1));
    }
    const spineGeoL = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(underSpinePtsL), 72, 0.10, 8, false);
    const spineGeoR = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(underSpinePtsR), 72, 0.10, 8, false);
    g.add(new THREE.Mesh(spineGeoL, trussMat), new THREE.Mesh(spineGeoR, trussMat));

    return g;
  }
  scene.add(buildRealisticScaffoldTower());

  function onWindowResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (composer) {
      composer.setSize(w, h);
      if (bloomPass) bloomPass.resolution.set(w, h);
    }
  }

  return {
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
  };
}
