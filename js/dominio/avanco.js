/* ---------------------------------------------------------------------------
   Lista de avanço do projeto — a planilha inteira que o PCP sobe pronta
   (todas as peças, comerciais e conjuntos, não só as OPs). Puro cálculo.

   A aba é guardada como matriz de valores (equipes/{id}/avanco/{projetoId});
   daqui saem:
     - os itens para a tela (cada linha com a situação das OPs dela)
     - a planilha de volta, no mesmo layout, com o avanço preenchido pelo
       que o CQ já deu baixa (por peças)
--------------------------------------------------------------------------- */
import { acharCabecalho, chave, texto, numero, marcado, marcasDa } from './planilha.js';
import { pecasOp, statusOp } from './producao.js';

export const MAX_LINHAS = 1500;
export const MAX_COLUNAS = 60;
export const MAX_BYTES = 900000;   // o documento do Firestore vai até ~1 MB

/* ------------------------------------------------------------ guardar */
// Valor de uma célula do SheetJS para guardar: número, texto ou null.
// Número escrito com zero à esquerda (nº de OP "02050301001") fica texto.
export function valorCelula(cel) {
  if (!cel || cel.v == null) return null;
  if (cel.t === 'e') return null;
  if (cel.t === 'n') {
    if (cel.w && /^0\d+$/.test(String(cel.w).trim())) return String(cel.w).trim();
    return Number.isFinite(cel.v) ? cel.v : null;
  }
  if (cel.t === 'b') return cel.v ? 'X' : null;
  const s = String(cel.v).replace(/\r/g, '').trim();
  return s ? s.slice(0, 500) : null;
}

// Corta o que sobra: tudo depois do último item (fórmulas que deixam "-"
// até a linha 5000), linhas vazias no fim e células vazias no fim de cada linha.
export function enxugar(matriz) {
  let linhas = (matriz || []).slice(0, 20000).map(function (l) {
    const r = (l || []).slice(0, MAX_COLUNAS).map(function (v) { return v === '' || v === undefined ? null : v; });
    while (r.length && r[r.length - 1] == null) r.pop();
    return r;
  });
  const lidos = itens(linhas);
  if (lidos && lidos.itens.length) linhas = linhas.slice(0, lidos.itens[lidos.itens.length - 1].linha + 1);
  while (linhas.length && !linhas[linhas.length - 1].length) linhas.pop();
  return linhas;
}

// Firestore não aceita lista dentro de lista: cada linha vira { c: [...] }.
export function paraGravar(matriz) { return matriz.map(function (l) { return { c: l }; }); }
export function daGravacao(linhas) { return (linhas || []).map(function (l) { return (l && l.c) || []; }); }

/* -------------------------------------------------------------- itens */
// Nível na árvore pela posição: "18" → 0, "18.11" → 1, "18.11.1" → 2.
function nivel(pos) { const t = texto(pos); return t ? t.split('.').length - 1 : 0; }

/**
 * Itens da lista (linhas abaixo do cabeçalho com desenho, posição ou
 * descrição): { linha, item, desenho, posicao, nivel, descricao, qtd,
 * pesoUnit, pesoTotal, comercial, cald, usin, marcas, produto, opCald, opUsin, obs }
 */
export function itens(matriz) {
  const cab = acharCabecalho(matriz || []);
  if (!cab) return null;
  const c = cab.cols;
  const cel = function (l, k) { return c[k] == null ? '' : texto(l[c[k]]); };
  const lista = [];
  for (let i = cab.linha + 1; i < matriz.length; i++) {
    const l = matriz[i] || [];
    const desenho = cel(l, 'desenho'), posicao = cel(l, 'posicao'), descricao = cel(l, 'descricao');
    if (!desenho && !posicao && !descricao) continue;
    const opCald = cel(l, 'opCald'), opUsin = cel(l, 'opUsin');
    lista.push({
      linha: i, item: cel(l, 'item'), desenho: desenho, posicao: posicao, nivel: nivel(posicao), descricao: descricao,
      qtd: numero(cel(l, 'qtd')), pesoUnit: numero(cel(l, 'pesoUnit')), pesoTotal: numero(cel(l, 'pesoTotal')),
      comercial: c.comercial != null && marcado(l[c.comercial]),
      cald: !!opCald || (c.fCald != null && marcado(l[c.fCald])),
      usin: !!opUsin || (c.fUsin != null && marcado(l[c.fUsin])),
      marcas: marcasDa(l, c), produto: cel(l, 'produto'), opCald: opCald, opUsin: opUsin, obs: cel(l, 'obs')
    });
  }
  return { cabecalho: cab, itens: lista };
}

