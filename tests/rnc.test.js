import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Rnc from '../js/dominio/rnc.js';
import * as Producao from '../js/dominio/producao.js';

const op = { id: 'o1', area: 'usinagem', numero: '4512', desenho: 'D-10', posicao: '3', rev: 'B', descricao: 'Eixo', qtd: 2, commessa: 'C-77' };

test('rascunho preenche o que a OP já tem e marca o setor da área', () => {
  const r = Rnc.rascunho(op, '2026-10-20', 'Ana');
  assert.equal(r.produto, 'Eixo');
  assert.equal(r.op, '4512');
  assert.equal(r.item, '3');
  assert.equal(r.qtd, '2');
  assert.equal(r.inspetor, 'Ana');
  assert.equal(r.data, '2026-10-20');
  assert.deepEqual(r.setor, { usinagem: true, caldeiraria: false, pintura: false, fornecedor: false, outros: false });
});

test('validar exige nº, descrição e inspetor; reinspeção exige inspetor e data', () => {
  const r = Rnc.rascunho(op, '2026-10-20', '');
  assert.deepEqual(Rnc.validar(r).faltando, ['numero', 'descricao', 'inspetor']);
  Object.assign(r, { numero: '001', descricao: 'furo fora', inspetor: 'Ana', reResultado: 'conforme' });
  assert.deepEqual(Rnc.validar(r).faltando, ['reInspetor', 'reData']);
  Object.assign(r, { reInspetor: 'Bia', reData: '2026-10-22' });
  assert.equal(Rnc.validar(r).ok, true);
  assert.equal(Rnc.validar(Object.assign({}, r, { numero: 'x'.repeat(31) })).ok, false);
});

test('efeito da reinspeção no destino da OP', () => {
  assert.deepEqual(Rnc.efeitoReinspecao({ reResultado: '' }), { opStatus: 'retrabalho', encerra: false });
  assert.deepEqual(Rnc.efeitoReinspecao({ reResultado: 'retrabalho' }), { opStatus: 'retrabalho', encerra: false });
  assert.deepEqual(Rnc.efeitoReinspecao({ reResultado: 'conforme' }), { opStatus: 'aprovada', encerra: true });
  assert.deepEqual(Rnc.efeitoReinspecao({ reResultado: 'desvio' }), { opStatus: 'desvio', encerra: true });
  assert.deepEqual(Rnc.efeitoReinspecao({ reResultado: 'nao_conforme' }), { opStatus: 'retrabalho', encerra: true });
  // nº de OP de retrabalho manda mais que o resultado marcado
  assert.deepEqual(Rnc.efeitoReinspecao({ reResultado: 'conforme', reOp: ' 4513 ' }), { opStatus: 'morta', criarOp: '4513', encerra: true });
});

test('próximo nº segue o maior já usado, com prefixo e zeros', () => {
  assert.equal(Rnc.proximoNumero([]), '001');
  assert.equal(Rnc.proximoNumero([{ numero: '009' }, { numero: '012' }, { numero: 'abc' }]), '013');
  assert.equal(Rnc.proximoNumero([{ numero: 'RNC-2026/041' }]), 'RNC-2026/042');
});

test('meses termina no mês pedido, do mais antigo ao atual', () => {
  assert.deepEqual(Rnc.meses('2026-02', 3), ['2025-12', '2026-01', '2026-02']);
});

test('indicadores do mês: finalizadas, RNCs, em aberto, retrabalho e mortas', () => {
  const ops = [
    { status: 'aprovada', criadoEm: '2026-09-01T10:00:00Z', finalizadoEm: '2026-10-05T10:00:00Z' },
    { status: 'desvio', criadoEm: '2026-09-01T10:00:00Z', retrabalhoDesde: '2026-10-02T10:00:00Z', finalizadoEm: '2026-10-09T10:00:00Z' },
    { status: 'retrabalho', criadoEm: '2026-10-01T10:00:00Z', retrabalhoDesde: '2026-10-03T10:00:00Z' },
    { status: 'rnc', criadoEm: '2026-10-01T10:00:00Z', retrabalhoDesde: '2026-10-04T10:00:00Z' },   // legado
    { status: 'aberta', criadoEm: '2026-10-10T10:00:00Z' },
    { status: 'morta', criadoEm: '2026-09-01T10:00:00Z', retrabalhoDesde: '2026-09-20T10:00:00Z', mortaEm: '2026-10-12T10:00:00Z' },
    { status: 'aberta', criadoEm: '2026-11-02T10:00:00Z' }   // ainda não existia
  ];
  const rncs = [{ criadoEm: '2026-10-02T10:00:00Z' }, { criadoEm: '2026-10-03T10:00:00Z' }, { criadoEm: '2026-09-20T10:00:00Z' }];
  const out = Rnc.indicadoresMes(ops, rncs, '2026-10', '2026-12-01T00:00:00Z');
  assert.deepEqual(out, { mes: '2026-10', aprovadas: 1, desvio: 1, rncs: 2, finalizadas: 2, mortas: 1, emAberto: 3, retrabalho: 2 });
  // setembro: as três criadas em setembro estavam abertas; a futura morta já estava em retrabalho
  const set = Rnc.indicadoresMes(ops, rncs, '2026-09', '2026-12-01T00:00:00Z');
  assert.equal(set.emAberto, 3);
  assert.equal(set.retrabalho, 1);
  assert.equal(set.rncs, 1);
  assert.equal(Rnc.taxaAprovacao(out), 50);
  assert.equal(Rnc.taxaAprovacao({ finalizadas: 0, rncs: 0 }), null);
});

test('estatísticas: retrabalho abre, desvio conta como aprovada, morta sai do total', () => {
  const s = Producao.estatisticas([
    { area: 'usinagem', status: 'aprovada' }, { area: 'usinagem', status: 'desvio' },
    { area: 'caldeiraria', status: 'rnc' }, { area: 'caldeiraria', status: 'aberta' }, { area: 'caldeiraria', status: 'morta' }
  ]);
  assert.equal(s.total, 4);
  assert.equal(s.aprovadas, 2);
  assert.equal(s.desvio, 1);
  assert.equal(s.retrabalho, 1);
  assert.equal(s.mortas, 1);
  assert.equal(s.pct, 50);
  assert.equal(Producao.emAberto({ status: 'rnc' }), true);
  assert.equal(Producao.finalizada({ status: 'desvio' }), true);
});
