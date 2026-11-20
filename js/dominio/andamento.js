/* ---------------------------------------------------------------------------
   Andamento geral do projeto (aba Projetos), sem Firebase:
     - PCP: o checklist do técnico (0–100);
     - Fábrica: peças feitas / total das OPs do projeto (null = sem OPs);
     - Geral: PCP vale 20% e Fábrica 80% (sem OPs, conta só o PCP);
     - Fase: PCP → Aguardando OPs → Fabricação → Acabamento → Pronto para entrega
       (ou Entregue / Cancelado / Paralisado, pelo status);
     - Risco: a fábrica está atrás do tempo que já passou da produção.
--------------------------------------------------------------------------- */
import { hoje, difDias } from '../nucleo/fmt.js';
import * as Projeto from './projeto.js';
import { estatisticas, statusOp, inicio } from './producao.js';

export const PESO_PCP = 0.2, PESO_FABRICA = 0.8;
export const FASES = ['pcp', 'aguardandoOps', 'fabricacao', 'acabamento', 'pronto', 'paralisado', 'entregue', 'cancelado'];
const ACABAMENTO = ['pintura', 'servicoExterno', 'ttat', 'oxidacao'];

function aprovada(o) { const s = statusOp(o); return s === 'aprovada' || s === 'desvio'; }
// OP aprovada pelo CQ que ainda vai para pintura / serviço externo / TTAT / oxidação
function faltaAcabamento(o) {
  const precisa = ACABAMENTO.some(function (k) { return o.marcas && o.marcas[k]; });
  if (!precisa) return false;
  return !o.encerradaEm || (o.destino && o.destino !== 'expedicao');
}

/** p, ops (do projeto), h → { pcp, fabrica, geral, fase, risco: null|'atencao'|'atraso', esperado, stats } */
export function calcular(p, ops, h) {
  h = h || hoje();
  const pcp = Projeto.progresso(p);
  const vivas = (ops || []).filter(function (o) { return statusOp(o) !== 'morta'; });
  const stats = estatisticas(ops || []);
  const fabrica = vivas.length ? stats.pct : null;
  const geral = Math.round(pcp * PESO_PCP + (fabrica == null ? 0 : fabrica * PESO_FABRICA));
  const st = Projeto.status(p);
  let fase;
  if (st === 'concluido') fase = 'entregue';
  else if (st === 'cancelado') fase = 'cancelado';
  else if (st === 'paralisado') fase = 'paralisado';
  else if (pcp < 100) fase = 'pcp';
  else if (!vivas.length) fase = 'aguardandoOps';
  else if (vivas.some(function (o) { return !aprovada(o); })) fase = 'fabricacao';
  else if (vivas.some(faltaAcabamento)) fase = 'acabamento';
  else fase = 'pronto';
  // risco: quanto da janela de produção já passou × quanto a fábrica fez
  let risco = null, esperado = null;
  const ini = inicio(p), fim = p && p.prodFim;
  if (fabrica != null && ini && fim && Projeto.aberto(p) && fase === 'fabricacao' && fim > ini) {
    const total = difDias(ini, fim), passou = Math.max(0, Math.min(total, difDias(ini, h)));
    esperado = Math.round(passou / total * 100);
    const falta = esperado - fabrica;
    if (h > fim || falta >= 30) risco = 'atraso';
    else if (falta >= 15) risco = 'atencao';
  }
  return { pcp: pcp, fabrica: fabrica, geral: geral, fase: fase, risco: risco, esperado: esperado, stats: stats };
}
