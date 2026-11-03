/*
 * Gerador de Moldes — geometria das peças (planificação).
 *
 * Todas as medidas internas estão em milímetros, eixo y para baixo.
 * Cada gerador recebe medidas em mm e um contexto { t, aba } onde
 *   t   = espessura do material (mm)
 *   aba = largura padrão das abas de cola (mm)
 * e devolve { pecas, passos, verificacoes, avisos }.
 *
 * Regra de espessura (linha neutra): o material dobra em torno do meio da
 * sua espessura. Por isso, para medidas EXTERNAS, cada painel entre duas
 * dobras mede (medida externa − t) e um tubo de diâmetro externo D tem
 * circunferência π·(D − t) no molde. Para papel (0,1 mm) a correção é
 * desprezível; para papelão de 3 a 7 mm ela é o que faz a peça fechar.
 */
(function (raiz, fabrica) {
  const G = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = G;
  else raiz.Geometria = G;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  /** Acima desta espessura (mm) as junções em "T" são coladas de topo, sem abas. */
  const LIMIAR_TOPO = 1.5;

  // ---------------------------------------------------------------- utilidades
  const ch = (p) => Math.round(p[0] * 100) + ',' + Math.round(p[1] * 100);
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

  function areaAssinada(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  }

  function limpar(pts) {
    const out = [];
    for (const p of pts) {
      if (!out.length || dist(out[out.length - 1], p) > 1e-6) out.push([p[0], p[1]]);
    }
    while (out.length > 1 && dist(out[0], out[out.length - 1]) <= 1e-6) out.pop();
    return out;
  }

  function comprimentoPolilinha(pts, fechado) {
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++) s += dist(pts[i], pts[i + 1]);
    if (fechado && pts.length > 1) s += dist(pts[pts.length - 1], pts[0]);
    return s;
  }

  function caixaLimite(listas) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const pts of listas) for (const p of pts) {
      if (p[0] < minx) minx = p[0];
      if (p[1] < miny) miny = p[1];
      if (p[0] > maxx) maxx = p[0];
      if (p[1] > maxy) maxy = p[1];
    }
    return { minx, miny, maxx, maxy, w: maxx - minx, h: maxy - miny };
  }

  function segmentosCruzam(p1, p2, p3, p4) {
    const o = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const e = 1e-9;
    const d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
    return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) &&
           ((d3 > e && d4 < -e) || (d3 < -e && d4 > e));
  }

  /** true se o contorno não se cruza (abas não invadem outras partes da peça). */
  function poligonoSimples(pts) {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (segmentosCruzam(a, b, pts[j], pts[(j + 1) % n])) return false;
      }
    }
    return true;
  }

  /** Pontos de um arco de círculo (inclui as duas pontas). */
  function arco(cx, cy, r, a0, a1, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  }

  /** Meia elipse de semi-eixos a (horizontal) e b (altura), da esquerda para a direita, por cima. */
  function meiaElipse(a, b, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const th = Math.PI - Math.PI * i / n;
      pts.push([a * Math.cos(th), -b * Math.sin(th)]);
    }
    return pts;
  }

  function meioPerimetroElipse(a, b) {
    return comprimentoPolilinha(meiaElipse(a, b, 4000), false);
  }

  function circulo(r, passo) {
    const n = Math.max(36, Math.ceil(TAU * r / (passo || 1.5)));
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([r * Math.cos(TAU * i / n), r * Math.sin(TAU * i / n)]);
    return pts;
  }

  function elipse(a, b) {
    const n = Math.max(48, Math.ceil(Math.PI * (a + b) / 1.5));
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([a * Math.cos(TAU * i / n), b * Math.sin(TAU * i / n)]);
    return pts;
  }

  /** Polígono regular de n lados construído sobre a aresta p→q, do lado oposto a `longeDe`. */
  function poligonoSobreAresta(p, q, n, longeDe) {
    const L = dist(p, q);
    const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const construir = (sinal) => {
      const pts = [p, q];
      let cur = q, a = ang + sinal * TAU / n;
      for (let k = 2; k < n; k++) {
        cur = [cur[0] + L * Math.cos(a), cur[1] + L * Math.sin(a)];
        pts.push(cur);
        a += sinal * TAU / n;
      }
      return pts;
    };
    let pts = construir(1);
    const lado = (pt) => (q[0] - p[0]) * (pt[1] - p[1]) - (q[1] - p[1]) * (pt[0] - p[0]);
    const c = pts.reduce((s, v) => [s[0] + v[0] / n, s[1] + v[1] / n], [0, 0]);
    if (Math.sign(lado(c)) === Math.sign(lado(longeDe))) pts = construir(-1);
    return pts;
  }

  // ------------------------------------------------------------ montagem do molde
  const aba = (a, b, w, tipo, chanfro) => ({ a, b, w, tipo: tipo || 'cola', chanfro });

  /** Ângulo livre por fora do contorno no vértice entre a aresta que chega (u) e a que sai (d). */
  function anguloLivre(u, d) {
    const giro = Math.atan2(u[0] * d[1] - u[1] * d[0], u[0] * d[0] + u[1] * d[1]);
    return Math.PI + giro;
  }

  /**
   * Pontos externos da aba. O chanfro de cada ponta respeita a meia-abertura
   * livre do vértice (corte em meia-esquadria), para a aba nunca invadir a
   * peça vizinha nem a aba vizinha. Se não houver espaço, a aba fica mais estreita.
   */
  function pontosAba(a, b, sp, livreA, livreB) {
    const L = dist(a, b);
    const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const n = [d[1], -d[0]]; // normal para fora (polígonos com área positiva)
    let w = sp.w;
    const c0 = sp.chanfro != null ? sp.chanfro
      : sp.tipo === 'encaixe' ? Math.min(w * 0.5, L * 0.15)
      : Math.min(w, L * 0.3);
    const psi0 = Math.atan2(w, Math.max(c0, 1e-9));
    const psiA = Math.min(psi0, livreA / 2 - 0.03);
    const psiB = Math.min(psi0, livreB / 2 - 0.03);
    if (psiA < 0.04 || psiB < 0.04) return null;
    let ca = w / Math.tan(psiA), cb = w / Math.tan(psiB);
    if (ca + cb > 0.9 * L) {
      const f = 0.9 * L / (ca + cb);
      w *= f; ca *= f; cb *= f;
    }
    if (w < 1.5) return null;
    return [
      [a[0] + n[0] * w + d[0] * ca, a[1] + n[1] * w + d[1] * ca],
      [b[0] + n[0] * w - d[0] * cb, b[1] + n[1] * w - d[1] * cb],
    ];
  }

  const direcao = (e) => {
    const L = dist(e.a, e.b);
    return [(e.b[0] - e.a[0]) / L, (e.b[1] - e.a[1]) / L];
  };

  /**
   * Junta painéis que compartilham arestas: aresta compartilhada vira dobra,
   * aresta livre vira corte, e arestas listadas em `abas` ganham aba.
   */
  function montarMolde(paineis, abas) {
    const specs = new Map();
    for (const ab of abas || []) {
      specs.set(ch(ab.a) + '|' + ch(ab.b), ab);
      specs.set(ch(ab.b) + '|' + ch(ab.a), ab);
    }
    const porChave = new Map();
    const lista = [];
    const nucleo = [];
    for (const p of paineis) {
      let pts = limpar(p);
      if (pts.length < 3) continue;
      if (areaAssinada(pts) < 0) pts = pts.slice().reverse();
      nucleo.push(pts);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const e = { a, b, k: ch(a) + '>' + ch(b), kr: ch(b) + '>' + ch(a) };
        porChave.set(e.k, e);
        lista.push(e);
      }
    }
    const dobras = [];
    const borda = [];
    const vistos = new Set();
    for (const e of lista) {
      if (porChave.has(e.kr)) {
        if (!vistos.has(e.kr)) { dobras.push([e.a, e.b]); vistos.add(e.k); }
      } else borda.push(e);
    }
    const porInicio = new Map();
    for (const e of borda) {
      const k = ch(e.a);
      if (!porInicio.has(k)) porInicio.set(k, []);
      porInicio.get(k).push(e);
    }
    const usados = new Set();
    const contornos = [];
    const poligonosAba = [];
    let abasPerdidas = 0;
    for (const e0 of borda) {
      if (usados.has(e0)) continue;
      const cadeia = [];
      let e = e0;
      while (e && !usados.has(e)) {
        usados.add(e);
        cadeia.push(e);
        e = (porInicio.get(ch(e.b)) || []).find((x) => !usados.has(x));
      }
      const laco = [];
      const m = cadeia.length;
      for (let i = 0; i < m; i++) {
        const ed = cadeia[i];
        laco.push(ed.a);
        const sp = specs.get(ch(ed.a) + '|' + ch(ed.b));
        if (!sp) continue;
        const dd = direcao(ed);
        const livreA = anguloLivre(direcao(cadeia[(i - 1 + m) % m]), dd);
        const livreB = anguloLivre(dd, direcao(cadeia[(i + 1) % m]));
        const ext = pontosAba(ed.a, ed.b, sp, livreA, livreB);
        if (!ext) { abasPerdidas++; continue; }
        laco.push(ext[0], ext[1]);
        poligonosAba.push({ pts: [ed.a, ext[0], ext[1], ed.b], tipo: sp.tipo });
        dobras.push([ed.a, ed.b]);
      }
      contornos.push(limpar(laco));
    }
    contornos.sort((x, y) => Math.abs(areaAssinada(y)) - Math.abs(areaAssinada(x)));
    return { contornos, abas: poligonosAba, dobras, nucleo, abasPerdidas };
  }

  // --------------------------------------------------------------------- peças
  const mm = (x) => (Math.round(x * 100) / 100).toString().replace('.', ',');
  const fmt = (mm, casas) => (mm / 10).toFixed(casas == null ? 1 : casas).replace('.', ',');

  function criarPeca(codigo, nome, molde, extra) {
    const bb = caixaLimite(molde.nucleo.length ? molde.nucleo : molde.contornos);
    const p = Object.assign({
      codigo, nome, qtd: 1,
      contornos: molde.contornos,
      abas: molde.abas,
      dobras: molde.dobras,
      marcas: [],
      textos: [],
      rotulo: [(bb.minx + bb.maxx) / 2, (bb.miny + bb.maxy) / 2],
      medidas: fmt(bb.w) + ' × ' + fmt(bb.h) + ' cm',
    }, extra || {});
    p.simples = p.contornos.every(poligonoSimples);
    p.abasPerdidas = molde.abasPerdidas || 0;
    return p;
  }

  function pecaPlana(codigo, nome, pts, extra) {
    return criarPeca(codigo, nome, montarMolde([pts], []), extra);
  }

  /** Abas em cada segmento de uma polilinha (dentes de colagem). */
  function dentes(pts, w, lista, tipo) {
    for (let i = 0; i < pts.length - 1; i++) lista.push(aba(pts[i], pts[i + 1], w, tipo || 'cola'));
  }

  const nSegmentos = (comp, comDentes) =>
    comDentes ? Math.max(8, Math.round(comp / 14)) : Math.max(24, Math.ceil(comp / 2));

  function exigir(cond, msg) { if (!cond) throw new Error(msg); }

  // ================================================================ FORMAS BÁSICAS

  function gerarCaixa(v, ctx) {
    const t = ctx.t, w = ctx.aba;
    exigir(v.comp > 2 * t && v.larg > 2 * t && v.alt > 2 * t,
      'As medidas da caixa precisam ser maiores que o dobro da espessura do material.');
    const L = v.comp - t, W = v.larg - t, H = v.alt - t;
    const paineis = [
      [[0, 0], [L, 0], [L, W], [0, W]],              // fundo
      [[0, -H], [L, -H], [L, 0], [0, 0]],            // frente
      [[0, W], [L, W], [L, W + H], [0, W + H]],      // fundo-trás
      [[-H, 0], [0, 0], [0, W], [-H, W]],            // lateral esquerda
      [[L, 0], [L + H, 0], [L + H, W], [L, W]],      // lateral direita
    ];
    const abas = [
      aba([0, 0], [0, -H], w), aba([L, -H], [L, 0], w),
      aba([0, W], [0, W + H], w), aba([L, W], [L, W + H], w),
    ];
    if (v.tampa === 'sim') {
      paineis.push([[0, W + H], [L, W + H], [L, 2 * W + H], [0, 2 * W + H]]);
      abas.push(aba([0, 2 * W + H], [L, 2 * W + H], Math.min(0.6 * H, 25, 0.6 * W), 'encaixe'));
    }
    const peca = criarPeca('A', 'Caixa', montarMolde(paineis, abas), { rotulo: [L / 2, W / 2] });
    const passos = [
      'Recorte pela linha contínua e vinque todas as linhas tracejadas antes de dobrar.',
      'Dobre as quatro paredes para cima, em volta do fundo.',
      'Passe cola nas abas cinza das paredes da frente e de trás e cole-as por dentro das laterais.',
    ];
    if (v.tampa === 'sim') passos.push('A tampa fecha sozinha: dobre a aba de encaixe (sem cola) e encaixe-a por dentro da frente.');
    return {
      pecas: [peca], passos,
      verificacoes: [
        { ok: true, texto: `Painéis do molde: ${mm(L)} × ${mm(W)} × ${mm(H)} mm (medida externa menos ${mm(t)} mm de espessura).` },
      ],
      avisos: [],
    };
  }

  function gerarCilindro(v, ctx) {
    const t = ctx.t, w = ctx.aba;
    exigir(v.diam > 2 * t && v.alt > t, 'Diâmetro e altura precisam ser maiores que a espessura do material.');
    const Dm = v.diam - t;
    const C = Math.PI * Dm, H = v.alt;
    const tampas = v.tampas;
    const comDentes = tampas !== 'nenhuma';
    const n = Math.max(8, Math.round(C / 14));
    const wd = Math.min(w, (v.diam - 2 * t) * 0.3, 10);
    const topo = [], base = [];
    for (let i = 0; i <= n; i++) topo.push([C * i / n, 0]);
    for (let i = n; i >= 0; i--) base.push([C * i / n, H]);
    const pts = topo.concat(base);
    const abas = [aba([C, 0], [C, H], w)];
    if (tampas === 'ambas' || tampas === 'uma') dentes(base.slice().reverse(), wd, abas);
    if (tampas === 'ambas') dentes(topo, wd, abas);
    const pecas = [criarPeca('A', 'Corpo do cilindro', montarMolde([pts], abas))];
    if (comDentes) {
      const r = (v.diam - 2 * t) / 2;
      pecas.push(pecaPlana('B', 'Tampa', circulo(r), {
        qtd: tampas === 'ambas' ? 2 : 1, medidas: 'Ø ' + fmt(2 * r) + ' cm', rotulo: [0, 0],
      }));
    }
    const passos = [
      'Recorte e vinque as dobras. Enrole o corpo A até a aba lateral encostar na borda oposta e cole.',
    ];
    if (comDentes) passos.push('Dobre os dentes para dentro, passe cola neles e assente a tampa B por cima.');
    return {
      pecas, passos,
      verificacoes: [{ ok: true, texto: `Comprimento do corpo = π × (${mm(v.diam)} − ${mm(t)}) mm = ${mm(C)} mm.` }],
      avisos: [],
    };
  }

  /**
   * Setor de coroa circular (raios s1 > s2 ≥ 0, abertura th). Acima de 270° o
   * setor sai em duas metades, cada uma com a sua aba, para a aba não bater
   * na borda oposta.
   */
  function moldesSetor(s1, s2, th, w, dentesMaior, wdM, dentesMenor, wdm) {
    const partes = th > 1.5 * Math.PI ? 2 : 1;
    const thp = th / partes;
    const moldes = [];
    for (let k = 0; k < partes; k++) {
      const a0 = Math.PI / 2 - thp / 2;
      const fora = arco(0, 0, s1, a0, a0 + thp, nSegmentos(s1 * thp, dentesMaior));
      const dentro = s2 > 0 ? arco(0, 0, s2, a0 + thp, a0, nSegmentos(s2 * thp, dentesMenor)) : [[0, 0]];
      const abas = [aba(dentro[dentro.length - 1], fora[0], w)];
      if (dentesMaior) dentes(fora, wdM, abas);
      if (dentesMenor && s2 > 0) dentes(dentro, wdm, abas);
      moldes.push(montarMolde([fora.concat(dentro)], abas));
    }
    return moldes;
  }

  const graus = (r) => (r * 180 / Math.PI).toFixed(1).replace('.', ',');

  function pecasSetor(moldes, codigo, nome, rotulo) {
    if (moldes.length === 1) return [criarPeca(codigo, nome, moldes[0], { rotulo })];
    return moldes.map((m, k) => criarPeca(codigo + (k + 1), nome + ' (metade ' + (k + 1) + ')', m, { rotulo }));
  }

  function gerarCone(v, ctx) {
    const t = ctx.t, w = ctx.aba;
    exigir(v.diam > 2 * t && v.alt > 0, 'Informe diâmetro e altura maiores que zero.');
    const R = (v.diam - t) / 2;
    const s = Math.hypot(R, v.alt);
    const th = TAU * R / s;
    const comBase = v.base === 'sim';
    const moldes = moldesSetor(s, 0, th, w, comBase, Math.min(w, R * 0.5, 10), false, 0);
    const pecas = pecasSetor(moldes, 'A', 'Cone', [0, s * 0.62]);
    if (comBase) {
      const r = (v.diam - 2 * t) / 2;
      pecas.push(pecaPlana('B', 'Base', circulo(r), { medidas: 'Ø ' + fmt(2 * r) + ' cm', rotulo: [0, 0] }));
    }
    const passos = moldes.length === 1
      ? ['Recorte e vinque. Feche o cone colando a aba lateral por baixo da borda oposta.']
      : ['Recorte e vinque. O cone é baixo e saiu em duas metades: cole a aba de cada metade por baixo da borda da outra.'];
    if (comBase) passos.push('Dobre os dentes para dentro, passe cola e assente a base B.');
    return {
      pecas, passos,
      verificacoes: [
        { ok: true, texto: `Geratriz ${fmt(s)} cm; abertura total do setor ${graus(th)}°.` },
        { ok: true, texto: `Arco do setor = ${fmt(s * th)} cm = circunferência da base na linha neutra.` },
      ],
      avisos: [],
    };
  }

  /** Tronco de cone (copo, cauda, funil). Devolve também a peça pronta para reuso. */
  function moldeTroncoCone(D1, D2, H, ctx, opc) {
    const t = ctx.t, w = ctx.aba;
    let R1 = (D1 - t) / 2, R2 = (D2 - t) / 2;
    let dentesMaior = opc.dentesMaior, dentesMenor = opc.dentesMenor;
    if (R2 > R1) { [R1, R2] = [R2, R1]; [dentesMaior, dentesMenor] = [dentesMenor, dentesMaior]; }
    R2 = Math.max(R2, 0.5);
    exigir(R1 - R2 > 0.05, 'Os dois diâmetros são iguais: use a forma Cilindro.');
    const l = Math.hypot(R1 - R2, H);
    const s1 = R1 * l / (R1 - R2), s2 = s1 - l;
    const th = TAU * R1 / s1;
    const moldes = moldesSetor(s1, s2, th, w, dentesMaior, Math.min(w, R1 * 0.5, 10), dentesMenor, Math.min(w, R2 * 0.5, s2 * 0.3, 8));
    return { moldes, s1, s2, th, R1, R2, l, rotulo: [0, (s1 + s2) / 2] };
  }

  function gerarTroncoCone(v, ctx) {
    const t = ctx.t;
    exigir(v.d1 > 2 * t && v.d2 >= 0 && v.alt > 0, 'Informe os diâmetros e a altura.');
    const tampas = v.tampas;
    const r = moldeTroncoCone(v.d1, v.d2, v.alt, ctx, {
      dentesMaior: tampas === 'ambas' || tampas === 'maior',
      dentesMenor: tampas === 'ambas',
    });
    const pecas = pecasSetor(r.moldes, 'A', 'Tronco de cone', r.rotulo);
    if (tampas !== 'nenhuma') {
      const rb = Math.max(v.d1, v.d2) / 2 - t;
      pecas.push(pecaPlana('B', 'Tampa maior', circulo(rb), { medidas: 'Ø ' + fmt(2 * rb) + ' cm', rotulo: [0, 0] }));
      if (tampas === 'ambas') {
        const rs = Math.min(v.d1, v.d2) / 2 - t;
        if (rs > 1) pecas.push(pecaPlana('C', 'Tampa menor', circulo(rs), { medidas: 'Ø ' + fmt(2 * rs) + ' cm', rotulo: [0, 0] }));
      }
    }
    return {
      pecas,
      passos: [
        r.moldes.length === 1
          ? 'Recorte e vinque. Enrole a peça A e cole a aba lateral por baixo da borda oposta.'
          : 'Recorte e vinque. A peça saiu em duas metades (A1 e A2): cole a aba de cada metade por baixo da borda da outra.',
      ].concat(tampas !== 'nenhuma' ? ['Dobre os dentes para dentro, passe cola e assente as tampas.'] : []),
      verificacoes: [
        { ok: true, texto: `Raios do setor: ${fmt(r.s1)} cm e ${fmt(r.s2)} cm; abertura total ${graus(r.th)}°.` },
        { ok: true, texto: `Arco maior = ${fmt(r.s1 * r.th)} cm (π × ${fmt(2 * r.R1)}); arco menor = ${fmt(r.s2 * r.th)} cm (π × ${fmt(2 * r.R2)}).` },
      ],
      avisos: [],
    };
  }

  /** Prisma regular de n lados. modo: 'ambas' | 'uma' | 'nenhuma' | 'abas' (abas de fixação nas duas pontas). */
  function moldePrisma(n, lado, H, ctx, modo) {
    const t = ctx.t, w = ctx.aba;
    const a = lado - t * Math.tan(Math.PI / n);
    exigir(a > 0 && H > 0, 'Lado e altura precisam ser maiores que a espessura.');
    const paineis = [];
    const abas = [];
    for (let j = 0; j < n; j++) {
      paineis.push([[j * a, 0], [(j + 1) * a, 0], [(j + 1) * a, H], [j * a, H]]);
      if (modo === 'abas') {
        abas.push(aba([j * a, 0], [(j + 1) * a, 0], Math.min(w, a * 0.8)));
        abas.push(aba([(j + 1) * a, H], [j * a, H], Math.min(w, a * 0.8)));
      }
    }
    abas.push(aba([n * a, 0], [n * a, H], w));
    const tampa = (p, q, longe) => {
      const pts = poligonoSobreAresta(p, q, n, longe);
      paineis.push(pts);
      for (let k = 1; k < n; k++) abas.push(aba(pts[k], pts[(k + 1) % n], Math.min(w, a * 0.45)));
    };
    const jm = Math.floor(n / 2) * a; // tampas presas na face do meio: molde mais estreito
    if (modo === 'ambas') tampa([jm, 0], [jm + a, 0], [jm + a / 2, H]);
    if (modo === 'ambas' || modo === 'uma') tampa([jm, H], [jm + a, H], [jm + a / 2, 0]);
    return { molde: montarMolde(paineis, abas), a, rotulo: [a * n / 2, H / 2] };
  }

  function gerarPrisma(v, ctx) {
    const n = Math.round(v.lados);
    exigir(n >= 3 && n <= 12, 'O prisma deve ter de 3 a 12 lados.');
    const r = moldePrisma(n, v.lado, v.alt, ctx, v.tampas);
    return {
      pecas: [criarPeca('A', `Prisma de ${n} lados`, r.molde, { rotulo: r.rotulo })],
      passos: [
        'Recorte e vinque todas as dobras.',
        'Feche o tubo colando a aba lateral por dentro da última face.',
      ].concat(v.tampas === 'abas'
        ? ['Dobre as abas das pontas para fora: elas servem para colar a peça em outra superfície.']
        : v.tampas !== 'nenhuma' ? ['Dobre as tampas e cole suas abas por dentro das faces.'] : []),
      verificacoes: [{ ok: true, texto: `Largura de cada face no molde: ${fmt(r.a)} cm.` }],
      avisos: [],
    };
  }

  function gerarPiramide(v, ctx) {
    const t = ctx.t, w = ctx.aba;
    const n = Math.round(v.lados);
    exigir(n >= 3 && n <= 12, 'A pirâmide deve ter de 3 a 12 lados.');
    const a = v.lado - t * Math.tan(Math.PI / n);
    exigir(a > 0 && v.alt > 0, 'Lado e altura precisam ser maiores que zero.');
    const Rb = a / (2 * Math.sin(Math.PI / n));
    const e = Math.hypot(Rb, v.alt);
    const al = 2 * Math.asin(a / (2 * e));
    const f0 = Math.PI / 2 - n * al / 2;
    const O = [0, 0];
    const vs = [];
    for (let k = 0; k <= n; k++) vs.push([e * Math.cos(f0 + k * al), e * Math.sin(f0 + k * al)]);
    const paineis = [];
    for (let k = 0; k < n; k++) paineis.push([O, vs[k], vs[k + 1]]);
    const abas = [aba(vs[n], O, w)];
    if (v.base === 'sim') {
      const pts = poligonoSobreAresta(vs[0], vs[1], n, O);
      paineis.push(pts);
      for (let k = 1; k < n; k++) abas.push(aba(pts[k], pts[(k + 1) % n], Math.min(w, a * 0.45)));
    }
    return {
      pecas: [criarPeca('A', `Pirâmide de ${n} lados`, montarMolde(paineis, abas), { rotulo: [0, e * 0.6] })],
      passos: [
        'Recorte e vinque todas as dobras.',
        'Feche as faces em volta da ponta e cole a aba lateral por dentro.',
      ].concat(v.base === 'sim' ? ['Dobre a base e cole suas abas por dentro das faces.'] : []),
      verificacoes: [{ ok: true, texto: `Aresta lateral: ${fmt(e)} cm; ângulo de cada face na ponta: ${(al * 180 / Math.PI).toFixed(1).replace('.', ',')}°.` }],
      avisos: [],
    };
  }

  /**
   * Tronco de pirâmide retangular: face maior A×B, face menor a×b, distância H entre elas.
   * O molde é aberto em volta da face maior (as faces laterais afinam para fora e nunca se cruzam).
   */
  function moldeTroncoPiramide(A, B, a, b, H, ctx, fecharMenor) {
    const t = ctx.t, w = ctx.aba;
    A -= t; B -= t; a = Math.max(0, a - t); b = Math.max(0, b - t);
    if (a * b > A * B) { [A, a] = [a, A]; [B, b] = [b, B]; }
    exigir(A > 0 && B > 0 && H > 0, 'Medidas do tronco de pirâmide inválidas.');
    const hN = Math.hypot(H, (B - b) / 2);
    const hE = Math.hypot(H, (A - a) / 2);
    const x = A / 2, y = B / 2, yN = -y - hN, xE = x + hE;
    const paineis = [
      [[-x, -y], [x, -y], [x, y], [-x, y]],
      [[-x, -y], [-a / 2, yN], [a / 2, yN], [x, -y]],          // face de cima (N)
      [[-x, y], [x, y], [a / 2, -yN], [-a / 2, -yN]],          // face de baixo (S)
      [[x, -y], [xE, -b / 2], [xE, b / 2], [x, y]],            // face direita (E)
      [[-x, -y], [-x, y], [-xE, b / 2], [-xE, -b / 2]],        // face esquerda (W)
    ];
    const abas = [
      aba([-x, -y], [-a / 2, yN], w), aba([a / 2, yN], [x, -y], w),
      aba([x, y], [a / 2, -yN], w), aba([-a / 2, -yN], [-x, y], w),
    ];
    if (fecharMenor && a >= 6 && b >= 6) {
      paineis.push([[-a / 2, yN - b], [a / 2, yN - b], [a / 2, yN], [-a / 2, yN]]);
      const wm = Math.min(w, a * 0.45, b * 0.45);
      abas.push(aba([-a / 2, yN - b], [a / 2, yN - b], wm));
      abas.push(aba([a / 2, yN - b], [a / 2, yN], wm));
      abas.push(aba([-a / 2, yN], [-a / 2, yN - b], wm));
    }
    const aresta = Math.hypot(H, (B - b) / 2, (A - a) / 2);
    const cruz = { molde: montarMolde(paineis, abas), rotulo: [0, 0] };
    const leque = moldeTroncoPiramideLeque(A, B, a, b, hN, hE, w, fecharMenor);
    const escolhido = escolherMolde([cruz, leque], ctx.folha);
    return { molde: escolhido.molde, rotulo: escolhido.rotulo, hN, hE, aresta, A, B, a, b };
  }

  /**
   * Mesmo tronco de pirâmide aberto em leque: as quatro faces laterais em
   * sequência, com a face maior e a menor presas à segunda face. Para peças
   * longas e finas (focinho, telhado alto) ocupa bem menos papel que a cruz.
   */
  function moldeTroncoPiramideLeque(A, B, a, b, hN, hE, w, fecharMenor) {
    const faces = [[A, a, hN], [B, b, hE], [A, a, hN], [B, b, hE]];
    const local = ([Lg, sh, h]) => [[0, 0], [Lg, 0], [(Lg + sh) / 2, h], [(Lg - sh) / 2, h]];
    const transformacoes = [];
    const paineis = [];
    let R0 = null, R1 = null;
    faces.forEach((f, k) => {
      const pl = local(f);
      let T;
      if (k === 0) T = (p) => [p[0], p[1]];
      else {
        const L0 = pl[0], L1 = pl[3];
        const th = Math.atan2(R1[1] - R0[1], R1[0] - R0[0]) - Math.atan2(L1[1] - L0[1], L1[0] - L0[0]);
        const c = Math.cos(th), sn = Math.sin(th), base = R0;
        T = (p) => [base[0] + c * (p[0] - L0[0]) - sn * (p[1] - L0[1]), base[1] + sn * (p[0] - L0[0]) + c * (p[1] - L0[1])];
      }
      const pg = pl.map(T);
      if (k > 0) { pg[0] = R0; pg[3] = R1; }
      transformacoes.push(T);
      paineis.push(pg);
      R0 = pg[1]; R1 = pg[2];
    });
    const abas = [aba(R0, R1, w)];
    const T1 = transformacoes[1];
    const f1 = paineis[1];
    const [Lg, sh, h] = faces[1];
    const maior = [f1[0], f1[1], T1([Lg, -A]), T1([0, -A])];
    paineis.push(maior);
    const wM = Math.min(w, A * 0.45, Lg * 0.45);
    abas.push(aba(maior[1], maior[2], wM), aba(maior[2], maior[3], wM), aba(maior[3], maior[0], wM));
    if (fecharMenor && a >= 6 && b >= 6) {
      const menor = [f1[3], f1[2], T1([(Lg + sh) / 2, h + a]), T1([(Lg - sh) / 2, h + a])];
      paineis.push(menor);
      const wm = Math.min(w, a * 0.45, b * 0.45);
      abas.push(aba(menor[1], menor[2], wm), aba(menor[2], menor[3], wm), aba(menor[3], menor[0], wm));
    }
    const c = f1.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
    return { molde: montarMolde(paineis, abas), rotulo: c };
  }

  /** Entre layouts equivalentes, fica com o que não cruza e melhor cabe na folha. */
  function escolherMolde(opcoes, folha) {
    const avaliadas = opcoes.map((o) => {
      const bb = caixaLimite(o.molde.contornos);
      const simples = o.molde.contornos.every(poligonoSimples);
      const cabe = folha ? (bb.w <= folha.w && bb.h <= folha.h) || (bb.h <= folha.w && bb.w <= folha.h) : true;
      return { o, simples, cabe, perdidas: o.molde.abasPerdidas || 0, area: bb.w * bb.h };
    });
    avaliadas.sort((x, y) => (y.simples - x.simples) || (y.cabe - x.cabe) || (x.perdidas - y.perdidas) || (x.area - y.area));
    return avaliadas[0].o;
  }

  function gerarTroncoPiramide(v, ctx) {
    const r = moldeTroncoPiramide(v.compMaior, v.largMaior, v.compMenor, v.largMenor, v.alt, ctx, v.fechar === 'sim');
    return {
      pecas: [criarPeca('A', 'Tronco de pirâmide', r.molde, { rotulo: r.rotulo })],
      passos: [
        'Recorte e vinque todas as dobras.',
        'Dobre as quatro faces inclinadas em volta da face maior e cole as abas por dentro.',
      ].concat(v.fechar === 'sim' ? ['Feche a face menor colando suas três abas por dentro.'] : []),
      verificacoes: [{ ok: true, texto: `As quatro arestas inclinadas medem ${fmt(r.aresta)} cm, por isso as faces fecham sem folga.` }],
      avisos: [],
    };
  }

  function gerarPlana(v) {
    const L = v.comp, A = v.alt;
    exigir(L > 0 && (v.forma === 'circulo' || A > 0), 'Informe as medidas da peça.');
    let pts, nome;
    if (v.forma === 'retangulo') { pts = [[0, 0], [L, 0], [L, A], [0, A]]; nome = 'Retângulo'; }
    else if (v.forma === 'circulo') { pts = circulo(L / 2); nome = 'Círculo'; }
    else if (v.forma === 'elipse') { pts = elipse(L / 2, A / 2); nome = 'Elipse'; }
    else { pts = [[0, A], [L / 2, 0], [L, A]]; nome = 'Triângulo'; }
    const p = pecaPlana('A', nome, pts, { qtd: Math.max(1, Math.round(v.qtd || 1)) });
    if (v.forma === 'circulo') p.medidas = 'Ø ' + fmt(L) + ' cm';
    if (v.forma === 'triangulo') p.rotulo = [L / 2, A * 0.66];
    return { pecas: [p], passos: ['Recorte pela linha contínua.'], verificacoes: [], avisos: [] };
  }

  // ===================================================================== FIGURAS

  /**
   * Tatu montado por módulos: base, costelas em meia elipse, faixas do casco,
   * cabeça (tronco de pirâmide), orelhas, olhos, cauda (tronco de cone),
   * patas (tubo quadrado) e pés. Todas as medidas saem do comprimento total.
   */
  function gerarTatu(v, ctx) {
    const t = ctx.t, w = ctx.aba;
    const fino = t < LIMIAR_TOPO;
    const C = v.comp;
    exigir(C >= 150, 'Para o tatu, use comprimento total de pelo menos 15 cm.');
    const n = Math.max(4, Math.min(14, Math.round(v.faixas || 7)));
    const Lc = 0.5 * C;
    const W = v.larg > 0 ? v.larg : 0.225 * C;
    const Hc = v.altura > 0 ? v.altura : 0.2 * C;
    exigir(W > 6 * t && Hc > 4 * t, 'Material grosso demais para este tamanho. Aumente o tatu ou use material mais fino.');

    const passo = Lc / n;
    const wb = passo * 1.25;                       // faixa com 25% de sobreposição
    const aR = W / 2 - t;                          // costela fica dentro da faixa
    const alturas = [];
    for (let i = 0; i < n; i++) alturas.push(Hc * (0.7 + 0.3 * Math.sin(Math.PI * (i + 0.5) / n)));

    const pecas = [];
    const verificacoes = [];
    const avisos = [];

    // Cabeça (dimensionada para caber na costela da frente)
    const h0 = alturas[0], hU = alturas[n - 1];
    const Lh = 0.2 * C;
    const headH = 0.62 * h0;
    const wmax = 2 * aR * Math.sqrt(1 - Math.pow(headH / h0, 2));
    const headW = Math.min(0.6 * W, 0.9 * wmax);
    const focinho = Math.max(0.18 * headH, 4);
    // Cauda
    const Lt = 0.3 * C;
    const dt = 0.5 * hU;
    const ponta = Math.max(0.12 * dt, 3);
    // Patas
    const s = 0.28 * W;
    const hl = 0.42 * Hc;

    // A — base com marcas das costelas e das patas
    const base = pecaPlana('A', 'Base', [[0, 0], [Lc, 0], [Lc, W], [0, W]], { rotulo: [Lc / 2, W / 2] });
    for (let i = 0; i < n; i++) {
      const z = (i + 0.5) * passo;
      base.marcas.push([[z, 0], [z, W]]);
      base.textos.push({ x: z, y: W - 3, t: 'B' + (i + 1), tam: 2.2 });
    }
    const zPatas = [0.2 * Lc - s / 2, 0.8 * Lc - s / 2];
    const yPatas = [0.12 * W, W - 0.12 * W - s];
    for (const zp of zPatas) for (const yp of yPatas) {
      base.marcas.push([[zp, yp], [zp + s, yp], [zp + s, yp + s], [zp, yp + s], [zp, yp]]);
      base.textos.push({ x: zp + s / 2, y: yp + s / 2, t: 'pata', tam: 2 });
    }
    pecas.push(base);

    // B — costelas
    const nArco = (a, b) => (fino ? Math.max(6, Math.round(meioPerimetroElipse(a, b) / 15)) : 80);
    for (let i = 0; i < n; i++) {
      const b = alturas[i];
      const arcoPts = meiaElipse(aR, b, nArco(aR, b));
      const abas = [];
      if (fino) {
        abas.push(aba([aR, 0], [-aR, 0], Math.min(w, 10)));
        dentes(arcoPts, Math.min(6, w), abas);
      }
      pecas.push(criarPeca('B' + (i + 1), 'Costela ' + (i + 1), montarMolde([arcoPts], abas), {
        rotulo: [0, -b * 0.4],
        medidas: fmt(2 * aR) + ' × ' + fmt(b) + ' cm',
      }));
    }

    // C — faixas do casco
    for (let i = 0; i < n; i++) {
      const b = alturas[i];
      const meio = meioPerimetroElipse(aR + t / 2, b + t / 2);
      const Lb = meio + 2 * t;
      const wt = Math.min(w, 12);
      const pts = [[0, 0], [Lb, 0], [Lb, wb], [0, wb]];
      const molde = montarMolde([pts], [aba([0, wb], [0, 0], wt), aba([Lb, 0], [Lb, wb], wt)]);
      const p = criarPeca('C' + (i + 1), 'Faixa ' + (i + 1), molde, {
        rotulo: [Lb / 2, wb / 2],
        medidas: fmt(Lb) + ' × ' + fmt(wb) + ' cm',
      });
      p.marcas.push([[Lb / 2, 0], [Lb / 2, 3]], [[Lb / 2, wb], [Lb / 2, wb - 3]]);
      if (t >= 1) p.dobras.push([[t, 0], [t, wb]], [[Lb - t, 0], [Lb - t, wb]]);
      p.textos.push({ x: Lb / 2, y: wb - 2.5, t: 'curvar no comprimento', tam: 1.8 });
      pecas.push(p);
      verificacoes.push({
        ok: true,
        texto: `Faixa C${i + 1}: ${fmt(Lb)} cm = meia volta da costela B${i + 1} (${fmt(meioPerimetroElipse(aR, b))} cm) + espessura.`,
      });
    }

    // D — cabeça
    const cab = moldeTroncoPiramide(headW, headH, focinho, focinho, Lh, ctx, true);
    pecas.push(criarPeca('D', 'Cabeça', cab.molde, { rotulo: cab.rotulo }));
    verificacoes.unshift({
      ok: headW <= wmax + 0.01,
      texto: `Cabeça (${fmt(headW)} × ${fmt(headH)} cm) cabe na frente da costela B1: largura livre nessa altura ${fmt(wmax)} cm.`,
    });

    // E — orelhas
    const eb = 0.38 * headW, eh = 0.55 * headH;
    const orelha = montarMolde([[[0, eh], [eb / 2, 0], [eb, eh]]], [aba([eb, eh], [0, eh], Math.min(w, eh * 0.4))]);
    pecas.push(criarPeca('E', 'Orelha', orelha, { qtd: 2, rotulo: [eb / 2, eh * 0.66] }));

    // F — olhos
    const dOlho = Math.max(0.16 * headH, 4);
    pecas.push(pecaPlana('F', 'Olho', circulo(dOlho / 2), { qtd: 2, rotulo: [0, 0], medidas: 'Ø ' + fmt(dOlho) + ' cm' }));

    // G — cauda
    const cauda = moldeTroncoCone(dt, ponta, Lt, ctx, { dentesMaior: true, dentesMenor: false });
    pecas.push(...pecasSetor(cauda.moldes, 'G', 'Cauda', cauda.rotulo));
    const meiaLargTraseira = aR * Math.sqrt(Math.max(0, 1 - Math.pow(dt / hU, 2)));
    verificacoes.splice(1, 0, {
      ok: meiaLargTraseira >= dt / 2,
      texto: `Cauda (Ø ${fmt(dt)} cm) cabe na traseira da costela B${n} (altura ${fmt(hU)} cm).`,
    });

    // H — patas e I — pés
    const pata = moldePrisma(4, s, hl, ctx, 'abas');
    pecas.push(criarPeca('H', 'Pata', pata.molde, { qtd: 4, rotulo: pata.rotulo }));
    pecas.push(pecaPlana('I', 'Pé', elipse(0.75 * s, 0.575 * s), {
      qtd: 4, rotulo: [0, 0], medidas: fmt(1.5 * s) + ' × ' + fmt(1.15 * s) + ' cm',
    }));

    verificacoes.push({ ok: n * wb >= Lc, texto: `${n} faixas de ${fmt(wb)} cm cobrem os ${fmt(Lc)} cm do corpo com sobreposição de ${fmt(wb - passo)} cm.` });

    if (!fino) avisos.push(`Material de ${String(t).replace('.', ',')} mm: as costelas não têm abas. Cole-as de topo, com cola quente, e cole as faixas direto na borda das costelas.`);
    if (t > focinho / 3) avisos.push('O focinho ficou pequeno para este material. Para um acabamento melhor, faça a cabeça em papel-cartão.');

    const passos = [
      'Recorte todas as peças. Vinque as linhas tracejadas com régua e uma caneta sem tinta antes de dobrar.',
      fino
        ? 'Dobre a aba de baixo e os dentes de cada costela B para o mesmo lado. Cole as costelas em pé sobre a base A, cada uma na linha com o seu número (B1 fica na frente).'
        : 'Cole as costelas B em pé sobre a base A, de topo, cada uma na linha com o seu número (B1 fica na frente).',
      'Cole cada faixa C sobre a costela de mesmo número. A marca do meio da faixa vai no ponto mais alto da costela. Dobre as abas das pontas por baixo da base e cole.',
      'Monte as patas H: dobre em tubo quadrado, cole a aba lateral e abra as abas das pontas para fora. Cole um pé I em uma ponta. Fure com uma agulha os cantos dos quadrados marcados na base A para achar a posição do lado de baixo e cole ali a outra ponta de cada pata.',
      'Monte a cabeça D (veja a forma Tronco de pirâmide). Cole a face maior na frente da costela B1, apoiada na base.',
      'Cole as orelhas E no alto da cabeça, perto da face maior, e os olhos F nas laterais.',
      `Enrole a cauda G, cole a aba lateral e abra os dentes da ponta larga para fora. Cole-os na traseira da costela B${n}, rente à base.`,
    ];

    return { pecas, passos, verificacoes, avisos };
  }

  // =================================================================== catálogo
  const MODELOS = {
    caixa: {
      nome: 'Caixa', grupo: 'Formas básicas', gerar: gerarCaixa,
      descricao: 'Caixa com fundo, quatro paredes e tampa opcional. Medidas externas.',
      campos: [
        { id: 'comp', rotulo: 'Comprimento', un: 'cm', padrao: 12 },
        { id: 'larg', rotulo: 'Largura', un: 'cm', padrao: 8 },
        { id: 'alt', rotulo: 'Altura', un: 'cm', padrao: 6 },
        { id: 'tampa', rotulo: 'Tampa', tipo: 'opcoes', padrao: 'sim', opcoes: [['sim', 'Com tampa'], ['nao', 'Sem tampa']] },
      ],
    },
    cilindro: {
      nome: 'Cilindro', grupo: 'Formas básicas', gerar: gerarCilindro,
      descricao: 'Tubo redondo: porta-lápis, tronco, torre.',
      campos: [
        { id: 'diam', rotulo: 'Diâmetro', un: 'cm', padrao: 7 },
        { id: 'alt', rotulo: 'Altura', un: 'cm', padrao: 10 },
        { id: 'tampas', rotulo: 'Tampas', tipo: 'opcoes', padrao: 'uma', opcoes: [['uma', 'Só o fundo'], ['ambas', 'Fundo e topo'], ['nenhuma', 'Sem tampas']] },
      ],
    },
    cone: {
      nome: 'Cone', grupo: 'Formas básicas', gerar: gerarCone,
      descricao: 'Cone de ponta fina: chapéu, telhado de torre, cone de sinalização.',
      campos: [
        { id: 'diam', rotulo: 'Diâmetro da base', un: 'cm', padrao: 8 },
        { id: 'alt', rotulo: 'Altura', un: 'cm', padrao: 12 },
        { id: 'base', rotulo: 'Base', tipo: 'opcoes', padrao: 'sim', opcoes: [['sim', 'Com base'], ['nao', 'Sem base']] },
      ],
    },
    troncoCone: {
      nome: 'Tronco de cone', grupo: 'Formas básicas', gerar: gerarTroncoCone,
      descricao: 'Cone cortado: copo, vaso, cauda, abajur.',
      campos: [
        { id: 'd1', rotulo: 'Diâmetro maior', un: 'cm', padrao: 8 },
        { id: 'd2', rotulo: 'Diâmetro menor', un: 'cm', padrao: 5 },
        { id: 'alt', rotulo: 'Altura', un: 'cm', padrao: 9 },
        { id: 'tampas', rotulo: 'Tampas', tipo: 'opcoes', padrao: 'maior', opcoes: [['maior', 'Só na boca maior'], ['ambas', 'Nas duas bocas'], ['nenhuma', 'Sem tampas']] },
      ],
    },
    prisma: {
      nome: 'Prisma', grupo: 'Formas básicas', gerar: gerarPrisma,
      descricao: 'Tubo de faces retas: 3 lados (triangular), 4 (quadrado), 6 (sextavado).',
      campos: [
        { id: 'lados', rotulo: 'Número de lados', un: '', padrao: 6, min: 3, max: 12, passo: 1 },
        { id: 'lado', rotulo: 'Medida de cada lado', un: 'cm', padrao: 3 },
        { id: 'alt', rotulo: 'Altura', un: 'cm', padrao: 10 },
        { id: 'tampas', rotulo: 'Pontas', tipo: 'opcoes', padrao: 'ambas', opcoes: [['ambas', 'Fechar as duas'], ['uma', 'Fechar só o fundo'], ['nenhuma', 'Abertas'], ['abas', 'Abas para colar']] },
      ],
    },
    piramide: {
      nome: 'Pirâmide', grupo: 'Formas básicas', gerar: gerarPiramide,
      descricao: 'Pirâmide regular com base de 3 a 12 lados.',
      campos: [
        { id: 'lados', rotulo: 'Número de lados da base', un: '', padrao: 4, min: 3, max: 12, passo: 1 },
        { id: 'lado', rotulo: 'Medida de cada lado', un: 'cm', padrao: 8 },
        { id: 'alt', rotulo: 'Altura', un: 'cm', padrao: 8 },
        { id: 'base', rotulo: 'Base', tipo: 'opcoes', padrao: 'sim', opcoes: [['sim', 'Com base'], ['nao', 'Sem base']] },
      ],
    },
    troncoPiramide: {
      nome: 'Tronco de pirâmide', grupo: 'Formas básicas', gerar: gerarTroncoPiramide,
      descricao: 'Bloco que afina: cabeça de bicho, focinho, telhado, suporte.',
      campos: [
        { id: 'compMaior', rotulo: 'Face maior: largura', un: 'cm', padrao: 6 },
        { id: 'largMaior', rotulo: 'Face maior: altura', un: 'cm', padrao: 5 },
        { id: 'compMenor', rotulo: 'Face menor: largura', un: 'cm', padrao: 1.5 },
        { id: 'largMenor', rotulo: 'Face menor: altura', un: 'cm', padrao: 1.5 },
        { id: 'alt', rotulo: 'Distância entre as faces', un: 'cm', padrao: 8 },
        { id: 'fechar', rotulo: 'Face menor', tipo: 'opcoes', padrao: 'sim', opcoes: [['sim', 'Fechada'], ['nao', 'Aberta']] },
      ],
    },
    plana: {
      nome: 'Peça plana', grupo: 'Formas básicas', gerar: gerarPlana,
      descricao: 'Recorte simples: placa, disco, pé, etiqueta.',
      campos: [
        { id: 'forma', rotulo: 'Forma', tipo: 'opcoes', padrao: 'retangulo', opcoes: [['retangulo', 'Retângulo'], ['circulo', 'Círculo'], ['elipse', 'Elipse'], ['triangulo', 'Triângulo']] },
        { id: 'comp', rotulo: 'Largura (ou diâmetro)', un: 'cm', padrao: 10 },
        { id: 'alt', rotulo: 'Altura', un: 'cm', padrao: 6 },
        { id: 'qtd', rotulo: 'Quantidade', un: 'peças', padrao: 1, min: 1, max: 50, passo: 1 },
      ],
    },
    tatu: {
      nome: 'Tatu', grupo: 'Animais', gerar: gerarTatu,
      descricao: 'Tatu com casco de faixas, cabeça, cauda e quatro patas. As peças saem do comprimento total e fecham entre si.',
      campos: [
        { id: 'comp', rotulo: 'Comprimento total (focinho à cauda)', un: 'cm', padrao: 40 },
        { id: 'faixas', rotulo: 'Faixas do casco', un: '', padrao: 7, min: 4, max: 14, passo: 1 },
        { id: 'larg', rotulo: 'Largura do corpo', un: 'cm', padrao: '', auto: true },
        { id: 'altura', rotulo: 'Altura do casco', un: 'cm', padrao: '', auto: true },
      ],
    },
  };

  const MATERIAIS = [
    { id: 'sulfite', nome: 'Papel sulfite 75 g/m²', t: 0.1 },
    { id: 'papel180', nome: 'Papel 180 g/m²', t: 0.2 },
    { id: 'cartao', nome: 'Papel-cartão ou cartolina', t: 0.35 },
    { id: 'parana', nome: 'Papelão cinza (paraná)', t: 1.5 },
    { id: 'ondaB', nome: 'Papelão ondulado onda B', t: 3 },
    { id: 'ondaC', nome: 'Papelão ondulado onda C', t: 4 },
    { id: 'ondaBC', nome: 'Papelão ondulado onda dupla BC', t: 7 },
    { id: 'eva2', nome: 'EVA 2 mm', t: 2 },
    { id: 'eva5', nome: 'EVA 5 mm', t: 5 },
    { id: 'outro', nome: 'Outro (informar espessura)', t: null },
  ];

  /** Largura de aba recomendada para a espessura (mm). */
  const abaPadrao = (t) => Math.min(20, Math.max(8, 3 * t + 5));

  function girarPeca(p, ang) {
    const c = Math.cos(ang), sn = Math.sin(ang);
    const R = (q) => [c * q[0] - sn * q[1], sn * q[0] + c * q[1]];
    return Object.assign({}, p, {
      contornos: p.contornos.map((x) => x.map(R)),
      abas: p.abas.map((a) => ({ pts: a.pts.map(R), tipo: a.tipo })),
      dobras: p.dobras.map((d) => d.map(R)),
      marcas: (p.marcas || []).map((m) => m.map(R)),
      textos: (p.textos || []).map((tx) => { const q = R([tx.x, tx.y]); return Object.assign({}, tx, { x: q[0], y: q[1] }); }),
      rotulo: R(p.rotulo),
      faces: p.faces && p.faces.map((f) => ({ pts: f.pts.map(R), cor: f.cor, deco: (f.deco || []).map((d) => ({ pts: d.pts.map(R), cor: d.cor })) })),
    });
  }

  /** Se a peça não cabe na folha, procura um ângulo em que ela caiba. */
  function ajustarGiro(p, folha) {
    const cabe = (bb) => (bb.w <= folha.w && bb.h <= folha.h) || (bb.h <= folha.w && bb.w <= folha.h);
    if (cabe(caixaLimite(p.contornos))) return p;
    let melhor = null;
    for (let g = 5; g < 180; g += 5) {
      const q = girarPeca(p, g * Math.PI / 180);
      const bb = caixaLimite(q.contornos);
      if (cabe(bb) && (!melhor || bb.w * bb.h < melhor.area)) melhor = { q, area: bb.w * bb.h };
    }
    return melhor ? melhor.q : p;
  }

  /** Gera o molde a partir de valores em cm (como digitados na tela). */
  function gerar(modeloId, valoresCm, espessuraMm, abaMm, folha) {
    const m = MODELOS[modeloId];
    exigir(m, 'Modelo desconhecido.');
    const v = {};
    for (const c of m.campos) {
      const bruto = valoresCm[c.id];
      if (c.tipo === 'opcoes') { v[c.id] = bruto != null ? bruto : c.padrao; continue; }
      const num = typeof bruto === 'number' ? bruto : parseFloat(String(bruto == null ? '' : bruto).replace(',', '.'));
      if (c.un === 'cm') v[c.id] = isFinite(num) ? num * 10 : (c.auto ? 0 : NaN);
      else v[c.id] = isFinite(num) ? num : c.padrao;
      if (!c.auto && c.un === 'cm') exigir(isFinite(v[c.id]) && v[c.id] >= 0, `Preencha "${c.rotulo}".`);
    }
    const t = Math.max(0, espessuraMm || 0);
    exigir(t <= 10, 'Espessura máxima aceita: 10 mm.');
    const ctx = { t, aba: abaMm > 0 ? abaMm : abaPadrao(t), folha: folha || null };
    const r = m.gerar(v, ctx);
    if (folha) r.pecas = r.pecas.map((p) => ajustarGiro(p, folha));
    for (const p of r.pecas) {
      if (!p.simples) r.avisos.push(`Na peça ${p.codigo} as abas se cruzam. Ajuste as medidas ou diminua a largura das abas.`);
      if (p.abasPerdidas) r.avisos.push(`Na peça ${p.codigo}, ${p.abasPerdidas === 1 ? '1 aba não coube' : p.abasPerdidas + ' abas não couberam'} por falta de espaço. Nessas emendas, cole uma tira de papel por dentro.`);
    }
    r.ctx = ctx;
    return r;
  }

  return {
    LIMIAR_TOPO, MODELOS, MATERIAIS, abaPadrao, gerar,
    // expostos para testes
    montarMolde, poligonoSimples, areaAssinada, caixaLimite, meioPerimetroElipse,
    moldeTroncoCone, moldeTroncoPiramide, moldeTroncoPiramideLeque, moldePrisma, comprimentoPolilinha, dist, fmt,
  };
});
