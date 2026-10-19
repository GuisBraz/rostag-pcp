/* ---------------------------------------------------------------------------
   Produção — a etapa depois do PCP. Começa no fim do PCP (datas atreladas)
   e termina em prodFim; o avanço sai das OPs que o CQ aprovou.
--------------------------------------------------------------------------- */
import { hoje, difDias } from '../nucleo/fmt.js';

// Contagem das OPs de um projeto: geral e por área. RNC conta como não aprovada.
export function estatisticas(ops) {
  const vazio = function () { return { total: 0, aprovadas: 0, rnc: 0, abertas: 0, pct: 0 }; };
  const r = Object.assign(vazio(), { caldeiraria: vazio(), usinagem: vazio() });
  (ops || []).forEach(function (o) {
    [r, r[o.area]].forEach(function (alvo) {
      if (!alvo) return;
      alvo.total++;
      if (o.status === 'aprovada') alvo.aprovadas++;
      else if (o.status === 'rnc') alvo.rnc++;
      else alvo.abertas++;
    });
  });
  [r, r.caldeiraria, r.usinagem].forEach(function (a) { a.pct = a.total ? Math.round(a.aprovadas / a.total * 100) : 0; });
  return r;
}

export function inicio(p) { return p.pcpFim || null; }

// Planejada → Em produção → Atrasada → Concluída. Sem fim definido: 'semData'.
// Projeto paralisado para inteiro: a produção fica 'parada', não atrasa.
export function situacao(p, stats, h) {
  h = h || hoje();
  const st = stats || estatisticas([]);
  if (st.total > 0 && st.aprovadas === st.total) return 'concluida';
  if (p.status === 'paralisado') return 'parada';
  if (!p.prodFim || !p.pcpFim) return 'semData';
  if (h < p.pcpFim) return 'planejada';
  if (h > p.prodFim) return 'atrasada';
  return 'andamento';
}

export function diasAtraso(p, h) {
  h = h || hoje();
  return p.prodFim && h > p.prodFim ? difDias(p.prodFim, h) : 0;
}
