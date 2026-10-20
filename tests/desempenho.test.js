import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefs } from '../js/nucleo/prefs.js';
import * as Desempenho from '../js/dominio/desempenho.js';
import * as Projeto from '../js/dominio/projeto.js';

prefs.fimDeSemana = 'sim';   // conta todos os dias: datas fáceis de conferir
prefs.alertaTarefa = 2;

const H = '2026-10-20';
function proj(extra) {
  return { id: 'p', status: 'ativo', gpUid: 'g1', responsavelUid: 't1', pcpInicio: '2026-10-01', pcpFim: '2026-10-30',
    entrega: '2026-12-01', paralisacoes: [], reagendamentos: [], checklist: [], ...extra };
}

test('fim planejado ignora quando a atividade foi marcada', () => {
  const p = proj({ checklist: [{ t: 'a', dias: 3, done: true, doneAt: '2026-10-10' }, { t: 'b', dias: 2, done: false }] });
  assert.deepEqual(Desempenho.fimPlanejado(p), ['2026-10-03', '2026-10-05']);
});

test('técnico: no prazo, com atraso e atrasada agora', () => {
  const p = proj({ checklist: [
    { t: 'a', dias: 3, done: true, doneAt: '2026-10-02' },     // planejado 03 → no prazo
    { t: 'b', dias: 2, done: true, doneAt: '2026-10-09' },     // planejado 05 → atraso
    { t: 'c', dias: 1, done: false },                          // depois de b (09) → 10, já passou
    { t: 'd', dias: 30, done: false }                          // termina em novembro
  ] });
  const r = Desempenho.porTecnico([p], H).t1;
  assert.deepEqual(r, { noPrazo: 1, comAtraso: 1, atrasadasAgora: 1, abertas: 2, projetos: 1 });
});

test('técnico: projeto sem cronograma conta só como projeto; cancelado não conta', () => {
  const r = Desempenho.porTecnico([proj({ cronogramaDefinido: false }), proj({ status: 'cancelado', responsavelUid: 't2' })], H);
  assert.deepEqual(r.t1, { noPrazo: 0, comAtraso: 0, atrasadasAgora: 0, abertas: 0, projetos: 1 });
  assert.equal(r.t2, undefined);
});

test('GP: entregas no prazo × atraso, abertos, atrasados, reagendamentos e cancelados', () => {
  const r = Desempenho.porGp([
    proj({ status: 'concluido', concluidoEm: '2026-11-30' }),
    proj({ status: 'concluido', concluidoEm: '2026-12-05' }),
    proj({ entrega: '2026-10-01', reagendamentos: [{}, {}] }),
    proj({ status: 'paralisado' }),
    proj({ status: 'cancelado' })
  ], H).g1;
  assert.deepEqual(r, { entreguesNoPrazo: 1, entreguesAtrasados: 1, abertos: 2, atrasadosAgora: 1, reagendamentos: 2, cancelados: 1 });
  assert.equal(Desempenho.pctNoPrazo(1, 1), 50);
  assert.equal(Desempenho.pctNoPrazo(0, 0), null);
});

test('pedido à Gerência: só vale paralisar/cancelar em projeto aberto', () => {
  const ped = { tipo: 'paralisar', motivo: 'cliente pediu', porUid: 'g1', porNome: 'G', em: 'x' };
  assert.equal(Projeto.migrarProjeto(proj({ pedido: ped })).pedido.tipo, 'paralisar');
  assert.equal(Projeto.migrarProjeto(proj({ pedido: { ...ped, tipo: 'apagar' } })).pedido, null);
  assert.equal(Projeto.migrarProjeto(proj({ status: 'concluido', pedido: ped })).pedido, null);
  assert.equal(Projeto.migrarProjeto(proj({})).pedido, null);
});
