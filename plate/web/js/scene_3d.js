/* =========================================================================
   THREE.JS 3D SAHNE & HESAPLANMIŞ KUSURSUZ KOMPOZİSYON
   ========================================================================= */

export function initScene3D({ THREE, threeCanvas, monitorTexture, CANVAS_WIDTH, CANVAS_HEIGHT }) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020408, 0.14);

  const camera = new THREE.PerspectiveCamera(34, CANVAS_WIDTH / CANVAS_HEIGHT, 0.01, 30);
  camera.position.set(0.0, 0.02, 1.32);
  camera.lookAt(new THREE.Vector3(0.0, -0.35, -0.05));

  const renderer = new THREE.WebGLRenderer({
    canvas: threeCanvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT, false);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(new THREE.AmbientLight(0xffffff, 0.95));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(0.9, 2.2, 1.2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.55);
  fillLight.position.set(-1.0, 0.8, -0.3);
  scene.add(fillLight);

  // 1. Masa
  const tableMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 0.80, 0.04, 48),
    new THREE.MeshStandardMaterial({ color: 0x060912, roughness: 0.7, metalness: 0.2 })
  );
  tableMesh.position.set(0.0, -0.72, 0.08);
  tableMesh.receiveShadow = true;
  scene.add(tableMesh);

  // 2. 3D Monitör
  const monitorGroup = new THREE.Group();
  monitorGroup.position.set(0.0, -0.28, -0.38);
  monitorGroup.rotation.x = 0.04;
  scene.add(monitorGroup);

  const monW = 0.58, monH = 0.326, monD = 0.02;
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.85 });
  const monBezel = new THREE.Mesh(new THREE.BoxGeometry(monW, monH, monD), bezelMat);
  monBezel.castShadow = true;
  monitorGroup.add(monBezel);

  const monScreenGeo = new THREE.PlaneGeometry(monW - 0.016, monH - 0.016);
  const monScreenMat = new THREE.MeshBasicMaterial({ map: monitorTexture });
  const monScreenMesh = new THREE.Mesh(monScreenGeo, monScreenMat);
  monScreenMesh.position.z = monD / 2 + 0.001;
  monitorGroup.add(monScreenMesh);

  const monPoleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.8 });
  const monPole = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.46, 0.038), monPoleMat);
  monPole.position.set(0, -0.25, -0.01);
  monPole.castShadow = true;
  monitorGroup.add(monPole);

  // 3. Eğilen 3D Dairesel (Köşesiz) Plaka
  const plateGroup = new THREE.Group();
  plateGroup.position.set(0.0, -0.42, 0.08);
  scene.add(plateGroup);

  function createCircularPlateTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = 1024; cvs.height = 1024;
    const ctx = cvs.getContext('2d');

    // Dairesel Arka Plan
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(512, 512, 508, 0, Math.PI * 2);
    ctx.fill();

    // Konsantrik Polar Rehber Halkaları
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 4;
    const radii = [100, 200, 300, 400, 480];
    radii.forEach(r => {
      ctx.beginPath();
      ctx.arc(512, 512, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // İnce Eksen Çapraz Çizgileri
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(512, 24); ctx.lineTo(512, 1000); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(24, 512); ctx.lineTo(1000, 512); ctx.stroke();

    // Dış Çerçeve Çemberi
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(512, 512, 500, 0, Math.PI * 2);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(cvs);
    tex.anisotropy = 8;
    return tex;
  }

  // Köşesiz Dairesel Plaka Meshi (Radius: 0.148m, Height: 0.008m, 64 Dilim)
  const plateMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.148, 0.148, 0.008, 64),
    [
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9, roughness: 0.2 }), // Kenar yüzeyi
      new THREE.MeshStandardMaterial({
        map: createCircularPlateTexture(),
        color: 0xffffff,
        roughness: 0.25,
        metalness: 0.1
      }), // Üst dairesel yüzey
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.4 })  // Alt yüzey
    ]
  );
  plateMesh.castShadow = true;
  plateMesh.receiveShadow = true;
  plateGroup.add(plateMesh);

  // 3.1 Dairesel (Köşesiz) Elastik Kenar Bariyeri (Smooth Torus Rim)
  const bumperGroup = new THREE.Group();
  const bumperMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.2,
    metalness: 0.8,
    transparent: true,
    opacity: 0.88
  });

  const bumperTorus = new THREE.Mesh(
    new THREE.TorusGeometry(0.148, 0.0055, 16, 64),
    bumperMat
  );
  bumperTorus.rotation.x = Math.PI / 2;
  bumperTorus.position.y = 0.005;
  bumperGroup.add(bumperTorus);

  plateGroup.add(bumperGroup);

  // Mavi Konsantrik Hedef Halkası
  const targetRing = new THREE.Mesh(
    new THREE.RingGeometry(0.014, 0.024, 32),
    new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.DoubleSide })
  );
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.y = 0.0045;
  plateGroup.add(targetRing);

  const targetCenterDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.007, 24),
    new THREE.MeshBasicMaterial({ color: 0x1d4ed8, side: THREE.DoubleSide })
  );
  targetCenterDot.rotation.x = -Math.PI / 2;
  targetCenterDot.position.y = 0.0046;
  plateGroup.add(targetCenterDot);

  // 4. Top
  function createReelBallTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = 512; cvs.height = 256;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = '#f97316'; ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#ffffff'; ctx.beginPath();
    ctx.arc(256, 128, 54, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ea580c'; ctx.beginPath();
    ctx.arc(256, 128, 28, 0, Math.PI * 2); ctx.fill();
    return new THREE.CanvasTexture(cvs);
  }

  const ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 32, 32),
    new THREE.MeshStandardMaterial({ map: createReelBallTexture(), roughness: 0.25, metalness: 0.15 })
  );
  ballMesh.castShadow = true;
  scene.add(ballMesh);

  // 5. Top Temas Gölgesi
  function createContactShadowTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = 128; cvs.height = 128;
    const ctx = cvs.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    grad.addColorStop(0.0, 'rgba(0, 0, 0, 0.75)');
    grad.addColorStop(0.35, 'rgba(0, 0, 0, 0.40)');
    grad.addColorStop(0.70, 'rgba(0, 0, 0, 0.12)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cvs);
  }

  const ballShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.046, 0.046),
    new THREE.MeshBasicMaterial({ 
      map: createContactShadowTexture(), 
      transparent: true, 
      opacity: 0.65, 
      depthWrite: false 
    })
  );
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.position.y = 0.0042;
  plateGroup.add(ballShadow);

  // 6. Plaka Altı Mekanik Pivot & Servo İtici Kollar
  const pivotBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.020, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.95, roughness: 0.15 })
  );
  pivotBall.position.set(0.0, -0.42, 0.08);
  scene.add(pivotBall);

  const pivotStand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.024, 0.30, 24),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.4 })
  );
  pivotStand.position.set(0.0, -0.57, 0.08);
  scene.add(pivotStand);

  const rodX = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0045, 0.0045, 0.30, 16),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 })
  );
  scene.add(rodX);

  const rodY = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0045, 0.0045, 0.30, 16),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 })
  );
  scene.add(rodY);

  // 7. Kamera Kolu (Boom Arm)
  const boomGroup = new THREE.Group();
  const boomMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.8 });

  const boomPole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.32, 24), boomMat);
  boomPole.position.set(0.25, -0.48, 0.12);
  boomPole.castShadow = true;
  boomGroup.add(boomPole);

  const boomArm = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.15, 24), boomMat);
  boomArm.rotation.z = Math.PI / 2;
  boomArm.position.set(0.18, -0.34, 0.12);
  boomGroup.add(boomArm);

  const camHead = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.024, 0.034), boomMat);
  camHead.position.set(0.10, -0.345, 0.12);
  boomGroup.add(camHead);

  const greenLed = new THREE.Mesh(
    new THREE.SphereGeometry(0.0035, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x10b981 })
  );
  greenLed.position.set(0.116, -0.34, 0.135);
  boomGroup.add(greenLed);

  scene.add(boomGroup);

  const ballOrientation = new THREE.Quaternion();

  // Mekanik bağlantı güncelleme (servo kollar)
  function updateMechanicalLinkage(tiltX, tiltY) {
    plateGroup.rotation.z = -tiltX;
    plateGroup.rotation.x = tiltY;

    const attachX = new THREE.Vector3(-0.11, -0.004, 0).applyEuler(plateGroup.rotation).add(plateGroup.position);
    const baseX = new THREE.Vector3(-0.11, -0.68, 0.08);
    rodX.position.copy(attachX).add(baseX).multiplyScalar(0.5);
    rodX.scale.set(1, attachX.distanceTo(baseX) / 0.30, 1);
    rodX.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), attachX.clone().sub(baseX).normalize());

    const attachY = new THREE.Vector3(0, -0.004, 0.11).applyEuler(plateGroup.rotation).add(plateGroup.position);
    const baseY = new THREE.Vector3(0.0, -0.68, 0.19);
    rodY.position.copy(attachY).add(baseY).multiplyScalar(0.5);
    rodY.scale.set(1, attachY.distanceTo(baseY) / 0.30, 1);
    rodY.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), attachY.clone().sub(baseY).normalize());
  }

  // Kamera sarsıntı (Trauma Shake) değişkenleri
  let trauma = 0.0;
  const camBasePos = new THREE.Vector3(0.0, 0.02, 1.32);

  function triggerCameraTrauma(amount = 0.3) {
    trauma = Math.min(1.0, trauma + amount);
  }

  function updateCameraShake(dt = 0.016) {
    if (trauma > 0.001) {
      trauma = Math.max(0, trauma - dt * 3.2);
      const shake = trauma * trauma;
      camera.position.x = camBasePos.x + (Math.random() - 0.5) * shake * 0.032;
      camera.position.y = camBasePos.y + (Math.random() - 0.5) * shake * 0.032;
    } else {
      camera.position.x = camBasePos.x;
      camera.position.y = camBasePos.y;
    }
  }

  function setTargetPose(tx, ty) {
    targetRing.position.set(tx, 0.0045, ty);
    targetCenterDot.position.set(tx, 0.0046, ty);
  }

  function setBumperVisible(visible) {
    bumperGroup.visible = visible;
  }

  // Top konumu ve yuvarlanma oryantasyonu (120Hz hassas)
  function updateBallPose(frame, dt = 1.0 / 120.0) {
    const ballR = 0.018;
    const bHeight = frame.ball_height !== undefined ? frame.ball_height : 0.0;

    if (frame.state === 'held' || frame.state === 'falling') {
      // Top 3D Havada Tutuluyor veya Serbest Düşüyor
      const ballLocal = new THREE.Vector3(frame.ball_x, ballR + 0.004 + bHeight, frame.ball_y);
      const ballWorld = ballLocal.applyEuler(plateGroup.rotation).add(plateGroup.position);
      ballMesh.position.copy(ballWorld);

      const rDist = Math.hypot(frame.ball_x, frame.ball_y);
      const isOffPlate = rDist > 0.155;
      ballShadow.visible = !isOffPlate;
      if (!isOffPlate) {
        ballShadow.position.x = frame.ball_x;
        ballShadow.position.z = frame.ball_y;
        const shadowFade = Math.max(0.06, 0.60 / (1.0 + bHeight * 6.5));
        ballShadow.material.opacity = shadowFade;
        const sScale = Math.min(2.4, 1.0 + bHeight * 2.2);
        ballShadow.scale.set(sScale, sScale, sScale);
      }
    } else if (frame.state === 'respawning') {
      const dropLocal = new THREE.Vector3(frame.ball_x, ballR + 0.004 + bHeight, frame.ball_y);
      const dropWorld = dropLocal.applyEuler(plateGroup.rotation).add(plateGroup.position);
      ballMesh.position.copy(dropWorld);

      ballShadow.visible = true;
      ballShadow.position.x = frame.ball_x;
      ballShadow.position.z = frame.ball_y;
      ballShadow.material.opacity = Math.max(0.1, 0.55 - bHeight * 2.5);
    } else {
      const ballLocal = new THREE.Vector3(frame.ball_x, ballR + 0.004, frame.ball_y);
      const ballWorld = ballLocal.clone().applyEuler(plateGroup.rotation).add(plateGroup.position);
      ballMesh.position.copy(ballWorld);

      ballShadow.visible = true;
      ballShadow.position.x = frame.ball_x;
      ballShadow.position.z = frame.ball_y;
      ballShadow.material.opacity = 0.55;
      ballShadow.scale.set(1.0, 1.0, 1.0);

      // Newton-Euler kaymasız 120Hz yuvarlanma açısı
      const rollAxisLocal = new THREE.Vector3(frame.vy, 0, -frame.vx);
      const rollSpeed = rollAxisLocal.length();
      if (rollSpeed > 0.0001) {
        const rollMag = (rollSpeed * dt) / ballR;
        rollAxisLocal.normalize();
        const rollAxisWorld = rollAxisLocal.clone().applyEuler(plateGroup.rotation);
        const deltaQ = new THREE.Quaternion().setFromAxisAngle(rollAxisWorld, rollMag);
        ballOrientation.premultiply(deltaQ);
        ballMesh.quaternion.copy(ballOrientation);
      }
    }
  }

  return {
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
  };
}
