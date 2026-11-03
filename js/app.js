/* Gerador de Moldes — tela, prévia em SVG, impressão e PDF. */
(function () {
  'use strict';
  const G = window.Geometria, P = window.Paginacao;
  const $ = (id) => document.getElementById(id);
  const CHAVE = 'gerador-moldes:v1';

  const estado = {
    modelo: 'tatu',
    valores: {},          // valores por modelo: { tatu: {comp: '40', ...} }
    material: 'cartao',
    espessura: '0,35',
    aba: '',
    papel: 'A4',
    colorido: true,
    resultado: null,
    folhas: [],
  };

  // ------------------------------------------------------------ preferências
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (salvo && G.MODELOS[salvo.modelo]) Object.assign(estado, salvo, { resultado: null, folhas: [] });
  } catch (e) { /* sem armazenamento: segue com o padrão */ }
  function salvar() {
    try {
      const { modelo, valores, material, espessura, aba, papel, colorido } = estado;
      localStorage.setItem(CHAVE, JSON.stringify({ modelo, valores, material, espessura, aba, papel, colorido }));
    } catch (e) { /* ignora */ }
  }

  const num = (s) => parseFloat(String(s == null ? '' : s).replace(',', '.'));
  const br = (n, casas) => Number(n).toFixed(casas).replace('.', ',');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- formulário
  function montarSeletores() {
    const grupos = {};
    for (const [id, m] of Object.entries(G.MODELOS)) (grupos[m.grupo] = grupos[m.grupo] || []).push([id, m.nome]);
    $('modelo').innerHTML = Object.entries(grupos).map(([g, itens]) =>
      `<optgroup label="${esc(g)}">${itens.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('')}</optgroup>`).join('');
    $('material').innerHTML = G.MATERIAIS.map((m) =>
      `<option value="${m.id}">${esc(m.nome)}${m.t != null ? ' — ' + br(m.t, m.t < 1 ? 2 : 1).replace(/,?0+$/, '') + ' mm' : ''}</option>`).join('');
    $('papel').innerHTML = Object.entries(P.PAPEIS).map(([id, p]) =>
      `<option value="${id}">${p.nome} (${br(p.w / 10, 1)} × ${br(p.h / 10, 1)} cm)</option>`).join('');
    $('modelo').value = estado.modelo;
    $('material').value = estado.material;
    $('espessura').value = estado.espessura;
    $('aba').value = estado.aba;
    $('papel').value = estado.papel;
    $('colorido').checked = !!estado.colorido;
  }

  function montarCampos() {
    const m = G.MODELOS[estado.modelo];
    const vals = estado.valores[estado.modelo] = estado.valores[estado.modelo] || {};
    $('descricao').textContent = m.descricao;
    $('campos').innerHTML = m.campos.map((c) => {
      const idc = 'campo-' + estado.modelo + '-' + c.id;
      const v = vals[c.id] != null ? vals[c.id] : (c.padrao === '' ? '' : String(c.padrao).replace('.', ','));
      if (c.tipo === 'busca') {
        return `<div class="campo busca"><label for="termo-busca">${esc(c.rotulo)}</label>
          <div class="linha-busca"><div class="entrada"><input id="termo-busca" type="search" autocomplete="off" placeholder="ex.: capacete, cavalo, crânio" value="${esc(estado.termoBusca || '')}"></div>
          <button type="button" id="btn-buscar">Buscar</button></div>
          <span class="dica">Busca gratuita em modelos .stl de licença livre (Wikimedia). Precisa de internet.</span>
          <div id="resultados-busca" class="resultados" aria-live="polite"></div>
          <div id="links-busca" class="links-busca"></div></div>`;
      }
      if (c.tipo === 'arquivo') {
        const nome = window.Importar && window.Importar.estado.nome;
        return `<div class="campo"><span class="rotulo-campo">${esc(c.rotulo)}</span><input type="file" id="${idc}" class="oculto" data-arquivo="1" accept=".stl,.obj,.glb"><label class="botao-arquivo" for="${idc}">Escolher arquivo .stl, .obj ou .glb</label><span class="dica" id="info-arquivo">${nome ? 'Carregado: ' + esc(nome) : 'Nenhum arquivo escolhido.'}</span></div>`;
      }
      if (c.tipo === 'opcoes') {
        return `<div class="campo"><label for="${idc}">${esc(c.rotulo)}</label><div class="entrada"><select id="${idc}" data-campo="${c.id}">${
          c.opcoes.map(([k, n]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div></div>`;
      }
      return `<div class="campo"><label for="${idc}">${esc(c.rotulo)}</label><div class="entrada"><input id="${idc}" data-campo="${c.id}" inputmode="decimal" autocomplete="off" value="${esc(v)}"${c.auto ? ' placeholder="automático"' : ''}>${c.un ? `<span class="un">${esc(c.un)}</span>` : ''}</div>${c.auto ? '<span class="dica">Deixe em branco para usar a proporção do modelo.</span>' : ''}</div>`;
    }).join('');
  }

  function lerCampos() {
    const vals = estado.valores[estado.modelo] = estado.valores[estado.modelo] || {};
    for (const el of $('campos').querySelectorAll('[data-campo]')) vals[el.dataset.campo] = el.value;
    if (estado.modelo === 'importar') { vals.arquivo = undefined; vals.busca = undefined; }
    return vals;
  }

  // ------------------------------------------------------------------ cálculo
  let temporizador = null;
  function agendar() {
    document.body.classList.add('atualizando');
    clearTimeout(temporizador);
    temporizador = setTimeout(atualizar, 180);
  }

  function atualizar() {
    document.body.classList.remove('atualizando');
    const vals = lerCampos();
    estado.espessura = $('espessura').value;
    estado.aba = $('aba').value;
    estado.papel = $('papel').value;
    salvar();
    const t = num(estado.espessura);
    const abaMm = num(estado.aba);
    $('aba').placeholder = 'auto: ' + br(G.abaPadrao(isFinite(t) ? t : 0), 0);
    try {
      if (!isFinite(t) || t < 0) throw new Error('Informe a espessura do material em milímetros.');
      const papel = P.PAPEIS[estado.papel];
      const r = G.gerar(estado.modelo, vals, t, isFinite(abaMm) ? abaMm : 0, P.areaUtil(papel));
      estado.resultado = r;
      estado.folhas = P.paginar(r.pecas, papel);
      renderizar(papel);
      $('btn-pdf').disabled = false;
      $('btn-imprimir').disabled = false;
    } catch (e) {
      estado.resultado = null;
      estado.folhas = [];
      $('avisos').innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`;
      $('resumo').innerHTML = '';
      $('verificacoes').innerHTML = '';
      $('folhas').innerHTML = '';
      $('btn-pdf').disabled = true;
      $('btn-imprimir').disabled = true;
    }
  }

  function infoFolha(i) {
    const m = G.MODELOS[estado.modelo];
    const mat = G.MATERIAIS.find((x) => x.id === estado.material);
    const t = num(estado.espessura);
    const vals = estado.valores[estado.modelo] || {};
    const medidas = m.campos.filter((c) => c.un === 'cm' && vals[c.id] !== '' && vals[c.id] != null)
      .map((c) => `${c.rotulo.toLowerCase()} ${String(vals[c.id]).replace('.', ',')} cm`).join(', ');
    return {
      titulo: `${m.nome}${medidas ? ' — ' + medidas : ''}`,
      numero: i + 1,
      total: estado.folhas.length,
      colorido: !!estado.colorido && !!(estado.resultado && estado.resultado.cena),
      rodape: `Material: ${mat && mat.t != null ? mat.nome : 'espessura informada'} (${br(t, t < 1 ? 2 : 1)} mm). Imprima em tamanho real (100%), sem ajustar à página.` + (estado.modelo === 'importar' && window.Importar && window.Importar.estado.credito ? ` Modelo: ${window.Importar.estado.credito}`.slice(0, 140) : ''),
    };
  }

  // ---------------------------------------------------------------- desenho SVG
  const ESTILOS = {
    corte: 'fill="none" stroke="#111" stroke-width="0.3" stroke-linejoin="round"',
    dobra: 'fill="none" stroke="#d0342c" stroke-width="0.25" stroke-dasharray="2 1.2"',
    aba: 'fill="#d4d4d4" stroke="none"',
    encaixe: 'fill="#f1f1f1" stroke="none"',
    marca: 'fill="none" stroke="#8a8a8a" stroke-width="0.2" stroke-dasharray="0.8 0.8"',
    emenda: 'fill="#000" fill-opacity="0.08" stroke="none"',
    moldura: 'fill="none" stroke="#9a9a9a" stroke-width="0.2" stroke-dasharray="3 2"',
    regua: 'fill="none" stroke="#111" stroke-width="0.25"',
    fundoNumero: 'fill="#ffffff" fill-opacity="0.85" stroke="none"',
  };
  let contClip = 0;
  let previa = null;
  function svgDaFolha(ops, papel) {
    const partes = [];
    const pt = (p) => p[0].toFixed(2) + ',' + p[1].toFixed(2);
    for (const op of ops) {
      if (op.t === 'poli') {
        const tag = op.fechado ? 'polygon' : 'polyline';
        const estilo = op.estilo === 'face' ? `fill="${op.cor}" stroke="${op.cor}" stroke-width="0.12"` : (ESTILOS[op.estilo] || ESTILOS.corte);
        partes.push(`<${tag} points="${op.pts.map(pt).join(' ')}" ${estilo}/>`);
      } else if (op.t === 'texto') {
        const anc = op.ancora === 'inicio' ? 'start' : op.ancora === 'fim' ? 'end' : 'middle';
        const cor = op.cor === 'marca' ? '#6f6f6f' : op.cor === 'numero' ? '#2d3a8c' : '#151515';
        const giro = op.giro ? ` transform="rotate(${op.giro} ${op.x.toFixed(2)} ${op.y.toFixed(2)})"` : '';
        partes.push(`<text x="${op.x.toFixed(2)}" y="${op.y.toFixed(2)}"${giro} font-size="${(op.tam * 1.15).toFixed(2)}" text-anchor="${anc}" dominant-baseline="middle" fill="${cor}" font-family="Arial, Helvetica, sans-serif"${op.negrito ? ' font-weight="700"' : ''}>${esc(op.txt)}</text>`);
      } else if (op.t === 'recorte') {
        const id = 'rc' + (++contClip);
        partes.push(`<clipPath id="${id}"><rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}"/></clipPath><g clip-path="url(#${id})">`);
      } else if (op.t === 'fimRecorte') {
        partes.push('</g>');
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${papel.w} ${papel.h}" width="${papel.w}mm" height="${papel.h}mm"><rect width="${papel.w}" height="${papel.h}" fill="#fff"/>${partes.join('')}</svg>`;
  }

  function renderizar(papel) {
    const r = estado.resultado;
    const totalPecas = r.pecas.reduce((s, p) => s + p.qtd, 0);
    $('resumo').innerHTML = `<span><b>${totalPecas}</b> peças</span><span><b>${estado.folhas.length}</b> folha${estado.folhas.length > 1 ? 's' : ''} ${papel.nome}</span><span>abas de <b>${br(r.ctx.aba, 0)}</b> mm</span>`;
    $('avisos').innerHTML = r.avisos.map((a) => `<div class="aviso">${esc(a)}</div>`).join('');
    $('verificacoes').innerHTML = r.verificacoes.map((v) =>
      `<li><span class="sinal${v.ok ? '' : ' nao'}" aria-label="${v.ok ? 'confere' : 'não confere'}">${v.ok ? '✓' : '✗'}</span><span>${esc(v.texto)}</span></li>`).join('');

    if (r.cena && window.Previa3D) {
      $('bloco-previa').hidden = false;
      previa = previa || new window.Previa3D($('previa'));
      previa.mostrar(r.cena);
    } else $('bloco-previa').hidden = true;
    $('linha-colorido').hidden = !r.cena;
    const svgs = estado.folhas.map((f, i) => svgDaFolha(P.desenharFolha(f, papel, infoFolha(i)), papel));
    $('folhas').innerHTML = svgs.map((s, i) => `<div class="folha-env">${s}<span>Folha ${i + 1} de ${svgs.length}</span></div>`).join('');
    $('impressao').innerHTML = svgs.join('');
    let estiloPagina = document.getElementById('estilo-pagina');
    if (!estiloPagina) { estiloPagina = document.createElement('style'); estiloPagina.id = 'estilo-pagina'; document.head.appendChild(estiloPagina); }
    estiloPagina.textContent = `@page { size: ${papel.w}mm ${papel.h}mm; margin: 0; }`;

    $('tabela-pecas').innerHTML = r.pecas.map((p) =>
      `<tr><td><b>${esc(p.codigo)}</b></td><td>${esc(p.nome)}</td><td class="num">${p.qtd}</td><td class="num">${esc(p.medidas)}</td></tr>`).join('');
    $('passos').innerHTML = r.passos.map((p) => `<li>${esc(p)}</li>`).join('');
    $('dicas').innerHTML = dicasMaterial(num(estado.espessura), estado.material).map((d) => `<li>${esc(d)}</li>`).join('');
  }

  function dicasMaterial(t, material) {
    const d = [
      'Antes de cortar, meça a régua de 5 cm no rodapé da folha. Se não medir 5 cm, a impressão saiu fora de escala.',
    ];
    if (material === 'eva2' || material === 'eva5') {
      d.push('EVA não marca dobra com vinco. Faça um corte raso, de cerca de 1/3 da espessura, sobre as linhas tracejadas, pelo lado de fora da dobra.');
      d.push('Use cola de contato ou cola quente. Cola branca escolar não segura EVA.');
      d.push('Para transferir o molde, recorte o papel impresso e contorne com caneta sobre o EVA.');
    } else if (t >= 2.5) {
      d.push('Papelão ondulado: vinque as dobras com régua e uma ponta romba (cabo de colher ou caneta sem tinta) antes de dobrar.');
      d.push('Peças que precisam curvar, como faixas e cones, curvam melhor quando as ondas do papelão ficam atravessadas ao sentido da curva.');
      d.push('Corte com estilete e régua de metal, em várias passadas leves, sobre uma base de corte.');
      d.push('Prefira cola quente ou cola branca extra forte. As abas foram aumentadas para o material grosso.');
    } else if (t >= 1) {
      d.push('Papelão cinza: vinque bem as dobras com régua antes de dobrar. Corte com estilete em várias passadas.');
    } else {
      d.push('Papel: vinque as linhas tracejadas com régua e uma caneta sem tinta. A dobra fica reta e o modelo fecha certinho.');
      d.push('Cola branca ou cola em bastão funcionam bem. Segure cada emenda alguns segundos até firmar.');
    }
    d.push('Use estilete com cuidado: corte sempre afastando a lâmina do corpo e da mão de apoio, e guarde a lâmina recolhida.');
    return d;
  }

  // ----------------------------------------------------------------------- PDF
  function gerarPdf() {
    const jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) throw new Error('O gerador de PDF não carregou. Verifique a internet e recarregue a página.');
    const papel = P.PAPEIS[estado.papel];
    const doc = new jsPDF({ unit: 'mm', format: [papel.w, papel.h], orientation: 'portrait', compress: true });
    const MM_PT = 72 / 25.4;
    estado.folhas.forEach((f, i) => {
      if (i > 0) doc.addPage([papel.w, papel.h], 'portrait');
      const ops = P.desenharFolha(f, papel, infoFolha(i));
      for (const op of ops) {
        if (op.t === 'poli') desenharPoli(doc, op);
        else if (op.t === 'texto') {
          doc.setFont('helvetica', op.negrito ? 'bold' : 'normal');
          doc.setFontSize(op.tam * 1.15 * MM_PT);
          if (op.cor === 'numero') doc.setTextColor(45, 58, 140); else doc.setTextColor(op.cor === 'marca' ? 110 : 20);
          if (op.giro) {
            // texto girado 90° (sentido horário): posição calculada aqui, pois o alinhamento do jsPDF ignora o giro
            const larg = doc.getTextWidth(op.txt);
            const desce = 0.35 * op.tam * 1.15;
            doc.text(op.txt, op.x - desce, op.y - larg / 2, { angle: -90 });
          } else {
            doc.text(op.txt, op.x, op.y, { align: op.ancora === 'inicio' ? 'left' : op.ancora === 'fim' ? 'right' : 'center', baseline: 'middle' });
          }
        } else if (op.t === 'recorte') {
          doc.saveGraphicsState();
          doc.rect(op.x, op.y, op.w, op.h, null);
          doc.clip();
          doc.discardPath();
        } else if (op.t === 'fimRecorte') doc.restoreGraphicsState();
      }
    });
    return doc;
  }

  function desenharPoli(doc, op) {
    const pts = op.pts;
    if (pts.length < 2) return;
    const deltas = [];
    for (let i = 1; i < pts.length; i++) deltas.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
    doc.setLineDashPattern([], 0);
    let estilo = 'S';
    switch (op.estilo) {
      case 'aba': doc.setFillColor(212, 212, 212); estilo = 'F'; break;
      case 'encaixe': doc.setFillColor(241, 241, 241); estilo = 'F'; break;
      case 'emenda': doc.setFillColor(235, 235, 235); estilo = 'F'; break;
      case 'fundoNumero': doc.setFillColor(255, 255, 255); estilo = 'F'; break;
      case 'face': { const n = parseInt(op.cor.slice(1), 16); doc.setFillColor((n >> 16) & 255, (n >> 8) & 255, n & 255); doc.setDrawColor((n >> 16) & 255, (n >> 8) & 255, n & 255); doc.setLineWidth(0.12); estilo = 'FD'; break; }
      case 'dobra': doc.setDrawColor(208, 52, 44); doc.setLineWidth(0.25); doc.setLineDashPattern([2, 1.2], 0); break;
      case 'marca': doc.setDrawColor(138, 138, 138); doc.setLineWidth(0.2); doc.setLineDashPattern([0.8, 0.8], 0); break;
      case 'moldura': doc.setDrawColor(154, 154, 154); doc.setLineWidth(0.2); doc.setLineDashPattern([3, 2], 0); break;
      case 'regua': doc.setDrawColor(17, 17, 17); doc.setLineWidth(0.25); break;
      default: doc.setDrawColor(17, 17, 17); doc.setLineWidth(0.3);
    }
    doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], estilo, !!op.fechado);
    doc.setLineDashPattern([], 0);
  }

  function nomeArquivo() {
    const m = G.MODELOS[estado.modelo];
    const base = m.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `molde-${base}-${estado.papel.toLowerCase()}.pdf`;
  }

  const dentroDeMoldura = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  let downloads = null;
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('downloads').then((d) => { downloads = d; }).catch(() => {});
  }

  async function baixarPdf() {
    const btn = $('btn-pdf');
    btn.disabled = true;
    $('mensagem').textContent = 'Gerando o PDF…';
    try {
      const doc = gerarPdf();
      const nome = nomeArquivo();
      if (downloads) {
        try {
          await downloads.save({ filename: nome, data: doc.output('blob') });
          $('mensagem').textContent = 'PDF salvo. Imprima em tamanho real (100%).';
        } catch (e) {
          $('mensagem').textContent = e && e.code === 'declined' ? 'Download cancelado.' : 'Não foi possível salvar o PDF nesta tela.';
        }
      } else {
        doc.save(nome);
        $('mensagem').textContent = 'PDF gerado. Imprima em tamanho real (100%), sem ajustar à página.';
      }
    } catch (e) {
      $('mensagem').textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  }

  // -------------------------------------------------------------------- eventos
  montarSeletores();
  montarCampos();
  if (dentroDeMoldura) $('btn-imprimir').hidden = true; // a impressão direta não funciona dentro de quadros

  $('modelo').addEventListener('change', () => { estado.modelo = $('modelo').value; montarCampos(); atualizar(); });
  $('campos').addEventListener('change', (e) => {
    if (!e.target.dataset.arquivo) return;
    const arq = e.target.files && e.target.files[0];
    if (!arq) return;
    $('info-arquivo').textContent = 'Lendo ' + arq.name + '…';
    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        const info = window.Importar.definir(arq.name, leitor.result);
        window.Importar.estado.credito = '';
        $('info-arquivo').textContent = `Carregado: ${arq.name} (${info.faces} faces).`;
        atualizar();
      } catch (err) { $('info-arquivo').textContent = err.message; }
    };
    leitor.onerror = () => { $('info-arquivo').textContent = 'Não foi possível ler o arquivo.'; };
    leitor.readAsArrayBuffer(arq);
  });
  $('campos').addEventListener('input', (e) => { if (!e.target.dataset.arquivo && e.target.id !== 'termo-busca') agendar(); });

  // ------------------------------------------------------------- busca 3D
  async function fazerBusca() {
    const termo = ($('termo-busca').value || '').trim();
    if (!termo) { $('termo-busca').focus(); return; }
    estado.termoBusca = termo;
    const caixa = $('resultados-busca');
    $('links-busca').innerHTML = `<span class="dica">Mais opções, para baixar e depois escolher o arquivo acima:</span>` +
      window.Buscar.linksExternos(termo).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.nome)} <small>${esc(l.formato)}</small></a>`).join('');
    if (!navigator.onLine) { caixa.innerHTML = '<div class="aviso">Sem internet agora. A busca precisa de conexão; os moldes prontos continuam funcionando.</div>'; return; }
    caixa.innerHTML = '<span class="dica">Buscando…</span>';
    try {
      const r = await window.Buscar.buscar(termo);
      if (!r.resultados.length) {
        caixa.innerHTML = `<div class="aviso">Nenhum modelo livre encontrado para "${esc(termo)}"${r.termoUsado && r.termoUsado !== termo.toLowerCase() ? ` (busquei também "${esc(r.termoUsado)}")` : ''}. Tente outra palavra ou use os sites abaixo.</div>`;
        return;
      }
      ultimosResultados = r.resultados;
      caixa.innerHTML = r.resultados.map((m, i) => `<button type="button" class="resultado" data-i="${i}">
          ${m.miniatura ? `<img src="${esc(m.miniatura)}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;sem-imagem&quot;>3D</span>'">` : '<span class="sem-imagem">3D</span>'}
          <span class="r-titulo">${esc(m.titulo)}</span>
          <span class="r-info">${esc(m.licenca)}${m.tamanho ? ' · ' + (m.tamanho < 1048576 ? Math.max(1, Math.round(m.tamanho / 1024)) + ' KB' : (m.tamanho / 1048576).toFixed(1).replace('.', ',') + ' MB') : ''}</span></button>`).join('');
    } catch (err) {
      caixa.innerHTML = '<div class="aviso">Não foi possível buscar agora. Confira a internet e tente de novo, ou use os sites abaixo.</div>';
    }
  }
  let ultimosResultados = [];
  async function usarResultado(i) {
    const m = ultimosResultados[i];
    if (!m) return;
    if (m.tamanho > 40 * 1048576) { $('info-arquivo').textContent = 'Arquivo muito grande para o celular (mais de 40 MB). Escolha outro.'; return; }
    $('info-arquivo').textContent = `Baixando "${m.titulo}"…`;
    try {
      const resp = await fetch(m.url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const info = window.Importar.definir(m.arquivo, await resp.arrayBuffer());
      window.Importar.estado.credito = `${m.titulo} — ${m.autor ? m.autor + ', ' : ''}${m.licenca}, Wikimedia Commons`;
      $('info-arquivo').textContent = `Carregado: ${m.titulo} (${info.faces} faces). Licença: ${m.licenca}${m.autor ? ', autor: ' + m.autor : ''}.`;
      atualizar();
      $('info-arquivo').scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (err) {
      $('info-arquivo').textContent = 'Não foi possível baixar este modelo. Tente outro.';
    }
  }
  $('campos').addEventListener('click', (e) => {
    if (e.target.id === 'btn-buscar') fazerBusca();
    const r = e.target.closest && e.target.closest('.resultado');
    if (r) usarResultado(+r.dataset.i);
  });
  $('campos').addEventListener('keydown', (e) => { if (e.target.id === 'termo-busca' && e.key === 'Enter') { e.preventDefault(); fazerBusca(); } });
  $('campos').addEventListener('change', (e) => { if (!e.target.dataset.arquivo) agendar(); });
  $('material').addEventListener('change', () => {
    estado.material = $('material').value;
    const m = G.MATERIAIS.find((x) => x.id === estado.material);
    if (m && m.t != null) $('espessura').value = br(m.t, m.t < 1 ? 2 : 1).replace(/,?0+$/, '');
    else $('espessura').focus();
    atualizar();
  });
  $('espessura').addEventListener('input', () => {
    const t = num($('espessura').value);
    const m = G.MATERIAIS.find((x) => x.t != null && Math.abs(x.t - t) < 1e-9 && x.id === estado.material);
    if (!m) { estado.material = 'outro'; $('material').value = 'outro'; }
    agendar();
  });
  $('aba').addEventListener('input', agendar);
  $('papel').addEventListener('change', atualizar);
  $('colorido').addEventListener('change', () => { estado.colorido = $('colorido').checked; atualizar(); });
  $('btn-pdf').addEventListener('click', baixarPdf);
  $('btn-imprimir').addEventListener('click', () => window.print());

  for (const [botao, painel] of [['aba-folhas', 'painel-folhas'], ['aba-montagem', 'painel-montagem']]) {
    $(botao).addEventListener('click', () => {
      for (const [b, p] of [['aba-folhas', 'painel-folhas'], ['aba-montagem', 'painel-montagem']]) {
        $(b).setAttribute('aria-selected', String(b === botao));
        $(p).hidden = p !== painel;
      }
    });
  }

  atualizar();

  // Funciona sem internet quando aberto pelo endereço do site (http/https)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !dentroDeMoldura) {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
  }
})();
