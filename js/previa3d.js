/* Gerador de Moldes — prévia 3D da figura montada (canvas, sem bibliotecas). */
(function (raiz) {
  'use strict';

  function hexRgb(h) {
    const n = parseInt((h || '#d8c3a0').slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function Previa(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rumo = -35;
    this.elev = 22;
    this.cena = null;
    this.giroAuto = !(raiz.matchMedia && raiz.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let arrasto = null;
    canvas.addEventListener('pointerdown', (e) => { arrasto = { x: e.clientX, y: e.clientY, r: this.rumo, el: this.elev }; this.giroAuto = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!arrasto) return;
      this.rumo = arrasto.r - (e.clientX - arrasto.x) * 0.6;
      this.elev = Math.max(-10, Math.min(80, arrasto.el + (e.clientY - arrasto.y) * 0.4));
      this.desenhar();
    });
    const soltar = () => { arrasto = null; };
    canvas.addEventListener('pointerup', soltar);
    canvas.addEventListener('pointercancel', soltar);
    const passo = () => {
      if (this.giroAuto && this.cena && document.visibilityState !== 'hidden' && canvas.offsetParent) { this.rumo += 0.25; this.desenhar(); }
      raiz.requestAnimationFrame(passo);
    };
    raiz.requestAnimationFrame(passo);
  }

  Previa.prototype.mostrar = function (cena) {
    this.cena = cena;
    let a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
    for (const m of cena) for (const v of m.v) for (let i = 0; i < 3; i++) { a[i] = Math.min(a[i], v[i]); b[i] = Math.max(b[i], v[i]); }
    this.centro = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    this.raio = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2 || 1;
    this.desenhar();
  };

  Previa.prototype.desenhar = function () {
    const cv = this.canvas, ctx = this.ctx;
    const dpr = raiz.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!this.cena) return;
    const ra = this.rumo * Math.PI / 180, re = this.elev * Math.PI / 180;
    const cr = Math.cos(ra), sr = Math.sin(ra), ce = Math.cos(re), se = Math.sin(re);
    const c = this.centro;
    const esc = Math.min(W, H) / (2.15 * this.raio);
    // câmera: gira em Z (rumo) e inclina (elevação); tela x = direita, y = para cima, z = profundidade
    const ver = (p) => {
      const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
      const x1 = x * cr - y * sr, y1 = x * sr + y * cr;
      const yy = z * ce - x1 * se, zz = z * se + x1 * ce; // zz: em direção ao observador
      return [W / 2 + y1 * esc, H / 2 - yy * esc, zz];
    };
    const luz = [0.35, 0.5, 0.8];
    const lista = [];
    for (const m of this.cena) {
      const P = m.v.map(ver);
      m.f.forEach((f, fi) => {
        const pts = f.map((i) => P[i]);
        let ar = 0;
        for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; ar += a[0] * b[1] - b[0] * a[1]; }
        // normal 3D para a luz
        let n = [0, 0, 0];
        for (let i = 0; i < f.length; i++) {
          const a = m.v[f[i]], b = m.v[f[(i + 1) % f.length]];
          n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
        }
        const ln = Math.hypot(n[0], n[1], n[2]) || 1;
        n = n.map((x) => x / ln);
        const frente = ar < 0; // sentido anti-horário visto de fora (tela com y para baixo)
        if (!frente && !m.aberta) return;
        const sinal = frente ? 1 : -1;
        const nl = Math.max(0, sinal * (n[0] * luz[0] + n[1] * luz[1] + n[2] * luz[2]));
        const z = pts.reduce((s, p) => s + p[2], 0) / pts.length;
        const deco = (m.deco[fi] || []).map((d) => ({ pts: d.pts.map(ver), cor: d.cor }));
        lista.push({ pts, z, cor: m.cor[fi], deco, luz: 0.55 + 0.45 * nl });
      });
    }
    lista.sort((a, b) => a.z - b.z);
    const tinta = (cor, k) => { const [r, g, b] = hexRgb(cor); return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`; };
    for (const it of lista) {
      ctx.beginPath();
      it.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.fillStyle = tinta(it.cor || '#e6d3b0', it.luz);
      ctx.fill();
      ctx.strokeStyle = tinta(it.cor || '#e6d3b0', it.luz * 0.8);
      ctx.lineWidth = 0.6;
      ctx.stroke();
      for (const d of it.deco) {
        ctx.beginPath();
        d.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.closePath();
        ctx.fillStyle = tinta(d.cor, it.luz);
        ctx.fill();
      }
    }
  };

  raiz.Previa3D = Previa;
})(typeof self !== 'undefined' ? self : this);
