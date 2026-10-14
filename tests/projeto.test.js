import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefs } from '../js/nucleo/prefs.js';
import { hoje, addDias } from '../js/nucleo/fmt.js';
import * as Projeto from '../js/dominio/projeto.js';
import { CHECKLIST_PADRAO } from '../js/dominio/constantes.js';

prefs.idioma = 'pt';
const base = { commessa: '2026-001', descricao: 'Teste', pcpInicio: '2026-01-05', pcpFim: '2026-01-30', entrega: '2026-02-27' };
function com(extra) { return Object.assign({}, base, extra); }

test('status: marcado à mão vence a data; senão vem da entrega', () => {
  assert.equal(Projeto.status({ status: 'cancelado', entrega: '2000-01-01' }), 'cancelado');
  assert.equal(Projeto.status({ status: 'paralisado', entrega: '2000-01-01' }), 'paralisado');
  assert.equal(Projeto.status({ status: 'ativo', entrega: addDias(hoje(), -1) }), 'atrasado');
  assert.equal(Projeto.status({ status: 'ativo', entrega: hoje() }), 'andamento');
});

test('validar: obrigatórios, ordem das datas e commessa repetida', () => {
  assert.ok(Projeto.validar(base, [], null).ok);
  const sem = Projeto.validar(com({ descricao: '' }), [], null);
  assert.equal(sem.ok, false);
  assert.deepEqual(sem.campos, ['descricao']);
  assert.equal(Projeto.validar(com({ pcpFim: '2026-01-01' }), [], null).ok, false);
  assert.equal(Projeto.validar(com({ entrega: '2026-01-10' }), [], null).ok, false);
  assert.equal(Projeto.validar(com({ pcpInicio: '2026-02-31' }), [], null).ok, false);
  const existentes = [{ id: 'a', commessa: ' 2026-001 ' }];
  assert.equal(Projeto.validar(base, existentes, null).ok, false);
  assert.ok(Projeto.validar(base, existentes, 'a').ok, 'editando o próprio projeto não acusa duplicado');
});

test('validar: limite de tamanho dos textos', () => {
  assert.equal(Projeto.validar(com({ descricao: 'x'.repeat(200) }), [], null).ok, false);
});

test('migrarProjeto converte schema antigo (início + prazo)', () => {
  const p = Projeto.migrarProjeto({ id: 'old', commessa: 1, inicio: '2025-03-01', prazo: '2025-04-01', status: 'xyz', setor: 'A' });
  assert.equal(p.commessa, '1');
  assert.equal(p.pcpInicio, '2025-03-01');
  assert.equal(p.pcpFim, '2025-04-01');
  assert.equal(p.entrega, '2025-04-01');
  assert.equal(p.status, 'ativo');
  assert.ok(!('setor' in p) && !('inicio' in p) && !('prazo' in p));
});

test('migrarProjeto corrige datas fora de ordem e lixo', () => {
  const p = Projeto.migrarProjeto({ id: 'x', pcpInicio: '2026-05-10', pcpFim: '2026-05-01', entrega: 'ontem',
    checklist: [{ t: 'a', dias: 500, done: 1, doneAt: 'nunca' }], paralisacoes: [{ inicio: 'x' }, { inicio: '2026-05-02' }] });
  assert.equal(p.pcpFim, '2026-05-10');
  assert.equal(p.entrega, '2026-05-10');
  assert.equal(p.checklist[0].dias, 90);
  assert.equal(p.checklist[0].done, true);
  assert.equal(p.checklist[0].doneAt, null);
  assert.equal(p.paralisacoes.length, 1);
});

test('migrarProjeto troca id inválido por um novo', () => {
  assert.match(Projeto.migrarProjeto({ id: '../../x"' }).id, /^p_/);
});

test('cancelado no schema 3 ganha a paralisação que o fluxo atual exige', () => {
  const p = Projeto.migrarProjeto({ id: 'c', status: 'cancelado', canceladoEm: '2025-06-01', pcpInicio: '2025-01-01', entrega: '2025-07-01' });
  assert.equal(p.paralisacoes.length, 1);
  assert.equal(p.canceladoEm, '2025-06-01');
});

test('progresso, paralisação e ciclo', () => {
  assert.equal(Projeto.progresso({ checklist: [{ done: true }, { done: false }, { done: true }, { done: true }] }), 75);
  assert.equal(Projeto.diasParadoAtual({ paralisacoes: [{ inicio: addDias(hoje(), -4), fim: null }] }), 4);
  assert.equal(Projeto.ciclo({ dataSolicitacao: '2026-01-01', concluidoEm: '2026-01-11' }), 10);
});

test('checklist novo tem as tarefas padrão zeradas', () => {
  const c = Projeto.checklistNovo();
  assert.equal(c.length, CHECKLIST_PADRAO.length);
  assert.ok(c.every((i) => i.dias === 0 && !i.done));
});

test('migrar aceita lista crua e backup exportado', () => {
  assert.equal(Projeto.migrar([{ id: 'a' }]).length, 1);
  assert.equal(Projeto.migrar({ schema: 4, projetos: [{ id: 'a' }, { id: 'b' }] }).length, 2);
  assert.throws(() => Projeto.migrar({ nada: true }));
});
