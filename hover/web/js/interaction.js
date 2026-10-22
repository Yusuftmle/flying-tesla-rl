/* =========================================================================
   MOUSE DRAG & FLING (İNTERAKTİF TIKLA & FIRLAT SİSTEMİ)
   ========================================================================= */

export function initMouseInteraction({
  canvas,
  THREE,
  scene,
  camera,
  controls,
  vehicleGroup,
  rampSys,
  arenaState,
  getMode,
  playRocketIgnite,
  initAudio,
  showToast,
  getCurrentLang,
  GROUND_Z,
  resetArenaAccumulator,
  getRampClimbTForPos
}) {
  const dragRaycaster = new THREE.Raycaster();
  const dragMouseNDC = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.0); // Z=0 Dikey Düzlem
  const dragPlaneHit = new THREE.Vector3();
  let isDraggingCar = false;
  let dragTrackHistory = [];

  // Fırlatma Yayı / İp Görseli (Slingshot Aim Vector)
  const slingMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9, linewidth: 3 });
  const slingGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const slingLine = new THREE.Line(slingGeo, slingMat);
  slingLine.visible = false;
  scene.add(slingLine);

  canvas.addEventListener('pointerdown', (e) => {
    if (getMode() !== 'arena') return;
    dragMouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    dragMouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    dragRaycaster.setFromCamera(dragMouseNDC, camera);

    if (dragRaycaster.ray.intersectPlane(dragPlane, dragPlaneHit)) {
      const carPos = vehicleGroup.position;
      const dist = Math.hypot(dragPlaneHit.x - carPos.x, dragPlaneHit.y - carPos.y);
      if (dist < 6.0) {
        isDraggingCar = true;
        controls.enabled = false;
        dragTrackHistory = [{ x: dragPlaneHit.x, y: dragPlaneHit.y, t: performance.now() }];
        slingLine.visible = true;
        arenaState.climbingRamp = false;
        arenaState.terminal = true; // Sürüklerken simülasyonu duraklat

        // Arabayı elde tutarken hızları sıfırla, dik tut
        arenaState.vx = 0.0;
        arenaState.vz = 0.0;
        arenaState.omega = 0.0;
        arenaState.omegaRoll = 0.0;
        arenaState.theta = 0.0;
        arenaState.roll = 0.0;
        arenaState.thrusters = [0, 0, 0, 0];
        arenaState.rcs = [0, 0, 0, 0];
      }
    }
  });

  window.addEventListener('pointermove', (e) => {
    dragMouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    dragMouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    if (!isDraggingCar) return;

    dragRaycaster.setFromCamera(dragMouseNDC, camera);
    if (dragRaycaster.ray.intersectPlane(dragPlane, dragPlaneHit)) {
      let posX = dragPlaneHit.x;
      let posZ = Math.max(GROUND_Z + 0.35, dragPlaneHit.y);

      // 1. İskele Kulesi Bounding Box Engeli (X: 13.6 - 18.3, Z <= 30.6)
      if (posX >= 13.6 && posX <= 18.3 && posZ <= 30.6) {
        if (posZ > 28.5) posZ = 30.65;
        else if (posX < 15.8) posX = 13.55;
        else posX = 18.35;
      }

      // 2. Dairesel C-Loop Rampa Katı Duvar Engeli (Merkez 0, 14.7, Yarıçap 14.0)
      const ddx = posX - 0.0;
      const ddz = posZ - 14.7;
      const dd = Math.hypot(ddx, ddz);
      let dbeta = Math.atan2(ddx, -ddz);
      if (dbeta < 0.0) dbeta += 2.0 * Math.PI;

      if (dbeta >= 0.0 && dbeta <= 3.44) {
        // Rampa duvar kalınlığı: 13.20m ila 14.85m arası KATI çelik gövdedir
        if (dd > 13.20 && dd < 14.85) {
          if (dd < 14.0) {
            // İç tarafa yakınsa iç sürüş yüzeyine yapıştır
            posX = (ddx / dd) * 13.20;
            posZ = 14.7 + (ddz / dd) * 13.20;
          } else {
            // Dış tarafa yakınsa dış zırh yüzeyine yapıştır
            posX = (ddx / dd) * 14.90;
            posZ = 14.7 + (ddz / dd) * 14.90;
          }
        }
      }

      arenaState.x = posX;
      arenaState.z = posZ;
      arenaState.vx = 0.0;
      arenaState.vz = 0.0;
      arenaState.theta = 0.0;
      arenaState.roll = 0.0;
      vehicleGroup.position.set(posX, posZ, 0.0);
      vehicleGroup.rotation.set(0, 0, 0);

      const now = performance.now();
      dragTrackHistory.push({ x: posX, y: posZ, t: now });
      while (dragTrackHistory.length > 2 && (now - dragTrackHistory[0].t) > 130) {
        dragTrackHistory.shift();
      }

      // Fırlatma yönü vektör çizgisi
      const p0 = new THREE.Vector3(posX, posZ, 0.0);
      const first = dragTrackHistory[0];
      const dx = (posX - first.x) * 1.8;
      const dy = (posZ - first.y) * 1.8;
      const p1 = new THREE.Vector3(posX + dx, posZ + dy, 0.0);
      slingLine.geometry.setFromPoints([p0, p1]);
    }
  });

  window.addEventListener('pointerup', () => {
    if (!isDraggingCar) return;
    isDraggingCar = false;
    controls.enabled = true;
    slingLine.visible = false;

    const now = performance.now();
    let vx = 0.0, vz = 0.0;
    if (dragTrackHistory.length >= 2) {
      const last = dragTrackHistory[dragTrackHistory.length - 1];
      const first = dragTrackHistory[0];
      const dt = Math.max(0.03, (last.t - first.t) * 0.001);
      if ((now - last.t) < 120) { // Sadece aktif savurma anında hız ver
        vx = (last.x - first.x) / dt;
        vz = (last.y - first.y) / dt;
      }
    }

    arenaState.vx = Math.max(-45.0, Math.min(45.0, vx * 1.25));
    arenaState.vz = Math.max(-35.0, Math.min(35.0, vz * 1.25));

    const currentLang = getCurrentLang();

    arenaState.climbingRamp = false;

    if (Math.hypot(vx, vz) < 1.5) {
      // Kullanıcı sadece havada bıraktıysa sakin dik tutarak süzül
      arenaState.vx = 0.0;
      arenaState.vz = 0.0;
      arenaState.omega = 0.0;
      arenaState.omegaRoll = 0.0;
      arenaState.theta = 0.0;
      arenaState.roll = 0.0;
      arenaState.fepState = 'nominal';
      showToast(currentLang === 'tr' ? 'Serbest Bırakıldı: Otopilot Devrede' : 'Free Release: Autopilot Engaged');
    } else {
      // Kullanıcı havada serbest savurdu:
      const flingVx = (vx < -1.0) ? Math.min(-20.0, vx * 1.8) : vx * 1.25;
      arenaState.vx = Math.max(-45.0, Math.min(45.0, flingVx));
      arenaState.vz = Math.max(-35.0, Math.min(35.0, vz * 1.25));
      arenaState.theta = Math.atan2(arenaState.vx, Math.max(8.0, arenaState.vz)) * 0.22;
      arenaState.omega = arenaState.vx * 0.03 + (Math.random() - 0.5) * 1.2;
      arenaState.omegaRoll = (Math.random() - 0.5) * 1.5;
      arenaState.fepState = 'nominal';
      showToast(currentLang === 'tr' ? 'Araç Fırlatıldı: Otopilot Devrede' : 'Vehicle Launched: Autopilot Engaged');
    }

    arenaState.terminal = false;
    arenaState.softLanded = false;
    arenaState.crashed = false;
    arenaState.fuelMass = 45.0;
    arenaState.mass = 1845.0;
    resetArenaAccumulator();
    playRocketIgnite(0.85);
    initAudio();
  });

  return {
    isDragging: () => isDraggingCar
  };
}
