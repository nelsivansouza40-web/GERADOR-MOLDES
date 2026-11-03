/*
 * Gerador de Moldes — catálogo de figuras montadas com formas 3D.
 *
 * Cada figura é descrita em centímetros, no tamanho padrão, com o eixo X
 * para a frente, Y para a esquerda e Z para cima. O tamanho escolhido pelo
 * usuário só muda a escala. Cada parte é planificada por Malha3D.desdobrar.
 */
(function (raiz, fabrica) {
  const nodejs = typeof module === 'object' && module.exports;
  const G = nodejs ? require('./geometria.js') : raiz.Geometria;
  const M = nodejs ? require('./malha3d.js') : raiz.Malha3D;
  const F = fabrica(G, M);
  if (nodejs) module.exports = F; else raiz.Figuras = F;
})(typeof self !== 'undefined' ? self : this, function (G, M) {
  'use strict';

  const C = {
    vermelho: '#d7372a', azul: '#2b6fd0', amarelo: '#f2c230', verde: '#3f8f3a', verdeEsc: '#2f6e2c',
    laranja: '#e0702a', marrom: '#8a5a32', marromEsc: '#5a3a22', cinza: '#9aa0a6', cinzaEsc: '#5f6368',
    preto: '#262626', branco: '#ffffff', bege: '#ead2a4', pele: '#efc9a8', peleSombra: '#e0b08f',
    rosa: '#ef9fab', creme: '#f6ecd6', ocre: '#e3a33b', cabelo: '#4a3020', lilas: '#dfe9f5',
  };

  // Gerador de números fixo (as pintas saem sempre no mesmo lugar)
  function sorteio(semente) {
    let s = semente;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }

  // ------------------------------------------------------------ construtor
  function Figura() {
    this.partes = [];
    this.passos = [];
  }
  /** parte(nome, malha, poses, op) — poses: [{ t:[x,y,z], r:[['y',30]], esp }] em cm. */
  Figura.prototype.parte = function (nome, malha, poses, op) {
    this.partes.push({ nome, malha, poses: poses && poses.length ? poses : [{}], op: op || {} });
    return malha;
  };
  Figura.prototype.passo = function (t) { this.passos.push(t); };

  const CATALOGO = {};
  /** [id, nome, fator de faces] */
  const ACABAMENTOS = [
    ['simples', 'Simples (poucas faces, monta rápido)', 1],
    ['medio', 'Médio', 1.5],
    ['suave', 'Suave (recomendado)', 2],
    ['muito', 'Muito suave (mais peças pequenas)', 3],
  ];

  function figura(id, def) {
    CATALOGO[id] = def;
    G.MODELOS[id] = {
      nome: def.nome, grupo: def.grupo, descricao: def.descricao, figura: true,
      campos: [
        { id: 'tam', rotulo: def.medida[0], un: 'cm', padrao: def.padrao || def.medida[1] },
        { id: 'acabamento', rotulo: 'Acabamento', tipo: 'opcoes', padrao: 'suave', opcoes: ACABAMENTOS.map((a) => [a[0], a[1]]) },
      ],
      gerar: (v, ctx) => gerarFigura(id, v.tam / (def.medida[1] * 10), ctx, v.acabamento),
    };
  }

  function letra(i) {
    let s = '';
    i++;
    while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  function pontoInterno(poly) {
    const c = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]);
    return c;
  }

  /** Planifica todas as partes de uma figura já construída (malhas em cm). */
  function planificarPartes(partes, k, ctx) {
    const escala = 10 * k;
    const pecas = [];
    const cena = [];
    let erroMax = 0, pares = 0, menorAresta = Infinity;
    const codigos = {};
    partes.forEach((pt, i) => {
      const cod = letra(i);
      codigos[pt.nome] = cod;
      let malha = M.escalar(pt.malha, escala);
      if (ctx.folha) malha = M.subdividir(malha, Math.min(ctx.folha.w, ctx.folha.h) - 2 * Math.min(ctx.aba, 8) - 12);
      const r = M.desdobrar(malha, { aba: Math.min(ctx.aba, 8), limite: ctx.folha });
      erroMax = Math.max(erroMax, r.erroMax);
      pares += r.pares;
      malha.f.forEach((f) => f.forEach((a, j) => {
        const l = M.len(M.sub(malha.v[f[(j + 1) % f.length]], malha.v[a]));
        if (l < menorAresta) menorAresta = l;
      }));
      r.pecas.forEach((p, j) => {
        const codigo = r.pecas.length > 1 ? cod + (j + 1) : cod;
        const maior = p.faces.reduce((a, b) => (Math.abs(G.areaAssinada(b.pts)) > Math.abs(G.areaAssinada(a.pts)) ? b : a));
        const bb = G.caixaLimite(p.nucleo.length ? p.nucleo : p.contornos);
        const peca = {
          codigo, nome: pt.nome + (r.pecas.length > 1 ? ` (parte ${j + 1})` : ''), qtd: pt.poses.length,
          contornos: p.contornos, abas: p.abas, dobras: p.dobras, marcas: p.curvas || [],
          textos: p.textos, faces: p.faces, rotulo: pontoInterno(maior.pts),
          medidas: G.fmt(bb.w) + ' × ' + G.fmt(bb.h) + ' cm', abasPerdidas: p.abasPerdidas,
        };
        peca.simples = peca.contornos.every(G.poligonoSimples);
        pecas.push(peca);
      });
      for (const pose of pt.poses) {
        const m = M.posar(malha, { r: pose.r, esp: pose.esp, t: (pose.t || [0, 0, 0]).map((x) => x * escala) });
        cena.push({ v: m.v, f: m.f, cor: m.cor, deco: m.deco, aberta: !!malha.aberta, codigo: cod });
      }
    });
    return { pecas, cena, erroMax, pares, menorAresta, codigos };
  }

  function gerarFigura(id, k, ctx, acabamento) {
    const def = CATALOGO[id];
    const fig = new Figura();
    const ac = ACABAMENTOS.find((a) => a[0] === acabamento) || ACABAMENTOS[2];
    M.config.suave = ac[2];
    try { def.construir(fig); } finally { M.config.suave = 1; }
    const r = planificarPartes(fig.partes, k, ctx);
    const nomeCod = (nome) => (r.codigos[nome] ? `${r.codigos[nome]} (${nome.toLowerCase()})` : nome.toLowerCase());
    const passos = [
      'Recorte cada peça pela linha contínua e vinque as linhas tracejadas antes de dobrar.',
      'Feche cada peça colando as abas cinza. As bordas com o mesmo número se colam uma na outra.',
      'Onde há só uma linha cinza pontilhada, não dobre: curve o papel com os dedos (ou enrolando num lápis) para a superfície ficar lisa.',
    ].concat(fig.passos.map((t) => t.replace(/\{([^}]+)\}/g, (_, n) => nomeCod(n))));
    const avisos = [];
    if (ctx.t >= G.LIMIAR_TOPO) avisos.push('Figuras com muitas faces pequenas ficam melhores em papel 180 g ou papel-cartão. Em papelão ou EVA, aumente bastante o tamanho.');
    if (r.menorAresta < 3) avisos.push(`Algumas arestas medem menos de 3 mm (a menor tem ${G.fmt(r.menorAresta, 2)} cm), em geral nas pontas arredondadas. Se ficar difícil montar, aumente o tamanho ou use um acabamento mais simples.`);
    return {
      pecas: r.pecas, passos, avisos, cena: r.cena,
      verificacoes: [
        { ok: r.erroMax < 0.01, texto: `Todas as arestas do molde têm o mesmo comprimento do modelo 3D (diferença máxima ${r.erroMax.toFixed(4).replace('.', ',')} mm).` },
        { ok: true, texto: `${r.pares} emendas numeradas: bordas com o mesmo número se colam.` },
      ],
    };
  }

  // ------------------------------------------------------- atalhos (cm)
  const E = (cx, ly, hz, op) => M.elipsoide(cx, ly, hz, op);
  const EZ = (lx, ly, hz, op) => M.elipsoideZ(lx, ly, hz, op);
  const T = (comp, r1, r2, op) => M.tronco(comp, r1, r2, op);
  const P = (t, r, esp) => ({ t, r: r || [], esp });
  const semicirculo = (r, n) => {
    n = n || 8;
    const p = [];
    for (let i = 0; i <= n; i++) p.push([r * Math.cos(Math.PI * i / n), r * Math.sin(Math.PI * i / n)]);
    return p;
  };
  const deslocar = (poly, dx, dy) => poly.map(([x, y]) => [x + dx, y + dy]);
  /** Pata/perna inclinada: base em `ini`, direção pela inclinação (graus a partir da vertical) e rumo (graus a partir de X). */
  const inclinada = (ini, incl, rumo) => P(ini, [['y', incl], ['z', rumo]]);
  const ponta = (ini, comp, incl, rumo) => {
    const a = incl * Math.PI / 180, b = rumo * Math.PI / 180;
    return [ini[0] + comp * Math.sin(a) * Math.cos(b), ini[1] + comp * Math.sin(a) * Math.sin(b), ini[2] + comp * Math.cos(a)];
  };
  const seisPatas = (f, malha, nome, xs, y, z, incl, rumos) => {
    const poses = [];
    xs.forEach((x, i) => { poses.push(inclinada([x, y, z], incl, rumos[i])); poses.push(inclinada([x, -y, z], incl, -rumos[i])); });
    return f.parte(nome, malha, poses);
  };

  // =============================================================== ANIMAIS

  figura('arara', {
    nome: 'Arara', grupo: 'Animais', medida: ['Altura total (com o poleiro)', 32],
    descricao: 'Arara-vermelha pousada no poleiro, com asas e cauda longa.',
    construir(f) {
      f.parte('Corpo', EZ(8, 7.5, 14, { lados: 8, aneis: 6, ovo: 0.15, cor: C.vermelho }), [P([0, 0, 13.5], [['y', 15]])]);
      const cab = E(6, 5.2, 5.6, { lados: 8, aneis: 5, cor: C.vermelho });
      M.pintar(cab, [2.2, 2.3, 0], 1.4, C.creme); M.pintar(cab, [2.2, -2.3, 0], 1.4, C.creme);
      M.olho(cab, [1.7, 2.45, 0.5], 0.7, '#f2e6c8'); M.olho(cab, [1.7, -2.45, 0.5], 0.7, '#f2e6c8');
      f.parte('Cabeça', cab, [P([2.6, 0, 22.2])]);
      f.parte('Bico de cima', M.cone(3.6, 1.45, { lados: 6, cor: '#efe9dc' }), [P([4.9, 0, 22.6], [['y', 120]])]);
      f.parte('Bico de baixo', M.cone(2, 1.0, { lados: 6, cor: C.preto }), [P([4.6, 0, 21.3], [['y', 150]])]);
      const asa = M.placa(M.folha(13, 5.6), 0.6, { plano: 'xz', cor: C.azul });
      M.pintar(asa, [3.4, 0, 0], 2.4, C.amarelo, 1.6); M.pintar(asa, [1.1, 0, 0], 1.3, C.vermelho);
      f.parte('Asa', asa, [P([1.2, 3.9, 19], [['y', 120]]), P([1.2, -3.9, 19], [['y', 120]])]);
      const cauda = M.placa(M.folha(17, 3.2), 0.5, { plano: 'xz', cor: C.vermelho });
      M.pintar(cauda, [13.5, 0, 0], 3, C.azul, 1.2);
      f.parte('Cauda', cauda, [P([-2.2, 0, 8.8], [['y', 105]])]);
      f.parte('Pé', M.placa(M.oval(1.4, 0.8, 10), 0.6, { cor: C.cinzaEsc }), [P([1, 1.6, 6.5]), P([1, -1.6, 6.5])]);
      f.parte('Poleiro', T(16, 0.8, 0.8, { lados: 6, cor: C.marrom }), [P([0.8, 8, 5.6], [['x', 90]])]);
      f.parte('Haste', T(5, 0.8, 0.8, { lados: 6, cor: C.marrom }), [P([0.8, 7, 0.8]), P([0.8, -7, 0.8])]);
      f.parte('Base', M.caixa(10, 18, 0.8, { cor: C.marromEsc }), [P([0.8, 0, 0])]);
      f.passo('Cole as duas {Haste} em pé sobre a {Base} e o {Poleiro} deitado por cima delas.');
      f.passo('Cole a {Cabeça} no alto do {Corpo}, um pouco à frente. Cole o {Bico de cima} e, logo abaixo, o {Bico de baixo}.');
      f.passo('Cole uma {Asa} de cada lado do corpo, apontando para trás e para baixo, e a {Cauda} nas costas, pendurada.');
      f.passo('Cole os dois {Pé} sob o corpo e apoie a arara no poleiro.');
    },
  });

  figura('pombo', {
    nome: 'Pombo', grupo: 'Animais', medida: ['Comprimento (bico à cauda)', 30],
    descricao: 'Pombo em pé, com pescoço esverdeado, asas e cauda em leque.',
    construir(f) {
      f.parte('Corpo', E(16, 9, 9.5, { lados: 8, aneis: 6, ovo: -0.15, cor: '#8f969e' }), [P([0, 0, 9])]);
      f.parte('Pescoço', T(4.6, 2.5, 1.9, { lados: 8, cor: '#6d8a7a' }), [P([5.2, 0, 11], [['y', 25]])]);
      const cab = E(5, 4.2, 4.4, { lados: 8, aneis: 5, cor: '#8f969e' });
      M.olho(cab, [1.3, 1.8, 0.6], 0.55, '#e8792b'); M.olho(cab, [1.3, -1.8, 0.6], 0.55, '#e8792b');
      f.parte('Cabeça', cab, [P([7.6, 0, 15.6])]);
      f.parte('Bico', M.cone(1.8, 0.55, { lados: 5, cor: C.preto }), [P([9.9, 0, 15.3], [['y', 100]])]);
      const asa = M.placa(M.folha(12, 5, 12, 0.3), 0.5, { plano: 'xz', cor: '#7c838b' });
      M.pintar(asa, [5, 0, 0.2], 1.2, '#474b51', 1.8); M.pintar(asa, [7.6, 0, 0.2], 1.1, '#474b51', 1.6);
      f.parte('Asa', asa, [P([3.4, 4.4, 11], [['z', 180], ['y', -8]]), P([3.4, -4.4, 11], [['z', 180], ['y', -8]])]);
      const cauda = M.placa([[0, -1.3], [6.2, -2.9], [6.8, 0], [6.2, 2.9], [0, 1.3]], 0.5, { cor: '#7c838b' });
      M.pintar(cauda, [6, 0, 0], 0.8, '#3e4247', 2.6);
      f.parte('Cauda', cauda, [P([-6.6, 0, 10.2], [['z', 180], ['y', 12]])]);
      f.parte('Perna', T(4.4, 0.4, 0.35, { lados: 4, cor: '#c4505a' }), [P([1, 1.6, 0.4]), P([1, -1.6, 0.4])]);
      f.parte('Pé', M.placa(M.oval(1.5, 0.9, 10), 0.4, { cor: '#c4505a' }), [P([1.4, 1.6, 0.2]), P([1.4, -1.6, 0.2])]);
      f.passo('Cole o {Pescoço} no alto da frente do {Corpo} e a {Cabeça} por cima. Cole o {Bico} na frente da cabeça.');
      f.passo('Cole uma {Asa} de cada lado, apontando para trás, e a {Cauda} nas costas.');
      f.passo('Cole as {Perna} sob o corpo e os {Pé} na ponta de cada perna.');
    },
  });

  figura('jabuti', {
    nome: 'Jabuti', grupo: 'Animais', medida: ['Comprimento (cabeça à cauda)', 30],
    descricao: 'Jabuti com casco de placas, cabeça, quatro patas e cauda.',
    construir(f) {
      const casco = M.domo(22, 17, 9, { lados: 12, aneis: 6, cor: '#6f5228', corBase: '#d1b06b' });
      for (const [az, el] of [[0, 80], [0, 40], [60, 40], [120, 40], [180, 40], [240, 40], [300, 40], [30, 12], [90, 12], [150, 12], [210, 12], [270, 12], [330, 12]]) {
        M.pintar(casco, M.naSuperficie([0, 0, 0], 22, 17, 18, az, el), el > 70 ? 2.6 : el > 30 ? 2.3 : 1.6, '#a27c3e');
      }
      f.parte('Casco', casco, [P([0, 0, 3])]);
      const cab = E(6, 4, 3.8, { lados: 8, aneis: 5, cor: '#7b7262' });
      M.olho(cab, [1.7, 1.45, 0.6], 0.45); M.olho(cab, [1.7, -1.45, 0.6], 0.45);
      f.parte('Cabeça', cab, [P([14.2, 0, 4.4])]);
      f.parte('Pescoço', T(4, 1.6, 1.4, { lados: 6, cor: '#7b7262' }), [P([9.6, 0, 3.8], [['y', 82]])]);
      f.parte('Pata', T(4, 2.1, 1.8, { lados: 6, cor: '#7b7262' }), [P([7, 6, 0]), P([7, -6, 0]), P([-7, 6, 0]), P([-7, -6, 0])]);
      f.parte('Cauda', M.cone(3, 1.0, { lados: 5, cor: '#7b7262' }), [P([-10.4, 0, 3.6], [['y', -100]])]);
      f.passo('Cole as quatro {Pata} sob o {Casco}, perto das bordas.');
      f.passo('Cole o {Pescoço} na frente do casco e a {Cabeça} na ponta dele. Cole a {Cauda} atrás.');
    },
  });

  figura('cobra', {
    nome: 'Cobra', grupo: 'Animais', medida: ['Comprimento total', 70],
    descricao: 'Cobra em S, feita de gomos que se encaixam um no outro, com língua bifurcada.',
    construir(f) {
      const cab = E(6.5, 4.4, 2.8, { lados: 8, aneis: 5, cor: '#4f8f3a' });
      M.olho(cab, [1.6, 1.75, 0.65], 0.45, '#e2c044'); M.olho(cab, [1.6, -1.75, 0.65], 0.45, '#e2c044');
      f.parte('Cabeça', cab, [P([0, 0, 1.7])]);
      f.parte('Língua', M.chapa([[0, -0.15], [2.2, -0.15], [3, -0.7], [2.4, 0], [3, 0.7], [2.2, 0.15], [0, 0.15]], { cor: '#c62828' }), [P([3, 0, 1.4])]);
      const raios = [1.75, 1.75, 1.6, 1.4, 1.15, 0.9, 0.65];
      let pos = [-2.9, 0, 1.7];
      let rumo = 180;
      for (let i = 0; i < 6; i++) {
        const L = 9;
        const ang = 180 + 38 * Math.sin(i * 1.15 + 0.5);
        rumo = ang;
        const m = T(L, raios[i], raios[i + 1], { lados: 8, achat: 1.25, cor: i % 2 ? '#3f7430' : '#4f8f3a' });
        M.pintar(m, [0, raios[i] * 1.2, L / 2], raios[i] * 0.55, '#e3d27a');
        M.pintar(m, [0, -raios[i] * 1.2, L / 2], raios[i] * 0.55, '#e3d27a');
        f.parte('Gomo ' + (i + 1), m, [P(pos, [['y', 90], ['z', rumo]])]);
        const a = rumo * Math.PI / 180;
        pos = [pos[0] + L * Math.cos(a), pos[1] + L * Math.sin(a), pos[2]];
      }
      f.parte('Ponta da cauda', M.cone(7, raios[6], { lados: 8, achat: 1.25, cor: '#3f7430' }), [P(pos, [['y', 90], ['z', rumo + 25]])]);
      f.passo('Cole os gomos em sequência, tampa com tampa: {Gomo 1} atrás da {Cabeça}, depois {Gomo 2} e assim por diante, girando um pouco cada um para formar o S.');
      f.passo('Termine com a {Ponta da cauda} e cole a {Língua} sob a ponta da cabeça.');
    },
  });

  figura('coelho', {
    nome: 'Coelho', grupo: 'Animais', medida: ['Altura (até as orelhas)', 24],
    descricao: 'Coelho sentado, com orelhas longas e rabo de pompom.',
    construir(f) {
      const cor = '#e9e4dc';
      f.parte('Corpo', E(13, 10, 11, { lados: 8, aneis: 6, ovo: 0.12, cor }), [P([0, 0, 6.5], [['y', -35]])]);
      const cab = E(7.5, 6.4, 6.4, { lados: 8, aneis: 6, cor });
      M.olho(cab, [2.4, 2.25, 0.9], 0.7, '#5a3a22'); M.olho(cab, [2.4, -2.25, 0.9], 0.7, '#5a3a22');
      M.pintar(cab, [3.7, 0, -0.3], 0.5, C.rosa);
      f.parte('Cabeça', cab, [P([5, 0, 13.5])]);
      const orelha = M.placa(deslocar(M.oval(4.6, 1.5, 14), 4.6, 0), 0.6, { plano: 'xz', cor });
      M.pintar(orelha, [4.8, 0, 0], 3.4, C.rosa, 0.8);
      f.parte('Orelha', orelha, [P([4.2, 1.4, 15.6], [['y', -78], ['x', -12]]), P([4.2, -1.4, 15.6], [['y', -78], ['x', 12]])]);
      f.parte('Rabo', E(3.6, 3.6, 3.6, { lados: 6, aneis: 4, cor: C.branco }), [P([-6.1, 0, 5])]);
      f.parte('Pata traseira', M.domo(9, 3.6, 4, { lados: 8, aneis: 4, cor }), [P([-0.5, 4.4, 0]), P([-0.5, -4.4, 0])]);
      f.parte('Pata dianteira', T(5.5, 1.1, 1.0, { lados: 6, cor }), [P([4.6, 1.8, 0]), P([4.6, -1.8, 0])]);
      f.passo('Cole as duas {Pata traseira} deitadas e as duas {Pata dianteira} em pé; apoie o {Corpo} sobre elas.');
      f.passo('Cole a {Cabeça} no alto do corpo, as {Orelha} em pé no alto da cabeça e o {Rabo} atrás.');
    },
  });

  figura('aranha', {
    nome: 'Aranha', grupo: 'Animais', medida: ['Comprimento do corpo', 14],
    descricao: 'Aranha caranguejeira com oito patas articuladas.',
    construir(f) {
      const cor = '#4a3426';
      const abd = E(9, 7.6, 6.6, { lados: 8, aneis: 6, cor: '#3b2a20' });
      M.pintar(abd, [0.5, 0, 3.3], 1.3, '#c45a1c'); M.pintar(abd, [-2.4, 0, 2.7], 1.0, '#c45a1c');
      f.parte('Abdômen', abd, [P([-4.8, 0, 4.4])]);
      const cef = E(6, 5, 3.6, { lados: 8, aneis: 5, cor });
      for (const [y, z, r] of [[0.45, 0.9, 0.32], [-0.45, 0.9, 0.32], [1.05, 0.65, 0.26], [-1.05, 0.65, 0.26]]) M.pintar(cef, [2.75, y, z], r, '#111111');
      f.parte('Cefalotórax', cef, [P([1.6, 0, 3.6])]);
      const rumos = [40, 72, 108, 140];
      const coxas = [], canelas = [];
      for (const lado of [1, -1]) {
        rumos.forEach((ru) => {
          const rumo = ru * lado;
          const a = rumo * Math.PI / 180;
          const quadril = [1.6 + 1.8 * Math.cos(a), 2.0 * Math.sin(a), 3.3];
          coxas.push(inclinada(quadril, 60, rumo));
          canelas.push(inclinada(ponta(quadril, 6, 60, rumo), 140, rumo));
        });
      }
      f.parte('Fêmur', T(6, 0.45, 0.38, { lados: 4, cor }), coxas);
      f.parte('Tíbia', T(8.2, 0.38, 0.26, { lados: 4, cor: '#c45a1c' }), canelas);
      f.passo('Cole o {Cefalotórax} na frente do {Abdômen}.');
      f.passo('Cole os oito {Fêmur} nas laterais do cefalotórax, subindo para fora, e na ponta de cada um uma {Tíbia} descendo até a mesa.');
    },
  });

  figura('joaninha', {
    nome: 'Joaninha', grupo: 'Animais', medida: ['Comprimento', 12],
    descricao: 'Joaninha de casco vermelho com pintas pretas.',
    construir(f) {
      const casco = M.domo(10, 8.6, 4.6, { lados: 12, aneis: 5, cor: '#d32f2f', corBase: C.preto });
      M.pintar(casco, [0, 0, 4.7], 0.2, C.preto, 5.2);
      for (const [az, el] of [[35, 45], [-35, 45], [125, 42], [-125, 42], [75, 22], [-75, 22], [0, 62]]) {
        M.pintar(casco, M.naSuperficie([0, 0, 0], 10, 8.6, 9.2, az, el), 0.95, C.preto);
      }
      f.parte('Casco', casco, [P([-0.6, 0, 0.6])]);
      const cab = M.domo(3, 4.6, 2.4, { lados: 8, aneis: 4, cor: C.preto });
      M.pintar(cab, [0.3, 1.4, 1.7], 0.55, C.branco); M.pintar(cab, [0.3, -1.4, 1.7], 0.55, C.branco);
      f.parte('Cabeça', cab, [P([4.6, 0, 0.6])]);
      seisPatas(f, T(2.6, 0.22, 0.18, { lados: 4, cor: C.preto }), 'Pata', [2.4, 0, -2.4], 2.4, 1.4, 135, [50, 90, 130]);
      f.parte('Antena', M.chapa([[0, -0.12], [2.6, -0.16], [2.6, 0.16], [0, 0.12]], { cor: C.preto }), [P([5.6, 0.9, 2.2], [['y', -30], ['z', 25]]), P([5.6, -0.9, 2.2], [['y', -30], ['z', -25]])]);
      f.passo('Cole a {Cabeça} na frente do {Casco}.');
      f.passo('Cole as seis {Pata} sob o casco, três de cada lado, e as duas {Antena} na cabeça.');
    },
  });

  figura('abelha', {
    nome: 'Abelha', grupo: 'Animais', medida: ['Comprimento', 14],
    descricao: 'Abelha com abdômen listrado, quatro asas e ferrão.',
    construir(f) {
      f.parte('Abdômen', E(7, 5.6, 5.6, { lados: 8, aneis: 7, ovo: 0.1, cores: (j) => (j % 2 ? C.preto : C.amarelo) }), [P([-4.2, 0, 4.2], [['y', -15]])]);
      const tor = E(4.2, 4, 4, { lados: 8, aneis: 5, cor: '#5a3d1c' });
      M.pintar(tor, [0, 0, 2], 1.2, '#e2b13c');
      f.parte('Tórax', tor, [P([0.6, 0, 4.8])]);
      const cab = E(3.2, 3.8, 3.4, { lados: 8, aneis: 5, cor: C.preto });
      M.pintar(cab, [0.6, 1.6, 0.4], 0.6, '#7a5c3a', 1.1); M.pintar(cab, [0.6, -1.6, 0.4], 0.6, '#7a5c3a', 1.1);
      f.parte('Cabeça', cab, [P([3.6, 0, 4.6])]);
      f.parte('Antena', M.chapa([[0, -0.1], [2.4, -0.15], [2.4, 0.15], [0, 0.1]], { cor: C.preto }), [P([4.5, 0.6, 5.8], [['y', -50], ['z', 20]]), P([4.5, -0.6, 5.8], [['y', -50], ['z', -20]])]);
      f.parte('Asa grande', M.chapa(M.folha(6, 2.6), { cor: C.lilas }), [P([0.4, 1.0, 6.8], [['z', 150]]), P([0.4, -1.0, 6.8], [['z', -150]])]);
      f.parte('Asa pequena', M.chapa(M.folha(4.3, 1.9), { cor: C.lilas }), [P([-0.4, 1.0, 6.5], [['z', 140]]), P([-0.4, -1.0, 6.5], [['z', -140]])]);
      seisPatas(f, T(3.6, 0.22, 0.16, { lados: 4, cor: C.preto }), 'Pata', [1.6, 0.6, -0.4], 1.4, 3.4, 145, [60, 90, 120]);
      f.parte('Ferrão', M.cone(1.2, 0.35, { lados: 4, cor: C.preto }), [P([-7.6, 0, 3.3], [['y', -105]])]);
      f.passo('Cole o {Tórax} entre a {Cabeça} e o {Abdômen}, e o {Ferrão} na ponta do abdômen.');
      f.passo('Cole as {Asa grande} e as {Asa pequena} no alto do tórax, abertas para trás.');
      f.passo('Cole as seis {Pata} sob o tórax e as {Antena} na cabeça.');
    },
  });

  figura('libelula', {
    nome: 'Libélula', grupo: 'Animais', medida: ['Comprimento', 16],
    descricao: 'Libélula de abdômen longo e quatro asas abertas.',
    construir(f) {
      f.parte('Abdômen', M.tubo([[0, 0.55], [2.5, 0.6], [5, 0.5], [7.5, 0.45], [9.5, 0.35], [10.2, 0]], { lados: 6, cores: (j) => (j % 2 ? '#1f4f8a' : '#2f7fd1') }), [P([-1.6, 0, 3], [['y', -90]])]);
      f.parte('Tórax', E(3.2, 2.2, 2.4, { lados: 6, aneis: 5, cor: '#2e8f6f' }), [P([0, 0, 3.1])]);
      const cab = E(1.8, 2.6, 2, { lados: 8, aneis: 4, cor: '#2e8f6f' });
      M.pintar(cab, [0.3, 1.1, 0.3], 0.85, '#1f3a5a'); M.pintar(cab, [0.3, -1.1, 0.3], 0.85, '#1f3a5a');
      f.parte('Cabeça', cab, [P([2.1, 0, 3.3])]);
      f.parte('Asa da frente', M.chapa(M.folha(7.5, 1.7, 14, 0.2), { cor: C.lilas }), [P([0.6, 0.5, 3.9], [['z', 80]]), P([0.6, -0.5, 3.9], [['z', -80]])]);
      f.parte('Asa de trás', M.chapa(M.folha(7, 1.9, 14, 0.2), { cor: C.lilas }), [P([-0.4, 0.5, 3.9], [['z', 105]]), P([-0.4, -0.5, 3.9], [['z', -105]])]);
      seisPatas(f, T(2.8, 0.15, 0.12, { lados: 4, cor: '#333333' }), 'Pata', [0.9, 0.2, -0.5], 0.6, 2.4, 140, [55, 90, 125]);
      f.passo('Cole a {Cabeça} na frente do {Tórax} e o {Abdômen} atrás.');
      f.passo('Cole as {Asa da frente} e as {Asa de trás} abertas no alto do tórax e as seis {Pata} embaixo.');
    },
  });

  figura('marimbondo', {
    nome: 'Marimbondo', grupo: 'Animais', medida: ['Comprimento', 16],
    descricao: 'Marimbondo de cintura fina, listras amarelas e pretas e ferrão.',
    construir(f) {
      f.parte('Abdômen', E(7.5, 4.2, 4.2, { lados: 8, aneis: 8, ovo: 0.2, cores: (j) => (j % 2 ? C.preto : '#f0b81f') }), [P([-5.4, 0, 3.6], [['y', -18]])]);
      f.parte('Cintura', T(1.4, 0.35, 0.35, { lados: 4, cor: C.preto }), [P([-1.1, 0, 4.4], [['y', -100]])]);
      const tor = E(3.6, 3, 3.2, { lados: 8, aneis: 5, cor: C.preto });
      M.pintar(tor, [0.4, 0, 1.6], 0.6, '#f0b81f');
      f.parte('Tórax', tor, [P([0.4, 0, 4.5])]);
      const cab = E(2.6, 3.2, 2.8, { lados: 8, aneis: 5, cor: '#f0b81f' });
      M.pintar(cab, [0.5, 1.25, 0.3], 0.5, C.preto, 1.0); M.pintar(cab, [0.5, -1.25, 0.3], 0.5, C.preto, 1.0);
      f.parte('Cabeça', cab, [P([3, 0, 4.6])]);
      f.parte('Antena', M.chapa([[0, -0.1], [2.6, -0.14], [2.6, 0.14], [0, 0.1]], { cor: C.preto }), [P([3.8, 0.5, 5.6], [['y', -45], ['z', 25]]), P([3.8, -0.5, 5.6], [['y', -45], ['z', -25]])]);
      f.parte('Asa grande', M.chapa(M.folha(6.5, 1.6), { cor: '#d9dfe8' }), [P([0.2, 0.7, 5.9], [['z', 165]]), P([0.2, -0.7, 5.9], [['z', -165]])]);
      f.parte('Asa pequena', M.chapa(M.folha(4.8, 1.3), { cor: '#d9dfe8' }), [P([-0.3, 0.7, 5.8], [['z', 172]]), P([-0.3, -0.7, 5.8], [['z', -172]])]);
      seisPatas(f, T(4.2, 0.2, 0.14, { lados: 4, cor: '#e0a81c' }), 'Pata', [1.2, 0.4, -0.4], 1.1, 3.5, 140, [60, 90, 120]);
      f.parte('Ferrão', M.cone(1, 0.3, { lados: 4, cor: C.preto }), [P([-9, 0, 2.4], [['y', -110]])]);
      f.passo('Cole a {Cintura} entre o {Tórax} e o {Abdômen}, a {Cabeça} na frente e o {Ferrão} na ponta.');
      f.passo('Cole as asas deitadas sobre as costas, as seis {Pata} embaixo e as {Antena} na cabeça.');
    },
  });

  function felino(f, op) {
    const cor = op.cor;
    const corpo = E(30, 12, 13, { lados: 10, aneis: 7, cor });
    M.pintar(corpo, [0, 0, -6.6], 4.5, '#f6e7c8', 11);
    if (op.pintas) {
      const rnd = sorteio(7);
      for (let i = 0; i < 38; i++) {
        const p = M.naSuperficie([0, 0, 0], 30, 12, 13, rnd() * 360, rnd() * 110 - 40);
        M.pintar(corpo, p, 1.1 + rnd() * 0.3, C.preto); M.pintar(corpo, p, 0.55, '#c9852a');
      }
    }
    f.parte('Corpo', corpo, [P([0, 0, 17])]);
    const cab = E(10, 10, 8.5, { lados: 8, aneis: 6, cor });
    M.olho(cab, [3.6, 2.4, 1.6], 0.8, '#d9b84a'); M.olho(cab, [3.6, -2.4, 1.6], 0.8, '#d9b84a');
    if (op.pintas) { const rnd = sorteio(3); for (let i = 0; i < 9; i++) M.pintar(cab, M.naSuperficie([0, 0, 0], 10, 10, 8.5, rnd() * 140 - 70 + 180, rnd() * 50 + 20), 0.45, C.preto); }
    f.parte('Cabeça', cab, [P([17, 0, 22])]);
    const foc = E(4.4, 5, 3.6, { lados: 8, aneis: 4, cor: '#f3dcae' });
    M.pintar(foc, [2, 0, 0.8], 0.8, '#7a3d3d', 0.55);
    f.parte('Focinho', foc, [P([21.4, 0, 20.2])]);
    const rOrelha = op.juba ? 1.6 : 2.2;
    const orelha = M.placa(semicirculo(rOrelha), 0.8, { plano: 'yz', cor });
    M.pintar(orelha, [0, 0, rOrelha * 0.45], rOrelha * 0.4, op.juba ? '#6b3f1a' : C.preto);
    f.parte('Orelha', orelha, [P([15.6, 3.4, 25.4]), P([15.6, -3.4, 25.4])]);
    if (op.juba) f.parte('Juba', M.placa(M.estrela(9, 7.2, 14), 2.4, { plano: 'yz', cor: '#8a5524' }), [P([14.4, 0, 23])]);
    const perna = T(11.5, 2.5, 2.9, { lados: 8, cor });
    if (op.pintas) { M.pintar(perna, [2.5, 0, 6], 0.7, C.preto); M.pintar(perna, [-1.6, 1.8, 8], 0.6, C.preto); }
    f.parte('Perna', perna, [P([10, 3.8, 1]), P([10, -3.8, 1]), P([-10, 3.8, 1]), P([-10, -3.8, 1])]);
    f.parte('Pata', M.domo(5, 4.2, 2.2, { lados: 8, aneis: 4, cor }), [P([11, 3.8, 0]), P([11, -3.8, 0]), P([-9, 3.8, 0]), P([-9, -3.8, 0])]);
    const c1 = T(12, 1.7, 1.3, { lados: 6, cor });
    f.parte('Cauda (base)', c1, [P([-14.2, 0, 19.5], [['y', -120]])]);
    const c2 = T(11, 1.3, 0.9, { lados: 6, cor });
    if (op.pintas) { M.pintar(c2, [1.3, 0, 4], 0.6, C.preto); M.pintar(c2, [0, 0, 10.6], 1.0, C.preto); }
    const fim = ponta([-14.2, 0, 19.5], 12, -120, 0);
    f.parte('Cauda (ponta)', c2, [P(fim, [['y', op.juba ? -150 : -165]])]);
    if (op.juba) f.parte('Tufo da cauda', E(3.4, 3.4, 3.4, { lados: 6, aneis: 4, cor: '#8a5524' }), [P(ponta(fim, 11, -150, 0))]);
    f.passo('Cole as quatro {Perna} em pé sobre as quatro {Pata} e apoie o {Corpo} sobre as pernas.');
    f.passo('Cole a {Cabeça} na frente do corpo, o {Focinho} na frente da cabeça e as {Orelha} em pé no alto.' + (op.juba ? ' Cole a {Juba} atrás da cabeça.' : ''));
    f.passo('Cole a {Cauda (base)} atrás do corpo e a {Cauda (ponta)} na ponta dela.' + (op.juba ? ' Termine com o {Tufo da cauda}.' : ''));
  }

  figura('onca', {
    nome: 'Onça-pintada', grupo: 'Animais', medida: ['Comprimento (focinho à cauda)', 60], padrao: 45,
    descricao: 'Onça-pintada em pé, com rosetas pretas impressas no corpo.',
    construir(f) { felino(f, { cor: C.ocre, pintas: true }); },
  });
  figura('leao', {
    nome: 'Leão', grupo: 'Animais', medida: ['Comprimento (focinho à cauda)', 60], padrao: 45,
    descricao: 'Leão em pé, com juba e tufo na ponta da cauda.',
    construir(f) { felino(f, { cor: '#d4a55e', juba: true }); },
  });

  figura('raposa', {
    nome: 'Raposa', grupo: 'Animais', medida: ['Comprimento (focinho à cauda)', 50],
    descricao: 'Raposa com focinho fino, orelhas pontudas e cauda volumosa de ponta branca.',
    construir(f) {
      const cor = '#d9692a';
      const corpo = E(20, 8, 9, { lados: 8, aneis: 6, cor });
      M.pintar(corpo, [8.6, 0, -1.2], 2.6, C.branco);
      f.parte('Corpo', corpo, [P([0, 0, 13])]);
      const cab = E(7, 7, 6, { lados: 8, aneis: 6, cor });
      M.pintar(cab, [1.8, 2.6, -1.1], 1.5, C.branco); M.pintar(cab, [1.8, -2.6, -1.1], 1.5, C.branco);
      M.olho(cab, [2.7, 1.8, 0.9], 0.5, '#c98a2a'); M.olho(cab, [2.7, -1.8, 0.9], 0.5, '#c98a2a');
      f.parte('Cabeça', cab, [P([12, 0, 16.5])]);
      const foc = M.cone(5.2, 1.9, { lados: 6, achat: 0.85, cor });
      M.pintar(foc, [0, 0, 4.8], 0.55, C.preto);
      f.parte('Focinho', foc, [P([14.8, 0, 15.8], [['y', 96]])]);
      const orelha = M.placa([[-1.7, 0], [1.7, 0], [0, 4.4]], 0.6, { plano: 'yz', cor });
      M.pintar(orelha, [0, 0, 1.6], 0.9, C.preto);
      f.parte('Orelha', orelha, [P([11, 2.2, 18.8]), P([11, -2.2, 18.8])]);
      f.parte('Perna', T(9.5, 1.2, 1.4, { lados: 6, cor: '#2b2b2b' }), [P([6.5, 2.6, 0]), P([6.5, -2.6, 0]), P([-6.5, 2.6, 0]), P([-6.5, -2.6, 0])]);
      f.parte('Cauda', E(17, 6, 6, { lados: 8, aneis: 7, cores: (j) => (j <= 1 ? C.branco : cor) }), [P([-16.4, 0, 10.2], [['y', -25]])]);
      f.passo('Cole as quatro {Perna} sob o {Corpo}.');
      f.passo('Cole a {Cabeça} na frente, o {Focinho} na frente da cabeça e as {Orelha} em pé.');
      f.passo('Cole a {Cauda} atrás, inclinada para baixo.');
    },
  });

  figura('anta', {
    nome: 'Anta', grupo: 'Animais', medida: ['Comprimento', 55], padrao: 40,
    descricao: 'Anta com corpo robusto, tromba curta e orelhas de borda branca.',
    construir(f) {
      const cor = '#4f4846';
      f.parte('Corpo', E(30, 13, 15, { lados: 10, aneis: 7, ovo: -0.08, cor }), [P([0, 0, 19])]);
      const cab = E(11, 7, 8.5, { lados: 8, aneis: 6, cor });
      M.olho(cab, [2.6, 2.9, 1.4], 0.45);
      M.olho(cab, [2.6, -2.9, 1.4], 0.45);
      f.parte('Cabeça', cab, [P([17.2, 0, 19.6], [['y', 22]])]);
      const tromba = T(5, 2.2, 1.4, { lados: 6, cor });
      M.pintar(tromba, [0, 0, 5], 0.9, '#2b2626');
      f.parte('Tromba', tromba, [P([21.6, 0, 17.4], [['y', 118]])]);
      const orelha = M.placa(deslocar(M.oval(1.6, 2.2, 12), 0, 2.2), 0.6, { plano: 'yz', cor });
      M.pintar(orelha, [0, 0, 4.2], 1.6, C.branco, 0.45);
      f.parte('Orelha', orelha, [P([14.6, 2.8, 22.6]), P([14.6, -2.8, 22.6])]);
      const perna = M.tubo([[0, 2.9], [1, 2.95], [12.5, 3.2]], { lados: 8, cores: (j) => (j === 0 ? '#2b2626' : cor) });
      f.parte('Perna', perna, [P([10, 4.2, 0]), P([10, -4.2, 0]), P([-10, 4.2, 0]), P([-10, -4.2, 0])]);
      f.parte('Cauda', M.cone(2.5, 0.9, { lados: 5, cor }), [P([-14.8, 0, 20], [['y', -110]])]);
      f.passo('Cole as quatro {Perna} sob o {Corpo}.');
      f.passo('Cole a {Cabeça} na frente, um pouco abaixo, e a {Tromba} na ponta da cabeça. Cole as {Orelha} em pé e a {Cauda} atrás.');
    },
  });

  figura('girafa', {
    nome: 'Girafa', grupo: 'Animais', medida: ['Altura total', 62], padrao: 45,
    descricao: 'Girafa de pescoço longo, com manchas e chifres curtos (ossicones).',
    construir(f) {
      const cor = '#e7b65c', mancha = '#9b5a2a';
      const corpo = E(22, 11, 13, { lados: 10, aneis: 7, cor });
      const rnd = sorteio(11);
      for (let i = 0; i < 30; i++) M.pintar(corpo, M.naSuperficie([0, 0, 0], 22, 11, 13, rnd() * 360, rnd() * 120 - 45), 1.3 + rnd() * 0.4, mancha);
      f.parte('Corpo', corpo, [P([0, 0, 30])]);
      const pesc = T(22, 3.4, 2.2, { lados: 8, cor });
      for (let z = 3; z < 21; z += 4.2) for (let a = 0; a < 360; a += 90) {
        const r = 3.4 - 1.2 * z / 22, ang = (a + z * 25) * Math.PI / 180;
        M.pintar(pesc, [r * Math.cos(ang), r * Math.sin(ang), z], 1.0, mancha);
      }
      f.parte('Pescoço', pesc, [P([8, 0, 32], [['y', 25]])]);
      const topo = ponta([8, 0, 32], 22, 25, 0);
      const cab = E(8, 4.4, 4.8, { lados: 8, aneis: 6, cor });
      M.olho(cab, [0.9, 2.05, 0.9], 0.5); M.olho(cab, [0.9, -2.05, 0.9], 0.5);
      M.pintar(cab, [3.6, 0.8, -0.6], 0.35, C.marromEsc); M.pintar(cab, [3.6, -0.8, -0.6], 0.35, C.marromEsc);
      f.parte('Cabeça', cab, [P([topo[0] + 2.4, 0, topo[2] + 0.8], [['y', 25]])]);
      f.parte('Ossicone', T(2.2, 0.4, 0.35, { lados: 6, cor }), [P([topo[0] + 0.6, 0.9, topo[2] + 2.4]), P([topo[0] + 0.6, -0.9, topo[2] + 2.4])]);
      f.parte('Ponta do ossicone', E(0.9, 0.9, 0.9, { lados: 6, aneis: 3, cor: C.marromEsc }), [P([topo[0] + 0.6, 0.9, topo[2] + 4.7]), P([topo[0] + 0.6, -0.9, topo[2] + 4.7])]);
      f.parte('Orelha', M.placa(M.folha(2.6, 1.2), 0.4, { cor }), [P([topo[0] + 0.2, 1.8, topo[2] + 2], [['z', 100]]), P([topo[0] + 0.2, -1.8, topo[2] + 2], [['z', -100]])]);
      const perna = M.tubo([[0, 1.4], [1.2, 1.45], [25, 1.9]], { lados: 6, cores: (j) => (j === 0 ? '#3a2a1a' : cor) });
      f.parte('Perna', perna, [P([8, 3.4, 0]), P([8, -3.4, 0]), P([-8, 3.4, 0]), P([-8, -3.4, 0])]);
      f.parte('Cauda', T(12, 0.45, 0.35, { lados: 5, cor }), [P([-10.8, 0, 33], [['y', -160]])]);
      f.parte('Tufo da cauda', E(1.6, 1.6, 3, { lados: 6, aneis: 4, cor: '#3a2a1a' }), [P(ponta([-10.8, 0, 33], 12.8, -160, 0))]);
      f.passo('Cole as quatro {Perna} sob o {Corpo}.');
      f.passo('Cole o {Pescoço} no alto da frente do corpo, inclinado para a frente, e a {Cabeça} na ponta.');
      f.passo('Cole os dois {Ossicone} no alto da cabeça com a {Ponta do ossicone}, as {Orelha} dos lados, a {Cauda} e o {Tufo da cauda}.');
    },
  });

  // ========================================================= CORPO HUMANO

  const contornoOrelha = (h) => {
    const k = h / 6.5;
    return [[0, 3.2], [1.3, 3.0], [2.0, 2.2], [2.1, 1.0], [1.6, -0.2], [1.2, -1.4], [1.2, -2.4], [0.6, -3.2], [-0.2, -3.1], [-0.5, -2.2], [-0.6, -0.8], [-1.0, 0.6], [-1.2, 2.0], [-0.8, 2.9]]
      .map(([u, w]) => [-u * k, w * k]);
  };
  function malhaNariz(cor) {
    // altura 5,5 cm; base (lado do rosto) em x = 0
    const v = [
      [0, 0, 2.8], [0, 1.9, -2.4], [0, 0, -2.8], [0, -1.9, -2.4], // base no rosto
      [2.8, 0, -1.5], [1.0, 1.7, -2.1], [1.3, 0, -2.7], [1.0, -1.7, -2.1], // ponta, asas e base
    ];
    const f = [[0, 4, 5], [0, 7, 4], [4, 6, 5], [4, 7, 6], [0, 5, 1], [0, 3, 7], [1, 5, 6], [1, 6, 2], [3, 2, 6], [3, 6, 7], [0, 1, 2, 3]];
    const m = M.livre(v, f, cor);
    M.pintar(m, [1.05, 0.65, -2.45], 0.42, '#7a4a3a', 0.3); M.pintar(m, [1.05, -0.65, -2.45], 0.42, '#7a4a3a', 0.3);
    return m;
  }

  figura('cabeca', {
    nome: 'Cabeça', grupo: 'Corpo humano', medida: ['Circunferência da cabeça', 57],
    descricao: 'Cabeça em tamanho real, com pescoço, nariz e orelhas. Serve para demonstrar capacete, óculos e protetor auricular.',
    construir(f) {
      const cab = EZ(19.5, 15.5, 23, { lados: 12, aneis: 8, ovo: -0.1, cor: C.pele });
      M.pintar(cab, [-1.5, 0, 9.6], 8.6, C.cabelo, 9.6);
      M.olho(cab, [8.7, 3.2, 1.6], 1.15, '#5a7fa8'); M.olho(cab, [8.7, -3.2, 1.6], 1.15, '#5a7fa8');
      M.pintar(cab, [8.6, 3.2, 3.6], 1.5, C.cabelo, 0.35); M.pintar(cab, [8.6, -3.2, 3.6], 1.5, C.cabelo, 0.35);
      M.pintar(cab, [8.1, 0, -5.4], 2.3, '#c0505a', 0.55);
      f.parte('Cabeça', cab, [P([0, 0, 22])]);
      f.parte('Nariz', malhaNariz(C.pele), [P([9.3, 0, 21.6])]);
      f.parte('Orelha', M.placa(contornoOrelha(6.5), 1.2, { plano: 'xz', cor: C.peleSombra }), [P([-0.6, 7.75, 22.2]), P([-0.6, -7.75, 22.2], [], true)]);
      f.parte('Pescoço', T(11, 5.8, 5.6, { lados: 10, achat: 1.05, cor: C.pele }), [P([-0.8, 0, 0.5])]);
      f.passo('Cole o {Pescoço} em pé e a {Cabeça} sobre ele, com o rosto para a frente.');
      f.passo('Cole o {Nariz} no meio do rosto, entre os olhos e a boca, e uma {Orelha} de cada lado, na altura dos olhos.');
    },
  });

  figura('nariz', {
    nome: 'Nariz', grupo: 'Corpo humano', medida: ['Altura do nariz (ampliado)', 12],
    descricao: 'Nariz ampliado sobre uma base de rosto, para estudo e demonstração de respiradores.',
    construir(f) {
      const k = 12 / 5.6;
      f.parte('Nariz', M.escalar(malhaNariz(C.pele), k), [P([0, 0, 0])]);
      f.parte('Base do rosto', M.placa(M.oval(5.2 * k, 4 * k, 18), 0.6 * k, { plano: 'yz', cor: C.peleSombra }), [P([-0.3 * k, 0, 0], [['x', 90]])]);
      f.passo('Cole o {Nariz} pela face de trás no centro da {Base do rosto}.');
    },
  });

  figura('olho', {
    nome: 'Olho', grupo: 'Corpo humano', medida: ['Diâmetro do globo (ampliado)', 8],
    descricao: 'Globo ocular ampliado com íris, pupila e nervo óptico. O olho real mede cerca de 2,4 cm.',
    construir(f) {
      const g = E(8, 8, 8, { lados: 12, aneis: 8, cor: '#fbf8f2' });
      M.pintar(g, [4, 0, 0], 1.9, '#4a7db0'); M.pintar(g, [4, 0, 0], 0.9, '#111111'); M.pintar(g, [3.9, 0.55, 0.6], 0.3, C.branco);
      const rnd = sorteio(5);
      for (let i = 0; i < 10; i++) M.pintar(g, M.naSuperficie([0, 0, 0], 8, 8, 8, 40 + rnd() * 280, rnd() * 120 - 60), 0.12, '#d65a5a', 0.6);
      f.parte('Globo ocular', g, [P([0, 0, 4])]);
      f.parte('Nervo óptico', T(4, 1.0, 0.9, { lados: 6, cor: '#e9b7a2' }), [P([-3.7, 0, 4], [['y', -90]])]);
      f.passo('Cole o {Nervo óptico} na parte de trás do {Globo ocular}, do lado oposto à íris.');
    },
  });

  figura('orelha', {
    nome: 'Orelha', grupo: 'Corpo humano', medida: ['Altura da orelha (ampliada)', 14],
    descricao: 'Orelha ampliada sobre uma base, com canal auditivo. Útil para demonstrar protetor auricular.',
    construir(f) {
      const orelha = M.placa(contornoOrelha(14), 2.4, { plano: 'yz', cor: C.pele });
      M.pintar(orelha, [1.2, -0.6, -0.4], 2.4, C.peleSombra, 3.2);
      f.parte('Pavilhão', orelha, [P([1.2, 0, 0])]);
      f.parte('Canal auditivo', T(1.2, 0.9, 0.9, { lados: 6, cor: '#b97f6a' }), [P([2.4, -0.6, -0.6], [['y', 90]])]);
      f.parte('Base', M.placa(M.oval(7, 9, 16), 1, { plano: 'yz', cor: C.peleSombra }), [P([-0.5, 0, 0])]);
      f.passo('Cole o {Pavilhão} na {Base} e o {Canal auditivo} na concha, perto da frente da orelha.');
    },
  });

  figura('boca', {
    nome: 'Boca', grupo: 'Corpo humano', medida: ['Largura da boca (ampliada)', 14],
    descricao: 'Boca ampliada com lábios, dentes e base. A boca real mede cerca de 5 cm.',
    construir(f) {
      f.parte('Lábio superior', M.domo(14, 2.6, 1.9, { lados: 8, aneis: 6, cor: '#c8606a' }), [P([0.3, 0, 0.9], [['z', 90]])]);
      f.parte('Lábio inferior', M.domo(12.5, 2.8, 2.2, { lados: 8, aneis: 6, cor: '#c8606a' }), [P([0.3, 0, -0.9], [['x', 180], ['z', 90]])]);
      f.parte('Dentes', M.placa([[-4, 0], [4, 0], [4, 1], [-4, 1]], 0.4, { plano: 'yz', cor: C.branco }), [P([0.2, 0, -0.1])]);
      f.parte('Interior', M.placa(M.oval(6.4, 1.6, 14), 0.4, { plano: 'yz', cor: '#5a1f24' }), [P([-0.3, 0, 0])]);
      f.parte('Base', M.placa(M.oval(10, 6.5, 18), 1, { plano: 'yz', cor: C.pele }), [P([-1, 0, 0])]);
      f.passo('Cole o {Interior} no centro da {Base} e os {Dentes} na parte de cima do interior.');
      f.passo('Cole o {Lábio superior} acima e o {Lábio inferior} abaixo da abertura.');
    },
  });

  function membro(id, nome, medida, descricao, estacoes, achat, lados, passo) {
    figura(id, {
      nome, grupo: 'Corpo humano', medida, descricao,
      construir(f) {
        f.parte(nome, M.tubo(estacoes, { lados, achat, cor: C.pele }), [P([0, 0, 0])]);
        f.passo(passo);
      },
    });
  }
  membro('braco', 'Braço', ['Comprimento (cotovelo ao ombro)', 30], 'Braço em tamanho real, do cotovelo ao ombro, com o volume do bíceps.',
    [[0, 4.3], [6, 4.9], [14, 5.1], [22, 4.7], [30, 4.0]], 0.92, 10, 'Feche o tubo colando as bordas numeradas. As tampas das pontas servem para unir ao {Braço} e ao antebraço.');
  membro('antebraco', 'Antebraço', ['Comprimento (punho ao cotovelo)', 26], 'Antebraço em tamanho real, do punho ao cotovelo.',
    [[0, 2.8], [6, 3.2], [16, 4.2], [22, 4.4], [26, 4.1]], 0.85, 10, 'Feche o tubo colando as bordas numeradas. A ponta fina é o punho.');
  membro('punho', 'Punho', ['Comprimento', 7], 'Punho em tamanho real, achatado como o natural. Útil para demonstrar luvas e pulseiras.',
    [[0, 2.9], [3.5, 2.75], [7, 2.9]], 0.68, 10, 'Feche a peça colando as bordas numeradas.');
  membro('perna', 'Perna', ['Comprimento (tornozelo ao joelho)', 42], 'Perna em tamanho real, do tornozelo ao joelho, com a panturrilha.',
    [[0, 3.4], [5, 3.7], [12, 4.8], [20, 5.8], [30, 5.6], [38, 5.1], [42, 5.0]], 0.9, 10, 'Feche o tubo colando as bordas numeradas. A ponta fina é o tornozelo.');
  membro('coxa', 'Coxa', ['Comprimento (joelho ao quadril)', 45], 'Coxa em tamanho real, do joelho ao quadril.',
    [[0, 5.4], [8, 6.4], [20, 7.6], [34, 8.5], [45, 8.6]], 0.92, 12, 'Feche o tubo colando as bordas numeradas. A ponta fina é o joelho.');

  figura('mao', {
    nome: 'Mão', grupo: 'Corpo humano', medida: ['Comprimento da mão', 19],
    descricao: 'Mão aberta em tamanho real: palma e cinco dedos. Útil para demonstrar luvas.',
    construir(f) {
      f.parte('Palma', M.placa([[0, -4.0], [1.5, -4.4], [8.6, -4.2], [10, -3.2], [10.2, 3.6], [9, 4.3], [1.5, 4.2], [0, 3.6]], 2.8, { cor: C.pele }), [P([0, 0, 1.4])]);
      const dedo = (L, r) => {
        const m = M.tubo([[0, r], [L - r * 0.8, r * 0.95], [L - r * 0.25, r * 0.6], [L, 0]], { lados: 6, achat: 0.85, cor: C.pele });
        M.pintar(m, [-r * 0.85, 0, L - r * 0.9], 0.45, '#f5ddd0', 0.6);
        return m;
      };
      f.parte('Indicador', dedo(7.6, 0.95), [P([9.9, 2.6, 1.4], [['y', 90]])]);
      f.parte('Médio', dedo(8.4, 1.0), [P([10.1, 0.6, 1.4], [['y', 90]])]);
      f.parte('Anelar', dedo(7.8, 0.95), [P([10.1, -1.4, 1.4], [['y', 90]])]);
      f.parte('Mínimo', dedo(6.2, 0.8), [P([9.8, -3.3, 1.4], [['y', 90]])]);
      f.parte('Polegar', dedo(6.4, 1.15), [P([2.6, 4.2, 1.4], [['y', 90], ['z', 50]])]);
      f.passo('Cole os dedos pela base na borda da frente da {Palma}: {Indicador}, {Médio}, {Anelar} e {Mínimo}. Cole o {Polegar} na lateral, perto do punho, apontando para a frente.');
    },
  });

  figura('pe', {
    nome: 'Pé', grupo: 'Corpo humano', medida: ['Comprimento do pé', 26],
    descricao: 'Pé em tamanho real com o tornozelo. Útil para demonstrar calçado de segurança.',
    construir(f) {
      const perfil = [[0, 2.2, 3.4], [1.5, 3.1, 5.6], [5, 3.4, 7.2], [9, 3.6, 7.0], [13, 4.1, 5.4], [17, 4.6, 3.8], [21, 4.8, 2.8], [24, 4.5, 2.2], [26, 3.2, 1.5]];
      const pe = M.domo(26, 9, 7, { perfil: perfil.map(([z, a, b]) => [z - 13, a, b]), lados: 10, triangular: true, cor: C.pele });
      for (const [y, r] of [[3.2, 0.7], [1.6, 0.5], [0.2, 0.45], [-1.2, 0.42], [-2.6, 0.4]]) M.pintar(pe, [12.4 - Math.abs(y) * 0.35, y, 1.7], r, '#f5ddd0');
      f.parte('Pé', pe, [P([0, 0, 0])]);
      f.parte('Tornozelo', T(9, 3.3, 3.2, { lados: 10, achat: 0.85, cor: C.pele }), [P([-8.2, 0, 4.5])]);
      f.passo('Cole o {Tornozelo} em pé sobre a parte de trás do {Pé}, acima do calcanhar.');
    },
  });

  return { CATALOGO, ACABAMENTOS, C, figura, Figura, planificarPartes, letra, P, T, E, EZ };
});
