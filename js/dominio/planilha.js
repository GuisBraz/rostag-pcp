/* ---------------------------------------------------------------------------
   Planilha de controle de avanço → OPs. Puro cálculo, sem DOM.

   Entrada: as linhas da aba como matriz de textos (o SheetJS lê .xls, .xlsx e
   .csv). O cabeçalho é achado pelos nomes das colunas, não pela posição:
   DESENHO, POSIÇÃO, REV., DESCRIÇÃO DO ITEM, QTE TOTAL, PESO UNIT (KG),
   PESO TOTAL (KG), N° OP CALD e N° OP USINAGEM.
   Cada linha com nº de OP de caldeiraria vira uma OP de caldeiraria; com nº de
   OP de usinagem, uma de usinagem. Uma peça (desenho + posição) tem no máximo
   uma OP por área.
--------------------------------------------------------------------------- */

const LIMITE_LINHAS_CABECALHO = 40;

function chave(txt) {
  return String(txt == null ? '' : txt).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function texto(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

// Número escrito em português ("1.234,5") ou inglês ("1234.5"). Vazio = null.
export function numero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = texto(v).replace(/\s|kg/gi, '');
  if (!s || s === '-') return null;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const COLUNAS = {
  desenho: function (k) { return k === 'DESENHO' || k === 'NDESENHO' || k === 'NODESENHO'; },
  posicao: function (k) { return k.indexOf('POSICAO') === 0 || k === 'POS'; },
  rev: function (k) { return k === 'REV' || k === 'REVISAO'; },
  descricao: function (k) { return k.indexOf('DESCRICAO') === 0; },
  qtd: function (k) { return k.indexOf('QTE') === 0 || k.indexOf('QTD') === 0 || k.indexOf('QUANT') === 0; },
  pesoUnit: function (k) { return k.indexOf('PESOUNIT') === 0; },
  pesoTotal: function (k) { return k.indexOf('PESOTOTAL') === 0; },
  opCald: function (k) { return k.indexOf('OPCALD') >= 0; },
  opUsin: function (k) { return k.indexOf('OPUSIN') >= 0; }
};

// Acha a linha do cabeçalho e a coluna de cada campo.
export function acharCabecalho(linhas) {
  for (let i = 0; i < Math.min(linhas.length, LIMITE_LINHAS_CABECALHO); i++) {
    const cols = {};
    (linhas[i] || []).forEach(function (cel, j) {
      const k = chave(cel);
      if (!k) return;
      Object.keys(COLUNAS).forEach(function (campo) { if (cols[campo] == null && COLUNAS[campo](k)) cols[campo] = j; });
    });
    if (cols.desenho != null && (cols.opCald != null || cols.opUsin != null)) return { linha: i, cols: cols };
  }
  return null;
}

// Id do documento: uma OP por projeto + área + peça.
export function idOp(projetoId, area, desenho, posicao) {
  const slug = function (s) { return String(s || '0').replace(/[^A-Za-z0-9-]+/g, '_').slice(0, 60) || '0'; };
  return projetoId + '__' + area + '__' + slug(desenho) + '__' + slug(posicao);
}

/**
 * Lê as linhas e devolve { ops, ignoradas, erros, avisos }.
 *  ops: [{ area, numero, desenho, posicao, rev, descricao, qtd, pesoUnit, pesoTotal, linha }]
 *  ignoradas: linhas sem nº de OP (ex.: a linha do conjunto)
 *  erros: linhas recusadas (OP sem desenho, peça repetida na mesma área)
 */
export function lerOps(linhas) {
  const cab = acharCabecalho(linhas || []);
  if (!cab) return { ok: false, motivo: 'semCabecalho', ops: [], ignoradas: 0, erros: [], avisos: [] };
  const c = cab.cols;
  const ops = [], erros = [], avisos = [];
  const vistas = {}, numeros = {};
  let ignoradas = 0;
  const cel = function (linha, campo) { return c[campo] == null ? '' : texto(linha[c[campo]]); };

  for (let i = cab.linha + 1; i < linhas.length; i++) {
    const l = linhas[i] || [];
    const nLinha = i + 1;   // como o Excel mostra
    const opC = cel(l, 'opCald'), opU = cel(l, 'opUsin');
    const desenho = cel(l, 'desenho');
    if (!opC && !opU) { if (desenho) ignoradas++; continue; }
    if (!desenho) { erros.push({ linha: nLinha, motivo: 'semDesenho' }); continue; }
    const comum = {
      desenho: desenho.slice(0, 60), posicao: cel(l, 'posicao').slice(0, 20), rev: cel(l, 'rev').slice(0, 10),
      descricao: cel(l, 'descricao').slice(0, 200), qtd: numero(cel(l, 'qtd')),
      pesoUnit: numero(cel(l, 'pesoUnit')), pesoTotal: numero(cel(l, 'pesoTotal')), linha: nLinha
    };
    [['caldeiraria', opC], ['usinagem', opU]].forEach(function (par) {
      const area = par[0], num = par[1].slice(0, 40);
      if (!num) return;
      const k = area + '|' + chave(comum.desenho) + '|' + chave(comum.posicao);
      if (vistas[k]) { erros.push({ linha: nLinha, motivo: 'pecaRepetida', area: area, outra: vistas[k] }); return; }
      vistas[k] = nLinha;
      const kn = area + '|' + chave(num);
      if (numeros[kn]) avisos.push({ linha: nLinha, motivo: 'numeroRepetido', area: area, numero: num, outra: numeros[kn] });
      else numeros[kn] = nLinha;
      ops.push(Object.assign({ area: area, numero: num }, comum));
    });
  }
  return { ok: true, ops: ops, ignoradas: ignoradas, erros: erros, avisos: avisos };
}

/**
 * Compara a planilha com as OPs já gravadas do projeto.
 * Devolve { novas, atualizadas, iguais } — atualizar nunca mexe na finalização.
 */
export function comparar(lidas, existentesPorId, projetoId) {
  const CAMPOS = ['numero', 'desenho', 'posicao', 'rev', 'descricao', 'qtd', 'pesoUnit', 'pesoTotal'];
  const novas = [], atualizadas = [], iguais = [];
  lidas.forEach(function (o) {
    const id = idOp(projetoId, o.area, o.desenho, o.posicao);
    const atual = existentesPorId[id];
    if (!atual) { novas.push(Object.assign({ id: id }, o)); return; }
    const mudou = {};
    CAMPOS.forEach(function (k) { if ((atual[k] == null ? null : atual[k]) !== (o[k] == null ? null : o[k])) mudou[k] = o[k] == null ? null : o[k]; });
    if (Object.keys(mudou).length) atualizadas.push({ id: id, campos: mudou, op: o, status: atual.status });
    else iguais.push(id);
  });
  return { novas: novas, atualizadas: atualizadas, iguais: iguais };
}
