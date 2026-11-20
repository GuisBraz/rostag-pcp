import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcular } from '../js/dominio/andamento.js';

const feito = (n, de) => Array.from({ length: de }, (_, i) => ({ t: 't' + i, done: i < n }));
const proj = (extra) => ({ commessa: '2026-039', entrega: '2027-01-20', prodInicio: '2026-11-01', prodFim: '2026-12-01', status: 'ativo', checklist: feito(10, 10), ...extra });
const op = (status, qtd, extra) => ({ area: 'caldeiraria', status, qtd, ...extra });

test('andamento geral: PCP 20% + Fábrica 80%', () => {
  const ops = [op('aprovada', 5), op('aberta', 18)];
  const a = calcular(proj(), ops, '2026-11-05');
  assert.equal(a.pcp, 100);
  assert.equal(a.fabrica, 22);
  assert.equal(a.geral, Math.round(20 + 0.8 * 22));
  assert.equal(a.fase, 'fabricacao');
});

test('sem OPs: conta só o PCP e a fase diz o que falta', () => {
  assert.equal(calcular(proj(), [], '2026-11-05').geral, 20);
  assert.equal(calcular(proj(), [], '2026-11-05').fase, 'aguardandoOps');
  assert.equal(calcular(proj({ checklist: feito(5, 10) }), [], '2026-11-05').fase, 'pcp');
  assert.equal(calcular(proj({ checklist: feito(5, 10) }), [], '2026-11-05').fabrica, null);
});

test('fases depois do CQ: acabamento (pintura etc.) e pronto para entrega', () => {
  assert.equal(calcular(proj(), [op('aprovada', 2, { marcas: { pintura: true } })]).fase, 'acabamento');
  assert.equal(calcular(proj(), [op('aprovada', 2, { encerradaEm: 'x' })]).fase, 'pronto');
  assert.equal(calcular(proj({ status: 'concluido' }), []).fase, 'entregue');
  assert.equal(calcular(proj({ status: 'paralisado' }), []).fase, 'paralisado');
});

test('risco: a fábrica atrás do tempo que já passou', () => {
  const ops = [op('aprovada', 1), op('aberta', 9)];                       // 10% feito
  assert.equal(calcular(proj(), ops, '2026-11-04').risco, null);           // 10% do tempo
  assert.equal(calcular(proj(), ops, '2026-11-09').risco, 'atencao');      // ~27% do tempo
  assert.equal(calcular(proj(), ops, '2026-11-20').risco, 'atraso');       // ~63% do tempo
});
