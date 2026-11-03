/*
 * Gerador de Moldes — busca de modelos 3D na internet.
 *
 * Busca arquivos .stl de licença livre no acervo da Wikimedia Commons (sem
 * cadastro, com permissão de acesso direto pelo navegador) e monta links de
 * busca para Printables, Thingiverse e Sketchfab, onde o usuário baixa o
 * arquivo e importa no aplicativo.
 */
(function (raiz, fabrica) {
  const B = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = B;
  else raiz.Buscar = B;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Termos em português → inglês (o acervo é descrito quase todo em inglês). */
  const DICIONARIO = {
    // animais
    tatu: 'armadillo', arara: 'macaw', papagaio: 'parrot', pombo: 'pigeon', passaro: 'bird', ave: 'bird', jabuti: 'tortoise',
    tartaruga: 'turtle', cobra: 'snake', serpente: 'snake', coelho: 'rabbit', aranha: 'spider', joaninha: 'ladybug', abelha: 'bee',
    libelula: 'dragonfly', marimbondo: 'wasp', vespa: 'wasp', formiga: 'ant', borboleta: 'butterfly', onca: 'jaguar', leao: 'lion',
    tigre: 'tiger', gato: 'cat', cachorro: 'dog', cao: 'dog', raposa: 'fox', lobo: 'wolf', anta: 'tapir', girafa: 'giraffe',
    elefante: 'elephant', cavalo: 'horse', vaca: 'cow', boi: 'ox', porco: 'pig', ovelha: 'sheep', cabra: 'goat', galinha: 'chicken',
    pato: 'duck', peixe: 'fish', tubarao: 'shark', baleia: 'whale', golfinho: 'dolphin', urso: 'bear', macaco: 'monkey',
    sapo: 'frog', jacare: 'alligator', crocodilo: 'crocodile', dinossauro: 'dinosaur', coruja: 'owl', aguia: 'eagle',
    pinguim: 'penguin', camelo: 'camel', zebra: 'zebra', rinoceronte: 'rhinoceros', hipopotamo: 'hippopotamus', esquilo: 'squirrel',
    rato: 'mouse', morcego: 'bat', polvo: 'octopus', caranguejo: 'crab', caracol: 'snail', besouro: 'beetle', escorpiao: 'scorpion',
    // corpo humano
    cabeca: 'head', cranio: 'skull', caveira: 'skull', rosto: 'face', nariz: 'nose', olho: 'eye', olhos: 'eye', orelha: 'ear',
    ouvido: 'ear', boca: 'mouth', dente: 'tooth', dentes: 'teeth', braco: 'arm', antebraco: 'forearm', punho: 'wrist', mao: 'hand',
    dedo: 'finger', perna: 'leg', coxa: 'thigh', joelho: 'knee', pe: 'foot', coracao: 'heart', cerebro: 'brain', pulmao: 'lung',
    coluna: 'spine', vertebra: 'vertebra', osso: 'bone', esqueleto: 'skeleton', corpo: 'body', anatomia: 'anatomy',
    // veículos e máquinas
    carro: 'car', caminhao: 'truck', onibus: 'bus', moto: 'motorcycle', motocicleta: 'motorcycle', bicicleta: 'bicycle',
    aviao: 'airplane', helicoptero: 'helicopter', barco: 'boat', navio: 'ship', trem: 'train', foguete: 'rocket',
    empilhadeira: 'forklift', trator: 'tractor', escavadeira: 'excavator', guindaste: 'crane', betoneira: 'concrete mixer',
    maquina: 'machine', motor: 'engine', engrenagem: 'gear', robo: 'robot', drone: 'drone', compressor: 'compressor',
    // EPI, EPC e segurança
    capacete: 'helmet', luva: 'glove', bota: 'boot', botina: 'boot', oculos: 'goggles', mascara: 'mask', respirador: 'respirator',
    protetor: 'ear protection', abafador: 'earmuffs', cinto: 'harness', extintor: 'fire extinguisher', hidrante: 'fire hydrant',
    cone: 'traffic cone', placa: 'sign', escada: 'ladder', andaime: 'scaffold', mangueira: 'hose', valvula: 'valve',
    // instalações e objetos
    casa: 'house', predio: 'building', galpao: 'warehouse', fabrica: 'factory', igreja: 'church', castelo: 'castle', ponte: 'bridge',
    torre: 'tower', tanque: 'tank', caixa: 'box', vaso: 'vase', copo: 'cup', garrafa: 'bottle', cadeira: 'chair', mesa: 'table',
    lampada: 'lamp', estatua: 'statue', busto: 'bust', personagem: 'character', boneco: 'figure', arvore: 'tree', flor: 'flower',
    planeta: 'planet', terra: 'earth', lua: 'moon', globo: 'globe', chave: 'key', ferramenta: 'tool', martelo: 'hammer',
  };

  const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /** Traduz palavra a palavra o que estiver no dicionário; mantém o resto. */
  function traduzir(termo) {
    const palavras = semAcento(termo).split(/[^a-z0-9]+/).filter(Boolean)
      .filter((p) => !['de', 'da', 'do', 'das', 'dos', 'e', 'para', 'com', 'um', 'uma', 'o', 'a'].includes(p));
    return palavras.map((p) => DICIONARIO[p] || p).join(' ').trim();
  }

  const API = 'https://commons.wikimedia.org/w/api.php';

  function urlBusca(texto, limite, semFiltro) {
    const q = new URLSearchParams({
      action: 'query', format: 'json', origin: '*', generator: 'search',
      gsrsearch: semFiltro ? texto + ' stl' : 'filemime:application/sla ' + texto, gsrnamespace: '6', gsrlimit: String(limite || 24),
      prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '240',
      iiextmetadatafilter: 'LicenseShortName|Artist|ObjectName',
    });
    return API + '?' + q.toString();
  }

  const limparHtml = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

  function lerResposta(json) {
    const paginas = (json && json.query && json.query.pages) ? Object.values(json.query.pages) : [];
    paginas.sort((a, b) => (a.index || 0) - (b.index || 0));
    return paginas.map((p) => {
      const ii = (p.imageinfo || [])[0] || {};
      const meta = ii.extmetadata || {};
      const arquivo = String(p.title || '').replace(/^(File|Arquivo):/i, '');
      return {
        titulo: limparHtml((meta.ObjectName && meta.ObjectName.value) || arquivo.replace(/\.stl$/i, '').replace(/_/g, ' ')),
        arquivo,
        miniatura: ii.thumburl || '',
        url: ii.url || '',
        pagina: ii.descriptionurl || ('https://commons.wikimedia.org/wiki/' + encodeURIComponent(String(p.title || ''))),
        tamanho: ii.size || 0,
        licenca: limparHtml(meta.LicenseShortName && meta.LicenseShortName.value) || 'licença livre',
        autor: limparHtml(meta.Artist && meta.Artist.value).slice(0, 80),
      };
    }).filter((r) => r.url && /\.stl$/i.test(r.arquivo));
  }

  /**
   * Busca modelos .stl. Tenta primeiro a tradução em inglês e, se vier pouco,
   * também o termo original. `buscarFn` permite trocar o fetch nos testes.
   */
  async function buscar(termo, buscarFn) {
    const f = buscarFn || ((u) => fetch(u).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }));
    const en = traduzir(termo);
    const original = semAcento(termo).trim();
    const vistos = new Set();
    const saida = [];
    for (const t of [en, original]) {
      if (!t || (saida.length >= 12 && t === original)) continue;
      const lista = lerResposta(await f(urlBusca(t, 24)));
      for (const r of lista) if (!vistos.has(r.url)) { vistos.add(r.url); saida.push(r); }
      if (en === original) break;
    }
    if (!saida.length && en) {
      // reserva: busca comum e fica só com os arquivos .stl
      for (const r of lerResposta(await f(urlBusca(en, 40, true)))) if (!vistos.has(r.url)) { vistos.add(r.url); saida.push(r); }
    }
    return { termoUsado: en, resultados: saida };
  }

  /** Buscas prontas nos sites onde o usuário baixa e depois importa. */
  function linksExternos(termo) {
    const q = encodeURIComponent(traduzir(termo) || termo);
    return [
      { nome: 'Printables', url: `https://www.printables.com/search/models?q=${q}`, formato: '.stl' },
      { nome: 'Thingiverse', url: `https://www.thingiverse.com/search?q=${q}&type=things`, formato: '.stl' },
      { nome: 'Sketchfab', url: `https://sketchfab.com/search?q=${q}&type=models&features=downloadable`, formato: '.glb' },
    ];
  }

  return { DICIONARIO, traduzir, urlBusca, lerResposta, buscar, linksExternos };
});
