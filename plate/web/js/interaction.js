/* =========================================================================
   3D ELLE TOPU HAVAYA KALDIRMA & FIRLATMA SİSTEMİ (DIRECT 3D HAND GRAB)
   ========================================================================= */

export function initInteraction({
  THREE,
  masterCanvas,
  camera,
  plateGroup,
  getAppMode,
  arenaState,
  initAudio,
  showToast
}) {
  let isHolding = false;
  let dragStartClientY = 0;
  let dragStartHeight = 0.08;
  let lastPos = { x: 0, y: 0, z: 0, t: 0 };
  let tossVelocity = { vx: 0, vy: 0, vz: 0 };
  const raycaster = new THREE.Raycaster();

  function getPlateIntersection(e) {
    const rect = masterCanvas.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera({ x: mouseX, y: mouseY }, camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -plateGroup.position.y);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, hit)) {
      hit.sub(plateGroup.position);
      hit.applyQuaternion(plateGroup.quaternion.clone().invert());
      return { x: hit.x, y: hit.z };
    }
    return null;
  }

  masterCanvas.addEventListener('mousedown', (e) => {
    if (getAppMode() !== 'arena') return;
    initAudio();

    const p = getPlateIntersection(e);
    if (!p) return;

    // Topa yakınlığa bak veya doğrudan plakadan yakala
    const distToBall = Math.hypot(p.x - arenaState.x, p.y - arenaState.y);
    if (distToBall <= 0.09 || Math.hypot(p.x, p.y) <= 0.16) {
      isHolding = true;
      masterCanvas.style.cursor = 'grabbing';
      arenaState.state = 'held';

      // Topu elle yakala ve hemen havaya kaldır (min 7 cm)
      arenaState.x = p.x;
      arenaState.y = p.y;
      dragStartClientY = e.clientY;
      dragStartHeight = Math.max(0.07, arenaState.zHeight);
      arenaState.zHeight = dragStartHeight;
      arenaState.vx = 0;
      arenaState.vy = 0;
      arenaState.fallVy = 0;

      lastPos = { x: p.x, y: p.y, z: dragStartHeight, t: performance.now() };
      tossVelocity = { vx: 0, vy: 0, vz: 0 };
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (getAppMode() !== 'arena') return;
    const p = getPlateIntersection(e);

    // Hover İmleci
    if (!isHolding && p) {
      const distToBall = Math.hypot(p.x - arenaState.x, p.y - arenaState.y);
      masterCanvas.style.cursor = (distToBall <= 0.06) ? 'grab' : 'crosshair';
    }

    if (!isHolding) return;

    if (p) {
      const now = performance.now();
      const dt = Math.max(0.005, (now - lastPos.t) / 1000.0);

      // 1. Yatay (X, Y) Pozisyonunu İmlece Kilitle
      arenaState.x = Math.max(-0.22, Math.min(0.22, p.x));
      arenaState.y = Math.max(-0.22, Math.min(0.22, p.y));

      // 2. Dikey (Z) Yüksekliğini Fareyi Yukarı Kaydırarak 3D Havaya Kaldır
      const screenDeltaY = dragStartClientY - e.clientY;
      const targetHeight = Math.max(0.015, Math.min(0.32, dragStartHeight + screenDeltaY * 0.0009));
      arenaState.zHeight = targetHeight;

      // 3. Fırlatma / Bırakma Hızı Hesabı (Toss Velocity)
      const rawVx = (arenaState.x - lastPos.x) / dt;
      const rawVy = (arenaState.y - lastPos.y) / dt;
      const rawVz = (targetHeight - lastPos.z) / dt;

      tossVelocity.vx = tossVelocity.vx * 0.6 + rawVx * 0.4;
      tossVelocity.vy = tossVelocity.vy * 0.6 + rawVy * 0.4;
      tossVelocity.vz = tossVelocity.vz * 0.6 + rawVz * 0.4;

      lastPos = { x: arenaState.x, y: arenaState.y, z: targetHeight, t: now };
    }
  });

  // Fare Tekerleği ile Havada Yükseklik Ayarlama
  window.addEventListener('wheel', (e) => {
    if (getAppMode() !== 'arena' || !isHolding) return;
    arenaState.zHeight = Math.max(0.015, Math.min(0.35, arenaState.zHeight - e.deltaY * 0.0006));
    dragStartHeight = arenaState.zHeight;
    dragStartClientY = e.clientY;
  }, { passive: true });

  window.addEventListener('mouseup', () => {
    if (!isHolding || getAppMode() !== 'arena') return;
    isHolding = false;
    masterCanvas.style.cursor = 'default';

    // Fırlatma hızını uygula (max 0.65 m/s)
    const spdXY = Math.hypot(tossVelocity.vx, tossVelocity.vy);
    const maxSpd = 0.65;
    if (spdXY > maxSpd) {
      arenaState.vx = (tossVelocity.vx / spdXY) * maxSpd;
      arenaState.vy = (tossVelocity.vy / spdXY) * maxSpd;
    } else {
      arenaState.vx = tossVelocity.vx;
      arenaState.vy = tossVelocity.vy;
    }

    // Dikey serbest düşüş / atış hızı
    arenaState.fallVy = Math.max(-1.5, Math.min(1.0, tossVelocity.vz));

    if (arenaState.zHeight > 0.005) {
      arenaState.state = 'falling';
    } else {
      arenaState.state = 'rolling';
    }
  });

  return {
    getDragState: () => ({
      isDragging: isHolding,
      dragStartPos: null,
      dragCurrentPos: null
    })
  };
}
