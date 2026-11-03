/*
 * Gerador de Moldes — veículos, instalações, EPIs, máquinas e personagens.
 * Mesmo padrão de figuras.js: medidas em cm, X para a frente, Z para cima.
 */
(function (raiz, fabrica) {
  const nodejs = typeof module === 'object' && module.exports;
  const M = nodejs ? require('./malha3d.js') : raiz.Malha3D;
  const F = nodejs ? require('./figuras.js') : raiz.Figuras;
  fabrica(M, F);
  if (nodejs) module.exports = F;
})(typeof self !== 'undefined' ? self : this, function (M, F) {
  'use strict';
  const { figura, P, T, E, EZ, C } = F;
  const vidro = '#a9d3ee', pneu = '#2a2a2a', calota = '#b8bec4', borracha = '#1f1f1f';

  /** Roda centrada na origem, eixo em Y. */
  function roda(r, larg, cor) {
    const m = M.mover(M.girar(T(larg, r, r, { lados: 12, cor: cor || pneu }), 'x', 90), [0, larg / 2, 0]);
    M.pintar(m, [0, larg / 2, 0], r * 0.5, calota); M.pintar(m, [0, -larg / 2, 0], r * 0.5, calota);
    return m;
  }
  const quatroRodas = (xf, xt, y, r) => [P([xf, y, r]), P([xf, -y, r]), P([xt, y, r]), P([xt, -y, r])];
  /** Prisma deitado com perfil no plano XZ, largura em Y. */
  const perfilXZ = (poly, larg, cor) => M.placa(poly, larg, { plano: 'xz', cor });
  const telhado = (m, corParede, corTelhado, corBase) =>
    M.colorirPorNormal(m, (n) => (n[2] > 0.3 ? corTelhado : n[2] < -0.9 ? corBase : corParede));

  // ================================================================ VEÍCULOS

  figura('carro', {
    nome: 'Carro', grupo: 'Veículos', medida: ['Comprimento', 24],
    descricao: 'Carro de passeio com janelas, faróis e quatro rodas.',
    construir(f) {
      const corpo = perfilXZ([[-12, 2], [12, 2], [12, 5.5], [10.5, 6.2], [5, 6.6], [2.5, 10], [-6, 10], [-8.5, 6.8], [-12, 6.4]], 10, C.vermelho);
      for (const y of [5, -5]) { M.pintarRet(corpo, [-3.2, y, 8.3], 4.4, 2.6, vidro); M.pintarRet(corpo, [1.1, y, 8.3], 2.6, 2.6, vidro); }
      M.pintarRet(corpo, [3.75, 0, 8.3], 8, 2.8, vidro);
      M.pintarRet(corpo, [-7.25, 0, 8.4], 8, 2.4, vidro);
      M.pintar(corpo, [12, 3.4, 4.4], 0.75, C.amarelo); M.pintar(corpo, [12, -3.4, 4.4], 0.75, C.amarelo);
      M.pintarRet(corpo, [-12, 3.6, 5.2], 1.6, 0.8, '#b71c1c'); M.pintarRet(corpo, [-12, -3.6, 5.2], 1.6, 0.8, '#b71c1c');
      f.parte('Carroceria', corpo, [P([0, 0, 0])]);
      f.parte('Roda', roda(2.4, 1.8), quatroRodas(7.5, -7.5, 6, 2.4));
      f.passo('Cole as quatro {Roda} nas laterais da {Carroceria}, nas duas pontas, com a parte de baixo encostando na mesa.');
    },
  });

  figura('caminhao', {
    nome: 'Caminhão baú', grupo: 'Veículos', medida: ['Comprimento', 40], padrao: 30,
    descricao: 'Caminhão com cabine, chassi, baú de carga e seis rodas.',
    construir(f) {
      const cab = perfilXZ([[12, 3.6], [20, 3.6], [20, 9], [18.6, 13.6], [12, 13.6]], 11, '#1f6fb5');
      M.pintarRet(cab, [19.3, 0, 11.3], 9, 3.4, vidro);
      M.pintarRet(cab, [15.8, 5.5, 11], 4, 3, vidro); M.pintarRet(cab, [15.8, -5.5, 11], 4, 3, vidro);
      M.pintar(cab, [20, 4, 5], 0.8, C.amarelo); M.pintar(cab, [20, -4, 5], 0.8, C.amarelo);
      f.parte('Cabine', cab, [P([0, 0, 0])]);
      f.parte('Chassi', M.caixa(33, 9, 1.4, { cor: '#333333' }), [P([3.5, 0, 2.2])]);
      const bau = M.caixa(23, 11, 11, { cor: '#f4f4f4' });
      for (const y of [5.5, -5.5]) M.pintarRet(bau, [0, y, 4], 20, 1.6, '#1f6fb5');
      M.pintarRet(bau, [-11.5, 0, 5.5], 0.3, 10, '#9a9a9a');
      f.parte('Baú', bau, [P([-1.5, 0, 3.6])]);
      f.parte('Para-choque', M.caixa(1, 11.5, 1.6, { cor: '#555555' }), [P([20.4, 0, 2.6])]);
      const r = 2.6;
      f.parte('Roda', roda(r, 2), [P([15.5, 6.2, r]), P([15.5, -6.2, r]), P([-5, 6.2, r]), P([-5, -6.2, r]), P([-9.8, 6.2, r]), P([-9.8, -6.2, r])]);
      f.passo('Cole o {Baú} e a {Cabine} sobre o {Chassi}, com a cabine na frente. Cole o {Para-choque} na frente da cabine.');
      f.passo('Cole as seis {Roda} nas laterais do chassi: duas embaixo da cabine e quatro embaixo do baú.');
    },
  });

  figura('empilhadeira', {
    nome: 'Empilhadeira', grupo: 'Veículos', medida: ['Comprimento (com os garfos)', 30], padrao: 24,
    descricao: 'Empilhadeira com torre, garfos, contrapeso, proteção do operador e assento.',
    construir(f) {
      const amarelo = '#f2b705';
      const corpo = perfilXZ([[-9, 2], [6, 2], [6, 7], [1, 7], [-4, 9], [-9, 9]], 11, amarelo);
      M.pintarRet(corpo, [-1, 5.5, 4.5], 8, 1, borracha); M.pintarRet(corpo, [-1, -5.5, 4.5], 8, 1, borracha);
      f.parte('Corpo', corpo, [P([0, 0, 0])]);
      const contra = M.caixa(3, 11, 7.5, { cor: '#3d3d3d' });
      for (const z of [1.5, 3.7, 5.9]) M.pintarRet(contra, [-1.5, 0, z], 9, 0.8, C.amarelo);
      f.parte('Contrapeso', contra, [P([-10.5, 0, 2])]);
      f.parte('Assento', M.placa([[0, 0], [4, 0], [4, 1.4], [0.8, 1.4], [0, 5]], 5, { plano: 'xz', cor: borracha }), [P([-5.5, 0, 9])]);
      f.parte('Coluna traseira', T(9, 0.4, 0.4, { lados: 4, cor: '#333333' }), [P([-7.5, 4.6, 9]), P([-7.5, -4.6, 9])]);
      f.parte('Coluna dianteira', T(11, 0.4, 0.4, { lados: 4, cor: '#333333' }), [P([3.5, 4.6, 7]), P([3.5, -4.6, 7])]);
      f.parte('Teto de proteção', M.caixa(12, 10.4, 0.5, { cor: '#333333' }), [P([-2, 0, 18])]);
      f.parte('Torre', M.caixa(1, 1.2, 21, { cor: '#555555' }), [P([7, 3.5, 1]), P([7, -3.5, 1])]);
      f.parte('Carro dos garfos', M.caixa(1, 9, 4.5, { cor: '#555555' }), [P([8, 0, 1.2])]);
      f.parte('Garfo', M.placa([[0, 0], [11, 0], [11, 0.6], [1, 0.6], [1, 5.5], [0, 5.5]], 1.2, { plano: 'xz', cor: '#555555' }), [P([8.5, 2.6, 0.8]), P([8.5, -2.6, 0.8])]);
      f.parte('Roda dianteira', roda(2.8, 2.4), [P([3, 6.8, 2.8]), P([3, -6.8, 2.8])]);
      f.parte('Roda traseira', roda(2.2, 2), [P([-6.5, 6.6, 2.2]), P([-6.5, -6.6, 2.2])]);
      f.passo('Cole o {Contrapeso} atrás do {Corpo} e o {Assento} sobre o corpo.');
      f.passo('Cole as {Coluna traseira} e as {Coluna dianteira} nos quatro cantos e o {Teto de proteção} por cima.');
      f.passo('Cole as duas {Torre} em pé na frente do corpo, o {Carro dos garfos} na frente delas e os dois {Garfo} no carro.');
      f.passo('Cole as {Roda dianteira} na frente e as {Roda traseira} atrás.');
    },
  });

  // ================================================== MAQUETES DE INSTALAÇÕES

  figura('galpao', {
    nome: 'Galpão industrial', grupo: 'Instalações', medida: ['Comprimento', 40], padrao: 30,
    descricao: 'Galpão com telhado de duas águas, portão, porta de pedestres e janelas laterais.',
    construir(f) {
      const g = telhado(M.placa([[-10, 0], [10, 0], [10, 8], [0, 12], [-10, 8]], 40, { plano: 'yz', cor: '#b9c4cc' }), '#b9c4cc', '#7a8691', '#6b6b6b');
      M.pintarRet(g, [20, 0, 3.1], 8, 6, '#5d6a75');
      M.pintarRet(g, [20, -7, 1.6], 1.8, 3.2, '#2e7d32');
      M.pintarRet(g, [20, -7, 4], 2.2, 0.5, '#2e7d32');
      for (let x = -15; x <= 15; x += 6) for (const y of [10, -10]) M.pintarRet(g, [x, y, 6], 3, 1.4, vidro);
      M.pintarRet(g, [-20, 0, 2.6], 6, 5, '#5d6a75');
      f.parte('Galpão', g, [P([0, 0, 0])]);
      f.parte('Calçada', M.chapa([[-23, -13], [23, -13], [23, 13], [-23, 13]], { cor: '#c8c8c8' }), [P([0, 0, -0.05])]);
      f.passo('Monte o {Galpão} como uma caixa: as paredes de ponta formam as empenas do telhado.');
      f.passo('Cole o galpão sobre a {Calçada}, centralizado.');
    },
  });

  figura('casa', {
    nome: 'Casa', grupo: 'Instalações', medida: ['Comprimento', 20],
    descricao: 'Casa térrea com telhado, porta, janelas e chaminé.',
    construir(f) {
      const c = telhado(M.placa([[-6, 0], [6, 0], [6, 7], [0, 11], [-6, 7]], 20, { plano: 'yz', cor: '#f1d9a7' }), '#f1d9a7', '#c2492e', '#8d6e63');
      M.pintarRet(c, [0, -6, 2.4], 2.4, 4.6, '#7a4a2a');
      for (const x of [-6, 5]) M.pintarRet(c, [x, -6, 4.2], 3, 2.4, vidro);
      for (const x of [-5, 5]) M.pintarRet(c, [x, 6, 4.2], 3, 2.4, vidro);
      M.pintarRet(c, [10, 0, 4.2], 2.6, 2.4, vidro); M.pintarRet(c, [-10, 0, 4.2], 2.6, 2.4, vidro);
      f.parte('Casa', c, [P([0, 0, 0], [['z', 90]])]);
      f.parte('Chaminé', M.caixa(2, 2, 6, { cor: '#9e3d26' }), [P([3, 3, 6.5])]);
      f.passo('Monte a {Casa} e cole a {Chaminé} sobre o telhado.');
    },
  });

  figura('caixaDagua', {
    nome: "Caixa d'água elevada", grupo: 'Instalações', medida: ['Altura total', 40], padrao: 32,
    descricao: "Reservatório elevado sobre quatro colunas, com tampa cônica e base.",
    construir(f) {
      const tanque = M.tubo([[0, 6], [9, 6], [12, 0.3]], { lados: 12, cor: '#9fb4c2' });
      M.pintarRet(tanque, [6, 0, 4.5], 4, 3, '#1f6fb5');
      f.parte('Reservatório', tanque, [P([0, 0, 26])]);
      f.parte('Plataforma', M.caixa(14, 14, 0.8, { cor: '#6d6d6d' }), [P([0, 0, 25.2])]);
      f.parte('Coluna', T(25.2, 0.7, 0.7, { lados: 4, cor: '#7d7d7d' }), [P([5.5, 5.5, 0]), P([5.5, -5.5, 0]), P([-5.5, 5.5, 0]), P([-5.5, -5.5, 0])]);
      f.parte('Escada', M.placa([[-0.6, 0], [0.6, 0], [0.6, 25], [-0.6, 25]], 0.3, { plano: 'yz', cor: '#c62828' }), [P([7.2, 0, 0])]);
      f.parte('Base', M.caixa(18, 18, 0.8, { cor: '#c8c8c8' }), [P([0, 0, -0.8])]);
      f.passo('Cole as quatro {Coluna} em pé nos cantos da {Base} e a {Plataforma} por cima delas.');
      f.passo('Cole o {Reservatório} sobre a plataforma e a {Escada} encostada em uma das colunas da frente.');
    },
  });

  // ============================================================ EPI E EPC

  figura('capacete', {
    nome: 'Capacete de segurança', grupo: 'EPI e EPC', medida: ['Comprimento do casco', 28],
    descricao: 'Capacete com aba frontal e nervura central. No tamanho padrão, o casco é oco e cabe em uma cabeça adulta.',
    construir(f) {
      const amarelo = '#f2c230';
      const casco = M.domo(28, 22, 14, { lados: 14, aneis: 6, semBase: true, cor: amarelo });
      f.parte('Casco', casco, [P([0, 0, 0])]);
      const arcoExt = [], arcoInt = [];
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * i / 10;
        arcoExt.push([14.2 * Math.cos(a), 14.6 * Math.sin(a)]);
        arcoInt.push([12.8 * Math.cos(a), 13.4 * Math.sin(a)]);
      }
      f.parte('Nervura', M.placa(arcoExt.concat(arcoInt.reverse()), 1.6, { plano: 'xz', cor: amarelo }), [P([0, 0, 0])]);
      const aba = [];
      for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + Math.PI * i / 10; aba.push([13.6 * Math.cos(a), 10.6 * Math.sin(a)]); }
      for (let i = 10; i >= 0; i--) { const a = -Math.PI / 2 + Math.PI * i / 10; aba.push([17.5 * Math.cos(a) - 0.2, 10.8 * Math.sin(a)]); }
      f.parte('Aba frontal', M.placa(aba, 0.5, { cor: amarelo }), [P([0, 0, 0.6])]);
      f.passo('Feche o {Casco}: ele fica aberto embaixo, como um capacete de verdade.');
      f.passo('Cole a {Nervura} em pé sobre o casco, da frente até a nuca, e a {Aba frontal} na borda da frente.');
    },
  });

  figura('protetorAuricular', {
    nome: 'Protetor auricular tipo concha', grupo: 'EPI e EPC', medida: ['Altura total', 22],
    descricao: 'Abafador com duas conchas, almofadas e arco.',
    construir(f) {
      const concha = M.domo(9, 6.5, 3.4, { lados: 10, aneis: 4, cor: '#d32f2f' });
      f.parte('Concha', concha, [P([0, 8.6, 5], [['x', -90]]), P([0, -8.6, 5], [['x', 90]])]);
      f.parte('Almofada', M.placa(M.oval(4.4, 3.1, 14), 1.6, { plano: 'xz', cor: borracha }), [P([0, 7.8, 5], [['z', 90], ['z', -90]]), P([0, -7.8, 5])]);
      const R = 8.6, z0 = 10, n = 8;
      const poses = [];
      let L = 0;
      for (let i = 0; i < n; i++) {
        const a1 = Math.PI * i / n, a2 = Math.PI * (i + 1) / n;
        const p1 = [0, R * Math.cos(a1), z0 + R * Math.sin(a1)], p2 = [0, R * Math.cos(a2), z0 + R * Math.sin(a2)];
        L = Math.hypot(p2[1] - p1[1], p2[2] - p1[2]);
        poses.push(P(p1, [['x', Math.atan2(-(p2[1] - p1[1]), p2[2] - p1[2]) * 180 / Math.PI]]));
      }
      f.parte('Gomo do arco', M.tubo([[0, 0.5], [L, 0.5]], { lados: 4, achat: 3, fase: Math.PI / 4, cor: '#3d3d3d' }), poses);
      f.parte('Haste', T(5, 0.5, 0.5, { lados: 4, achat: 3, fase: Math.PI / 4, cor: '#3d3d3d' }), [P([0, 8.6, 5]), P([0, -8.6, 5])]);
      f.passo('Cole cada {Almofada} na face plana de uma {Concha}.');
      f.passo('Cole os oito {Gomo do arco} em sequência, formando um arco, e uma {Haste} em cada ponta; cole as conchas nas hastes.');
    },
  });

  figura('botina', {
    nome: 'Botina de segurança', grupo: 'EPI e EPC', medida: ['Comprimento', 29],
    descricao: 'Botina de cano curto com solado grosso e biqueira.',
    construir(f) {
      const perfil = [[0, 2.6, 4.5], [1.5, 3.4, 7], [5, 3.7, 8.6], [9, 3.9, 8.4], [13, 4.4, 6.4], [17, 4.9, 4.8], [21, 5.1, 3.9], [24, 4.9, 3.4], [27, 3.6, 2.6]];
      const corpo = M.domo(27, 10, 8.6, { perfil: perfil.map(([z, a, b]) => [z - 13.5, a, b]), lados: 10, triangular: true, cor: '#4a3020' });
      for (let i = 0; i < 4; i++) M.pintar(corpo, [-1 + i * 2.2, 0, 8.6 - i * 0.5], 0.25, '#d9b98a', 1.5);
      M.pintar(corpo, [11.5, 0, 2.6], 3, '#3a2416', 2.2);
      f.parte('Corpo', corpo, [P([0, 0, 1.4])]);
      f.parte('Cano', T(7, 4, 4.2, { lados: 10, achat: 0.85, cor: '#4a3020' }), [P([-8.6, 0, 8.4])]);
      const sola = [];
      for (const [z, a] of perfil) sola.push([z - 13.5, a + 0.3]);
      for (const [z, a] of perfil.slice().reverse()) sola.push([z - 13.5, -a - 0.3]);
      f.parte('Solado', M.placa(sola, 1.4, { cor: '#d68a2c' }), [P([0, 0, 0.7])]);
      f.passo('Cole o {Cano} em pé sobre a parte de trás do {Corpo} e o corpo sobre o {Solado}.');
    },
  });

  figura('oculos', {
    nome: 'Óculos de proteção', grupo: 'EPI e EPC', medida: ['Largura', 15],
    descricao: 'Óculos de proteção com lente única envolvente e hastes.',
    construir(f) {
      const lente = [[-7.5, -1.6], [-7.2, 1.4], [-4, 2.1], [-1, 1.8], [0, 1.2], [1, 1.8], [4, 2.1], [7.2, 1.4], [7.5, -1.6], [4.5, -2.6], [1.5, -2.2], [0, -0.8], [-1.5, -2.2], [-4.5, -2.6]];
      f.parte('Lente', M.placa(lente, 0.3, { plano: 'yz', cor: '#cfe6f2' }), [P([0, 0, 5])]);
      f.parte('Haste', M.placa([[0, -0.4], [14, -0.4], [15, -1.6], [15.6, -1.2], [14.4, 0.4], [0, 0.4]], 0.4, { plano: 'xz', cor: '#2b6fd0' }), [P([-14.6, 7.3, 5.8]), P([-14.6, -7.3, 5.8])]);
      f.passo('Cole uma {Haste} em cada ponta da {Lente}, apontando para trás.');
    },
  });

  figura('cone', {
    nome: 'Cone de sinalização', grupo: 'EPI e EPC', medida: ['Altura', 30],
    descricao: 'Cone laranja com faixas refletivas brancas e base quadrada.',
    construir(f) {
      const est = [[0, 7.2], [6, 5.9], [10, 5.0], [14, 4.1], [18, 3.2], [22, 2.3], [27, 1.2], [28.5, 0]];
      f.parte('Cone', M.tubo(est, { lados: 12, cores: (j) => (j === 2 || j === 4 ? C.branco : C.laranja) }), [P([0, 0, 1.5])]);
      f.parte('Base', M.caixa(17, 17, 1.5, { cor: '#2b2b2b' }), [P([0, 0, 0])]);
      f.passo('Cole o {Cone} no centro da {Base}.');
    },
  });

  figura('extintor', {
    nome: 'Extintor de incêndio', grupo: 'EPI e EPC', medida: ['Altura', 45], padrao: 30,
    descricao: 'Extintor com cilindro, válvula, alça, manômetro, mangueira e etiqueta.',
    construir(f) {
      const cil = M.tubo([[0, 7.5], [30, 7.5], [33, 6.5], [35, 4], [35.6, 2]], { lados: 14, cor: C.vermelho });
      M.pintarRet(cil, [7.5, 0, 16], 7.4, 11, C.branco);
      M.pintarRet(cil, [7.5, 0, 19.5], 6, 1.4, '#222222'); M.pintarRet(cil, [7.5, 0, 16.5], 6, 0.7, '#555555'); M.pintarRet(cil, [7.5, 0, 14], 6, 0.7, '#555555');
      f.parte('Cilindro', cil, [P([0, 0, 0])]);
      f.parte('Válvula', M.caixa(3, 2.4, 4.2, { cor: '#9aa0a6' }), [P([0, 0, 35.6])]);
      const man = T(0.8, 1.4, 1.4, { lados: 10, cor: '#dcdcdc' });
      M.pintar(man, [0, 0, 0.8], 1.0, C.branco); M.pintar(man, [0.4, 0, 0.8], 0.25, '#2e7d32');
      f.parte('Manômetro', man, [P([1.5, 0, 38], [['y', 90]])]);
      f.parte('Alça', M.placa([[0, 0], [6, 0.8], [6.5, 1.6], [0, 1.2]], 1.6, { plano: 'xz', cor: '#3d3d3d' }), [P([-1.4, 0, 39.6])]);
      const seg = 6;
      f.parte('Mangueira', T(seg, 0.7, 0.7, { lados: 6, cor: borracha }), [P([-1.6, 0, 37], [['y', -150]]), P([-4.6, 0, 31.8], [['y', -175]]), P([-5.1, 0, 25.8], [['y', 175]])]);
      f.parte('Bocal', M.cone(2.4, 0.9, { lados: 6, cor: borracha }), [P([-4.6, 0, 19.8], [['y', 180]])]);
      f.passo('Cole a {Válvula} no topo do {Cilindro}, o {Manômetro} na frente da válvula e a {Alça} em cima.');
      f.passo('Cole as três {Mangueira} em sequência, descendo pela lateral, e o {Bocal} na ponta.');
    },
  });

  // ============================================================== MÁQUINAS

  figura('trator', {
    nome: 'Trator', grupo: 'Máquinas', medida: ['Comprimento', 30], padrao: 24,
    descricao: 'Trator agrícola com cabine, capô, escapamento e rodas traseiras grandes.',
    construir(f) {
      const verde = '#2f8f3a';
      const capo = M.caixa(12, 7, 6, { cor: verde });
      M.pintarRet(capo, [6, 0, 3], 5.4, 4.4, '#1e1e1e');
      M.pintar(capo, [6, 2.6, 4.8], 0.5, C.amarelo); M.pintar(capo, [6, -2.6, 4.8], 0.5, C.amarelo);
      f.parte('Capô', capo, [P([5.5, 0, 5])]);
      f.parte('Chassi', M.caixa(22, 6, 3, { cor: '#3a3a3a' }), [P([1, 0, 3])]);
      const cab = M.caixa(10, 10, 11, { cor: verde });
      for (const [c, w] of [[[5, 0, 6], 8], [[-5, 0, 6], 8], [[0, 5, 6], 8], [[0, -5, 6], 8]]) M.pintarRet(cab, c, w, 7.5, vidro);
      f.parte('Cabine', cab, [P([-6, 0, 6])]);
      f.parte('Teto', M.caixa(12, 12, 0.8, { cor: C.branco }), [P([-6, 0, 17])]);
      const rt = roda(6.5, 4);
      M.pintar(rt, [0, 2, 0], 3.2, C.amarelo); M.pintar(rt, [0, -2, 0], 3.2, C.amarelo);
      f.parte('Roda traseira', rt, [P([-6, 7.6, 6.5]), P([-6, -7.6, 6.5])]);
      const rd = roda(3.5, 2.5);
      M.pintar(rd, [0, 1.25, 0], 1.8, C.amarelo); M.pintar(rd, [0, -1.25, 0], 1.8, C.amarelo);
      f.parte('Roda dianteira', rd, [P([8, 5, 3.5]), P([8, -5, 3.5])]);
      f.parte('Escapamento', T(7, 0.6, 0.6, { lados: 6, cor: '#333333' }), [P([8, 2.2, 11])]);
      f.passo('Cole o {Capô} e a {Cabine} sobre o {Chassi} e o {Teto} sobre a cabine.');
      f.passo('Cole as {Roda traseira} ao lado da cabine e as {Roda dianteira} ao lado do capô. Cole o {Escapamento} em pé sobre o capô.');
    },
  });

  figura('betoneira', {
    nome: 'Betoneira', grupo: 'Máquinas', medida: ['Altura', 28],
    descricao: 'Betoneira de obra com tambor inclinado, motor, cavalete e rodas.',
    construir(f) {
      const tambor = M.tubo([[0, 3], [4, 7], [10, 7], [15, 3.6]], { lados: 12, cor: '#e86a1a' });
      M.pintar(tambor, [0, 0, 15], 2.6, '#3a3a3a');
      f.parte('Tambor', tambor, [P([-2, 0, 10.5], [['y', 55]])]);
      f.parte('Cavalete', M.placa([[-6, 0], [6, 0], [3, 12], [-3, 12]], 1.2, { plano: 'xz', cor: '#455a64' }), [P([0, 5.6, 0]), P([0, -5.6, 0])]);
      f.parte('Eixo', T(12.4, 0.6, 0.6, { lados: 6, cor: '#455a64' }), [P([0, 6.2, 11], [['x', 90]])]);
      const motor = M.caixa(5, 4, 4, { cor: '#37474f' });
      M.pintarRet(motor, [2.5, 0, 2], 3, 2.4, '#90a4ae');
      f.parte('Motor', motor, [P([-6, 0, 5])]);
      f.parte('Roda', roda(2.8, 1.6), [P([-4, 7.4, 2.8]), P([-4, -7.4, 2.8])]);
      f.parte('Barra de apoio', M.caixa(14, 1.2, 1.2, { cor: '#455a64' }), [P([0, 0, 4.4])]);
      f.passo('Cole os dois {Cavalete} em pé, ligados pela {Barra de apoio} e pelo {Eixo} no alto.');
      f.passo('Cole o {Tambor} inclinado sobre o eixo, o {Motor} sobre a barra e as duas {Roda} atrás.');
    },
  });

  // =========================================================== PERSONAGENS

  figura('trabalhador', {
    nome: 'Trabalhador com EPI', grupo: 'Personagens', medida: ['Altura', 30],
    descricao: 'Personagem de trabalhador com capacete, colete refletivo, luvas e botinas.',
    construir(f) {
      const cab = EZ(5.6, 5.2, 6.4, { lados: 10, aneis: 6, cor: C.pele });
      M.olho(cab, [2.6, 1.0, 0.4], 0.42, '#5a3a22'); M.olho(cab, [2.6, -1.0, 0.4], 0.42, '#5a3a22');
      M.pintar(cab, [2.7, 0, -1.4], 0.9, '#b5544f', 0.25);
      f.parte('Cabeça', cab, [P([0, 0, 25.3])]);
      f.parte('Capacete', M.domo(6.8, 6.4, 3.4, { lados: 10, aneis: 4, cor: C.amarelo }), [P([0, 0, 26.6])]);
      f.parte('Aba do capacete', M.placa([[0, -3.1], [2.4, -2.4], [3, 0], [2.4, 2.4], [0, 3.1]], 0.3, { cor: C.amarelo }), [P([1.4, 0, 26.6])]);
      const tronco = M.tubo([[0, 3.2], [4, 3.6], [9, 3.9]], { lados: 8, achat: 0.65, cor: '#f57c00' });
      for (const z of [2.6, 6.2]) for (const y of [0, 3.6, -3.6]) M.pintarRet(tronco, [y === 0 ? 2.6 : 0, y, z], y === 0 ? 4 : 2.2, 0.8, '#e0e0e0');
      f.parte('Tronco', tronco, [P([0, 0, 13])]);
      f.parte('Pescoço', T(1.4, 1.2, 1.2, { lados: 6, cor: C.pele }), [P([0, 0, 21.9])]);
      f.parte('Braço', T(8.2, 1.15, 0.95, { lados: 6, cor: '#1565c0' }), [P([0, 4.6, 21], [['x', 172]]), P([0, -4.6, 21], [['x', -172]])]);
      f.parte('Luva', EZ(2.2, 2, 2.6, { lados: 6, aneis: 4, cor: '#fbc02d' }), [P([0, 5.6, 12]), P([0, -5.6, 12])]);
      f.parte('Perna', T(10.5, 1.5, 1.3, { lados: 6, cor: '#1565c0' }), [P([0, 1.8, 2.6]), P([0, -1.8, 2.6])]);
      f.parte('Botina', M.domo(4.6, 3, 2.6, { lados: 8, aneis: 4, cor: '#4a3020' }), [P([0.6, 1.8, 0]), P([0.6, -1.8, 0])]);
      f.passo('Cole as {Perna} em pé sobre as {Botina}, o {Tronco} sobre as pernas, o {Pescoço} e a {Cabeça}.');
      f.passo('Cole o {Capacete} na cabeça com a {Aba do capacete} na frente.');
      f.passo('Cole um {Braço} de cada lado do tronco, junto ao ombro, e as {Luva} nas pontas.');
    },
  });

  figura('robo', {
    nome: 'Robô', grupo: 'Personagens', medida: ['Altura', 26],
    descricao: 'Robô de caixas com antena, painel no peito, braços e pernas.',
    construir(f) {
      const cinza = '#9fb3c8';
      const cab = M.caixa(6, 7, 5.5, { cor: cinza });
      M.pintar(cab, [3, 1.6, 3.2], 0.8, '#ffeb3b'); M.pintar(cab, [3, -1.6, 3.2], 0.8, '#ffeb3b');
      M.pintarRet(cab, [3, 0, 1.4], 3.6, 0.6, '#37474f');
      f.parte('Cabeça', cab, [P([0, 0, 20])]);
      f.parte('Antena', T(2.4, 0.25, 0.25, { lados: 4, cor: '#37474f' }), [P([0, 0, 25.5])]);
      f.parte('Ponta da antena', E(1.1, 1.1, 1.1, { lados: 6, aneis: 4, cor: C.vermelho }), [P([0, 0, 28.2])]);
      const corpo = M.caixa(7, 10, 9, { cor: '#5c7a99' });
      M.pintarRet(corpo, [3.5, 0, 5], 5, 4, '#cfd8dc');
      for (const [y, c] of [[-1.4, C.vermelho], [0, C.amarelo], [1.4, '#43a047']]) M.pintar(corpo, [3.5, y, 5.8], 0.5, c);
      f.parte('Corpo', corpo, [P([0, 0, 10.6])]);
      f.parte('Braço', T(7.5, 0.9, 0.9, { lados: 6, cor: cinza }), [P([0, 5.9, 19], [['x', 180]]), P([0, -5.9, 19], [['x', 180]])]);
      f.parte('Mão', M.caixa(1.8, 1.8, 1.6, { cor: '#37474f' }), [P([0, 5.9, 9.9]), P([0, -5.9, 9.9])]);
      f.parte('Perna', M.caixa(2.6, 2.6, 9, { cor: cinza }), [P([0, 2.6, 1.6]), P([0, -2.6, 1.6])]);
      f.parte('Pé', M.caixa(4.4, 3.2, 1.6, { cor: '#37474f' }), [P([0.6, 2.6, 0]), P([0.6, -2.6, 0])]);
      f.passo('Cole as {Perna} sobre os {Pé}, o {Corpo} sobre as pernas e a {Cabeça} por cima.');
      f.passo('Cole a {Antena} com a {Ponta da antena} no alto da cabeça e um {Braço} de cada lado com a {Mão} na ponta.');
    },
  });
});
