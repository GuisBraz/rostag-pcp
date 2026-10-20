/* ---------------------------------------------------------------------------
   OP cadastrada à mão (Fábrica → Adicionar OPs → Manual). Mesmo formato e
   mesmo id da planilha (projeto + área + desenho + posição), então a mesma
   peça vinda depois pela planilha ou pelo PDF só atualiza, não duplica.
--------------------------------------------------------------------------- */
import { idOp, numero } from './planilha.js';

export const AREAS = ['caldeiraria', 'usinagem'];
const LIMITE = { numero: 40, desenho: 60, posicao: 20, rev: 10, descricao: 160 };

function txt(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }

/**
 * Confere o formulário e monta a OP.
 *  d: { projetoId, area, numero, desenho, posicao, rev, descricao, qtd, pesoUnit, pesoTotal }
 *  ops: OPs já carregadas · editandoId: id da OP em edição (ou null)
 * Devolve { ok, erros: { campo: chave i18n }, avisos: [chave], op }.
 */
export function validar(d, ops, editandoId) {
  const erros = {}, avisos = [];
  const op = {
    area: d.area, numero: txt(d.numero, LIMITE.numero), desenho: txt(d.desenho, LIMITE.desenho),
    posicao: txt(d.posicao, LIMITE.posicao), rev: txt(d.rev, LIMITE.rev), descricao: txt(d.descricao, LIMITE.descricao),
    qtd: numero(d.qtd), pesoUnit: numero(d.pesoUnit), pesoTotal: numero(d.pesoTotal)
  };
  if (!d.projetoId) erros.projeto = 'opm.eProjeto';
  if (AREAS.indexOf(op.area) < 0) erros.area = 'opm.eArea';
  if (!op.numero) erros.numero = 'opm.eNumero';
  if (!op.desenho) erros.desenho = 'opm.eDesenho';
  ['qtd', 'pesoUnit', 'pesoTotal'].forEach(function (k) {
    if (String(d[k] == null ? '' : d[k]).trim() && (op[k] == null || op[k] < 0)) erros[k] = 'opm.eNumeroInvalido';
  });
  // peso total vazio: quantidade × peso unitário
  if (op.pesoTotal == null && op.qtd != null && op.pesoUnit != null) op.pesoTotal = Math.round(op.qtd * op.pesoUnit * 1000) / 1000;

  const id = d.projetoId && op.area && op.desenho ? idOp(d.projetoId, op.area, op.desenho, op.posicao) : null;
  if (id && !editandoId && (ops || []).some(function (o) { return o.id === id; })) erros.desenho = 'opm.ePecaExiste';
  // na edição a peça (desenho/posição/área) não muda: muda o id
  if (editandoId && id && id !== editandoId) erros.desenho = 'opm.eMudouPeca';
  const mesmoNumero = (ops || []).some(function (o) { return o.numero === op.numero && o.id !== (editandoId || id); });
  if (op.numero && mesmoNumero) avisos.push('opm.aNumeroRepetido');
  return { ok: !Object.keys(erros).length, erros: erros, avisos: avisos, op: Object.assign({ id: editandoId || id }, op) };
}
