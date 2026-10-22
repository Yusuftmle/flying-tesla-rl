/**
 * vehicle_model.js - 3D Cyber-Rocket Hypercar Procedural Mesh Generator
 * Clean Architecture - Presentation Layer
 */

export function createVehicleModel({ THREE, ARM_MAIN = 1.35, ARM_RCS = 1.95 }) {
  const vehicleGroup = new THREE.Group();

  // Malzemeler
  const carBodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e293b,
    metalness: 0.65,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08
  });
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x090d16,
    roughness: 0.35,
    metalness: 0.85
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x030712,
    metalness: 0.95,
    roughness: 0.04,
    transmission: 0.45,
    opacity: 0.95,
    transparent: true,
    clearcoat: 1.0
  });
  const cyanNeonMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    toneMapped: false
  });
  const redNeonMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(4.5, 0.05, 0.12),
    toneMapped: false
  });

  // 1. ANA ORTA GÖVDE & KARBON TABAN
  const midChassis = new THREE.Mesh(new THREE.BoxGeometry(2.30, 0.38, 1.84), carBodyMat);
  midChassis.position.set(-0.05, -0.05, 0.0);
  midChassis.castShadow = true;
  vehicleGroup.add(midChassis);

  const underPan = new THREE.Mesh(new THREE.BoxGeometry(4.40, 0.08, 1.80), carbonMat);
  underPan.position.set(-0.02, -0.26, 0.0);
  vehicleGroup.add(underPan);

  // 2. ÖN BURUN
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.90, 0.32, 1.78), carBodyMat);
  nose.position.set(1.58, -0.06, 0.0);
  nose.rotation.z = -0.13;
  vehicleGroup.add(nose);

  const noseTip = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.20, 1.72), carBodyMat);
  noseTip.position.set(2.38, -0.19, 0.0);
  vehicleGroup.add(noseTip);

  const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 2.22), carbonMat);
  splitter.position.set(2.46, -0.28, 0.0);
  const canardL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.04), carbonMat);
  canardL.position.set(2.44, -0.20, -1.10);
  const canardR = canardL.clone();
  canardR.position.set(2.44, -0.20, +1.10);
  vehicleGroup.add(splitter, canardL, canardR);

  // KAPUT OKU (>>>)
  const arrowG = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const segL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.05), cyanNeonMat);
    segL.rotation.y = Math.PI / 4;
    segL.position.set(k * 0.22, 0.0, -0.08);
    const segR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.05), cyanNeonMat);
    segR.rotation.y = -Math.PI / 4;
    segR.position.set(k * 0.22, 0.0, +0.08);
    arrowG.add(segL, segR);
  }
  arrowG.position.set(1.40, 0.14, 0.0);
  arrowG.rotation.z = -0.13;
  vehicleGroup.add(arrowG);

  // ÖN FARLAR & PROJEKTÖR HÜZMELERİ
  const headGeo = new THREE.BoxGeometry(0.18, 0.12, 0.42);
  const headLightL = new THREE.Mesh(headGeo, cyanNeonMat);
  headLightL.position.set(2.42, -0.12, -0.68);
  const headLightR = headLightL.clone();
  headLightR.position.set(2.42, -0.12, +0.68);
  const frontLEDStrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1.45), cyanNeonMat);
  frontLEDStrip.position.set(2.45, -0.12, 0.0);
  vehicleGroup.add(headLightL, headLightR, frontLEDStrip);

  const beamGeo = new THREE.CylinderGeometry(0.10, 0.65, 4.2, 16, 1, true);
  beamGeo.rotateZ(-Math.PI / 2);
  beamGeo.translate(2.1, 0, 0);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const beamL = new THREE.Mesh(beamGeo, beamMat);
  beamL.position.set(2.42, -0.12, -0.68);
  const beamR = new THREE.Mesh(beamGeo, beamMat);
  beamR.position.set(2.42, -0.12, +0.68);
  vehicleGroup.add(beamL, beamR);

  // 3. KOKPİT & FASTBACK CAM
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.10, 1.48), glassMat);
  windshield.position.set(0.35, 0.36, 0.0);
  windshield.rotation.z = -0.52;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.20, 0.08, 1.42), carBodyMat);
  roof.position.set(-0.35, 0.58, 0.0);
  const roofScoop = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.10, 0.45), carbonMat);
  roofScoop.position.set(-0.10, 0.65, 0.0);
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.08, 1.42), glassMat);
  rearGlass.position.set(-1.08, 0.36, 0.0);
  rearGlass.rotation.z = 0.44;
  const sideGlassL = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.34, 0.06), glassMat);
  sideGlassL.position.set(-0.30, 0.38, -0.72);
  const sideGlassR = sideGlassL.clone();
  sideGlassR.position.set(-0.30, 0.38, +0.72);
  vehicleGroup.add(windshield, roof, roofScoop, rearGlass, sideGlassL, sideGlassR);

  // 4. ARKA TARAF & GT KANAT
  const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.34, 1.84), carBodyMat);
  rearDeck.position.set(-1.62, 0.02, 0.0);
  vehicleGroup.add(rearDeck);

  const pylonGeo = new THREE.BoxGeometry(0.12, 0.55, 0.08);
  const pylonL = new THREE.Mesh(pylonGeo, carbonMat);
  pylonL.position.set(-1.82, 0.45, -0.65);
  pylonL.rotation.z = 0.18;
  const pylonR = pylonL.clone();
  pylonR.position.set(-1.82, 0.45, +0.65);
  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.07, 2.38), carbonMat);
  wingBlade.position.set(-1.94, 0.76, 0.0);
  wingBlade.rotation.z = -0.12;
  const endpGeo = new THREE.BoxGeometry(0.55, 0.28, 0.05);
  const endpL = new THREE.Mesh(endpGeo, carbonMat);
  endpL.position.set(-1.94, 0.76, -1.20);
  const endpEdgeL = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.04, 0.06), redNeonMat);
  endpEdgeL.position.set(-1.94, 0.89, -1.20);
  const endpR = endpL.clone();
  endpR.position.set(-1.94, 0.76, +1.20);
  const endpEdgeR = endpEdgeL.clone();
  endpEdgeR.position.set(-1.94, 0.89, +1.20);
  vehicleGroup.add(pylonL, pylonR, wingBlade, endpL, endpR, endpEdgeL, endpEdgeR);

  const tailLightBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 2.15), redNeonMat);
  tailLightBar.position.set(-2.34, 0.06, 0.0);
  vehicleGroup.add(tailLightBar);

  [-0.48, +0.48].forEach(tz => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.20, 0.24, 18), carbonMat);
    pipe.rotateZ(Math.PI / 2);
    pipe.position.set(-2.38, -0.12, tz);
    const pipeInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.06, 16),
      new THREE.MeshBasicMaterial({ color: 0xff3b10, toneMapped: false })
    );
    pipeInner.rotateZ(Math.PI / 2);
    pipeInner.position.set(-2.41, -0.12, tz);
    vehicleGroup.add(pipe, pipeInner);
  });

  const diffuserBase = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.10, 1.95), carbonMat);
  diffuserBase.position.set(-2.25, -0.26, 0.0);
  vehicleGroup.add(diffuserBase);
  [-0.75, -0.25, 0.25, 0.75].forEach(dx => {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.04), carbonMat);
    fin.position.set(-2.25, -0.28, dx);
    vehicleGroup.add(fin);
  });

  // 5. GENİŞ ÇAMURLUKLAR & 4 TEKERLEK
  const fenderGeo = new THREE.BoxGeometry(1.25, 0.24, 0.28);
  const fL = new THREE.Mesh(fenderGeo, carBodyMat); fL.position.set(1.48, 0.04, -1.02);
  const fR = new THREE.Mesh(fenderGeo, carBodyMat); fR.position.set(1.48, 0.04, +1.02);
  const rL = new THREE.Mesh(fenderGeo, carBodyMat); rL.position.set(-1.48, 0.08, -1.02);
  const rR = new THREE.Mesh(fenderGeo, carBodyMat); rR.position.set(-1.48, 0.08, +1.02);
  vehicleGroup.add(fL, fR, rL, rR);

  const carWheels = [];
  const tireGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.34, 32);
  tireGeo.rotateX(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.92, metalness: 0.08 });
  const rimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.35, 24);
  rimGeo.rotateX(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.18, metalness: 0.95 });
  const discGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.04, 24);
  discGeo.rotateX(Math.PI / 2);
  const discMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.95, roughness: 0.25 });

  const wheelPositions = [
    { x: +1.48, z: -1.18, isFront: true },
    { x: +1.48, z: +1.18, isFront: true },
    { x: -1.48, z: -1.18, isFront: false },
    { x: -1.48, z: +1.18, isFront: false }
  ];

  wheelPositions.forEach(wp => {
    const wGroup = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    const disc = new THREE.Mesh(discGeo, discMat);
    const caliper = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.14, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xff5500, toneMapped: false })
    );
    caliper.position.set(0.10, 0.14, wp.z > 0 ? 0.14 : -0.14);

    const rotatingHub = new THREE.Group();
    for (let s = 0; s < 5; s++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.04), rimMat);
      spoke.rotation.z = (s * Math.PI * 2) / 5;
      rotatingHub.add(spoke);
    }
    const hubCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 })
    );
    hubCap.rotateX(Math.PI / 2);
    const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.052, 12), cyanNeonMat);
    badge.rotateX(Math.PI / 2);
    rotatingHub.add(hubCap, badge);
    rotatingHub.position.set(0.0, 0.0, wp.z > 0 ? 0.16 : -0.16);

    wGroup.add(tire, rim, disc, caliper, rotatingHub);
    wGroup.userData = { rotatingHub, isFront: wp.isFront };
    carWheels.push(wGroup);
    wGroup.position.set(wp.x, -0.26, wp.z);
    vehicleGroup.add(wGroup);
  });

  // 6. 4 ALT İTİCİ NOZUL VE ALEV KONİLERİ
  const thrusterFlames = [];
  const thrusterLights = [];
  const thrusterNozzles = [];
  const bottomPositions = [
    { id: 'FL', x: +ARM_MAIN, z: -0.70 },
    { id: 'FR', x: +ARM_MAIN, z: +0.70 },
    { id: 'RL', x: -ARM_MAIN, z: -0.70 },
    { id: 'RR', x: -ARM_MAIN, z: +0.70 }
  ];

  function createFlameShader() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uThrust: { value: 0.0 },
        uTime: { value: 0.0 },
        uDeflectX: { value: 0.0 },
        uDeflectZ: { value: 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float uThrust;
        uniform float uTime;
        uniform float uDeflectX;
        uniform float uDeflectZ;

        void main() {
          vUv = uv;
          vec3 pos = position;
          float distFromThroat = clamp(1.0 - uv.y, 0.0, 1.0);
          float bendFactor = distFromThroat * distFromThroat;
          pos.x += uDeflectX * bendFactor;
          pos.z += uDeflectZ * bendFactor;

          if (uThrust > 0.05) {
            float jitter = sin(pos.y * 45.0 + uTime * 70.0) * 0.025 * uThrust * distFromThroat;
            pos.x += jitter;
            pos.z += jitter * 0.7;
          }
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uThrust;
        uniform float uTime;
        varying vec2 vUv;

        void main() {
          if (uThrust < 0.01) discard;

          vec3 whiteCore = vec3(1.6, 1.6, 1.7);
          vec3 cyanPlasma = vec3(0.08, 0.85, 1.0);
          vec3 violetGlow = vec3(0.35, 0.25, 0.95);
          vec3 amberOuter = vec3(1.0, 0.45, 0.05);

          float distFromThroat = 1.0 - vUv.y;
          float rad = abs(vUv.x - 0.5) * 2.0;

          vec3 col = mix(cyanPlasma, violetGlow, clamp(distFromThroat * 1.4, 0.0, 1.0));
          col = mix(col, amberOuter, clamp(rad * 1.25, 0.0, 1.0));
          col = mix(col, whiteCore, pow(clamp(1.0 - rad * 1.45, 0.0, 1.0), 3.0) * (1.0 - distFromThroat * 0.6));

          if (uThrust > 0.22) {
            float diamondFreq = 6.2;
            float phase = fract(vUv.y * diamondFreq - uTime * 6.5);
            float nodeDist = abs(phase - 0.5) * 2.0;
            float shockMask = clamp(1.0 - (rad * 1.8 + nodeDist * 1.8), 0.0, 1.0);
            float shockIntensity = pow(shockMask, 2.5) * smoothstep(0.08, 0.92, vUv.y) * smoothstep(0.22, 0.95, uThrust);
            vec3 shockColor = vec3(1.8, 2.0, 2.4);
            col += shockColor * shockIntensity * 2.8;
          }

          float turb = 0.92 + 0.08 * sin(vUv.y * 45.0 + uTime * 40.0) * sin(vUv.x * 20.0 - uTime * 30.0);
          float alpha = pow(vUv.y, 1.25) * clamp(uThrust * 1.8, 0.0, 1.0) * (1.0 - rad * 0.45) * turb;
          gl_FragColor = vec4(col * (1.5 + uThrust * 1.8), clamp(alpha, 0.0, 1.0));
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }

  bottomPositions.forEach(pos => {
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.92,
      roughness: 0.22,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0
    });
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.32, 16), nozzleMat);
    nozzle.position.set(pos.x, -0.45, pos.z);
    vehicleGroup.add(nozzle);
    thrusterNozzles.push(nozzle);

    const fGeo = new THREE.ConeGeometry(0.34, 1.15, 20, 1, true);
    fGeo.translate(0, 0.58, 0); fGeo.rotateZ(Math.PI);
    const fMesh = new THREE.Mesh(fGeo, createFlameShader());
    fMesh.position.set(pos.x, -0.58, pos.z);
    vehicleGroup.add(fMesh);
    thrusterFlames.push(fMesh);

    const pl = new THREE.PointLight(0x38bdf8, 0.0, 10.0, 1.5);
    pl.position.set(pos.x, -0.9, pos.z);
    vehicleGroup.add(pl);
    thrusterLights.push(pl);
  });

  // 7. 4 YAN RCS JETİ
  const rcsFlames = [];
  const rcsPositions = [
    { id: 'LF', x: +ARM_RCS, z: -1.12, rotX: -Math.PI / 2 },
    { id: 'LR', x: -ARM_RCS, z: -1.12, rotX: -Math.PI / 2 },
    { id: 'RF', x: +ARM_RCS, z: +1.12, rotX: +Math.PI / 2 },
    { id: 'RR', x: -ARM_RCS, z: +1.12, rotX: +Math.PI / 2 }
  ];

  rcsPositions.forEach(pos => {
    const rPod = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.16, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9 })
    );
    rPod.position.set(pos.x, 0.05, pos.z);
    vehicleGroup.add(rPod);

    const rMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.95, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending })
    );
    rMesh.position.set(pos.x, 0.05, pos.z + (pos.z > 0 ? 0.45 : -0.45));
    rMesh.rotation.x = pos.rotX;
    vehicleGroup.add(rMesh);
    rcsFlames.push(rMesh);
  });

  return {
    vehicleGroup,
    carWheels,
    thrusterFlames,
    thrusterNozzles,
    thrusterLights,
    rcsFlames,
    bottomPositions,
    rcsPositions
  };
}
