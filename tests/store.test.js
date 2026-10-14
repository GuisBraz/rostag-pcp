import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diferenca } from '../js/dados/store.js';

function base(lista) { return new Map(lista.map((p) => [p.id, JSON.stringify(p)])); }
function copia(v) { return JSON.parse(JSON.stringify(v)); }

test('sem mudança, nada é enviado', () => {
  const p = { id: 'a', commessa: '1', checklist: [] };
  assert.deepEqual(diferenca([copia(p)], base([p])), []);
});

test('só os campos alterados vão no update (o planejador só pode mudar o checklist)', () => {
  const antes = { id: 'a', commessa: '1', descricao: 'x', checklist: [{ t: 'a', done: false }] };
  const depois = copia(antes);
  depois.checklist[0].done = true;
  const ops = diferenca([depois], base([antes]));
  assert.equal(ops.length, 1);
  assert.equal(ops[0].tipo, 'atualizar');
  assert.deepEqual(Object.keys(ops[0].dados), ['checklist']);
});

test('projeto novo é criado e o que sumiu é apagado', () => {
  const a = { id: 'a' }, b = { id: 'b' };
  const ops = diferenca([a, { id: 'c', x: 1 }], base([a, b]));
  assert.deepEqual(ops.map((o) => o.tipo + ':' + o.id).sort(), ['apagar:b', 'criar:c']);
});

test('editar um projeto não reenvia os outros (não sobrescreve colegas)', () => {
  const lista = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 1 }];
  const local = copia(lista);
  local[1].v = 2;
  assert.deepEqual(diferenca(local, base(lista)).map((o) => o.id), ['b']);
});
