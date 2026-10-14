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
