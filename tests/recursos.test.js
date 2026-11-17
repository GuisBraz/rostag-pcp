import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/dominio/recursos.js';

const cfg = R.normalizar({ empresas: [{ id: 'yani', nome: 'YANI', qtd: { montagem: 3, solda: 2, acabamento: 1 } }] });
function op(id, etapas, extra) {
  return Object.assign({ id: id, qtd: 10, pesoTotal: 100, programacao: { terceirizadaId: 'yani', terceirizada: 'YANI', etapas: etapas, em: extra && extra.em || id,
    inicio: R.periodo(etapas).inicio, previsaoFim: R.periodo(etapas).fim, grupo: extra && extra.grupo || null } }, extra && extra.op);
}

test('padrões do cadastro: YANI, 3 recursos e segunda a sexta', () => {
  const c = R.normalizar({});
  assert.equal(c.empresas[0].nome, 'YANI');
  assert.deepEqual(c.tipos.map((t) => t.id), ['montagem', 'solda', 'acabamento']);
  assert.equal(R.diaUtil(c, '2026-11-16'), true);    // segunda
  assert.equal(R.diaUtil(c, '2026-11-21'), false);   // sábado
});

test('datas avulsas mandam no dia', () => {
  const c = R.normalizar({ extras: { '2026-11-21': true, '2026-11-20': false } });
  assert.equal(R.diaUtil(c, '2026-11-21'), true);
  assert.equal(R.diaUtil(c, '2026-11-20'), false);
  assert.deepEqual(R.diasUteis(c, '2026-11-19', '2026-11-23'), ['2026-11-19', '2026-11-21', '2026-11-23']);
});

test('conferência: não deixa passar do que a empresa tem', () => {
  const ops = [op('a', [{ t: 'montagem', q: 2, i: '2026-11-16', f: '2026-11-20' }])];
  const oc = R.ocupacao(cfg, R.alocacoes(ops));
  assert.equal(R.livres(cfg, oc, 'yani', 'montagem', '2026-11-16', '2026-11-20'), 1);
  assert.equal(R.conferir(cfg, oc, 'yani', [{ t: 'montagem', q: 1, i: '2026-11-18', f: '2026-11-19' }]).length, 0);
  const f = R.conferir(cfg, oc, 'yani', [{ t: 'montagem', q: 2, i: '2026-11-19', f: '2026-11-24' }]);
  assert.equal(f.length, 1);
  assert.deepEqual(f[0].dias, ['2026-11-19', '2026-11-20']);
});

test('escalonamento: a baixa libera a pessoa antes do fim', () => {
  const ops = [op('a', [{ t: 'montagem', q: 3, i: '2026-11-16', f: '2026-11-27', b: '2026-11-18' }])];
  const oc = R.ocupacao(cfg, R.alocacoes(ops));
  assert.equal(R.livres(cfg, oc, 'yani', 'montagem', '2026-11-19', '2026-11-20'), 3);
  assert.equal(R.livres(cfg, oc, 'yani', 'montagem', '2026-11-17', '2026-11-17'), 0);
});

test('OPs do mesmo grupo dividem a equipe (contam uma vez)', () => {
  const e = [{ t: 'solda', q: 2, i: '2026-11-16', f: '2026-11-17' }];
  const ops = [op('a', e, { grupo: 'g1' }), op('b', e, { grupo: 'g1' })];
  const oc = R.ocupacao(cfg, R.alocacoes(ops));
  assert.equal(oc.yani.solda['2026-11-16'], 2);
});

test('sem recurso: etapa com 0 pessoas, ou a última programada quando faltar gente', () => {
  const ops = [
    op('a', [{ t: 'acabamento', q: 1, i: '2026-11-16', f: '2026-11-18' }], { em: '1' }),
    op('b', [{ t: 'acabamento', q: 1, i: '2026-11-17', f: '2026-11-17' }], { em: '2' }),
    op('c', [{ t: 'montagem', q: 0, i: '2026-11-16', f: '2026-11-18' }], { em: '3' })
  ];
  const s = R.semRecurso(cfg, ops, '2026-11-16');
  assert.equal(!!s.a, false);
  assert.equal(s.b, true);
  assert.equal(s.c, true);
});

test('OP aprovada pelo CQ deixa de segurar o recurso', () => {
  const ops = [op('a', [{ t: 'montagem', q: 3, i: '2026-11-16', f: '2026-11-20' }], { op: { status: 'aprovada' } })];
  const oc = R.ocupacao(cfg, R.alocacoes(ops));
  assert.equal(R.livres(cfg, oc, 'yani', 'montagem', '2026-11-16', '2026-11-20'), 3);
});

test('carga por semana: peças e kg em cada semana que o período toca', () => {
  const sems = R.semanas('2026-11-17', 3);
  assert.equal(sems[0].inicio, '2026-11-16');
  const ops = [op('a', [{ t: 'montagem', q: 1, i: '2026-11-19', f: '2026-11-24' }])];
  const c = R.cargaSemanas(ops, sems);
  assert.deepEqual(c.yani.map((x) => x.pecas), [10, 10, 0]);
  assert.deepEqual(c.yani.map((x) => x.kg), [100, 100, 0]);
});

test('programação antiga (sem etapas) é reconhecida', () => {
  assert.equal(R.antiga({ programacao: { terceirizadaId: 'sofir', previsaoFim: '2026-11-20' } }), true);
  assert.equal(R.antiga(op('a', [{ t: 'montagem', q: 1, i: '2026-11-16', f: '2026-11-16' }])), false);
});
