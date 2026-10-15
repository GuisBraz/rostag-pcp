import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diferenca, mesclarChecklist } from '../js/dados/store.js';

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

/* ---------------- mesclagem do checklist (duas pessoas no mesmo projeto) */
function tarefa(t, extra) { return Object.assign({ t, dias: 1, done: false, doneAt: null, obs: '', obsEm: null }, extra); }
const lista8 = () => ['1', '2', '3', '4', '5', '6', '7', '8'].map((t) => tarefa(t));
function feitas(lista) { return lista.filter((i) => i.done).map((i) => i.t); }

test('mesclagem: cada um marca uma tarefa diferente e as duas ficam', () => {
  const base = lista8();
  const coord = copia(base); coord[5] = tarefa('6', { done: true, doneAt: '2026-10-15' });
  const plan = copia(base); plan[6] = tarefa('7', { done: true, doneAt: '2026-10-15' });
  // o coordenador gravou primeiro; o planejador mescla com o que está no servidor
  const final = mesclarChecklist(base, plan, coord);
  assert.deepEqual(feitas(final), ['6', '7']);
  assert.equal(final[5].doneAt, '2026-10-15');
});

test('mesclagem: sem mudança minha, fica o servidor; sem mudança do servidor, fica a minha', () => {
  const base = lista8(), outro = copia(base);
  outro[0].done = true;
  assert.deepEqual(mesclarChecklist(base, copia(base), outro), outro);
  assert.deepEqual(mesclarChecklist(base, outro, copia(base)), outro);
});

test('mesclagem: campos diferentes da mesma tarefa se somam (eu marco, o colega anota)', () => {
  const base = lista8();
  const meu = copia(base); meu[2].done = true; meu[2].doneAt = '2026-10-15';
  const atual = copia(base); atual[2].obs = 'falta peça'; atual[2].obsEm = '2026-10-14';
  const r = mesclarChecklist(base, meu, atual)[2];
  assert.deepEqual([r.done, r.doneAt, r.obs], [true, '2026-10-15', 'falta peça']);
});

test('mesclagem: desmarcar também é preservado', () => {
  const base = lista8(); base[3].done = true;
  const meu = copia(base); meu[3].done = false;
  const atual = copia(base); atual[4].done = true;
  assert.deepEqual(feitas(mesclarChecklist(base, meu, atual)), ['5']);
});

test('mesclagem: tarefa incluída por mim e apagada pelo colega', () => {
  const base = lista8();
  const meu = copia(base); meu.splice(2, 0, tarefa('nova'));
  const atual = copia(base); atual.splice(6, 1);                // colega apagou a "7"
  const r = mesclarChecklist(base, meu, atual).map((i) => i.t);
  assert.deepEqual(r, ['1', '2', 'nova', '3', '4', '5', '6', '8']);
});

test('mesclagem: tarefa apagada por mim some mesmo com mudança do colega em outra', () => {
  const base = lista8();
  const meu = copia(base); meu.splice(0, 1);
  const atual = copia(base); atual[7].done = true;
  const r = mesclarChecklist(base, meu, atual);
  assert.deepEqual(r.map((i) => i.t), ['2', '3', '4', '5', '6', '7', '8']);
  assert.deepEqual(feitas(r), ['8']);
});

test('diferença leva a versão de onde a edição partiu (base da mesclagem)', () => {
  const antes = { id: 'a', checklist: lista8() };
  const depois = copia(antes); depois.checklist[0].done = true;
  const [op] = diferenca([depois], base([antes]));
  assert.deepEqual(op.antes.checklist, antes.checklist);
});
