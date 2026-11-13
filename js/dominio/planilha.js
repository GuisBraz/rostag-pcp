/* ---------------------------------------------------------------------------
   Planilha de controle de avanço → OPs. Puro cálculo, sem DOM.

   Entrada: as linhas da aba como matriz de textos (o SheetJS lê .xls, .xlsx e
   .csv). O cabeçalho é achado pelos nomes das colunas, não pela posição:
   DESENHO, POSIÇÃO, REV., DESCRIÇÃO DO ITEM, QTE TOTAL, PESO UNIT (KG),
   PESO TOTAL (KG), N° OP CALD e N° OP USINAGEM.
   Cada linha com nº de OP de caldeiraria vira uma OP de caldeiraria; com nº de
   OP de usinagem, uma de usinagem. Uma peça (desenho + posição) tem no máximo
   uma OP por área. Linhas com o MESMO nº de OP na mesma área (ex.: o pé igual
   das duas escadas, aberto numa OP só) viram uma OP: quantidade e peso
   somados, posições juntas ("1.3 / 2.3").
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
  opUsin: function (k) { return k.indexOf('OPUSIN') >= 0; },
  // planilha de avanço completa (opcionais)
  item: function (k) { return k === 'N' || k === 'NO' || k === 'ITEM'; },
  produto: function (k) { return k.indexOf('PRODUTO') >= 0; },
  comercial: function (k) { return k === 'COMERCIAL'; },
  fCald: function (k) { return k === 'CALD' || k === 'CALDEIRARIA'; },
  fUsin: function (k) { return k === 'USINAGEM'; },
  fPintura: function (k) { return k === 'PINTURA'; },
  fOxidacao: function (k) { return k.indexOf('OXIDACAO') === 0; },
  fServico: function (k) { return k.indexOf('SERVICOEXT') === 0; },
  fTtat: function (k) { return k === 'TTAT'; },
  mont: function (k) { return k === 'MONT' || k === 'MONTAGEM'; },
  sold: function (k) { return k === 'SOLD' || k === 'SOLDA'; },
  acab: function (k) { return k === 'ACAB' || k === 'ACABAMENTO'; },
  avTotal: function (k) { return k.indexOf('AVANCOTOTAL') === 0; },
  avUsi: function (k) { return k.indexOf('AVANCOUSI') === 0; },
  obs: function (k) { return k.indexOf('OBSERVA') === 0; },
  sc: function (k) { return k === 'SC' || k === 'SCITEM' || k === 'NSC' || k.indexOf('SOLICITACAO') === 0; },
  pc: function (k) { return k === 'PC' || k === 'PCITEM' || k === 'NPC' || k.indexOf('PEDIDO') === 0; },
  fornecedor: function (k) { return k.indexOf('FORNECEDOR') === 0; }
};

export { chave, texto };

// Commessa base: o código sem o que vem depois para complementos e revisões
// ("2025-061P - REV.1" → "2025061P"). As OPs e os pedidos do sistema saem
// com a commessa original, então a comparação é sempre pela base.
export function commessaBase(c) {
  const s = texto(c).toUpperCase().replace(/[\s\-_.\/]*(REV|COMPL|ADITIVO)[\s\S]*$/, '');
  return chave(s);
}
export function mesmaCommessa(a, b) { const x = commessaBase(a); return !!x && x === commessaBase(b); }

// Marca da planilha (X, emoji, "sim"...): qualquer coisa que não seja vazio ou "-".
export function marcado(v) { const t = texto(v); return !!t && t !== '-'; }

// Acha a linha do cabeçalho e a coluna de cada campo.
export function acharCabecalho(linhas) {
  for (let i = 0; i < Math.min(linhas.length, LIMITE_LINHAS_CABECALHO); i++) {
    const cols = {};
    (linhas[i] || []).forEach(function (cel, j) {
      const k = chave(cel);
      if (!k) return;
      Object.keys(COLUNAS).forEach(function (campo) { if (cols[campo] == null && COLUNAS[campo](k)) cols[campo] = j; });
    });
    if (cols.desenho != null && (cols.opCald != null || cols.opUsin != null)) {
      // a 2ª coluna "PINTURA" (depois das OPs) é o avanço de pintura, não a marca
      const depois = Math.max(cols.opCald == null ? -1 : cols.opCald, cols.opUsin == null ? -1 : cols.opUsin);
      (linhas[i] || []).forEach(function (cel, j) { if (j > depois && chave(cel) === 'PINTURA') cols.pinturaAv = j; });
      if (cols.fPintura != null && cols.fPintura > depois) delete cols.fPintura;
      return { linha: i, cols: cols };
    }
  }
  return null;
}

// Id do documento: uma OP por projeto + área + peça.
export function idOp(projetoId, area, desenho, posicao) {
  const slug = function (s) { return String(s || '0').replace(/[^A-Za-z0-9-]+/g, '_').slice(0, 60) || '0'; };
  return projetoId + '__' + area + '__' + slug(desenho) + '__' + slug(posicao);
}

// O que a peça precisa além da OP (só as marcas que existem na planilha).
export function marcasDa(l, c) {
  const m = {};
  [['pintura', 'fPintura'], ['oxidacao', 'fOxidacao'], ['servicoExterno', 'fServico'], ['ttat', 'fTtat']].forEach(function (p) {
    if (c[p[1]] != null && marcado(l[c[p[1]]])) m[p[0]] = true;
  });
  return m;
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
  const vistas = {}, porNumero = {};
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
      pesoUnit: numero(cel(l, 'pesoUnit')), pesoTotal: numero(cel(l, 'pesoTotal')), linha: nLinha,
      produto: cel(l, 'produto').slice(0, 40), obs: cel(l, 'obs').slice(0, 300), marcas: marcasDa(l, c)
    };
    [['caldeiraria', opC], ['usinagem', opU]].forEach(function (par) {
      const area = par[0], num = par[1].slice(0, 40);
      if (!num) return;
      // mesmo nº de OP na mesma área: a linha entra na OP que já existe
      const kn = area + '|' + chave(num);
      if (porNumero[kn]) {
        const o = porNumero[kn];
        agrupar(o, comum);
        avisos.push({ linha: nLinha, motivo: 'agrupada', area: area, numero: num, outra: o.linha, qtd: o.qtd });
        return;
      }
      const k = area + '|' + chave(comum.desenho) + '|' + chave(comum.posicao);
      if (vistas[k]) { erros.push({ linha: nLinha, motivo: 'pecaRepetida', area: area, outra: vistas[k] }); return; }
      vistas[k] = nLinha;
      const op = Object.assign({ area: area, numero: num, idPos: comum.posicao, linhas: [nLinha] }, comum);
      porNumero[kn] = op;
      ops.push(op);
    });
  }
  return { ok: true, ops: ops, ignoradas: ignoradas, erros: erros, avisos: avisos };
}

// Soma a linha na OP agrupada: quantidade e peso total; a posição entra na lista.
function agrupar(o, l) {
  o.linhas.push(l.linha);
  if (o.qtd != null || l.qtd != null) o.qtd = (Number(o.qtd) || 0) + (Number(l.qtd) || 0);
  if (o.pesoTotal != null || l.pesoTotal != null) o.pesoTotal = Math.round(((Number(o.pesoTotal) || 0) + (Number(l.pesoTotal) || 0)) * 100) / 100;
  const pos = o.posicao ? o.posicao.split(' / ') : [];
  if (l.posicao && pos.indexOf(l.posicao) < 0) o.posicao = pos.concat([l.posicao]).join(' / ').slice(0, 60);
  ['produto', 'obs'].forEach(function (k) { if (!o[k] && l[k]) o[k] = l[k]; });
  Object.keys(l.marcas || {}).forEach(function (k) { o.marcas[k] = true; });
}

function ordenado(obj) { const r = {}; Object.keys(obj).sort().forEach(function (k) { r[k] = obj[k]; }); return r; }

/**
 * Compara a planilha com as OPs já gravadas do projeto.
 * Devolve { novas, atualizadas, iguais, juntar, naoJuntou } — atualizar nunca
 * mexe na finalização. juntar: ids de OPs duplicadas (mesmo nº de OP, de antes
 * do agrupamento) ainda em aberto, que somem porque a OP agrupada as cobre;
 * naoJuntou: as que o CQ já movimentou (ficam, com aviso).
 */
