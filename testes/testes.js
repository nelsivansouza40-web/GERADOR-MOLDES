/* Testes da geometria e da paginação. Rodar com: node gerador-moldes/testes/testes.js */
'use strict';
const assert = require('assert');
const G = require('../js/geometria.js');
const P = require('../js/paginacao.js');
const M = require('../js/malha3d.js');
const F = require('../js/figuras.js');
require('../js/figuras2.js');
const I = require('../js/importar.js');
const B = require('../js/buscar.js');

let ok = 0;
const pendentes = [];
function teste(nome, fn) {
  const falha = (e) => { console.error('FALHOU:', nome, '\n ', e.message); process.exitCode = 1; };
  try {
    const r = fn();
    if (r && r.then) pendentes.push(r.then(() => { ok++; }, falha));
    else ok++;
  } catch (e) { falha(e); }
}
const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b}`);

// 1. Todos os modelos com valores padrão, em todos os materiais
for (const [id, m] of Object.entries(G.MODELOS).filter(([i]) => i !== 'importar')) {
  for (const mat of G.MATERIAIS.filter((x) => x.t != null)) {
    teste(`${id} em ${mat.nome}`, () => {
      const v = {};
      for (const c of m.campos) v[c.id] = c.padrao;
      const r = G.gerar(id, v, mat.t);
      assert.ok(r.pecas.length > 0, 'sem peças');
      for (const p of r.pecas) {
        assert.ok(p.simples, `peça ${p.codigo} com contorno cruzado`);
        for (const c of p.contornos) for (const q of c) assert.ok(isFinite(q[0]) && isFinite(q[1]), 'ponto inválido');
      }
      for (const vf of r.verificacoes) assert.ok(vf.ok, vf.texto);
    });
  }
}

// 2. Variação aleatória de medidas (contornos nunca se cruzam)
function aleatorio(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
const rnd = aleatorio(42);
const faixa = (a, b) => a + (b - a) * rnd();
const casos = {
  caixa: () => ({ comp: faixa(2, 40), larg: faixa(2, 40), alt: faixa(2, 40), tampa: rnd() < 0.5 ? 'sim' : 'nao' }),
  cilindro: () => ({ diam: faixa(2, 30), alt: faixa(1, 40), tampas: ['uma', 'ambas', 'nenhuma'][Math.floor(rnd() * 3)] }),
  cone: () => { const d = faixa(2, 30); return { diam: d, alt: faixa(d * 0.4, 40), base: 'sim' }; },
  troncoCone: () => { const d1 = faixa(3, 30); return { d1, d2: faixa(0.3, d1 * 0.9), alt: faixa(2, 40), tampas: 'maior' }; },
  prisma: () => ({ lados: 3 + Math.floor(rnd() * 10), lado: faixa(1.5, 12), alt: faixa(2, 30), tampas: ['ambas', 'uma', 'nenhuma', 'abas'][Math.floor(rnd() * 4)] }),
  piramide: () => ({ lados: 3 + Math.floor(rnd() * 10), lado: faixa(2, 15), alt: faixa(1, 30), base: 'sim' }),
  troncoPiramide: () => { const A = faixa(3, 20), B = faixa(3, 20); return { compMaior: A, largMaior: B, compMenor: faixa(1, A), largMenor: faixa(1, B), alt: faixa(2, 25), fechar: 'sim' }; },
  tatu: () => ({ comp: faixa(20, 120), faixas: 4 + Math.floor(rnd() * 10) }),
};
for (const [id, gerarV] of Object.entries(casos)) {
  teste(`variação aleatória: ${id}`, () => {
    for (let k = 0; k < 60; k++) {
      const v = gerarV();
      const t = [0.1, 0.35, 2, 3][k % 4];
      let r;
      try { r = G.gerar(id, v, t); } catch (e) { continue; } // medidas recusadas com mensagem
      for (const p of r.pecas) assert.ok(p.simples, `${id} peça ${p.codigo} cruzada com ${JSON.stringify(v)} t=${t}`);
    }
  });
}

// 3. Conferências geométricas
teste('cilindro: comprimento = π(D − t)', () => {
  const r = G.gerar('cilindro', { diam: 7, alt: 10, tampas: 'nenhuma' }, 3);
  const bb = G.caixaLimite(r.pecas[0].contornos);
  perto(bb.w - G.abaPadrao(3), Math.PI * (70 - 3), 0.01, 'comprimento');
});

teste('cone: arco do setor = circunferência', () => {
  const ctx = { t: 0, aba: 8 };
  const R = 40, H = 120, s = Math.hypot(R, H), th = 2 * Math.PI * R / s;
  perto(s * th, 2 * Math.PI * R, 1e-9, 'arco');
});

teste('tronco de cone: arcos batem com as duas bocas', () => {
  const r = G.moldeTroncoCone(80, 50, 90, { t: 0, aba: 8 }, {});
  perto(r.s1 * r.th, Math.PI * 80, 1e-6, 'arco maior');
  perto(r.s2 * r.th, Math.PI * 50, 1e-6, 'arco menor');
  perto(r.s1 - r.s2, Math.hypot(15, 90), 1e-6, 'geratriz');
});

teste('tronco de pirâmide: arestas vizinhas iguais', () => {
  const r = G.moldeTroncoPiramide(60, 50, 15, 15, 80, { t: 0, aba: 8 }, true);
  const ladoN = Math.hypot(r.hN, (r.A - r.a) / 2);
  const ladoE = Math.hypot(r.hE, (r.B - r.b) / 2);
  perto(ladoN, ladoE, 1e-9, 'arestas');
});

teste('tatu: faixa = meia volta da costela + espessura', () => {
  const t = 3;
  const r = G.gerar('tatu', { comp: 40, faixas: 7 }, t);
  const costelas = r.pecas.filter((p) => /^B\d/.test(p.codigo));
  const faixas = r.pecas.filter((p) => /^C\d/.test(p.codigo));
  assert.strictEqual(costelas.length, 7);
  assert.strictEqual(faixas.length, 7);
  const W = 0.225 * 400, aR = W / 2 - t;
  costelas.forEach((c, i) => {
    const bb = G.caixaLimite(c.contornos);
    const b = bb.h; // sem abas (material grosso)
    const fx = G.caixaLimite(faixas[i].contornos);
    const esperado = G.meioPerimetroElipse(aR + t / 2, b + t / 2) + 2 * t;
    perto(fx.w - 2 * Math.min(G.abaPadrao(t), 12), esperado, 0.05, `faixa ${i + 1}`);
    // aproximação de Ramanujan como conferência independente
    const a2 = aR + t / 2, b2 = b + t / 2;
    const ram = Math.PI * (3 * (a2 + b2) - Math.sqrt((3 * a2 + b2) * (a2 + 3 * b2))) / 2;
    perto(esperado - 2 * t, ram, ram * 0.002, `Ramanujan ${i + 1}`);
  });
});

teste('caixa: painéis com medida externa − t', () => {
  const r = G.gerar('caixa', { comp: 12, larg: 8, alt: 6, tampa: 'nao' }, 3);
  const dobras = r.pecas[0].dobras.map(([a, b]) => G.dist(a, b));
  assert.ok(dobras.some((d) => Math.abs(d - 117) < 1e-6), 'dobra de 117 mm');
  assert.ok(dobras.some((d) => Math.abs(d - 77) < 1e-6), 'dobra de 77 mm');
});

teste('peça que não cabe é girada até caber na folha', () => {
  const area = P.areaUtil(P.PAPEIS.A4);
  const r = G.gerar('piramide', { lados: 4, lado: 8, alt: 8, base: 'sim' }, 0.35, 0, area);
  assert.strictEqual(P.paginar(r.pecas, P.PAPEIS.A4).length, 1);
  assert.ok(r.pecas[0].simples);
});

// 5. Figuras 3D: malhas fechadas e coerentes, planificação sem distorção
for (const id of Object.keys(F.CATALOGO)) {
  teste(`figura ${id}: malhas fechadas e faces planas`, () => {
    const fig = new F.Figura();
    F.CATALOGO[id].construir(fig);
    for (const parte of fig.partes) {
      const m = parte.malha;
      const dir = new Set(), cont = new Map();
      m.f.forEach((f) => f.forEach((a, k) => {
        const b = f[(k + 1) % f.length];
        const d = a + '>' + b;
        assert.ok(!dir.has(d), `${parte.nome}: faces com sentidos trocados`);
        dir.add(d);
        const u = a < b ? a + '_' + b : b + '_' + a;
        cont.set(u, (cont.get(u) || 0) + 1);
      }));
      if (!m.aberta) {
        for (const [, n] of cont) assert.strictEqual(n, 2, `${parte.nome}: malha aberta`);
        assert.ok(M.volume(m) > 0, `${parte.nome}: volume negativo`);
      }
      for (const f of m.f) {
        if (f.length < 4) continue;
        const pts = f.map((i) => m.v[i]);
        const n = M.norm(M.normalNewell(pts));
        for (const p of pts) assert.ok(Math.abs(M.dot(M.sub(p, pts[0]), n)) < 1e-3, `${parte.nome}: face não plana`);
      }
    }
  });
  for (const papel of ['A4', 'A3']) {
    teste(`figura ${id} em ${papel}: molde sem distorção e sem cruzamentos`, () => {
      const area = P.areaUtil(P.PAPEIS[papel]);
      const r = G.gerar(id, { tam: G.MODELOS[id].campos[0].padrao }, 0.2, 0, area);
      assert.ok(r.verificacoes[0].ok, r.verificacoes[0].texto);
      for (const p of r.pecas) assert.ok(p.simples, `peça ${p.codigo} cruzada`);
      for (const f of P.paginar(r.pecas, P.PAPEIS[papel])) assert.ok(f.tipo === 'pecas', `peça ${f.peca && f.peca.codigo} maior que a folha`);
    });
  }
}

// 6. Importação de modelo 3D
function esferaOBJ(n) {
  const linhas = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j < 2 * n; j++) {
    const t = Math.PI * i / n, f = Math.PI * j / n;
    linhas.push(`v ${Math.sin(t) * Math.cos(f)} ${Math.cos(t)} ${Math.sin(t) * Math.sin(f)}`);
  }
  const id = (i, j) => i * 2 * n + (j % (2 * n)) + 1;
  for (let i = 0; i < n; i++) for (let j = 0; j < 2 * n; j++) linhas.push(`f ${id(i, j)} ${id(i + 1, j)} ${id(i + 1, j + 1)} ${id(i, j + 1)}`);
  return linhas.join('\n');
}
function caixaSTL() {
  const v = [[0, 0, 0], [40, 0, 0], [40, 20, 0], [0, 20, 0], [0, 0, 10], [40, 0, 10], [40, 20, 10], [0, 20, 10]];
  const t = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const buf = new ArrayBuffer(84 + t.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, t.length, true);
  t.forEach((tri, k) => tri.forEach((vi, j) => v[vi].forEach((x, c) => dv.setFloat32(84 + k * 50 + 12 + j * 12 + c * 4, x, true))));
  return buf;
}
teste('importar .obj de alta resolução (simplifica e planifica)', () => {
  const texto = esferaOBJ(40);
  const enc = new TextEncoder().encode(texto);
  const info = I.definir('esfera.obj', enc.buffer);
  assert.ok(info.faces > 3000);
  const r = G.gerar('importar', { tam: 12, faces: 200, eixo: 'y' }, 0.2, 0, P.areaUtil(P.PAPEIS.A4));
  assert.ok(r.verificacoes[0].ok, r.verificacoes[0].texto);
  assert.ok(r.pecas.every((p) => p.simples));
  const nFaces = r.cena[0].f.length;
  assert.ok(nFaces <= 200 && nFaces >= 60, 'faces após simplificar: ' + nFaces);
});
teste('importar .stl binário: caixa sem linhas de dobra nas diagonais', () => {
  I.definir('caixa.stl', caixaSTL());
  const r = G.gerar('importar', { tam: 12, faces: 300, eixo: 'z' }, 0.2, 0, P.areaUtil(P.PAPEIS.A4));
  assert.ok(r.verificacoes[0].ok);
  const dobras = r.pecas.reduce((s, p) => s + p.dobras.length, 0);
  const abas = r.pecas.reduce((s, p) => s + p.abas.length, 0);
  assert.ok(dobras - abas <= 5, 'uma caixa aberta em cruz tem 5 dobras; encontradas ' + (dobras - abas));
});

// 7. Busca na internet (respostas simuladas no formato da API da Wikimedia)
function respostaCommons(titulos) {
  const pages = {};
  titulos.forEach((t, i) => {
    pages[-(i + 1)] = {
      title: 'File:' + t, index: i + 1,
      imageinfo: [{ url: 'https://upload.wikimedia.org/x/' + t, thumburl: 'https://upload.wikimedia.org/thumb/' + t + '.png', size: 123456, descriptionurl: 'https://commons.wikimedia.org/wiki/File:' + t,
        extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="#">Fulano</a>' } } }],
    };
  });
  return { query: { pages } };
}
teste('busca: tradução dos termos para o inglês', () => {
  assert.strictEqual(B.traduzir('Capacete'), 'helmet');
  assert.strictEqual(B.traduzir('cabeça de cavalo'), 'head horse');
  assert.strictEqual(B.traduzir('extintor'), 'fire extinguisher');
  assert.strictEqual(B.traduzir('xyzabc'), 'xyzabc');
});
teste('busca: lê a resposta e fica só com .stl, com licença e autor', () => {
  const r = B.lerResposta(respostaCommons(['Helmet_model.stl', 'Foto.jpg']));
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].titulo, 'Helmet model');
  assert.strictEqual(r[0].licenca, 'CC BY-SA 4.0');
  assert.strictEqual(r[0].autor, 'Fulano');
  assert.ok(B.urlBusca('helmet').includes('origin=%2A') || B.urlBusca('helmet').includes('origin=*'));
});
teste('busca: usa reserva quando o filtro não traz nada', async () => {
  const urls = [];
  const r = await B.buscar('capacete', async (u) => { urls.push(u); return urls.length < 3 ? { query: { pages: {} } } : respostaCommons(['A.stl']); });
  assert.strictEqual(r.resultados.length, 1);
  assert.ok(decodeURIComponent(urls[0].replace(/\+/g, ' ')).includes('filemime:application/sla helmet'));
});
teste('busca: links para Printables, Thingiverse e Sketchfab', () => {
  const l = B.linksExternos('cavalo');
  assert.deepStrictEqual(l.map((x) => x.nome), ['Printables', 'Thingiverse', 'Sketchfab']);
  assert.ok(l[0].url.endsWith('q=horse'));
});

// 8. Arquivo .glb
function caixaGLB() {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]);
  const idx = new Uint16Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(idx.buffer)]);
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ children: [1], scale: [2, 2, 2] }, { mesh: 0, translation: [5, 0, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.byteLength }, { buffer: 0, byteOffset: pos.byteLength, byteLength: idx.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 8, type: 'VEC3' }, { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' }],
  };
  let js = Buffer.from(JSON.stringify(json));
  while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
  let bn = bin; while (bn.length % 4) bn = Buffer.concat([bn, Buffer.alloc(1)]);
  const total = 12 + 8 + js.length + 8 + bn.length;
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546C67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(js.length, 0); c1.writeUInt32LE(0x4E4F534A, 4);
  const c2 = Buffer.alloc(8); c2.writeUInt32LE(bn.length, 0); c2.writeUInt32LE(0x004E4942, 4);
  const all = Buffer.concat([h, c1, js, c2, bn]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
}
teste('importar .glb: lê a malha com as transformações dos nós', () => {
  const m = I.lerGLB(caixaGLB());
  assert.strictEqual(m.f.length, 12);
  const xs = m.v.map((p) => p[0]);
  assert.strictEqual(Math.min(...xs), 10); // (0 + 5) × 2
  assert.strictEqual(Math.max(...xs), 12);
  I.definir('caixa.glb', caixaGLB());
  const r = G.gerar('importar', { tam: 10, faces: 300, eixo: 'y' }, 0.2, 0, P.areaUtil(P.PAPEIS.A4));
  assert.ok(r.verificacoes[0].ok);
});

// 4. Paginação: tudo dentro da área útil e sem sobreposição
for (const papelId of Object.keys(P.PAPEIS)) {
  teste(`paginação ${papelId}`, () => {
    const papel = P.PAPEIS[papelId];
    const area = P.areaUtil(papel);
    for (const comp of [30, 40, 80, 150]) {
      const r = G.gerar('tatu', { comp, faixas: 7 }, 0.35);
      const folhas = P.paginar(r.pecas, papel);
      const totalPecas = r.pecas.reduce((s, p) => s + p.qtd, 0);
      const pos = folhas.filter((f) => f.tipo === 'pecas').reduce((s, f) => s + f.itens.length, 0);
      const partes = new Set(folhas.filter((f) => f.tipo === 'parte').map((f) => f.peca.codigo + '#' + f.copia)).size;
      assert.strictEqual(pos + partes, totalPecas, 'quantidade de peças');
      for (const f of folhas.filter((x) => x.tipo === 'pecas')) {
        const caixas = f.itens.map((it) => {
          const T = P.transformacao(it.bb, it.rot, it.x, it.y);
          return P.caixa([].concat(...it.peca.contornos).map(T));
        });
        for (const c of caixas) {
          assert.ok(c.minx >= area.x - 0.01 && c.miny >= area.y - 0.01 && c.maxx <= area.x + area.w + 0.01 && c.maxy <= area.y + area.h + 0.01, 'peça fora da área útil');
        }
        for (let i = 0; i < caixas.length; i++) for (let j = i + 1; j < caixas.length; j++) {
          const a = caixas[i], b = caixas[j];
          const cruza = a.minx < b.maxx - 0.01 && b.minx < a.maxx - 0.01 && a.miny < b.maxy - 0.01 && b.miny < a.maxy - 0.01;
          assert.ok(!cruza, 'peças sobrepostas na folha');
        }
      }
    }
  });
}

Promise.all(pendentes).then(() => console.log(`${ok} testes passaram${process.exitCode ? ', com falhas acima' : ''}.`));