// OP "de pintura" do projeto, quando a planilha traz no resumo do topo.
export function opPintura(matriz, cab) {
  const ate = cab ? cab.linha : Math.min((matriz || []).length, 10);
  for (let i = 0; i < ate; i++) {
    const l = matriz[i] || [];
    for (let j = 0; j < l.length; j++) {
      if (chave(l[j]) === 'OPPINTURA') {
        for (let k = j + 1; k < l.length; k++) if (texto(l[k])) return texto(l[k]).slice(0, 40);
      }
    }
  }
  return '';
}

/* --------------------------------------------- situação de cada linha */
// Índice das OPs do projeto por área + nº, e a OP de retrabalho de cada peça morta.
export function indexarOps(ops) {
  const porNumero = {}, filhas = {};
  (ops || []).forEach(function (o) {
    if (o.origemOpId) (filhas[o.origemOpId] = filhas[o.origemOpId] || []).push(o);
    else porNumero[o.area + '|' + chave(o.numero)] = o;
  });
  return { porNumero: porNumero, filhas: filhas };
}

// Peças da OP da linha somando as OPs de retrabalho que nasceram dela.
export function pecasDaCadeia(op, idx) {
  const soma = { total: 0, feitas: 0, rnc: 0, ops: [] };
  const visitar = function (o, prof) {
    if (!o || prof > 10) return;
    const p = pecasOp(o);
    soma.total += p.total; soma.feitas += p.feitas; soma.rnc += p.rnc; soma.ops.push(o);
    (idx.filhas[o.id] || []).forEach(function (f) { visitar(f, prof + 1); });
  };
  visitar(op, 0);
  return soma;
}

/**
 * Situação de uma área da linha:
 *  { op, numero, situacao: 'semOp' | 'naoEncontrada' | status da OP | 'retrabalhoOp', pecas }
 * Peça morta com OP de retrabalho: a situação é a da última OP da cadeia.
 */
export function situacaoArea(item, area, idx) {
  const numeroOp = area === 'caldeiraria' ? item.opCald : item.opUsin;
  if (!numeroOp) return { op: null, numero: '', situacao: 'semOp', pecas: null };
  const op = idx.porNumero[area + '|' + chave(numeroOp)];
  if (!op) return { op: null, numero: numeroOp, situacao: 'naoEncontrada', pecas: null };
  const pecas = pecasDaCadeia(op, idx);
  const ultima = pecas.ops[pecas.ops.length - 1];
  return { op: op, numero: numeroOp, situacao: statusOp(ultima), pecas: pecas };
}

/* ------------------------------------------- planilha de volta (Excel) */
function letra(c) { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }

function fimDoMerge(merges, r, c) {
  const m = (merges || []).find(function (x) { return x.s.r === r && x.s.c === c; });
  return m ? m.e.c : c;
}

/**
 * A planilha com o avanço preenchido: devolve { matriz, celulas, resumo }.
 *  - linha com OP de caldeiraria: MONT, SOLD, ACAB e PINTURA = peças feitas
 *  - linha com OP de usinagem: AVANÇO TOTAL = peças feitas; Avanço Usi = feitas ÷ qtd
 *  - resumo do topo (QTD - PEÇAS, QTD - AVANÇO, Avanço Cald/Solda/Acab) com
 *    fórmulas certas e o valor já calculado
 * celulas: [{ r, c, v, f?, z? }] para aplicar por cima da matriz.
 */
