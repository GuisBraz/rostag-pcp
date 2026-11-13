/* ---------------------------------------------------------------------------
   Produção — começa em prodInicio (o GP escolhe; sem ela, no fim do PCP) e
   termina em prodFim; o avanço sai das peças que o CQ aprovou.
--------------------------------------------------------------------------- */
import { hoje, difDias } from '../nucleo/fmt.js';

// Situação da OP, já normalizada: o antigo "rnc" (antes da reinspeção existir)
// vale como "retrabalho".
//   aberta → aprovada | retrabalho → aprovada | desvio (liberada com desvio)
//                                  → morta (substituída por uma OP de retrabalho)
export function statusOp(o) { return o && o.status === 'rnc' ? 'retrabalho' : (o && o.status) || 'aberta'; }
export function finalizada(o) { const s = statusOp(o); return s === 'aprovada' || s === 'desvio'; }
export function emAberto(o) { const s = statusOp(o); return s === 'aberta' || s === 'retrabalho'; }

// Peças da OP (qtd; sem quantidade vale 1) e quantas o CQ reprovou na RNC
// (qtdNc; RNC antiga, sem quantidade, reprova a OP inteira).
export function qtdPecas(o) { const q = Number(o && o.qtd); return q > 0 ? q : 1; }
export function qtdReprovada(o) {
  const q = qtdPecas(o), n = Number(o && o.qtdNc);
  return n > 0 ? Math.min(n, q) : q;
}

/**
 * Peças da OP para o avanço: { total, feitas, rnc }.
 *  aberta → nada feito · aprovada/desvio → todas feitas
 *  retrabalho → as boas feitas, as reprovadas em RNC
 *  morta → só as boas contam; as reprovadas passam para a OP de retrabalho
 */
export function pecasOp(o) {
  const s = statusOp(o), q = qtdPecas(o);
  if (s === 'aprovada' || s === 'desvio') return { total: q, feitas: q, rnc: 0 };
  if (s === 'retrabalho') { const nc = qtdReprovada(o); return { total: q, feitas: q - nc, rnc: nc }; }
  if (s === 'morta') { const boas = q - qtdReprovada(o); return { total: boas, feitas: boas, rnc: 0 }; }
  return { total: q, feitas: 0, rnc: 0 };
}

// Avanço em % por peças: só mostra 100 quando todas estão feitas.
export function pctPecas(feitas, total) {
  if (!total) return 0;
  return feitas >= total ? 100 : Math.min(99, Math.round(feitas / total * 100));
}

// Contagem das OPs de um projeto: geral e por área. "aprovadas" inclui as
// liberadas com desvio; retrabalho conta como não aprovada; peça morta sai do
// total (a OP de retrabalho que a substitui é que conta). O campo "rnc" é o
// mesmo que "retrabalho", mantido para as telas que já usavam o nome.
// O avanço (pct) é por peças: pecas, pecasFeitas e pecasRnc.
export function estatisticas(ops) {
  const vazio = function () { return { total: 0, aprovadas: 0, desvio: 0, retrabalho: 0, rnc: 0, abertas: 0, mortas: 0, pct: 0, pecas: 0, pecasFeitas: 0, pecasRnc: 0 }; };
  const r = Object.assign(vazio(), { caldeiraria: vazio(), usinagem: vazio() });
  (ops || []).forEach(function (o) {
    const s = statusOp(o);
    const pc = pecasOp(o);
    [r, r[o.area]].forEach(function (alvo) {
      if (!alvo) return;
      alvo.pecas += pc.total; alvo.pecasFeitas += pc.feitas; alvo.pecasRnc += pc.rnc;
      if (s === 'morta') { alvo.mortas++; return; }
      alvo.total++;
      if (s === 'aprovada' || s === 'desvio') { alvo.aprovadas++; if (s === 'desvio') alvo.desvio++; }
      else if (s === 'retrabalho') { alvo.retrabalho++; alvo.rnc++; }
      else alvo.abertas++;
    });
  });
  [r, r.caldeiraria, r.usinagem].forEach(function (a) { a.pct = pctPecas(a.pecasFeitas, a.pecas); });
  return r;
}

// Início da produção: o GP escolhe (independente do PCP); projeto antigo,
// sem a data, continua começando no fim do PCP.
export function inicio(p) { return (p && (p.prodInicio || p.pcpFim)) || null; }

// Planejada → Em produção → Atrasada → Concluída. Sem fim definido: 'semData'.
// Projeto paralisado para inteiro: a produção fica 'parada', não atrasa.
export function situacao(p, stats, h) {
  h = h || hoje();
  const st = stats || estatisticas([]);
  if (st.total > 0 && st.aprovadas === st.total) return 'concluida';
  if (p.status === 'paralisado') return 'parada';
  if (!p.prodFim || !inicio(p)) return 'semData';
  if (h < inicio(p)) return 'planejada';
  if (h > p.prodFim) return 'atrasada';
  return 'andamento';
}

export function diasAtraso(p, h) {
  h = h || hoje();
  return p.prodFim && h > p.prodFim ? difDias(p.prodFim, h) : 0;
}

/* --------------------------------------------- próximo passo (baixa do CQ) */
// O CQ, ao dar baixa, diz para onde a peça vai. Usinagem e caldeiraria avisam
// o programador da área; pintura e decapagem, o de caldeiraria; serviço
// externo, o técnico do projeto; embarque, o GP e a Gerência.
export const PASSOS = ['usinagem', 'caldeiraria', 'pintura', 'decapagem', 'servicoExterno', 'embarque'];

function mesmaPeca(a, b) {
  const k = function (s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  return a.projetoId === b.projetoId && k(a.desenho) === k(b.desenho) && k(a.posicao) === k(b.posicao);
}
// Sugestão pelo que a planilha já diz: a outra área da peça ainda aberta,
// depois TTAT/serviço externo, pintura; sem nada, embarque.
export function passoSugerido(op, ops) {
  const outras = (ops || []).filter(function (x) { return x.id !== op.id && mesmaPeca(x, op) && emAberto(x); });
  if (op.area === 'caldeiraria' && outras.some(function (x) { return x.area === 'usinagem'; })) return 'usinagem';
  if (op.area === 'usinagem' && outras.some(function (x) { return x.area === 'caldeiraria'; })) return 'caldeiraria';
  const m = op.marcas || {};
  if (m.ttat || m.servicoExterno) return 'servicoExterno';
  if (m.pintura) return 'pintura';
  return 'embarque';
}
