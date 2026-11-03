/*
 * Gerador de Moldes — modelos 3D de faces planas e planificação automática.
 *
 * Uma malha é { v: [[x,y,z]...], f: [[i,j,k...]...], cor: [cor por face],
 * deco: [[{pts3d, cor}] por face] }. Unidade: mm. Eixo Z para cima.
 *
 * desdobrar() abre a malha no plano sem distorção: cada face é girada em
 * torno da aresta que a liga à vizinha, então todas as arestas mantêm o
 * comprimento real. Quando uma face cairia por cima de outra, ela começa
 * uma peça nova. Arestas cortadas recebem um número (as duas bordas com o
 * mesmo número se colam) e uma aba de cola em um dos lados.
 */
(function (raiz, fabrica) {
  const G = (typeof module === 'object' && module.exports) ? require('./geometria.js') : raiz.Geometria;
  const M = fabrica(G);
  if (typeof module === 'object' && module.exports) module.exports = M;
  else raiz.Malha3D = M;
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';

  // ------------------------------------------------------------- vetores 3D
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  function normalNewell(pts) {
    let n = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
    }
    return n; // comprimento = 2 × área
  }
  const centro = (pts) => mul(pts.reduce(add, [0, 0, 0]), 1 / pts.length);

  // --------------------------------------------------------------- malhas
  function nova(v, f, cor) {
    return { v, f, cor: f.map((_, i) => (Array.isArray(cor) ? cor[i] : cor) || null), deco: f.map(() => []) };
  }

  function volume(m) {
    let s = 0;
    for (const f of m.f) for (let i = 1; i < f.length - 1; i++) s += dot(m.v[f[0]], cross(m.v[f[i]], m.v[f[i + 1]]));
    return s / 6;
  }

  /** Deixa todas as faces no mesmo sentido, com a normal para fora. */
  function orientar(m) {
    const mapa = new Map();
    m.f.forEach((f, fi) => f.forEach((a, k) => {
      const b = f[(k + 1) % f.length];
      const key = a < b ? a + '_' + b : b + '_' + a;
      if (!mapa.has(key)) mapa.set(key, []);
      mapa.get(key).push(fi);
    }));
    const visto = new Array(m.f.length).fill(false);
    for (let s = 0; s < m.f.length; s++) {
      if (visto[s]) continue;
      visto[s] = true;
      const fila = [s];
      while (fila.length) {
        const fi = fila.shift();
        const f = m.f[fi];
        for (let k = 0; k < f.length; k++) {
          const a = f[k], b = f[(k + 1) % f.length];
          for (const gj of mapa.get(a < b ? a + '_' + b : b + '_' + a)) {
            if (gj === fi || visto[gj]) continue;
            const g = m.f[gj];
            if (g.some((x, t) => x === a && g[(t + 1) % g.length] === b)) {
              m.f[gj] = g.slice().reverse();
              m.deco[gj] = m.deco[gj]; // decorações não dependem do sentido
            }
            visto[gj] = true;
            fila.push(gj);
          }
        }
      }
    }
    if (volume(m) < 0) m.f = m.f.map((f) => f.slice().reverse());
    return m;
  }

  function transformar(m, fn) {
    return {
      v: m.v.map(fn), f: m.f.map((x) => x.slice()), cor: m.cor.slice(),
      deco: m.deco.map((ds) => ds.map((d) => ({ pts: d.pts.map(fn), cor: d.cor }))),
      aberta: m.aberta, anel: m.anel && m.anel.slice(),
    };
  }

  function rot(eixo, graus) {
    const a = graus * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    if (eixo === 'x') return (p) => [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]];
    if (eixo === 'y') return (p) => [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
    return (p) => [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]];
  }
  const girar = (m, eixo, graus) => transformar(m, rot(eixo, graus));
  const mover = (m, t) => transformar(m, (p) => add(p, t));
  const escalar = (m, k) => transformar(m, (p) => mul(p, k));

  /** Pose: rotações em ordem ([['y', 30], ['z', -10]]), depois translação; esp = espelhar em Y. */
  function posar(m, pose) {
    let r = m;
    for (const [e, g] of pose.r || []) r = girar(r, e, g);
    if (pose.esp) {
      r = transformar(r, (p) => [p[0], -p[1], p[2]]);
      r.f = r.f.map((f) => f.slice().reverse());
    }
    return mover(r, pose.t || [0, 0, 0]);
  }

  // ------------------------------------------------------------ primitivas
  /** Suavidade global: multiplica lados e anéis das formas arredondadas (1 = simples). */
  const config = { suave: 1 };

  /** Acrescenta estações intermediárias (Catmull-Rom) para um perfil mais redondo. */
  function refinarPerfil(perfil, vezes) {
    if (vezes <= 1 || perfil.length < 3) return perfil;
    const out = [];
    const P = (i) => perfil[Math.max(0, Math.min(perfil.length - 1, i))];
    for (let i = 0; i < perfil.length - 1; i++) {
      for (let k = 0; k < vezes; k++) {
        const t = k / vezes;
        const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
        const q = [0, 1, 2].map((c) => {
          const v = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t * t * t);
          return c === 0 ? p1[0] + (p2[0] - p1[0]) * t : Math.max(0, v);
        });
        // mantém a proporção da seção (faces planas) e as pontas fechadas
        if (p1[1] > 0 && p2[1] > 0 && Math.abs(p1[2] / p1[1] - p2[2] / p2[1]) < 1e-9) q[2] = q[1] * p1[2] / p1[1];
        if ((p1[1] === 0 && t === 0)) { q[1] = 0; q[2] = 0; }
        out.push(q);
      }
    }
    out.push(perfil[perfil.length - 1]);
    return out;
  }

  /**
   * Sólido de revolução de seção elíptica. perfil: [[z, a, b], ...] com
   * a/b constante (anéis semelhantes → faces planas). a = b = 0 vira ponta.
   * op: { lados, metade (base plana em y = 0), cores(j), cor, corTampa, corBase }
   */
  function revolucao(perfil, op) {
    op = op || {};
    const fator = op.semSuavizar ? 1 : config.suave;
    let N = Math.max(3, Math.round((op.lados || 8) * fator));
    if (op.metade && N % 2) N++;
    if (!op.semSuavizar && !op.perfilPronto) perfil = refinarPerfil(perfil, Math.round(fator));
    const metade = !!op.metade;
    const K = metade ? Math.max(2, Math.round(N / 2)) : N;
    const v = [], f = [], cor = [], anel = [];
    const aneis = perfil.map(([z, a, b]) => {
      if (a <= 1e-9 && b <= 1e-9) { v.push([0, 0, z]); return { polo: v.length - 1 }; }
      const idx = [];
      const qtd = metade ? K + 1 : K;
      for (let i = 0; i < qtd; i++) {
        const th = (metade ? Math.PI : 2 * Math.PI) * i / K + (metade ? 0 : (op.fase || 0));
        idx.push(v.length);
        v.push([a * Math.cos(th), b * Math.sin(th), z]);
      }
      return { idx };
    });
    const corDe = (j) => (typeof op.cores === 'function' ? op.cores(j) : op.cor) || null;
    for (let j = 0; j < aneis.length - 1; j++) {
      const A = aneis[j], B = aneis[j + 1];
      if (A.polo != null && B.polo != null) continue;
      for (let i = 0; i < K; i++) {
        const i1 = metade ? i + 1 : (i + 1) % K;
        let face;
        if (A.polo != null) face = [A.polo, B.idx[i1], B.idx[i]];
        else if (B.polo != null) face = [A.idx[i], A.idx[i1], B.polo];
        else if (op.triangular) {
          // perfil livre: quadriláteros não planos viram dois triângulos
          f.push([A.idx[i], A.idx[i1], B.idx[i1]]); cor.push(corDe(j)); anel.push(j);
          face = [A.idx[i], B.idx[i1], B.idx[i]];
        } else face = [A.idx[i], A.idx[i1], B.idx[i1], B.idx[i]];
        f.push(face); cor.push(corDe(j)); anel.push(j);
      }
    }
    const pri = aneis[0], ult = aneis[aneis.length - 1];
    if (pri.idx && op.fecharInicio !== false) { f.push(pri.idx.slice()); cor.push(op.corTampa || corDe(0)); }
    if (ult.idx && op.fecharFim !== false) { f.push(ult.idx.slice()); cor.push(op.corTampa || corDe(aneis.length - 2)); }
    if (metade && !op.semBase) {
      const ida = [], volta = [];
      for (const A of aneis) {
        if (A.polo != null) { ida.push(A.polo); volta.push(A.polo); }
        else { ida.push(A.idx[0]); volta.push(A.idx[K]); }
      }
      let base = ida.concat(volta.reverse());
      base = base.filter((x, i) => x !== base[(i + 1) % base.length]);
      f.push(base); cor.push(op.corBase || corDe(0));
    }
    const m = orientar(nova(v, f, cor));
    m.anel = f.map((_, i) => (i < anel.length ? anel[i] : null));
    if (metade && op.semBase) m.aberta = true;
    return m;
  }

  /** Perfil de elipsoide ao longo de z (de -c a +c), com `aneis` faixas. */
  function perfilElipse(c, a, b, aneis, ovo) {
    const p = [];
    for (let j = 0; j <= aneis; j++) {
      const fi = Math.PI * j / aneis;
      const s = Math.sin(fi) * (1 + (ovo || 0) * Math.cos(fi));
      p.push([-Math.cos(fi) * c, a * Math.max(0, s), b * Math.max(0, s)]);
    }
    return p;
  }

  /** Elipsoide com eixo X (comprimento cx, largura ly, altura hz), centrado na origem. */
  function elipsoide(cx, ly, hz, op) {
    op = op || {};
    const m = revolucao(perfilElipse(cx / 2, hz / 2, ly / 2, Math.round((op.aneis || 6) * config.suave), op.ovo), Object.assign({ perfilPronto: true }, op));
    return girar(m, 'y', 90);
  }
  /** Elipsoide de eixo vertical (Z). */
  function elipsoideZ(lx, ly, hz, op) {
    op = op || {};
    return revolucao(perfilElipse(hz / 2, lx / 2, ly / 2, Math.round((op.aneis || 6) * config.suave), op.ovo), Object.assign({ perfilPronto: true }, op));
  }
  /** Meio elipsoide deitado (eixo X), base plana em z = 0. */
  function domo(cx, ly, hz, op) {
    op = Object.assign({ metade: true }, op || {});
    const m = op.perfil ? revolucao(op.perfil, op)
      : revolucao(perfilElipse(cx / 2, ly / 2, hz, Math.round((op.aneis || 5) * config.suave), op.ovo), Object.assign({ perfilPronto: true }, op));
    return girar(girar(m, 'x', 90), 'z', 90);
  }
  /**
   * Tubo de eixo Z que começa em z = 0, com estações [[z, raio]] e
   * achatamento k (largura em Y = k × largura em X).
   */
  function tubo(estacoes, op) {
    op = op || {};
    const k = op.achat || 1;
    return revolucao(estacoes.map(([z, r]) => [z, r, r * k]), op);
  }
  const tronco = (comp, r1, r2, op) => tubo([[0, r1], [comp, r2]], op);
  const cone = (comp, r, op) => tubo([[0, r], [comp, 0]], op);

  /** Placa: polígono (u, v) extrudado com espessura e. plano 'xz' (em pé, de frente para Y), 'xy' (deitada) ou 'yz'. */
  function placa(poly, e, op) {
    op = op || {};
    const n = poly.length;
    const v = [];
    for (const [u, w] of poly) v.push([u, w, -e / 2]);
    for (const [u, w] of poly) v.push([u, w, e / 2]);
    const f = [];
    const cor = [];
    f.push(Array.from({ length: n }, (_, i) => n - 1 - i)); cor.push(op.cor);
    f.push(Array.from({ length: n }, (_, i) => n + i)); cor.push(op.cor);
    for (let i = 0; i < n; i++) { f.push([i, (i + 1) % n, n + (i + 1) % n, n + i]); cor.push(op.corLado || op.cor); }
    return noPlano(orientar(nova(v, f, cor)), op.plano || 'xy');
  }
  /** Peça plana de uma face só (asa de inseto, língua, pinta). */
  function chapa(poly, op) {
    op = op || {};
    const v = poly.map(([u, w]) => [u, w, 0]);
    const m = nova(v, [poly.map((_, i) => i)], op.cor);
    if (G.areaAssinada(poly) < 0) m.f[0].reverse();
    m.aberta = true;
    return noPlano(m, op.plano || 'xy');
  }
  function noPlano(m, plano) {
    if (plano === 'xz') return transformar(m, (p) => [p[0], -p[2], p[1]]);
    if (plano === 'yz') return transformar(m, (p) => [p[2], p[0], p[1]]);
    return m;
  }
  function caixa(lx, ly, lz, op) {
    op = op || {};
    const m = placa([[-lx / 2, -ly / 2], [lx / 2, -ly / 2], [lx / 2, ly / 2], [-lx / 2, ly / 2]], lz, { cor: op.cor });
    return mover(m, [0, 0, lz / 2]);
  }
  /** Malha livre: vértices e faces (as faces precisam ser planas). */
  const livre = (v, f, cor) => orientar(nova(v, f, cor));

  // ------------------------------------------------------- formas 2D úteis
  function oval(rx, ry, n) {
    n = n || 16;
    return Array.from({ length: n }, (_, i) => [rx * Math.cos(2 * Math.PI * i / n), ry * Math.sin(2 * Math.PI * i / n)]);
  }
  /** Folha / asa: ponta em (comp, 0), base arredondada em (0, 0). */
  function folha(comp, larg, n, assim) {
    n = n || 12;
    const p = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      p.push([comp * t, (larg / 2) * Math.sin(Math.PI * t) * (1 + (assim || 0) * (1 - t))]);
    }
    for (let i = n - 1; i > 0; i--) {
      const t = i / n;
      p.push([comp * t, -(larg / 2) * Math.sin(Math.PI * t) * (1 - (assim || 0) * (1 - t)) * 0.6]);
    }
    return p;
  }
  function estrela(rExt, rInt, pontas) {
    const p = [];
    for (let i = 0; i < pontas * 2; i++) {
      const r = i % 2 ? rInt : rExt;
      const a = Math.PI * i / pontas;
      p.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return p;
  }

  // ------------------------------------------------------------ pinturas
  /** Recorta o polígono convexo `p` (2D) pela face convexa `q` (Sutherland–Hodgman). */
  function recortar(p, q) {
    let out = p;
    const area = G.areaAssinada(q);
    for (let i = 0; i < q.length && out.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length];
      const dentro = (pt) => ((b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0])) * area >= 0;
      const inp = out;
      out = [];
      for (let j = 0; j < inp.length; j++) {
        const c = inp[j], d = inp[(j + 1) % inp.length];
        const cd = dentro(c), dd = dentro(d);
        if (cd) out.push(c);
        if (cd !== dd) {
          const x1 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
          const x2 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
          const t = x1 / (x1 - x2);
          out.push([c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t]);
        }
      }
    }
    return out;
  }

  function baseFace(pts) {
    const n = norm(normalNewell(pts));
    const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let cima = sub(ref, mul(n, dot(ref, n)));
    cima = norm(cima);
    const lado = cross(cima, n);
    return { n, cima, lado };
  }

  /**
   * Pinta uma elipse (raios rx na horizontal e ry na vertical da face) em
   * volta do ponto `c` da superfície. A pintura continua nas faces vizinhas.
   */
  /** Pinta um retângulo de largura w (horizontal da face) e altura h centrado em `c`. */
  function pintarRet(m, c, w, h, cor) { return pintar(m, c, w / 2, cor, h / 2, true); }

  function pintar(m, c, rx, cor, ry, retangulo) {
    ry = ry || rx;
    const alcance = Math.max(rx, ry);
    m.f.forEach((f, fi) => {
      const pts = f.map((i) => m.v[i]);
      const b = baseFace(pts);
      const o = pts[0];
      const dPlano = dot(sub(c, o), b.n);
      if (Math.abs(dPlano) > alcance * 0.9) return;
      if (dot(norm(sub(c, centro(m.v))), b.n) < -0.2) return;
      const cp = sub(c, mul(b.n, dPlano));
      const para2 = (p) => [dot(sub(p, o), b.lado), dot(sub(p, o), b.cima)];
      const face2 = pts.map(para2);
      const c2 = para2(cp);
      const circ = [];
      if (retangulo) {
        circ.push([c2[0] - rx, c2[1] - ry], [c2[0] + rx, c2[1] - ry], [c2[0] + rx, c2[1] + ry], [c2[0] - rx, c2[1] + ry]);
      } else for (let i = 0; i < 20; i++) {
        const a = 2 * Math.PI * i / 20;
        circ.push([c2[0] + rx * Math.cos(a), c2[1] + ry * Math.sin(a)]);
      }
      const rec = recortar(circ, face2);
      if (rec.length < 3 || Math.abs(G.areaAssinada(rec)) < 1e-3) return;
      const de2 = ([x, y]) => add(add(o, mul(b.lado, x)), mul(b.cima, y));
      m.deco[fi].push({ pts: rec.map(de2), cor });
    });
    return m;
  }
  /** Cor por direção da face: fn(normal) devolve a cor (ou nada para manter). */
  function colorirPorNormal(m, fn) {
    m.f.forEach((f, i) => {
      const c = fn(norm(normalNewell(f.map((k) => m.v[k]))));
      if (c) m.cor[i] = c;
    });
    return m;
  }
  /** Olho: branco, íris e pupila (ou só pupila se `iris` for nulo). */
  function olho(m, c, r, iris) {
    pintar(m, c, r, '#ffffff');
    if (iris) pintar(m, c, r * 0.65, iris);
    pintar(m, c, r * (iris ? 0.32 : 0.55), '#1b1b1b');
    return m;
  }
  /** Ponto na superfície de um elipsoide centrado em `ctr`, direção dada por ângulos (graus). */
  function naSuperficie(ctr, cx, ly, hz, azim, elev) {
    const a = azim * Math.PI / 180, e = elev * Math.PI / 180;
    return [ctr[0] + cx / 2 * Math.cos(e) * Math.cos(a), ctr[1] + ly / 2 * Math.cos(e) * Math.sin(a), ctr[2] + hz / 2 * Math.sin(e)];
  }

  // ------------------------------------------------- subdivisão de faces
  /** Corta um polígono 3D pelo plano (c, n): devolve a parte do lado positivo. */
  function cortar3D(pts, c, n, lado) {
    const out = [];
    const d = (p) => dot(sub(p, c), n) * lado;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const da = d(a), db = d(b);
      if (da >= 0) out.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) out.push(add(a, mul(sub(b, a), da / (da - db))));
    }
    return out;
  }

  function convexa(pts) {
    const n = normalNewell(pts);
    let sinal = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], c = pts[(i + 2) % pts.length];
      const z = dot(cross(sub(b, a), sub(c, b)), n);
      if (Math.abs(z) < 1e-9) continue;
      const sg = Math.sign(z);
      if (sinal && sg !== sinal) return false;
      sinal = sg;
    }
    return true;
  }

  /** Triangulação por orelhas de uma face plana (possivelmente côncava). */
  function orelhas(f, V) {
    const pts = f.map((i) => V[i]);
    const n = norm(normalNewell(pts));
    const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = norm(cross(ref, n)), w = cross(n, u);
    const p2 = pts.map((p) => [dot(p, u), dot(p, w)]);
    let idx = f.map((_, i) => i);
    const sentido = Math.sign(G.areaAssinada(p2)) || 1;
    const tris = [];
    let guarda = 0;
    while (idx.length > 3 && guarda++ < 1000) {
      let achou = false;
      for (let k = 0; k < idx.length; k++) {
        const a = idx[(k - 1 + idx.length) % idx.length], b = idx[k], c = idx[(k + 1) % idx.length];
        const A = p2[a], B = p2[b], Cc = p2[c];
        const cr = ((B[0] - A[0]) * (Cc[1] - A[1]) - (B[1] - A[1]) * (Cc[0] - A[0])) * sentido;
        if (cr <= 1e-9) continue;
        const dentro = idx.some((q) => q !== a && q !== b && q !== c && pontoDentro(p2[q], [A, B, Cc]));
        if (dentro) continue;
        tris.push([f[a], f[b], f[c]]);
        idx.splice(k, 1);
        achou = true;
        break;
      }
      if (!achou) break;
    }
    if (idx.length === 3) tris.push(idx.map((i) => f[i]));
    return tris.length ? tris : [f];
  }

  /**
   * Divide faces convexas maiores que `maxLado` (mm) em pedaços coplanares,
   * mantendo a malha fechada (os vizinhos recebem os mesmos vértices novos).
   */
  function subdividir(m0, maxLado) {
    const m = { v: m0.v.slice(), f: m0.f.map((f) => f.slice()), cor: m0.cor.slice(), deco: m0.deco.map((d) => d.slice()), aberta: m0.aberta, anel: m0.anel ? m0.anel.slice() : m0.f.map(() => null) };
    for (let volta = 0; volta < 10; volta++) {
      const cortes = new Map(); // aresta "a_b" (a < b) → [{ t, i }]
      const ponto = (a, b, p) => {
        const [x, y] = a < b ? [a, b] : [b, a];
        const key = x + '_' + y;
        const L = len(sub(m.v[y], m.v[x]));
        const t = len(sub(p, m.v[x])) / (L || 1);
        if (!cortes.has(key)) cortes.set(key, []);
        const lista = cortes.get(key);
        const ja = lista.find((q) => Math.abs(q.t - t) < 1e-7);
        if (ja) return ja.i;
        m.v.push(p);
        lista.push({ t, i: m.v.length - 1 });
        return m.v.length - 1;
      };
      // 1) escolhe as faces a dividir e registra os pontos de corte nas arestas
      const planos = new Map();
      const triangular = new Map(); // faces côncavas grandes: viram triângulos primeiro
      m.f.forEach((f, fi) => {
        const pts = f.map((i) => m.v[i]);
        let D = 0, pa = null, pb = null;
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
          const dd = len(sub(pts[j], pts[i]));
          if (dd > D) { D = dd; pa = pts[i]; pb = pts[j]; }
        }
        if (D <= maxLado) return;
        if (!convexa(pts)) { triangular.set(fi, true); return; }
        const c = centro(pts), n = norm(sub(pb, pa));
        planos.set(fi, { c, n });
        for (let i = 0; i < f.length; i++) {
          const a = f[i], b = f[(i + 1) % f.length];
          const da = dot(sub(m.v[a], c), n), db = dot(sub(m.v[b], c), n);
          if ((da > 1e-9 && db < -1e-9) || (da < -1e-9 && db > 1e-9)) ponto(a, b, add(m.v[a], mul(sub(m.v[b], m.v[a]), da / (da - db))));
        }
      });
      if (!planos.size && !triangular.size) break;
      // 2) todas as faces recebem os pontos criados nas suas arestas (sem junções em T)
      m.f = m.f.map((f) => {
        const out = [];
        for (let i = 0; i < f.length; i++) {
          const a = f[i], b = f[(i + 1) % f.length];
          out.push(a);
          const [x, y] = a < b ? [a, b] : [b, a];
          const lista = cortes.get(x + '_' + y);
          if (!lista) continue;
          const ord = lista.slice().sort((p, q) => p.t - q.t);
          for (const q of (a < b ? ord : ord.reverse())) if (q.i !== a && q.i !== b) out.push(q.i);
        }
        return out;
      });
      // 3) divide as faces escolhidas pelos pontos que agora fazem parte delas
      const nf = [], nc = [], nd = [], na = [];
      m.f.forEach((f, fi) => {
        if (triangular.has(fi)) {
          for (const t of orelhas(f, m.v)) { nf.push(t); nc.push(m.cor[fi]); nd.push(m.deco[fi]); na.push(m.anel[fi]); }
          return;
        }
        const pl = planos.get(fi);
        if (!pl) { nf.push(f); nc.push(m.cor[fi]); nd.push(m.deco[fi]); na.push(m.anel[fi]); return; }
        const lados = [[], []];
        for (const i of f) {
          const d = dot(sub(m.v[i], pl.c), pl.n);
          if (d >= -1e-6) lados[0].push(i);
          if (d <= 1e-6) lados[1].push(i);
        }
        for (const [lado, idx] of [[1, 0], [-1, 1]]) {
          if (lados[idx].length < 3) continue;
          nf.push(lados[idx]); nc.push(m.cor[fi]); na.push(m.anel[fi]);
          nd.push((m.deco[fi] || []).map((d) => ({ pts: cortar3D(d.pts, pl.c, pl.n, lado), cor: d.cor })).filter((d) => d.pts.length >= 3));
        }
      });
      m.f = nf; m.cor = nc; m.deco = nd; m.anel = na;
    }
    return m;
  }

  // ---------------------------------------------------------- planificação
  const ch2 = (p) => Math.round(p[0] * 100) + ',' + Math.round(p[1] * 100);

  function pontoDentro(pt, poly) {
    let dentro = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) dentro = !dentro;
    }
    return dentro;
  }
  function distSegmento(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function dentroFolgado(pt, poly) {
    if (!pontoDentro(pt, poly)) return false;
    for (let i = 0; i < poly.length; i++) if (distSegmento(pt, poly[i], poly[(i + 1) % poly.length]) < 0.05) return false;
    return true;
  }
  function pontoInterno(poly) {
    const c = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]);
    if (pontoDentro(c, poly)) return c;
    for (let i = 1; i < poly.length - 1; i++) {
      const t = [(poly[0][0] + poly[i][0] + poly[i + 1][0]) / 3, (poly[0][1] + poly[i][1] + poly[i + 1][1]) / 3];
      if (pontoDentro(t, poly)) return t;
    }
    return c;
  }
  function cruzam(p1, p2, p3, p4) {
    const o = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const e = 1e-7;
    const d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
    return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e));
  }
  function caixa2(p) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const q of p) { a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); }
    return [a, b, c, d];
  }
  function sobrepoem(A, B) {
    const ba = caixa2(A), bb = caixa2(B);
    if (ba[0] >= bb[2] - 1e-6 || bb[0] >= ba[2] - 1e-6 || ba[1] >= bb[3] - 1e-6 || bb[1] >= ba[3] - 1e-6) return false;
    for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
      if (cruzam(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
    }
    if (dentroFolgado(pontoInterno(A), B) || dentroFolgado(pontoInterno(B), A)) return true;
    for (const p of A) if (dentroFolgado(p, B)) return true;
    for (const p of B) if (dentroFolgado(p, A)) return true;
    return false;
  }

  /**
   * Planifica a malha. Devolve { pecas: [...], erroMax } onde cada peça tem
   * faces 2D, abas, números de colagem e decorações já no plano.
   */
  function desdobrar(m, op) {
    op = op || {};
    const w = op.aba || 7;
    const nf = m.f.length;
    const P3 = m.f.map((f) => f.map((i) => m.v[i]));
    const N3 = P3.map((p) => norm(normalNewell(p)));
    const areas = P3.map((p) => len(normalNewell(p)) / 2);

    const arestas = new Map(); // chave → [{f, k}]
    m.f.forEach((f, fi) => f.forEach((a, k) => {
      const b = f[(k + 1) % f.length];
      const key = a < b ? a + '_' + b : b + '_' + a;
      if (!arestas.has(key)) arestas.set(key, []);
      arestas.get(key).push({ f: fi, k });
    }));
    const chave = (fi, k) => { const f = m.f[fi]; const a = f[k], b = f[(k + 1) % f.length]; return a < b ? a + '_' + b : b + '_' + a; };

    const pos = new Array(nf).fill(null);
    const tf = new Array(nf).fill(null); // transformação 3D → 2D de cada face
    const pecaDe = new Array(nf).fill(-1);
    const grupos = [];

    function colocarRaiz(fi) {
      const p = P3[fi];
      const O = p[0];
      const d3 = norm(sub(p[1], p[0]));
      const l3 = cross(N3[fi], d3);
      tf[fi] = { O, d3, l3, O2: [0, 0], d2: [1, 0], l2: [0, 1] };
      return p.map((v) => [dot(sub(v, O), d3), dot(sub(v, O), l3)]);
    }
    function colocarFilho(fi, k, gi) {
      const f = m.f[fi], g = m.f[gi];
      const a = f[k], b = f[(k + 1) % f.length];
      const kg = g.findIndex((x, t) => x === b && g[(t + 1) % g.length] === a);
      if (kg < 0) return null;
      const A2 = pos[fi][k], B2 = pos[fi][(k + 1) % f.length];
      const A = m.v[a], B = m.v[b];
      const d3 = norm(sub(A, B));
      const l3 = cross(N3[gi], d3);
      const L2 = Math.hypot(A2[0] - B2[0], A2[1] - B2[1]);
      const d2 = [(A2[0] - B2[0]) / L2, (A2[1] - B2[1]) / L2];
      const l2 = [-d2[1], d2[0]];
      const T = { O: B, d3, l3, O2: B2, d2, l2 };
      const pts = g.map((vi) => para2(T, m.v[vi]));
      pts[kg] = B2; pts[(kg + 1) % g.length] = A2;
      return { pts, T };
    }
    function para2(T, v) {
      const r = sub(v, T.O);
      const u = dot(r, T.d3), q = dot(r, T.l3);
      return [T.O2[0] + u * T.d2[0] + q * T.l2[0], T.O2[1] + u * T.d2[1] + q * T.l2[1]];
    }

    const ordem = [...Array(nf).keys()].sort((x, y) => areas[y] - areas[x]);
    for (const r of ordem) {
      if (pecaDe[r] >= 0) continue;
      const gid = grupos.length;
      const grupo = { faces: [r] };
      grupos.push(grupo);
      pos[r] = colocarRaiz(r);
      pecaDe[r] = gid;
      let cx = caixa2(pos[r]);
      const centroRaiz = [(cx[0] + cx[2]) / 2, (cx[1] + cx[3]) / 2];
      const lim = op.limite;
      const cabe = (b) => {
        if (!lim) return true;
        const ww = b[2] - b[0] + 2 * w, hh = b[3] - b[1] + 2 * w;
        return (ww <= lim.w && hh <= lim.h) || (hh <= lim.w && ww <= lim.h);
      };
      const fila = [];
      const empilhar = (fi) => {
        m.f[fi].forEach((_, k) => {
          for (const o of arestas.get(chave(fi, k))) {
            if (o.f === fi || pecaDe[o.f] >= 0) continue;
            const res = colocarFilho(fi, k, o.f);
            if (!res) continue;
            const c2 = res.pts.reduce((s2, p) => [s2[0] + p[0] / res.pts.length, s2[1] + p[1] / res.pts.length], [0, 0]);
            const mesmoAnel = m.anel && m.anel[fi] != null && m.anel[fi] === m.anel[o.f];
            const ang = Math.acos(Math.max(-1, Math.min(1, dot(N3[fi], N3[o.f])))) * 180 / Math.PI;
            fila.push({ g: o.f, res, d: Math.hypot(c2[0] - centroRaiz[0], c2[1] - centroRaiz[1]), pref: mesmoAnel, ang: Math.round(ang / 4) });
          }
        });
      };
      empilhar(r);
      while (fila.length) {
        // cresce a peça pelo vizinho mais próximo do centro: peças compactas encaixam melhor na folha
        // prioridade: a face que menos aumenta o retângulo ocupado (peça compacta); empate: a mais próxima do centro
        let mi = -1, melhor = Infinity;
        const areaAtual = (cx[2] - cx[0]) * (cx[3] - cx[1]);
        for (let i = 0; i < fila.length; i++) {
          if (pecaDe[fila[i].g] >= 0) continue;
          const b = caixa2([[cx[0], cx[1]], [cx[2], cx[3]]].concat(fila[i].res.pts));
          // faces do mesmo anel primeiro: cada faixa do corpo sai inteira, como um arco
          // junções mais planas primeiro (superfícies retas saem inteiras); depois o mesmo anel; depois a mais compacta
          const sc = fila[i].ang * 1e13 - (fila[i].pref ? 1e12 : 0) + (b[2] - b[0]) * (b[3] - b[1]) - areaAtual + fila[i].d * 1e-3;
          if (sc < melhor) { melhor = sc; mi = i; }
        }
        if (mi < 0) break;
        const c = fila.splice(mi, 1)[0];
        const bNova = caixa2([[cx[0], cx[1]], [cx[2], cx[3]]].concat(c.res.pts));
        if (!cabe(bNova)) continue;
        if (grupo.faces.some((q) => sobrepoem(c.res.pts, pos[q]))) continue;
        pos[c.g] = c.res.pts; tf[c.g] = c.res.T; pecaDe[c.g] = gid;
        cx = bNova;
        grupo.faces.push(c.g);
        empilhar(c.g);
      }
    }

    // Arestas cortadas: número de colagem e aba em um dos lados
    let numero = 0;
    const planas = new Set();
    const curvas = new Set();
    const abasPorGrupo = grupos.map(() => []);
    const rotulos = grupos.map(() => []);
    const ocupado = grupos.map((gr) => gr.faces.map((fi) => pos[fi]));
    let erroMax = 0;
    for (const [, lista] of arestas) {
      if (lista.length !== 2) continue;
      const [x, y] = lista;
      const xa = pos[x.f][x.k], xb = pos[x.f][(x.k + 1) % m.f[x.f].length];
      const ya = pos[y.f][y.k], yb = pos[y.f][(y.k + 1) % m.f[y.f].length];
      const mesmaPeca = pecaDe[x.f] === pecaDe[y.f];
      if (mesmaPeca && ch2(xa) === ch2(yb) && ch2(xb) === ch2(ya)) { // dobra
        const cosAng = dot(N3[x.f], N3[y.f]);
        if (cosAng > 0.99995) planas.add(ch2(xa) + '|' + ch2(xb)).add(ch2(xb) + '|' + ch2(xa)); // mesmo plano: sem linha
        else if (cosAng > (op.curvar != null ? op.curvar : 0.94)) curvas.add(ch2(xa) + '|' + ch2(xb)).add(ch2(xb) + '|' + ch2(xa)); // ângulo pequeno: curvar o papel
        continue;
      }
      numero++;
      const L = Math.hypot(xb[0] - xa[0], xb[1] - xa[1]);
      const tentar = (lado, a, b) => {
        const gid = pecaDe[lado.f];
        const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
        const n = [d[1], -d[0]];
        const ww = Math.min(w, L * 0.45);
        const c = Math.min(ww, L * 0.3);
        if (ww < 2) return false;
        const trap = [a, [a[0] + n[0] * ww + d[0] * c, a[1] + n[1] * ww + d[1] * c], [b[0] + n[0] * ww - d[0] * c, b[1] + n[1] * ww - d[1] * c], b];
        if (ocupado[gid].some((q) => sobrepoem(trap, q))) return false;
        ocupado[gid].push(trap);
        abasPorGrupo[gid].push({ a, b, w: ww, tipo: 'cola' });
        return true;
      };
      const comAba = tentar(x, xa, xb) || tentar(y, ya, yb);
      for (const [lado, a, b] of [[x, xa, xb], [y, ya, yb]]) {
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
        const dentroDir = [-d[1], d[0]];
        const recuo = Math.min(2.2, L * 0.25);
        rotulos[pecaDe[lado.f]].push({ x: mid[0] + dentroDir[0] * recuo, y: mid[1] + dentroDir[1] * recuo, t: String(numero), tam: Math.max(1.4, Math.min(2.2, L * 0.18)) });
      }
      if (!comAba) numero += 0; // sem espaço para aba: a emenda fica só com o número
    }
    // conferência: arestas no plano com o mesmo comprimento do 3D
    for (let fi = 0; fi < nf; fi++) {
      const f = m.f[fi];
      for (let k = 0; k < f.length; k++) {
        const l3 = len(sub(m.v[f[(k + 1) % f.length]], m.v[f[k]]));
        const a = pos[fi][k], b = pos[fi][(k + 1) % f.length];
        erroMax = Math.max(erroMax, Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - l3));
      }
    }

    const espelho = (p) => [p[0], -p[1]]; // imprime o lado de fora para cima
    const pecas = grupos.map((gr, gid) => {
      const molde = G.montarMolde(gr.faces.map((fi) => pos[fi]), abasPorGrupo[gid]);
      const faces = gr.faces.map((fi) => ({
        pts: pos[fi].map(espelho), cor: m.cor[fi],
        deco: (m.deco[fi] || []).map((d) => ({ pts: d.pts.map((p) => espelho(para2(tf[fi], p))), cor: d.cor })),
      }));
      return {
        contornos: molde.contornos.map((c) => c.map(espelho)),
        abas: molde.abas.map((a) => ({ pts: a.pts.map(espelho), tipo: a.tipo })),
        dobras: molde.dobras.filter((d) => { const k = ch2(d[0]) + '|' + ch2(d[1]); return !planas.has(k) && !curvas.has(k); }).map((d) => d.map(espelho)),
        curvas: molde.dobras.filter((d) => curvas.has(ch2(d[0]) + '|' + ch2(d[1]))).map((d) => d.map(espelho)),
        nucleo: molde.nucleo.map((c) => c.map(espelho)),
        abasPerdidas: molde.abasPerdidas,
        faces,
        textos: rotulos[gid].map((r) => Object.assign({}, r, { y: -r.y, numero: true })),
      };
    });
    return { pecas, erroMax, pares: numero };
  }

  return {
    config, refinarPerfil,
    sub, add, mul, dot, cross, len, norm, normalNewell, volume,
    nova, orientar, transformar, girar, mover, escalar, posar, rot,
    revolucao, perfilElipse, elipsoide, elipsoideZ, domo, tubo, tronco, cone, placa, chapa, caixa, livre,
    oval, folha, estrela, pintar, pintarRet, olho, naSuperficie, colorirPorNormal,
    desdobrar, sobrepoem, subdividir,
  };
});
