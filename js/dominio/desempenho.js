/* ---------------------------------------------------------------------------
   Desempenho por pessoa (tela da Gerência). Puro cálculo, sem DOM.

   Técnico de processo: atividades do PCP feitas no prazo × com atraso
   (comparando a data em que foi marcada com o fim planejado da atividade),
   atividades atrasadas agora e projetos abertos.
   GP: projetos entregues no prazo × com atraso, projetos abertos, atrasados
   agora e quantos reagendamentos de data fez.
--------------------------------------------------------------------------- */
import * as Cronograma from './cronograma.js';
import * as Projeto from './projeto.js';

// Fim planejado de cada atividade: o cronograma calculado como se nada
// estivesse feito (a data de conclusão não empurra as seguintes).
export function fimPlanejado(p) {
  const copia = Object.assign({}, p, {
    checklist: (p.checklist || []).map(function (i) { return Object.assign({}, i, { done: false, doneAt: null }); })
  });
  return Cronograma.recalcular(copia).itens.map(function (i) { return i.fim; });
}

function vazioTecnico() { return { noPrazo: 0, comAtraso: 0, atrasadasAgora: 0, abertas: 0, projetos: 0 }; }
function vazioGp() { return { entreguesNoPrazo: 0, entreguesAtrasados: 0, abertos: 0, atrasadosAgora: 0, reagendamentos: 0, cancelados: 0 }; }

export function porTecnico(projetos, h) {
  const r = {};
  (projetos || []).forEach(function (p) {
    const uid = p.responsavelUid;
    if (!uid || Projeto.status(p) === 'cancelado') return;
    const l = r[uid] = r[uid] || vazioTecnico();
    if (Projeto.aberto(p)) l.projetos++;
    if (Projeto.aguardandoCronograma(p)) return;
    const planejado = fimPlanejado(p);
    const atual = Cronograma.calcular(p).itens;
    (p.checklist || []).forEach(function (item, i) {
      if (item.done) {
        if (!item.doneAt || !planejado[i] || item.doneAt <= planejado[i]) l.noPrazo++; else l.comAtraso++;
      } else if (Projeto.aberto(p)) {
        l.abertas++;
        if (atual[i] && atual[i].situacao === 'atrasada' && atual[i].fim < h) l.atrasadasAgora++;
      }
    });
  });
  return r;
}

export function porGp(projetos, h) {
  const r = {};
  (projetos || []).forEach(function (p) {
    const uid = p.gpUid;
    if (!uid) return;
    const l = r[uid] = r[uid] || vazioGp();
    const s = Projeto.status(p);
    l.reagendamentos += (p.reagendamentos || []).length;
    if (s === 'concluido') {
      if (p.concluidoEm && p.entrega && p.concluidoEm > p.entrega) l.entreguesAtrasados++; else l.entreguesNoPrazo++;
    } else if (s === 'cancelado') {
      l.cancelados++;
    } else {
      l.abertos++;
      if (s === 'atrasado' || (p.entrega && p.entrega < h)) l.atrasadosAgora++;
    }
  });
  return r;
}

// % no prazo (null quando ainda não há nada para medir).
export function pctNoPrazo(bons, ruins) { const t = bons + ruins; return t ? Math.round(bons / t * 100) : null; }
