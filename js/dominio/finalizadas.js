/* ---------------------------------------------------------------------------
   OPs finalizadas → peças prontas e o destino delas (expedição, montagem
   mecânica ou pintura). Puro cálculo, sem DOM.

   Uma peça = projeto + desenho + posição. Ela está pronta quando todas as
   OPs dela (sem contar a peça morta, que foi substituída pela OP de
   retrabalho) foram finalizadas pelo programador. O destino é gravado nas
   OPs da peça; sem destino gravado, peça com pintura marcada vai para
   Pintura.
--------------------------------------------------------------------------- */
import { chave } from './planilha.js';
import { statusOp } from './producao.js';
import { encerrada } from './programacao.js';

export const DESTINOS = ['expedicao', 'montagem', 'pintura'];
export const GRUPOS = ['expedicao', 'montagem', 'pintura', 'semDestino'];

function chavePeca(o) { return o.projetoId + '|' + chave(o.desenho) + '|' + chave(o.posicao); }

/**
 * Peças a partir das OPs: [{ id, projetoId, commessa, cliente, descricaoProjeto,
 *   desenho, posicao, descricao, qtd, pesoUnit, pesoTotal, produto, ops, pronta,
 *   finalizadaEm, destino, destinoGravado }]
 */
export function pecas(ops) {
  const mapa = {};
  (ops || []).forEach(function (o) {
    const k = chavePeca(o);
    (mapa[k] = mapa[k] || []).push(o);
  });
  return Object.keys(mapa).map(function (k) {
    const todas = mapa[k];
    const vivas = todas.filter(function (o) { return statusOp(o) !== 'morta'; });
    const base = todas.find(function (o) { return !o.origemOpId; }) || todas[0];
    const pronta = vivas.length > 0 && vivas.every(encerrada);
    const gravado = (todas.find(function (o) { return DESTINOS.indexOf(o.destino) >= 0; }) || {}).destino || null;
    const pintura = todas.some(function (o) { return o.marcas && o.marcas.pintura; });
    const fins = vivas.map(function (o) { return o.encerradaEm || ''; }).sort();
    const pesoTotal = base.pesoTotal != null ? base.pesoTotal : (base.pesoUnit != null && base.qtd != null ? Math.round(base.pesoUnit * base.qtd * 100) / 100 : null);
    return {
      id: k, projetoId: base.projetoId, commessa: base.commessa || '', cliente: base.cliente || '', descricaoProjeto: base.descricaoProjeto || '',
      desenho: base.desenho || '', posicao: base.posicao || '', descricao: base.descricao || '', qtd: base.qtd == null ? null : base.qtd,
      pesoUnit: base.pesoUnit == null ? null : base.pesoUnit, pesoTotal: pesoTotal, produto: base.produto || '',
      ops: todas, pronta: pronta, finalizadaEm: pronta ? fins[fins.length - 1] : null,
      destino: gravado || (pintura ? 'pintura' : null), destinoGravado: gravado
    };
  });
}

// Grupo da peça pronta: o destino ou "semDestino".
export function grupo(peca) { return peca.destino || 'semDestino'; }

// Contagem das peças prontas por grupo (só de projetos abertos, se informado).
export function contagem(lista, projetoAberto) {
  const r = { expedicao: 0, montagem: 0, pintura: 0, semDestino: 0 };
  (lista || []).forEach(function (p) {
    if (!p.pronta || (projetoAberto && !projetoAberto(p.projetoId))) return;
    r[grupo(p)]++;
  });
  return r;
}

/**
 * Commessas (não finalizadas) com peças prontas naquele grupo:
 * [{ projetoId, commessa, cliente, descricaoProjeto, prontas, total }]
 */
export function commessas(lista, g, projetoAberto) {
  const por = {};
  (lista || []).forEach(function (p) {
    if (projetoAberto && !projetoAberto(p.projetoId)) return;
    const c = por[p.projetoId] = por[p.projetoId] || { projetoId: p.projetoId, commessa: p.commessa, cliente: p.cliente, descricaoProjeto: p.descricaoProjeto, prontas: 0, total: 0 };
    c.total++;
    if (p.pronta && grupo(p) === g) c.prontas++;
  });
  return Object.keys(por).map(function (k) { return por[k]; }).filter(function (c) { return c.prontas > 0; })
    .sort(function (a, b) { return String(a.commessa).localeCompare(String(b.commessa), 'pt-BR', { numeric: true }); });
}

/**
 * Peças de uma commessa vistas de um grupo: a situação de cada uma
 *  disponivel (pronta e neste grupo) · outroDestino (pronta, outro grupo) · emProducao
 */
export function itensDaCommessa(lista, projetoId, g) {
  return (lista || []).filter(function (p) { return p.projetoId === projetoId; }).map(function (p) {
    const sit = !p.pronta ? 'emProducao' : (grupo(p) === g ? 'disponivel' : 'outroDestino');
    return Object.assign({}, p, { situacao: sit });
  }).sort(function (a, b) {
    const ord = { disponivel: 0, emProducao: 1, outroDestino: 2 };
    return ord[a.situacao] - ord[b.situacao] || String(a.desenho).localeCompare(String(b.desenho), 'pt-BR', { numeric: true })
      || String(a.posicao).localeCompare(String(b.posicao), 'pt-BR', { numeric: true });
  });
}

// Linhas do romaneio: só as peças disponíveis, com os totais.
export function romaneio(itens) {
  const linhas = (itens || []).filter(function (i) { return i.situacao === 'disponivel'; }).map(function (i, n) {
    return { item: n + 1, desenho: i.desenho, posicao: i.posicao, descricao: i.descricao, produto: i.produto, qtd: i.qtd, pesoUnit: i.pesoUnit, pesoTotal: i.pesoTotal,
      ops: i.ops.filter(function (o) { return statusOp(o) !== 'morta'; }).map(function (o) { return o.numero; }).join(' / ') };
  });
  const tot = linhas.reduce(function (t, l) { t.qtd += Number(l.qtd) || 0; t.peso += Number(l.pesoTotal) || 0; return t; }, { qtd: 0, peso: 0 });
  tot.peso = Math.round(tot.peso * 100) / 100;
  return { linhas: linhas, totais: tot };
}
