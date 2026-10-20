/* ---------------------------------------------------------------------------
   RNC — Registro de Não Conformidade (formulário R02 da SOFIR) e os
   indicadores do controle de qualidade. Puro cálculo, sem DOM.

   A RNC fica gravada em equipes/{id}/rncs/{id}, ligada à OP. O CQ preenche
   tudo; o que a OP já tem (produto, desenho, rev., commessa, OP, qtd., item e
   setor) vem preenchido e pode ser corrigido.
--------------------------------------------------------------------------- */
import { statusOp } from './producao.js';

export const SETORES = ['usinagem', 'caldeiraria', 'pintura', 'fornecedor', 'outros'];
export const RESULTADOS = ['retrabalho', 'conforme', 'nao_conforme', 'desvio'];

// Campos de texto do formulário e o tamanho máximo de cada um.
export const LIMITES = {
  numero: 30, produto: 160, desenho: 60, rev: 10, commessa: 40, op: 40, qtd: 20, tag: 40, item: 20, setorOutros: 60,
  descricao: 3000, inspetor: 60, qtdNc: 20, disposicao: 3000, dispResponsavel: 60, observacoes: 6000,
  reOp: 40, reInspetor: 60, reResponsavel: 60
};

// RNC nova a partir da OP: o que o sistema já sabe vem preenchido.
export function rascunho(op, hojeIso, nomeInspetor) {
  return {
    numero: '', produto: op.descricao || '', desenho: op.desenho || '', rev: op.rev || '',
    commessa: op.commessa || '', op: op.numero || '', qtd: op.qtd == null ? '' : String(op.qtd), tag: '', item: op.posicao || '',
    setor: SETORES.reduce(function (s, k) { s[k] = k === op.area; return s; }, {}), setorOutros: '',
    procedencia: '', descricao: '', inspetor: nomeInspetor || '', qtdNc: '', data: hojeIso || '',
    disposicao: '', dispResponsavel: '', dispData: '',
    reOp: '', reInspetor: '', reData: '', reResultado: '', reResponsavel: '',
    observacoes: ''
  };
}

// O que falta para gravar. Abrir RNC exige nº, descrição e inspetor; a
// reinspeção, quando marcada, exige inspetor e data.
export function validar(r) {
  const faltando = [];
  if (!String(r.numero || '').trim()) faltando.push('numero');
  if (!String(r.descricao || '').trim()) faltando.push('descricao');
  if (!String(r.inspetor || '').trim()) faltando.push('inspetor');
  if (r.reResultado && r.reResultado !== 'retrabalho') {
    if (!String(r.reInspetor || '').trim()) faltando.push('reInspetor');
    if (!r.reData) faltando.push('reData');
  }
  if (r.reOp && !String(r.reInspetor || '').trim() && faltando.indexOf('reInspetor') < 0) faltando.push('reInspetor');
  const longos = Object.keys(LIMITES).filter(function (k) { return r[k] && String(r[k]).length > LIMITES[k]; });
  return { ok: !faltando.length && !longos.length, faltando: faltando, longos: longos };
}

/**
 * O que a reinspeção faz com a OP:
 *  - nº de OP de retrabalho informado → a peça original "morre" e nasce a OP nova
 *  - conforme → aprovada · liberada com desvio → desvio
 *  - não conforme / retrabalho / vazio → a OP continua em retrabalho
 */
export function efeitoReinspecao(r) {
  if (String(r.reOp || '').trim()) return { opStatus: 'morta', criarOp: String(r.reOp).trim(), encerra: true };
  if (r.reResultado === 'conforme') return { opStatus: 'aprovada', encerra: true };
  if (r.reResultado === 'desvio') return { opStatus: 'desvio', encerra: true };
  if (r.reResultado === 'nao_conforme') return { opStatus: 'retrabalho', encerra: true };
  return { opStatus: 'retrabalho', encerra: false };
}

// Próximo nº sugerido: segue o maior número já usado (só a parte numérica final).
export function proximoNumero(rncs) {
  let maior = 0, prefixo = '', largura = 3;
  (rncs || []).forEach(function (r) {
    const m = String(r.numero || '').match(/^(.*?)(\d+)\s*$/);
    if (!m) return;
    const n = Number(m[2]);
    if (n >= maior) { maior = n; prefixo = m[1]; largura = m[2].length; }
  });
  return prefixo + String(maior + 1).padStart(largura, '0');
}

/* ------------------------------------------------------------ indicadores */
function mesDe(iso) { return iso ? String(iso).slice(0, 7) : ''; }

// Últimos n meses terminando em "mesFinal" (AAAA-MM), do mais antigo ao atual.
export function meses(mesFinal, n) {
  const [a, m] = mesFinal.split('-').map(Number);
  const lista = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(a, m - 1 - i, 1);
    lista.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  return lista;
}

/**
 * Indicadores de um mês (AAAA-MM). Datas são ISO (criadoEm, finalizadoEm...).
 *  aprovadas / desvio: OPs finalizadas no mês · rncs: RNCs abertas no mês
 *  finalizadas: aprovadas + desvio no mês · mortas: peças mortas no mês
 *  emAberto: OPs que estavam abertas (ou em retrabalho) no fim do mês
 *  retrabalho: OPs em retrabalho no fim do mês
 */
export function indicadoresMes(ops, rncs, mes, agoraIso) {
  const fimMes = mes + '-31T23:59:59.999Z';
  const corte = agoraIso && agoraIso < fimMes ? agoraIso : fimMes;
  const r = { mes: mes, aprovadas: 0, desvio: 0, rncs: 0, finalizadas: 0, mortas: 0, emAberto: 0, retrabalho: 0 };
  (ops || []).forEach(function (o) {
    const s = statusOp(o);
    const fim = o.finalizadoEm || null;
    if ((s === 'aprovada' || s === 'desvio') && mesDe(fim) === mes) {
      r.finalizadas++;
      if (s === 'desvio') r.desvio++; else r.aprovadas++;
    }
    if (s === 'morta' && mesDe(o.mortaEm || fim) === mes) r.mortas++;
    // aberta no fim do mês: já existia e ainda não tinha sido finalizada nem morta
    const criada = o.criadoEm || '';
    const saiu = (s === 'aprovada' || s === 'desvio') ? fim : (s === 'morta' ? (o.mortaEm || fim) : null);
    if (criada && criada <= corte && (!saiu || saiu > corte)) {
      r.emAberto++;
      if (o.retrabalhoDesde && o.retrabalhoDesde <= corte && (s === 'retrabalho' || (saiu && saiu > corte))) r.retrabalho++;
    }
  });
  (rncs || []).forEach(function (x) { if (mesDe(x.criadoEm) === mes) r.rncs++; });
  return r;
}

export function serie(ops, rncs, mesFinal, n, agoraIso) {
  return meses(mesFinal, n).map(function (m) { return indicadoresMes(ops, rncs, m, agoraIso); });
}

// Taxa de aprovação na inspeção: aprovadas (com e sem desvio) ÷ (aprovadas + RNCs).
export function taxaAprovacao(ind) {
  const base = ind.finalizadas + ind.rncs;
  return base ? Math.round(ind.finalizadas / base * 100) : null;
}
