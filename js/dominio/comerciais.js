/* ---------------------------------------------------------------------------
   Itens comerciais do projeto (parafusos, flanges, juntas…). Puro cálculo.

   A lista vem da planilha de avanço (linhas marcadas como Comercial). O que
   acontece depois fica em equipes/{id}/comerciais/{projetoId}.itens[chave]:
   pedido de compra (do PDF), SC, fornecedor e as chegadas (parciais). Os
   valores ficam à parte (comerciaisValores), que só Gerência, GP e técnico
   do projeto leem.
--------------------------------------------------------------------------- */
import { chave } from './planilha.js';

export function chaveItem(it) { return 'C|' + chave(it.posicao) + '|' + chave(it.descricao).slice(0, 40); }

function qtdChegou(reg) { return ((reg && reg.chegadas) || []).reduce(function (t, c) { return t + (Number(c.qtd) || 0); }, 0); }

/**
 * Itens comerciais com a situação: { chave, descricao, posicao, desenho, qtd, sc, pc,
 * fornecedor, produto, chegou, situacao: 'semPedido' | 'pendente' | 'parcial' | 'completo', extra }
 * itensPlanilha: Avanco.itens(...).itens · doc: o documento de comerciais (ou null)
 */
export function lista(itensPlanilha, doc) {
  const regs = (doc && doc.itens) || {};
  const vistos = {};
  const linhas = (itensPlanilha || []).filter(function (it) { return it.comercial; }).map(function (it) {
    const k = chaveItem(it), reg = regs[k] || {};
    vistos[k] = true;
    return montar(k, {
      descricao: it.descricao, posicao: it.posicao, desenho: it.desenho, qtd: it.qtd, produto: it.produto || reg.produtoPc || '',
      sc: reg.sc || it.sc || '', pc: reg.pc || it.pc || '', fornecedor: reg.fornecedor || it.fornecedor || '', unidade: reg.unidade || ''
    }, reg, false);
  });
  // itens que vieram só do pedido (não estavam na planilha)
  Object.keys(regs).forEach(function (k) {
    if (vistos[k] || k.indexOf('X|') !== 0) return;
    const r = regs[k];
    linhas.push(montar(k, { descricao: r.descricaoPc || '', posicao: '', desenho: '', qtd: r.qtdPedido, produto: r.produtoPc || '', sc: r.sc || '', pc: r.pc || '', fornecedor: r.fornecedor || '', unidade: r.unidade || '' }, r, true));
  });
  return linhas;
}
function montar(k, base, reg, extra) {
  const qtd = Number(base.qtd) > 0 ? Number(base.qtd) : (Number(reg.qtdPedido) || 0);
  const chegou = qtdChegou(reg);
  let situacao = 'semPedido';
  if (chegou > 0 && qtd > 0 && chegou >= qtd) situacao = 'completo';
  else if (chegou > 0) situacao = 'parcial';
  else if (base.pc) situacao = 'pendente';
  return Object.assign({ chave: k, extra: extra, chegou: chegou, situacao: situacao, chegadas: (reg && reg.chegadas) || [] }, base, { qtd: qtd });
}

export function resumo(linhas) {
  const r = { total: linhas.length, completo: 0, parcial: 0, pendente: 0, semPedido: 0 };
  linhas.forEach(function (l) { r[l.situacao]++; });
  return r;
}

/* ------------------------------------------------- ligar o pedido aos itens */
function palavras(s) { return chave(s).length ? String(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Z0-9#]+/).filter(function (w) { return w.length > 1; }) : []; }
// Semelhança entre duas descrições (0 a 1): palavras em comum.
export function semelhanca(a, b) {
  const pa = palavras(a), pb = palavras(b);
  if (!pa.length || !pb.length) return 0;
  const sb = new Set(pb);
  const comum = pa.filter(function (w) { return sb.has(w); }).length;
  return comum / Math.max(pa.length, pb.length);
}

/**
 * Para cada linha do pedido (já da commessa do projeto), o item comercial da
 * planilha que ela atende: pelo código do produto, depois pela SC (a mais
 * parecida, se a SC tiver vários itens) e, por fim, só sugestão pela descrição.
 * Devolve [{ linha, chave, por: 'produto' | 'sc' | 'sugestao' | null }]
 */
export function ligarPedido(linhasPedido, itens) {
  const livres = itens.slice();
  return (linhasPedido || []).map(function (ln) {
    let achado = null, por = null;
    if (ln.produto) achado = livres.find(function (it) { return it.produto && chave(it.produto) === chave(ln.produto); });
    if (achado) por = 'produto';
    if (!achado && ln.sc) {
      const mesmaSc = livres.filter(function (it) { return it.sc && it.sc === ln.sc; });
      if (mesmaSc.length === 1) achado = mesmaSc[0];
      else if (mesmaSc.length > 1) achado = mesmaSc.slice().sort(function (a, b) { return semelhanca(ln.descricao, b.descricao) - semelhanca(ln.descricao, a.descricao); })[0];
      if (achado) por = 'sc';
    }
    if (!achado) {
      const melhor = livres.map(function (it) { return { it: it, s: semelhanca(ln.descricao, it.descricao) }; }).sort(function (a, b) { return b.s - a.s; })[0];
      if (melhor && melhor.s >= 0.5) { achado = melhor.it; por = 'sugestao'; }
    }
    if (achado) livres.splice(livres.indexOf(achado), 1);
    return { linha: ln, chave: achado ? achado.chave : null, por: por };
  });
}
export function chaveExtra(linha) { return 'X|' + chave(linha.produto || linha.descricao).slice(0, 40); }
