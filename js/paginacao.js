/*
 * Gerador de Moldes — distribuição das peças nas folhas e lista de desenho.
 *
 * paginar() encaixa as peças em folhas (A4, A3, Carta) em escala real 1:1.
 * Peças maiores que a área útil são divididas em partes com 10 mm de
 * sobreposição para emendar. desenharFolha() devolve uma lista de
 * operações em mm (polígonos, linhas, textos, recorte) que serve tanto
 * para a prévia em SVG quanto para o PDF.
 */
(function (raiz, fabrica) {
  const P = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = P;
  else raiz.Paginacao = P;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PAPEIS = {
    A4: { nome: 'A4', w: 210, h: 297 },
    A3: { nome: 'A3', w: 297, h: 420 },
    Carta: { nome: 'Carta', w: 216, h: 279 },
  };
  const MARGEM = { esq: 8, dir: 8, topo: 13, base: 16 };
  const FOLGA = 4;          // espaço entre peças (mm)
  const SOBREPOSICAO = 10;  // emenda entre partes de uma peça grande (mm)

  function caixa(pts) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of pts) {
      if (p[0] < minx) minx = p[0];
      if (p[1] < miny) miny = p[1];
      if (p[0] > maxx) maxx = p[0];
      if (p[1] > maxy) maxy = p[1];
    }
    return { minx, miny, maxx, maxy, w: maxx - minx, h: maxy - miny };
  }

  function areaUtil(papel) {
    return { x: MARGEM.esq, y: MARGEM.topo, w: papel.w - MARGEM.esq - MARGEM.dir, h: papel.h - MARGEM.topo - MARGEM.base };
  }

  /** Função que leva um ponto da peça para a folha (com rotação de 90° opcional). */
  function transformacao(bb, rot, ox, oy) {
    if (!rot) return (p) => [p[0] - bb.minx + ox, p[1] - bb.miny + oy];
    return (p) => [bb.maxy - p[1] + ox, p[0] - bb.minx + oy];
  }

  function paginar(pecas, papel) {
    const area = areaUtil(papel);
    const folhas = [];
    const grandes = [];
    const itens = [];
    for (const peca of pecas) {
      const bb = caixa([].concat(...peca.contornos));
      for (let k = 0; k < (peca.qtd || 1); k++) itens.push({ peca, bb, copia: k + 1 });
    }
    for (const it of itens) {
      const cabeNormal = it.bb.w <= area.w && it.bb.h <= area.h;
      const cabeGirada = it.bb.h <= area.w && it.bb.w <= area.h;
      if (cabeNormal && cabeGirada) it.rot = it.bb.h > it.bb.w; // deixa o lado maior na horizontal
      else if (cabeNormal) it.rot = false;
      else if (cabeGirada) it.rot = true;
      else { grandes.push(it); continue; }
      it.w = it.rot ? it.bb.h : it.bb.w;
      it.h = it.rot ? it.bb.w : it.bb.h;
    }
    const normais = itens.filter((it) => !grandes.includes(it));
    normais.sort((a, b) => Math.max(b.bb.w, b.bb.h) - Math.max(a.bb.w, a.bb.h) || b.bb.w * b.bb.h - a.bb.w * a.bb.h);

    // Encaixe por retângulos livres (MaxRects, menor sobra): aproveita os vãos das folhas
    const W = area.w + FOLGA, H = area.h + FOLGA;
    const livres = [];
    const encaixar = (fi, w, h) => {
      let melhor = null;
      for (const r of livres[fi]) {
        if (w <= r.w + 1e-6 && h <= r.h + 1e-6) {
          const sobra = Math.min(r.w - w, r.h - h);
          if (!melhor || sobra < melhor.sobra || (sobra === melhor.sobra && r.y + r.x * 1e-3 < melhor.y + melhor.x * 1e-3)) melhor = { x: r.x, y: r.y, sobra };
        }
      }
      return melhor;
    };
    const ocupar = (fi, x, y, w, h) => {
      const novos = [];
      for (const r of livres[fi]) {
        if (x >= r.x + r.w || x + w <= r.x || y >= r.y + r.h || y + h <= r.y) { novos.push(r); continue; }
        if (x > r.x) novos.push({ x: r.x, y: r.y, w: x - r.x, h: r.h });
        if (x + w < r.x + r.w) novos.push({ x: x + w, y: r.y, w: r.x + r.w - x - w, h: r.h });
        if (y > r.y) novos.push({ x: r.x, y: r.y, w: r.w, h: y - r.y });
        if (y + h < r.y + r.h) novos.push({ x: r.x, y: y + h, w: r.w, h: r.y + r.h - y - h });
      }
      livres[fi] = novos.filter((r, i) => r.w > 1 && r.h > 1 && !novos.some((q, j) => j !== i &&
        r.x >= q.x && r.y >= q.y && r.x + r.w <= q.x + q.w && r.y + r.h <= q.y + q.h && (j < i || r.x !== q.x || r.y !== q.y || r.w !== q.w || r.h !== q.h)));
    };
    for (const it of normais) {
      const opcoes = [false, true].filter((rot) => {
        const w = rot ? it.bb.h : it.bb.w, h = rot ? it.bb.w : it.bb.h;
        return w <= area.w + 0.01 && h <= area.h + 0.01;
      });
      let escolha = null;
      for (let fi = 0; fi < folhas.length && !escolha; fi++) {
        if (folhas[fi].tipo !== 'pecas') continue;
        for (const rot of opcoes) {
          const w = (rot ? it.bb.h : it.bb.w) + FOLGA, h = (rot ? it.bb.w : it.bb.h) + FOLGA;
          const m = encaixar(fi, w, h);
          if (m && (!escolha || m.sobra < escolha.sobra)) escolha = { fi, rot, x: m.x, y: m.y, w, h, sobra: m.sobra };
        }
      }
      if (!escolha) {
        folhas.push({ tipo: 'pecas', itens: [] });
        const fi = folhas.length - 1;
        livres[fi] = [{ x: 0, y: 0, w: W, h: H }];
        const rot = opcoes.length === 2 ? it.bb.h > it.bb.w : opcoes[0];
        const w = (rot ? it.bb.h : it.bb.w) + FOLGA, h = (rot ? it.bb.w : it.bb.h) + FOLGA;
        escolha = { fi, rot, x: 0, y: 0, w, h };
      }
      ocupar(escolha.fi, escolha.x, escolha.y, escolha.w, escolha.h);
      folhas[escolha.fi].itens.push({ peca: it.peca, copia: it.copia, bb: it.bb, rot: escolha.rot, x: area.x + escolha.x, y: area.y + escolha.y });
    }

    // Peças grandes: divididas em partes
    for (const it of grandes) {
      const passoW = area.w - SOBREPOSICAO, passoH = area.h - SOBREPOSICAO;
      const contar = (w, h) => {
        const c = Math.max(1, Math.ceil((w - SOBREPOSICAO) / passoW));
        const l = Math.max(1, Math.ceil((h - SOBREPOSICAO) / passoH));
        return { c, l };
      };
      const n0 = contar(it.bb.w, it.bb.h), n1 = contar(it.bb.h, it.bb.w);
      const rot = n1.c * n1.l < n0.c * n0.l;
      const n = rot ? n1 : n0;
      for (let l = 0; l < n.l; l++) for (let c = 0; c < n.c; c++) {
        folhas.push({
          tipo: 'parte', peca: it.peca, copia: it.copia, bb: it.bb, rot,
          coluna: c, linha: l, colunas: n.c, linhas: n.l,
          // posição da origem da peça nesta folha
          x: area.x - c * passoW, y: area.y - l * passoH,
        });
      }
    }
    return folhas;
  }

  /** Operações de desenho de uma peça já posicionada. */
  function opsPeca(peca, T, rot, colorido) {
    const giro = rot ? 90 : 0;
    const ops = [];
    for (const a of peca.abas) ops.push({ t: 'poli', pts: a.pts.map(T), fechado: true, estilo: a.tipo === 'encaixe' ? 'encaixe' : 'aba' });
    for (const f of peca.faces || []) {
      if (colorido && f.cor && f.cor.toLowerCase() !== '#ffffff') ops.push({ t: 'poli', pts: f.pts.map(T), fechado: true, estilo: 'face', cor: f.cor });
      for (const d of f.deco || []) {
        ops.push(colorido ? { t: 'poli', pts: d.pts.map(T), fechado: true, estilo: 'face', cor: d.cor } : { t: 'poli', pts: d.pts.map(T), fechado: true, estilo: 'marca' });
      }
    }
    for (const m of peca.marcas || []) ops.push({ t: 'poli', pts: m.map(T), fechado: false, estilo: 'marca' });
    for (const d of peca.dobras) ops.push({ t: 'poli', pts: d.map(T), fechado: false, estilo: 'dobra' });
    for (const c of peca.contornos) ops.push({ t: 'poli', pts: c.map(T), fechado: true, estilo: 'corte' });
    const r = T(peca.rotulo);
    const bb = caixa([].concat(...peca.contornos));
    const menor = Math.min(bb.w, bb.h);
    const tam = Math.max(2.2, Math.min(6, menor * 0.22));
    ops.push({ t: 'texto', giro, x: r[0], y: r[1], txt: peca.codigo, tam, negrito: true });
    const abaixo = rot ? [-tam * 0.9, 0] : [0, tam * 0.9];
    if (menor > 22) ops.push({ t: 'texto', giro, x: r[0] + abaixo[0], y: r[1] + abaixo[1], txt: peca.nome + (peca.qtd > 1 ? ` (×${peca.qtd})` : ''), tam: Math.max(2, tam * 0.45) });
    for (const tx of peca.textos || []) {
      const p = T([tx.x, tx.y]);
      if (tx.numero) {
        const tm = tx.tam || 2, lw = (tx.t.length * 0.62 + 0.5) * tm * 1.15 / 2, lh = tm * 0.62;
        ops.push({ t: 'poli', estilo: 'fundoNumero', fechado: true, pts: rot ? [[p[0] - lh, p[1] - lw], [p[0] + lh, p[1] - lw], [p[0] + lh, p[1] + lw], [p[0] - lh, p[1] + lw]] : [[p[0] - lw, p[1] - lh], [p[0] + lw, p[1] - lh], [p[0] + lw, p[1] + lh], [p[0] - lw, p[1] + lh]] });
      }
      ops.push({ t: 'texto', giro, x: p[0], y: p[1], txt: tx.t, tam: tx.tam || 2, cor: tx.numero ? 'numero' : 'marca' });
    }
    return ops;
  }

  function desenharFolha(folha, papel, info) {
    const area = areaUtil(papel);
    const ops = [];
    // Cabeçalho
    const titulo = info.titulo.length > 72 ? info.titulo.slice(0, 71).trimEnd() + '…' : info.titulo;
    ops.push({ t: 'texto', x: MARGEM.esq, y: 8, txt: titulo, tam: 3.4, negrito: true, ancora: 'inicio' });
    ops.push({ t: 'texto', x: papel.w - MARGEM.dir, y: 8, txt: `Folha ${info.numero} de ${info.total}`, tam: 3, ancora: 'fim' });

    if (folha.tipo === 'pecas') {
      for (const it of folha.itens) ops.push(...opsPeca(it.peca, transformacao(it.bb, it.rot, it.x, it.y), it.rot, info.colorido));
    } else {
      ops.push({ t: 'recorte', x: area.x, y: area.y, w: area.w, h: area.h });
      ops.push(...opsPeca(folha.peca, transformacao(folha.bb, folha.rot, folha.x, folha.y), folha.rot, info.colorido));
      ops.push({ t: 'fimRecorte' });
      // faixas de emenda
      if (folha.coluna < folha.colunas - 1) {
        ops.push({ t: 'poli', estilo: 'emenda', fechado: true, pts: [[area.x + area.w - SOBREPOSICAO, area.y], [area.x + area.w, area.y], [area.x + area.w, area.y + area.h], [area.x + area.w - SOBREPOSICAO, area.y + area.h]] });
      }
      if (folha.linha < folha.linhas - 1) {
        ops.push({ t: 'poli', estilo: 'emenda', fechado: true, pts: [[area.x, area.y + area.h - SOBREPOSICAO], [area.x + area.w, area.y + area.h - SOBREPOSICAO], [area.x + area.w, area.y + area.h], [area.x, area.y + area.h]] });
      }
      ops.push({ t: 'poli', estilo: 'moldura', fechado: true, pts: [[area.x, area.y], [area.x + area.w, area.y], [area.x + area.w, area.y + area.h], [area.x, area.y + area.h]] });
      ops.push({
        t: 'texto', x: papel.w / 2, y: 11.5, tam: 2.6, ancora: 'meio',
        txt: `Peça ${folha.peca.codigo} em ${folha.colunas * folha.linhas} partes — parte linha ${folha.linha + 1}, coluna ${folha.coluna + 1}. Sobreponha a faixa cinza da folha seguinte e cole.`,
      });
    }

    // Rodapé: legenda e régua de conferência
    const yb = papel.h - 9;
    const x0 = MARGEM.esq;
    ops.push({ t: 'poli', estilo: 'corte', fechado: false, pts: [[x0, yb], [x0 + 8, yb]] });
    ops.push({ t: 'texto', x: x0 + 10, y: yb + 1, txt: 'cortar', tam: 2.6, ancora: 'inicio' });
    ops.push({ t: 'poli', estilo: 'dobra', fechado: false, pts: [[x0 + 24, yb], [x0 + 32, yb]] });
    ops.push({ t: 'texto', x: x0 + 34, y: yb + 1, txt: 'dobrar', tam: 2.6, ancora: 'inicio' });
    ops.push({ t: 'poli', estilo: 'aba', fechado: true, pts: [[x0 + 48, yb - 2], [x0 + 56, yb - 2], [x0 + 56, yb + 2], [x0 + 48, yb + 2]] });
    ops.push({ t: 'texto', x: x0 + 58, y: yb + 1, txt: 'colar', tam: 2.6, ancora: 'inicio' });
    ops.push({ t: 'texto', x: x0, y: yb + 6, txt: info.rodape, tam: 2.2, ancora: 'inicio', cor: 'marca' });
    const xr = papel.w - MARGEM.dir - 50;
    ops.push({ t: 'poli', estilo: 'regua', fechado: true, pts: [[xr, yb - 2], [xr + 50, yb - 2], [xr + 50, yb + 1], [xr, yb + 1]] });
    for (let k = 0; k <= 5; k++) ops.push({ t: 'poli', estilo: 'corte', fechado: false, pts: [[xr + 10 * k, yb - 2], [xr + 10 * k, yb - (k % 5 === 0 ? 4 : 3)]] });
    ops.push({ t: 'texto', x: xr + 25, y: yb + 5, txt: 'confira: 5 cm exatos', tam: 2.4, ancora: 'meio' });
    return ops;
  }

  return { PAPEIS, MARGEM, SOBREPOSICAO, areaUtil, paginar, desenharFolha, transformacao, caixa };
});
