import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefs } from '../js/nucleo/prefs.js';
import { hoje, addDias } from '../js/nucleo/fmt.js';
import * as Alertas from '../js/dominio/alertas.js';
import * as Serie from '../js/dominio/serie.js';

prefs.idioma = 'pt';
prefs.alerta = 10;
prefs.lidas = {};

function proj(extra) {
  const h = hoje();
  return Object.assign({ id: 'p', commessa: 'C-1', status: 'ativo', pcpInicio: addDias(h, -30), pcpFim: addDias(h, 30),
    entrega: addDias(h, 60), paralisacoes: [], checklist: [] }, extra);
}

test('entrega vencida gera alerta; perto do prazo gera aviso', () => {
  const ids = Alertas.gerar([
    proj({ id: 'a', entrega: addDias(hoje(), -2), pcpFim: addDias(hoje(), -2) }),
    proj({ id: 'b', entrega: addDias(hoje(), 3) })
  ]).map((n) => n.id);
  assert.ok(ids.includes('entrega-atrasada:a'));
  assert.ok(ids.includes('entrega-chegando:b'));
});

test('projeto concluído não gera alerta', () => {
  assert.equal(Alertas.gerar([proj({ status: 'concluido', concluidoEm: hoje(), entrega: addDias(hoje(), -5) })]).length, 0);
});

test('lidas são marcadas e podadas', () => {
  prefs.lidas = { 'entrega-atrasada:a': true, 'velho:x': true };
  const lista = Alertas.gerar([proj({ id: 'a', entrega: addDias(hoje(), -1), pcpFim: addDias(hoje(), -1) })]);
  assert.equal(lista.find((n) => n.id === 'entrega-atrasada:a').lida, true);
  Alertas.podarLidas(lista);
  assert.deepEqual(Object.keys(prefs.lidas), ['entrega-atrasada:a']);
});

test('cada cargo recebe só os alertas combinados', () => {
  const h = hoje();
  const p = proj({ id: 'a', gpUid: 'g', responsavelUid: 't', entrega: addDias(h, -1), pcpFim: addDias(h, -1) });
  const tipos = (ctx) => Alertas.gerar([p], ctx).map((n) => n.tipo);
  assert.ok(tipos({ papel: 'gerente_pcp', uid: 'm' }).includes('entrega-atrasada'));
  assert.ok(tipos({ papel: 'gp', uid: 'g' }).includes('entrega-atrasada'));
  assert.ok(!tipos({ papel: 'tecnico', uid: 't' }).includes('entrega-atrasada'), 'entrega atrasada não vai para o técnico');
  assert.ok(tipos({ papel: 'gp', uid: 'g' }).includes('pcp-estourado'));
  assert.equal(tipos({ papel: 'gp', uid: 'outro' }).length, 0, 'GP de outro projeto não recebe');
  assert.equal(tipos({ papel: 'cq', uid: 'q' }).length, 0);
});

test('produção atrasada e aguardando cronograma', () => {
  const h = hoje();
  const p = proj({ id: 'b', gpUid: 'g', pcpInicio: addDias(h, -20), pcpFim: addDias(h, -10), prodFim: addDias(h, -2), entrega: addDias(h, 30),
    checklist: [{ t: 'x', dias: 1, done: true, doneAt: addDias(h, -15) }] });
  const ops = [{ projetoId: 'b', area: 'usinagem', status: 'aberta' }];
  const tipos = Alertas.gerar([p], { papel: 'gerente_pcp', uid: 'm', ops }).map((n) => n.tipo);
  assert.ok(tipos.includes('prod-atrasada'));
  assert.ok(tipos.includes('pcp-concluido'));
  const novo = { id: 'c', commessa: 'C-2', status: 'ativo', cronogramaDefinido: false, entrega: addDias(h, 30), paralisacoes: [], checklist: [] };
  const t2 = Alertas.gerar([novo], { papel: 'gerente_pcp', uid: 'm' }).map((n) => n.tipo);
  assert.deepEqual(t2, ['aguardando']);
});

test('pontualidade separa no prazo e atrasado por mês', () => {
  const lista = [
    { concluidoEm: '2026-03-10', entrega: '2026-03-15' },
    { concluidoEm: '2026-03-20', entrega: '2026-03-15' },
    { concluidoEm: '2026-04-01', entrega: '2026-04-01' }
  ];
  const d = Serie.pontualidade(lista, 2026, [3, 4]);
  assert.deepEqual(d.noPrazo, [1, 1]);
  assert.deepEqual(d.atrasado, [1, 0]);
});