export function preencher(matriz, merges, ops) {
  const lidos = itens(matriz);
  if (!lidos) return null;
  const c = lidos.cabecalho.cols, h = lidos.cabecalho.linha;
  const idx = indexarOps(ops);
  const celulas = [];
  const tot = { caldeiraria: { qtd: 0, feitas: 0 }, usinagem: { qtd: 0, feitas: 0 } };
  const por = function (r, col, v, z) { if (col != null) celulas.push(z ? { r: r, c: col, v: v, z: z } : { r: r, c: col, v: v }); };
  let ultimaLinha = h + 1;
  lidos.itens.forEach(function (it) {
    ultimaLinha = Math.max(ultimaLinha, it.linha);
    const qtd = it.qtd > 0 ? it.qtd : 0;
    if (it.opCald) {
      const s = situacaoArea(it, 'caldeiraria', idx);
      const feitas = s.pecas ? Math.min(s.pecas.feitas, qtd || s.pecas.feitas) : 0;
      ['mont', 'sold', 'acab', 'pinturaAv'].forEach(function (k) { por(it.linha, c[k], feitas); });
      tot.caldeiraria.qtd += qtd; tot.caldeiraria.feitas += feitas;
    }
    if (it.opUsin) {
      const s = situacaoArea(it, 'usinagem', idx);
      const feitas = s.pecas ? Math.min(s.pecas.feitas, qtd || s.pecas.feitas) : 0;
      por(it.linha, c.avTotal, feitas);
      por(it.linha, c.avUsi, qtd ? feitas / qtd : 0, '0%');
      tot.usinagem.qtd += qtd; tot.usinagem.feitas += feitas;
    }
  });

  // resumo do topo: acha os rótulos acima do cabeçalho
  const ini = h + 2, fim = ultimaLinha + 1;           // linhas do Excel (1-based)
  const faixa = function (col) { return letra(col) + ini + ':' + letra(col) + fim; };
  const titulos = [];
  for (let i = 0; i < h; i++) {
    (matriz[i] || []).forEach(function (v, j) {
      const k = chave(v);
      if (k.indexOf('RESUMODEAVANCO') === 0) titulos.push({ c: j, area: k.indexOf('USINAGEM') >= 0 ? 'usinagem' : 'caldeiraria' });
    });
  }
  const areaDe = function (j) {
    let a = null;
    titulos.forEach(function (t) { if (t.c <= j && (!a || t.c > a.c)) a = t; });
    return a ? a.area : null;
  };
  const resumo = [];
  for (let i = 0; i < h; i++) {
    (matriz[i] || []).forEach(function (v, j) {
      const k = chave(v), area = areaDe(j);
      if (!area) return;
      const colOp = area === 'usinagem' ? c.opUsin : c.opCald;
      if (colOp == null || c.qtd == null) return;
      const alvo = fimDoMerge(merges, i, j) + 1;
      const celQtd = (function () {
        // a célula do "QTD - PEÇAS" da mesma área (para dividir)
        for (let a = 0; a < h; a++) {
          const l = matriz[a] || [];
          for (let b = 0; b < l.length; b++) if (chave(l[b]) === 'QTDPECAS' && areaDe(b) === area) return letra(fimDoMerge(merges, a, b) + 1) + (a + 1);
        }
        return null;
      })();
      const t = tot[area];
      const frac = t.qtd ? t.feitas / t.qtd : 0;
      let colAv = null;
      if (k === 'QTDPECAS') {
        resumo.push({ r: i, c: alvo, v: t.qtd, f: 'SUMIF(' + faixa(colOp) + ',"<>",' + faixa(c.qtd) + ')' });
        return;
      }
      if (k === 'QTDAVANCO') colAv = area === 'usinagem' ? c.avTotal : c.pinturaAv;
      else if (k === 'AVANCOCALD') colAv = c.mont;
      else if (k === 'AVANCOSOLDA') colAv = c.sold;
      else if (k === 'AVANCOACAB') colAv = c.acab;
      else return;
      if (colAv == null || !celQtd) return;
      resumo.push({ r: i, c: alvo, v: frac, z: '0%', f: 'IF(' + celQtd + '>0,SUMIF(' + faixa(colOp) + ',"<>",' + faixa(colAv) + ')/' + celQtd + ',0)' });
    });
  }
  return { matriz: matriz, celulas: celulas.concat(resumo), totais: tot };
}