export function comparar(lidas, existentesPorId, projetoId) {
  const CAMPOS = ['numero', 'desenho', 'posicao', 'rev', 'descricao', 'qtd', 'pesoUnit', 'pesoTotal', 'produto', 'obs', 'marcas'];
  const igual = function (a, b) { return JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b); };
  const novas = [], atualizadas = [], iguais = [], juntar = [], naoJuntou = [];
  const idsLidos = {};
  lidas.forEach(function (o) { idsLidos[idOp(projetoId, o.area, o.desenho, o.idPos != null ? o.idPos : o.posicao)] = true; });
  lidas.forEach(function (o) {
    const id = idOp(projetoId, o.area, o.desenho, o.idPos != null ? o.idPos : o.posicao);
    if (o.linhas && o.linhas.length > 1) {
      Object.keys(existentesPorId).forEach(function (eid) {
        const e = existentesPorId[eid];
        if (idsLidos[eid] || e.area !== o.area || chave(e.numero) !== chave(o.numero) || e.origemOpId) return;
        if ((!e.status || e.status === 'aberta') && !e.rncAtualId) juntar.push(eid);
        else naoJuntou.push({ id: eid, numero: e.numero, status: e.status });
      });
    }
    const atual = existentesPorId[id];
    if (!atual) { novas.push(Object.assign({ id: id }, o)); return; }
    const mudou = {};
    CAMPOS.forEach(function (k) {
      if (o[k] === undefined) return;   // OP vinda de fora (manual, teste) sem o campo novo
      if (k === 'marcas' ? !igual(ordenado(atual[k] || {}), ordenado(o[k] || {})) : !igual(atual[k], o[k])) mudou[k] = o[k] == null ? null : o[k];
    });
    if (Object.keys(mudou).length) atualizadas.push({ id: id, campos: mudou, op: o, status: atual.status });
    else iguais.push(id);
  });
  return { novas: novas, atualizadas: atualizadas, iguais: iguais, juntar: juntar, naoJuntou: naoJuntou };
}
