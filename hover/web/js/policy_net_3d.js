// policy_net_3d.js
// Sahnenin İÇİNDE duran 3D sinir ağı (SAC actor: 12 -> 16 -> 16 -> 5).
// Veri kaynağı: log başlığındaki ağırlıklar + her karedeki aktivasyonlar. Hiçbir değer uydurulmaz.
//
// Kullanım:
//   const net = new PolicyNet3D({ THREE });             // THREE = import * as THREE from 'three'
//   net.group.position.set(-9, 15, -10);                // rampanın yanında, uçuş yolunun ARKASINDA
//   scene.add(net.group);
//   net.setWeights([W1, W2, W3]);                       // W[l][çıkış_j][giriş_i]  (checkpoint değişince çağır)
//   net.setStep(20000);                                 // başlık yazısı
//   her karede: net.setFrame([in12, h16, h16, out5]);   // log'daki aktivasyonlar
//               net.update(dtSaniye);
//   isteğe bağlı: net.updateLinks(nozulDunyaPozlari[5], komutlar[5]);  // ağ -> itici çizgileri

export class PolicyNet3D {
  constructor(opts = {}) {
    const THREE = (this.T = opts.THREE);
    this.layers = opts.layers || [12, 32, 32, 8];
    this.W = opts.width ?? 16.5;
    this.H = opts.height ?? 13.0;
    this.inLabels = opts.inLabels || ['x err', 'height', 'vx', 'vz', 'sin θ', 'cos θ', 'spin', 'T front', 'T rear', 'RCS nose', 'RCS tail', 'v_des'];
    this.outLabels = opts.outLabels || ['T-FL', 'T-FR', 'T-RL', 'T-RR', 'RCS-LF', 'RCS-LR', 'RCS-RF', 'RCS-RR'];
    this.hasDOM = typeof document !== 'undefined' && opts.labels !== false;
    this.group = new THREE.Group();
    this.time = 0;
    this.rewire = 4.0;                       // ağırlık geçiş hızı (1/sn)
    this.ORANGE = new THREE.Color(0xff8a2a); // pozitif ağırlık / çıkış
    this.BLUE = new THREE.Color(0x35b8ff);   // negatif ağırlık / çıkış

    const L = this.layers.length;
    this.nodePos = [];
    const maxNodes = Math.max(...this.layers);
    const spacing = this.H / Math.max(16, maxNodes);
    for (let l = 0; l < L; l++) {
      const n = this.layers[l], x = -this.W / 2 + (this.W * l) / (L - 1), arr = [];
      for (let i = 0; i < n; i++) {
        arr.push(new THREE.Vector3(x, (i - (n - 1) / 2) * -spacing, Math.sin(i * 1.7 + l * 2.1) * 0.7));
      }
      this.nodePos.push(arr);
    }

    // --- düğümler (çekirdek + hale) ---
    this.total = this.layers.reduce((a, b) => a + b, 0);
    const core = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.32, 16, 12),
      new THREE.MeshBasicMaterial({ toneMapped: true }), this.total);
    const haloMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: true });
    const halo = new THREE.InstancedMesh(new THREE.SphereGeometry(0.74, 12, 10), haloMat, this.total);
    const m4 = new THREE.Matrix4(); let k = 0;
    this.nodeIndex = [];
    for (let l = 0; l < L; l++) {
      this.nodeIndex.push(k);
      for (const p of this.nodePos[l]) { m4.setPosition(p); core.setMatrixAt(k, m4); halo.setMatrixAt(k, m4); k++; }
    }
    core.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.total * 3), 3);
    halo.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.total * 3), 3);
    this.core = core; this.halo = halo;
    this.group.add(core, halo);

    // --- bağlantılar ---
    this.edges = [];                         // {l, i, j, a(Vector3), b(Vector3)}
    for (let l = 0; l < L - 1; l++)
      for (let j = 0; j < this.layers[l + 1]; j++)
        for (let i = 0; i < this.layers[l]; i++)
          this.edges.push({ l, i, j, a: this.nodePos[l][i], b: this.nodePos[l + 1][j] });
    const pos = new Float32Array(this.edges.length * 6);
    this.edges.forEach((e, n) => { pos.set([e.a.x, e.a.y, e.a.z, e.b.x, e.b.y, e.b.z], n * 6); });
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    eg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.edges.length * 6), 3));
    this.lines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.group.add(this.lines);

    // --- sinyal darbeleri (en güçlü bağlantılarda akan noktalar) ---
    this.pulseCount = 72;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pulseCount * 3), 3));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.pulseCount * 3), 3));
    this.pulses = new THREE.Points(pg, new THREE.PointsMaterial({
      size: 0.44, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, map: this._dot() }));
    this.pulseEdge = new Int32Array(this.pulseCount).fill(-1);
    this.group.add(this.pulses);

    // --- ağırlıklar / aktivasyonlar ---
    this.Wt = null; this.Wc = null;          // hedef ve gösterilen ağırlıklar: düz Float32Array, kenar sırasında
    this.wmax = 1e-6;
    this.acts = this.layers.map(n => new Float32Array(n));
    this.actMax = this.layers.map(() => 1e-3);
    this.edgeStrength = new Float32Array(this.edges.length);

    // --- çerçeve + etiketler ---
    this._buildFrame();
    if (this.hasDOM) this._buildLabels();

    // --- ağ -> itici çizgileri ---
    this.links = [];
    for (let k2 = 0; k2 < this.layers[L - 1]; k2++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(17 * 3), 3));
      const ln = new THREE.Line(g, new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      ln.frustumCulled = false; ln.visible = false;
      this.links.push(ln);
    }
  }

  _dot() {
    if (!this.hasDOM) return null;
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    return new this.T.CanvasTexture(c);
  }

  _sprite(text, px, color = '#cfe8ff', align = 'center') {
    const T = this.T, c = document.createElement('canvas'); c.width = 768; c.height = 96;
    const x = c.getContext('2d'); x.font = `600 ${px}px ui-monospace, Menlo, Consolas, monospace`;
    x.fillStyle = color; x.textBaseline = 'middle'; x.textAlign = align;
    x.fillText(text, align === 'left' ? 6 : align === 'right' ? 762 : 384, 48);
    const tex = new T.CanvasTexture(c);
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    s.scale.set(7.68, 0.96, 1); s.userData = { c, x, tex, px, color, align };
    return s;
  }

  _buildLabels() {
    const L = this.layers.length;
    this.inLabels.forEach((t, i) => {
      const s = this._sprite(t, 40, '#9fc4e6', 'right');
      s.position.copy(this.nodePos[0][i]).add(new this.T.Vector3(-2.9, 0, 0)); this.group.add(s);
    });
    this.outLabels.forEach((t, i) => {
      const s = this._sprite(t, 40, '#ffd9b0', 'left');
      s.position.copy(this.nodePos[L - 1][i]).add(new this.T.Vector3(2.9, 0, 0)); this.group.add(s);
    });
    this.title = null;
    this.sub = null;
  }

  setStep(n) {
    if (!this.sub) return;
  }

  _buildFrame() {
    const T = this.T, w = this.W / 2 + 4.2, h = this.H / 2 + 3.4, c = 1.4, v = [];
    const corner = (sx, sy) => v.push(sx * w, sy * h, 0, sx * (w - c), sy * h, 0, sx * w, sy * h, 0, sx * w, sy * (h - c), 0);
    corner(1, 1); corner(-1, 1); corner(1, -1); corner(-1, -1);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    this.group.add(new T.LineSegments(g, new T.LineBasicMaterial({ color: 0x2f7fb8, transparent: true, opacity: 0.8, toneMapped: false })));
  }

  // W: [W1 (16x12), W2 (16x16), W3 (5x16)], W[l][çıkış j][giriş i]
  setWeights(Ws, instant = false) {
    if (!Ws || !Array.isArray(Ws) || !Ws[0] || !Array.isArray(Ws[0])) return;
    const flat = new Float32Array(this.edges.length);
    this.edges.forEach((e, n) => {
      const layer = Ws[e.l];
      const row = (layer && Array.isArray(layer)) ? layer[e.j] : null;
      flat[n] = (row && row[e.i] !== undefined) ? (Number(row[e.i]) || 0.0) : 0.0;
    });
    this.Wt = flat;
    if (!this.Wc || instant) this.Wc = flat.slice();
    let m = 1e-6; for (const v of flat) m = Math.max(m, Math.abs(v)); this.wmax = m;
  }

  // acts: [giriş12, gizli16, gizli16, çıkış5]  (log'daki gerçek değerler)
  setFrame(acts) {
    if (!acts || !Array.isArray(acts)) return;
    acts.forEach((a, l) => {
      if (!this.acts[l] || !a) return;
      const len = Math.min(this.acts[l].length, a.length);
      for (let i = 0; i < len; i++) this.acts[l][i] = a[i] ?? 0;
    });
  }

  update(dt) {
    const T = this.T; this.time += dt;
    if (!this.Wc) return;
    // ağırlıkların "yeniden bağlanma" geçişi (sadece görsel yumuşatma; bölüm içi değerler gerçek)
    const k = 1 - Math.exp(-this.rewire * dt);
    for (let n = 0; n < this.Wc.length; n++) this.Wc[n] += (this.Wt[n] - this.Wc[n]) * k;

    // katman bazlı normalizasyon (yavaş sönen max)
    const an = this.acts.map((a, l) => {
      let m = 0; for (const v of a) m = Math.max(m, Math.abs(v));
      this.actMax[l] = Math.max(m, this.actMax[l] * 0.995, 1e-3);
      return Float32Array.from(a, v => Math.min(Math.abs(v) / this.actMax[l], 1));
    });

    // düğüm renkleri
    const L = this.layers.length, cc = this.core.instanceColor, hc = this.halo.instanceColor, col = new T.Color();
    for (let l = 0; l < L; l++) for (let i = 0; i < this.layers[l]; i++) {
      const idx = this.nodeIndex[l] + i, v = an[l][i], neg = this.acts[l][i] < 0;
      col.copy(neg ? this.BLUE : this.ORANGE).lerp(new T.Color(1, 1, 1), l === 0 ? 0.35 : 0.1).multiplyScalar(0.15 + v * 2.2);
      cc.setXYZ(idx, col.r, col.g, col.b);
      hc.setXYZ(idx, col.r * 0.6, col.g * 0.6, col.b * 0.6);
    }
    cc.needsUpdate = hc.needsUpdate = true;

    // bağlantı renkleri
    const ca = this.lines.geometry.attributes.color, arr = ca.array;
    this.edges.forEach((e, n) => {
      const w = this.Wc[n], s = Math.min(Math.abs(w) / this.wmax, 1), src = an[e.l][e.i];
      this.edgeStrength[n] = Math.abs(w) * src;
      const inten = 0.03 + 0.85 * s * (0.15 + 0.85 * src);
      const base = w >= 0 ? this.ORANGE : this.BLUE;
      for (let q = 0; q < 2; q++) { arr[n * 6 + q * 3] = base.r * inten; arr[n * 6 + q * 3 + 1] = base.g * inten; arr[n * 6 + q * 3 + 2] = base.b * inten; }
    });
    ca.needsUpdate = true;

    // darbeler: her katman çiftinde en güçlü kenarlar
    this._assignPulses();
    const pp = this.pulses.geometry.attributes.position, pc = this.pulses.geometry.attributes.color;
    for (let p = 0; p < this.pulseCount; p++) {
      const n = this.pulseEdge[p]; if (n < 0) { pc.setXYZ(p, 0, 0, 0); continue; }
      const e = this.edges[n], ph = (this.time * 0.9 + p * 0.37) % 1, base = this.Wc[n] >= 0 ? this.ORANGE : this.BLUE;
      pp.setXYZ(p, e.a.x + (e.b.x - e.a.x) * ph, e.a.y + (e.b.y - e.a.y) * ph, e.a.z + (e.b.z - e.a.z) * ph);
      const f = 1.2 + 2.0 * Math.min(this.edgeStrength[n] / this.wmax, 1);
      pc.setXYZ(p, base.r * f, base.g * f, base.b * f);
    }
    pp.needsUpdate = pc.needsUpdate = true;
  }

  _assignPulses() {
    const per = Math.floor(this.pulseCount / (this.layers.length - 1)); let p = 0;
    for (let l = 0; l < this.layers.length - 1; l++) {
      const idx = []; this.edges.forEach((e, n) => { if (e.l === l) idx.push(n); });
      idx.sort((a, b) => this.edgeStrength[b] - this.edgeStrength[a]);
      for (let q = 0; q < per && p < this.pulseCount; q++) this.pulseEdge[p++] = idx[q] ?? -1;
    }
    while (p < this.pulseCount) this.pulseEdge[p++] = -1;
  }

  // Ağ çıkış düğümü -> arabadaki ilgili nozul. nozzleWorld: 5 THREE.Vector3 (dünya), cmds: 5 sayı (-1..1)
  updateLinks(nozzleWorld, cmds) {
    const T = this.T, L = this.layers.length - 1;
    this.links.forEach((ln, k) => {
      if (!ln.parent) this.group.parent?.add(ln);
      const a = this.group.localToWorld(this.nodePos[L][k].clone()), b = nozzleWorld[k];
      const m = a.clone().lerp(b, 0.5); m.y += 2.5;
      const c = new T.QuadraticBezierCurve3(a, m, b), pts = c.getPoints(16), pa = ln.geometry.attributes.position;
      pts.forEach((q, i) => pa.setXYZ(i, q.x, q.y, q.z)); pa.needsUpdate = true;
      const v = Math.min(Math.abs(cmds[k]), 1);
      ln.material.color.copy(cmds[k] < 0 ? this.BLUE : this.ORANGE);
      ln.material.opacity = 0.08 + 0.7 * v; ln.visible = v > 0.02;
    });
  }
}
