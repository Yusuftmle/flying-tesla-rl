// ramp_launch.js - Devasa İçbükey C-Rampa (Inside Vert Loop) Geometrisi
//
// Koordinat (Three.js): x sağ (+), y yukarı (+), z derinlik (+/-)
// Simülasyon: x_sim = x_3d, z_sim = y_3d
// Araç düz pistten girer, içbükey çember yayında tırmanır, tavanı aşıp
// 196° açıyla (-16.1° aşağı-sola) ters vaziyette fırlar.
// %100 Newton fiziği ve kesintisiz momentum korunumuna sahiptir.

export class RampLaunch {
  constructor(o = {}) {
    this.G = 9.81;
    this.R = o.R ?? 14.0;
    this.exitDeg = o.exitDeg ?? 196.0;
    this.exitRad = (this.exitDeg * Math.PI) / 180.0; // 196°
    this.L_flat = o.L_flat ?? 18.0;
    this.hCom = o.hCom ?? 0.70;
    this.vExit = o.vExit ?? 21.8;
    this.groundY = o.groundY ?? 0.70;

    // Çember merkezi: (0.0, groundY + R) = (0.0, 14.7m)
    this.xc = 0.0;
    this.yc = this.groundY + this.R;

    this.S_arc = this.R * this.exitRad;
    this.S = this.L_flat + this.S_arc;

    const [exX, exY] = this._raw(this.S);
    this.xExit = exX;
    this.yExit = exY;

    this._buildSchedule();
  }

  _raw(s) {
    s = Math.max(0, Math.min(s, this.S));
    if (s <= this.L_flat) {
      const x = -this.L_flat + s;
      const y = this.groundY;
      const phi = 0.0;
      const nx = 0.0;
      const ny = 1.0;
      return [x, y, phi, nx, ny];
    } else {
      const beta = (s - this.L_flat) / this.R;
      const x = this.xc + this.R * Math.sin(beta);
      const y = this.yc - this.R * Math.cos(beta);
      const phi = beta;
      // İçe (merkeze) bakan normal
      const nx = -Math.sin(beta);
      const ny = Math.cos(beta);
      return [x, y, phi, nx, ny];
    }
  }

  surface(s) {
    const [x, y, phi, nx, ny] = this._raw(s);
    return { x, y, phi, nx, ny };
  }

  comPose(s) {
    const { x, y, phi, nx, ny } = this.surface(s);
    const comX = x + nx * this.hCom;
    const comY = y + ny * this.hCom;

    let pitch;
    if (s <= this.L_flat) {
      pitch = 0.0;
    } else {
      const beta = (s - this.L_flat) / this.R;
      pitch = beta; // 0'dan 196 dereceye kadar burun daima hareket yönündedir!
    }

    return {
      x: comX,
      y: comY,
      theta: pitch,
      phi: phi,
      nx,
      ny
    };
  }

  speedAt(s) {
    const y = this.surface(s).y;
    return Math.sqrt(Math.max(16.0, this.vExit ** 2 + 2 * this.G * (this.yExit - y)));
  }

  _buildSchedule(n = 2000) {
    this.tab = [[0, 0]];
    let t = 0;
    const ds = this.S / n;
    for (let i = 0; i < n; i++) {
      t += ds / this.speedAt((i + 0.5) * ds);
      this.tab.push([t, (i + 1) * ds]);
    }
    this.climbTime = t;
  }

  sAtTime(t) {
    if (t <= 0) return 0;
    if (t >= this.climbTime) return this.S;
    let lo = 0, hi = this.tab.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.tab[m][0] <= t) lo = m; else hi = m;
    }
    const [t0, s0] = this.tab[lo], [t1, s1] = this.tab[hi];
    return s0 + ((s1 - s0) * (t - t0)) / (t1 - t0);
  }

  poseAtTime(t) {
    const s = this.sAtTime(t);
    return { ...this.comPose(s), s, speed: this.speedAt(s) };
  }

  launchState() {
    const p = this.comPose(this.S);
    const v = this.vExit;
    // Çıkış açısı: -16.1 derece aşağı, sola doğru (-x)
    const thLaunch = -16.1 * (Math.PI / 180.0);
    return {
      x: p.x,
      z: p.y,
      vx: -v * Math.cos(Math.abs(thLaunch)),
      vz: v * Math.sin(thLaunch),
      theta: thLaunch,
      roll: 0.0,
      omega: v / this.R,
      omega_roll: 0.0,
      speed: v
    };
  }

  // ---- 3D Rampa Mesh'i (İçbükey Sürüş Yüzeyi + Dış Çelik Gövde + Kırmızı Neon Kenarlar) ----
  _ribbon(THREE, z0, z1, lift, ds = 0.20) {
    const n = Math.ceil(this.S / ds), pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const { x, y, nx, ny } = this.surface((i / n) * this.S);
      const px = x + nx * lift;
      const py = y + ny * lift;
      pos.push(px, py, z0, px, py, z1);
      if (i < n) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  buildMesh(THREE, o = {}) {
    const W = o.width ?? 4.4;
    const g = new THREE.Group();
    const side = THREE.DoubleSide;

    // 1. İç Sürüş Yüzeyi (İçbükey zemin, lift = 0.0)
    const trackMat = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      roughness: 0.72,
      metalness: 0.35,
      side
    });
    const trackMesh = new THREE.Mesh(this._ribbon(THREE, -W / 2, W / 2, 0.0), trackMat);
    trackMesh.receiveShadow = true;

    // 2. Dış Çelik Zırh Kaplaması (Dış yüzey, lift = -0.40m)
    const outerHullMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85,
      metalness: 0.6,
      side
    });
    const outerHull = new THREE.Mesh(this._ribbon(THREE, -W / 2 - 0.05, W / 2 + 0.05, -0.40), outerHullMat);

    // 3. Orta Kesik Beyaz Yarış Şeridi
    const stripeMat = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      side,
      toneMapped: false
    });
    const centerStripe = new THREE.Mesh(this._ribbon(THREE, -0.08, 0.08, 0.02), stripeMat);

    // 4. Kenar Kırmızı Neon Şeritler (Neon Red Glowing Edges - Kullanıcının referans resmindeki gibi!)
    const neonRedMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(3.5, 0.15, 0.25),
      side,
      toneMapped: false
    });
    const edgeL = new THREE.Mesh(this._ribbon(THREE, -W / 2, -W / 2 + 0.18, 0.03), neonRedMat);
    const edgeR = new THREE.Mesh(this._ribbon(THREE, W / 2 - 0.18, W / 2, 0.03), neonRedMat);

    // 5. Yükseltilmiş Yan Güvenlik Bariyerleri (Side Safety Guardrails)
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.8,
      side
    });
    const railL = new THREE.Mesh(this._ribbon(THREE, -W / 2 - 0.06, -W / 2 + 0.02, 0.55), railMat);
    const railR = new THREE.Mesh(this._ribbon(THREE, W / 2 - 0.02, W / 2 + 0.06, 0.55), railMat);

    // Bariyer üstü kırmızı uyarı şeridi
    const railNeonL = new THREE.Mesh(this._ribbon(THREE, -W / 2 - 0.08, -W / 2 - 0.02, 0.58), neonRedMat);
    const railNeonR = new THREE.Mesh(this._ribbon(THREE, W / 2 + 0.02, W / 2 + 0.08, 0.58), neonRedMat);

    g.add(trackMesh, outerHull, centerStripe, edgeL, edgeR, railL, railR, railNeonL, railNeonR);
    g.userData.width = W;
    return g;
  }
}
