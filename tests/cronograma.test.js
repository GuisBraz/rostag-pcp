import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prefs } from '../js/nucleo/prefs.js';
import * as Cronograma from '../js/dominio/cronograma.js';

function projeto(itens, extra) {
  return Object.assign({ id: 'p1', status: 'ativo', pcpInicio: '2026-01-05', pcpFim: '2026-01-30', entrega: '2026-02-27',
    paralisacoes: [], checklist: itens.map(function (d, i) { return { t: 'T' + i, dias: d, done: false, doneAt: null }; }) }, extra);
}

beforeEach(() => { prefs.fimDeSemana = 'nao'; prefs.alertaTarefa = 2; Cronograma.invalidar(); });

test('tarefas encadeadas pulam o fim de semana', () => {
  // 05/01/2026 é segunda. 3 dias + 3 dias: seg-qua, qui-seg (pula sáb/dom)
  const c = Cronograma.recalcular(projeto([3, 3]));
  assert.equal(c.itens[0].inicio, '2026-01-05');
  assert.equal(c.itens[0].fim, '2026-01-07');
  assert.equal(c.itens[1].inicio, '2026-01-08');
  assert.equal(c.itens[1].fim, '2026-01-12');
  assert.equal(c.fimPrevisto, '2026-01-12');
  assert.equal(c.duracaoTotal, 6);
});

test('com dias corridos, sábado e domingo contam', () => {
  prefs.fimDeSemana = 'sim';
  const c = Cronograma.recalcular(projeto([3, 3]));
  assert.equal(c.itens[1].fim, '2026-01-10');
});

test('duração 0 fecha no mesmo dia da tarefa anterior', () => {
  const c = Cronograma.recalcular(projeto([2, 0, 0, 1]));
  assert.equal(c.itens[1].fim, c.itens[0].fim);
  assert.equal(c.itens[2].fim, c.itens[0].fim);
  assert.equal(c.itens[3].inicio, '2026-01-07');
});

test('tarefa concluída usa a data real e empurra as seguintes', () => {
  const p = projeto([2, 2]);
  p.checklist[0].done = true;
  p.checklist[0].doneAt = '2026-01-09';
  const c = Cronograma.recalcular(p);
  assert.equal(c.itens[0].fim, '2026-01-09');
  assert.equal(c.itens[1].inicio, '2026-01-12');
});

test('dias parados não contam contra o cronograma', () => {
  const p = projeto([5], { paralisacoes: [{ inicio: '2026-01-06', fim: '2026-01-08', motivo: '' }] });
  const c = Cronograma.recalcular(p);
  // seg 05 conta; 06-08 parado; 09, 12, 13, 14 completam os 5 dias
  assert.equal(c.itens[0].fim, '2026-01-14');
});

test('estouro da janela do PCP', () => {
  const c = Cronograma.recalcular(projeto([20], { pcpFim: '2026-01-23' }));
  assert.ok(c.estouro > 0);
  assert.ok(c.fimPrevisto > '2026-01-23');
});

test('cache devolve o mesmo resultado e invalida', () => {
  const p = projeto([1]);
  const a = Cronograma.calcular(p);
  assert.equal(Cronograma.calcular(p), a);
  Cronograma.invalidar();
  assert.notEqual(Cronograma.calcular(p), a);
});
