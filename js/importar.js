/*
 * Gerador de Moldes — importação de modelo 3D (.obj ou .stl).
 *
 * O arquivo é lido, simplificado para o número de faces escolhido
 * (agrupamento de vértices em grade) e planificado por Malha3D.desdobrar.
 */
(function (raiz, fabrica) {
  const nodejs = typeof module === 'object' && module.exports;
  const G = nodejs ? require('./geometria.js') : raiz.Geometria;
  const M = nodejs ? require('./malha3d.js') : raiz.Malha3D;
  const F = nodejs ? require('./figuras.js') : raiz.Figuras;
  const I = fabrica(G, M, F);
  if (nodejs) module.exports = I; else raiz.Importar = I;
})(typeof self !== 'undefined' ? self : this, function (G, M, F) {
  'use strict';

  const estado = { nome: '', malha: null };

  function chaveV(p) { return p.map((x) => Math.round(x * 1e5)).join(','); }

  function lerOBJ(texto) {
    const v = [], f = [];
    for (const linha of texto.split(/\r?\n/)) {
      const t = linha.trim().split(/\s+/);
      if (t[0] === 'v' && t.length >= 4) v.push([+t[1], +t[2], +t[3]]);
      else if (t[0] === 'f' && t.length >= 4) {
        const idx = t.slice(1).map((s) => { const i = parseInt(s.split('/')[0], 10); return i < 0 ? v.length + i : i - 1; });
        for (let k = 1; k < idx.length - 1; k++) f.push([idx[0], idx[k], idx[k + 1]]);
      }
    }
    return { v, f };
  }

  function lerSTL(buf) {
    const bytes = new Uint8Array(buf);
    const inicio = String.fromCharCode.apply(null, bytes.subarray(0, Math.min(512, bytes.length)));
    const dv = new DataView(buf);
    const nBin = bytes.length >= 84 ? dv.getUint32(80, true) : -1;
    const ehBinario = nBin >= 0 && 84 + nBin * 50 === bytes.length;
    const v = [], f = [], mapa = new Map();
    const indice = (p) => {
      const k = chaveV(p);
      if (!mapa.has(k)) { mapa.set(k, v.length); v.push(p); }
      return mapa.get(k);
    };
    if (ehBinario || !/^\s*solid/i.test(inicio)) {
      for (let i = 0; i < nBin; i++) {
        const o = 84 + i * 50 + 12;
        const tri = [0, 1, 2].map((j) => indice([dv.getFloat32(o + j * 12, true), dv.getFloat32(o + j * 12 + 4, true), dv.getFloat32(o + j * 12 + 8, true)]));
        f.push(tri);
      }
    } else {
      const texto = new TextDecoder().decode(bytes);
      const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
      let m, tri = [];
      while ((m = re.exec(texto))) {
        tri.push(indice([+m[1], +m[2], +m[3]]));
        if (tri.length === 3) { f.push(tri); tri = []; }
      }
    }
    return { v, f };
  }

  // ---------------------------------------------------- glTF binário (.glb)
  function mat4Mul(a, b) {
    const r = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
    return r;
  }
  function matrizNo(no) {
    if (no.matrix) return no.matrix.slice();
    const t = no.translation || [0, 0, 0], q = no.rotation || [0, 0, 0, 1], e = no.scale || [1, 1, 1];
    const [x, y, z, w] = q;
    const R = [
      1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
      2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
      2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
      0, 0, 0, 1,
    ];
    for (let c = 0; c < 3; c++) for (let l = 0; l < 3; l++) R[c * 4 + l] *= e[c];
    R[12] = t[0]; R[13] = t[1]; R[14] = t[2];
    return R;
  }
  /** Lê .glb: junta todas as malhas de triângulos, já posicionadas pela árvore de nós. */
  function lerGLB(buf) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('Arquivo .glb inválido.');
    let pos = 12, json = null, bin = null;
    while (pos + 8 <= buf.byteLength) {
      const len = dv.getUint32(pos, true), tipo = dv.getUint32(pos + 4, true);
      const dados = buf.slice(pos + 8, pos + 8 + len);
      if (tipo === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(dados)));
      else if (tipo === 0x004E4942) bin = dados;
      pos += 8 + len;
    }
    if (!json || !bin) throw new Error('O arquivo .glb não tem a malha embutida.');
    const lerAcessor = (i) => {
      const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
      const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
      const Tipo = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
      if (!Tipo) throw new Error('Formato de dados do .glb não suportado.');
      const passo = bv.byteStride || comps * Tipo.BYTES_PER_ELEMENT;
      const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
      const out = [];
      const vdv = new DataView(bin);
      for (let k = 0; k < a.count; k++) {
        const item = [];
        for (let c = 0; c < comps; c++) {
          const o = base + k * passo + c * Tipo.BYTES_PER_ELEMENT;
          item.push(Tipo === Float32Array ? vdv.getFloat32(o, true) : Tipo === Uint32Array ? vdv.getUint32(o, true) : Tipo === Uint16Array ? vdv.getUint16(o, true) : vdv.getUint8(o));
        }
        out.push(comps === 1 ? item[0] : item);
      }
      return out;
    };
    const v = [], f = [];
    const visitar = (ni, pai) => {
      const no = json.nodes[ni];
      const Mx = mat4Mul(pai, matrizNo(no));
      if (no.mesh != null) {
        for (const prim of json.meshes[no.mesh].primitives) {
          if ((prim.mode != null && prim.mode !== 4) || prim.attributes.POSITION == null) continue;
          const P = lerAcessor(prim.attributes.POSITION);
          const base = v.length;
          for (const p of P) v.push([Mx[0] * p[0] + Mx[4] * p[1] + Mx[8] * p[2] + Mx[12], Mx[1] * p[0] + Mx[5] * p[1] + Mx[9] * p[2] + Mx[13], Mx[2] * p[0] + Mx[6] * p[1] + Mx[10] * p[2] + Mx[14]]);
          const idx = prim.indices != null ? lerAcessor(prim.indices) : P.map((_, i) => i);
          for (let k = 0; k + 2 < idx.length; k += 3) f.push([base + idx[k], base + idx[k + 1], base + idx[k + 2]]);
        }
      }
      for (const c of no.children || []) visitar(c, Mx);
    };
    const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const cena = json.scenes ? json.scenes[json.scene || 0] : { nodes: json.nodes.map((_, i) => i) };
    for (const n of cena.nodes) visitar(n, I4);
    // vértices repetidos (costuras de textura) viram um só, para a malha ficar fechada
    const mapa = new Map(), novo = [], v2 = [];
    v.forEach((p, i) => { const k = chaveV(p); if (!mapa.has(k)) { mapa.set(k, v2.length); v2.push(p); } novo[i] = mapa.get(k); });
    return { v: v2, f: f.map((t) => t.map((i) => novo[i])) };
  }

  /** Junta vértices numa grade de lado s; remove triângulos degenerados e repetidos. */
  function agrupar(m, s, min) {
    const grupos = new Map();
    const novo = new Array(m.v.length);
    m.v.forEach((p, i) => {
      const k = Math.floor((p[0] - min[0]) / s) + ',' + Math.floor((p[1] - min[1]) / s) + ',' + Math.floor((p[2] - min[2]) / s);
      if (!grupos.has(k)) grupos.set(k, { soma: [0, 0, 0], n: 0, idx: grupos.size });
      const g = grupos.get(k);
      g.soma = M.add(g.soma, p); g.n++;
      novo[i] = g.idx;
    });
    const v = [];
    for (const g of grupos.values()) v[g.idx] = M.mul(g.soma, 1 / g.n);
    const vistos = new Set();
    const f = [];
    for (const t of m.f) {
      const q = t.map((i) => novo[i]);
      if (q[0] === q[1] || q[1] === q[2] || q[0] === q[2]) continue;
      const k = q.slice().sort((a, b) => a - b).join(',');
      if (vistos.has(k)) continue;
      const area = M.len(M.cross(M.sub(v[q[1]], v[q[0]]), M.sub(v[q[2]], v[q[0]])));
      if (area < 1e-9) continue;
      vistos.add(k);
      f.push(q);
    }
    return { v, f };
  }

  function limites(v) {
    const a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
    for (const p of v) for (let i = 0; i < 3; i++) { a[i] = Math.min(a[i], p[i]); b[i] = Math.max(b[i], p[i]); }
    return { a, b, d: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) };
  }

  function simplificar(m, alvo) {
    const lim = limites(m.v);
    const limpo = agrupar(m, lim.d * 1e-7, lim.a);
    if (limpo.f.length <= alvo) return limpo;
    let lo = lim.d / 3000, hi = lim.d / 2, melhor = null;
    for (let i = 0; i < 28; i++) {
      const s = Math.sqrt(lo * hi);
      const r = agrupar(m, s, lim.a);
      if (r.f.length > alvo) lo = s; else { melhor = r; hi = s; }
    }
    return melhor || agrupar(m, hi, lim.a);
  }

  /** Lê o arquivo (ArrayBuffer) e guarda a malha para gerar o molde. */
  function definir(nome, buf) {
    const ext = (nome.split('.').pop() || '').toLowerCase();
    let m;
    if (ext === 'obj') m = lerOBJ(new TextDecoder().decode(new Uint8Array(buf)));
    else if (ext === 'stl') m = lerSTL(buf);
    else if (ext === 'glb') m = lerGLB(buf);
    else throw new Error('Use um arquivo .stl, .obj ou .glb.');
    if (!m.f.length) throw new Error('O arquivo não tem faces de modelo 3D.');
    estado.nome = nome;
    estado.malha = m;
    return { vertices: m.v.length, faces: m.f.length };
  }

  function gerarImportado(v, ctx) {
    if (!estado.malha) throw new Error('Escolha um arquivo de modelo 3D (.obj ou .stl) para gerar o molde.');
    const alvo = Math.max(20, Math.min(1200, Math.round(v.faces || 300)));
    let m = simplificar(estado.malha, alvo);
    if (v.eixo === 'y') m = { v: m.v.map((p) => [p[0], -p[2], p[1]]), f: m.f };
    const lim = limites(m.v);
    const maior = Math.max(lim.b[0] - lim.a[0], lim.b[1] - lim.a[1], lim.b[2] - lim.a[2]) || 1;
    const k = (v.tam / 10) / maior; // em cm
    const centro = [(lim.a[0] + lim.b[0]) / 2, (lim.a[1] + lim.b[1]) / 2, lim.a[2]];
    const vcm = m.v.map((p) => M.mul(M.sub(p, centro), k));
    const malha = M.orientar(M.nova(vcm, m.f, null));
    const r = F.planificarPartes([{ nome: 'Modelo', malha, poses: [{}] }], 1, ctx);
    const total = estado.malha.f.length;
    return {
      pecas: r.pecas, cena: r.cena,
      passos: [
        'Recorte cada peça pela linha contínua e vinque as linhas tracejadas antes de dobrar.',
        'As bordas com o mesmo número se colam uma na outra. Comece pelas peças maiores e vá fechando o modelo aos poucos.',
        'Dica: faça primeiro em papel comum para conferir o resultado antes de usar papel-cartão.',
      ],
      verificacoes: [
        { ok: r.erroMax < 0.01, texto: `Todas as arestas do molde têm o mesmo comprimento do modelo 3D (diferença máxima ${r.erroMax.toFixed(4).replace('.', ',')} mm).` },
        { ok: true, texto: `Modelo "${estado.nome}": ${total} faces no arquivo, ${malha.f.length} faces no molde.` },
      ].concat(estado.credito ? [{ ok: true, texto: `Crédito do modelo: ${estado.credito}.` }] : []).concat([
        { ok: true, texto: `${r.pares} emendas numeradas: bordas com o mesmo número se colam.` },
      ]),
      avisos: malha.f.length < total * 0.2 ? ['O modelo foi bastante simplificado. Se perder detalhes importantes, aumente o número de faces (o molde fica com mais peças).'] : [],
    };
  }

  G.MODELOS.importar = {
    nome: 'Buscar ou importar modelo 3D', grupo: 'Seu modelo 3D', figura: true,
    descricao: 'Busque um modelo 3D gratuito na internet ou use um arquivo baixado (.stl, .obj ou .glb). O aplicativo simplifica o modelo e abre as faces no papel.',
    campos: [
      { id: 'busca', rotulo: 'Buscar na internet', tipo: 'busca' },
      { id: 'arquivo', rotulo: 'Ou use um arquivo do aparelho', tipo: 'arquivo' },
      { id: 'tam', rotulo: 'Maior medida do modelo pronto', un: 'cm', padrao: 20 },
      { id: 'faces', rotulo: 'Número de faces (mais faces = mais detalhe e mais peças)', un: '', padrao: 250, min: 20, max: 1200, passo: 10 },
      { id: 'eixo', rotulo: 'Lado de cima do arquivo', tipo: 'opcoes', padrao: 'z', opcoes: [['z', 'Eixo Z (comum em .stl)'], ['y', 'Eixo Y (comum em .obj e .glb)']] },
    ],
    gerar: gerarImportado,
  };

  return { definir, lerOBJ, lerSTL, lerGLB, simplificar, estado };
});
