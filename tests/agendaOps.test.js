import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../js/dominio/programacao.js';

const MAQS = () => [
  { id: 'f', nome: 'Forest', tipo: 'Mandrilhadora', ativa: true, horasDia: 1, fila: [] },
  { id: 's', nome: 'San Rocco', tipo: 'Mandrilhadora', ativa: true, horasDia: 1, fila: [] },
  { id: 'm', nome: 'M2000', tipo: 'Centro', ativa: true, horasDia: 1, fila: [] }
];
const OP = { id: 'op1', numero: '020531', area: 'usinagem', status: 'aberta', projetoId: 'p', operacoes: [
  { setor: 'FOREST', horas: 4 }, { setor: 'AJUSTADOR', horas: 1 }, { setor: 'SAN ROCCO', horas: 6 }, { setor: 'M2000', horas: 8 }] };
const OUTRA = { id: 'op2', numero: '020599', area: 'usinagem', status: 'aberta', projetoId: 'p', operacoes: [{ setor: 'SAN ROCCO', horas: 10 }] };
const OPS = { op1: OP, op2: OUTRA };
const PROJ = { p: { id: 'p', prodFim: '2026-11-20' } };
const AGORA = '2026-11-19T06:00';   // quinta, 06:00 (usinagem: 06–23)

test('operações de máquina e a última da OP (ajustador não é máquina)', () => {
  assert.deepEqual(P.opsDeMaquina(OP, MAQS(), {}).map((x) => x.n + x.maquinaId), ['0f', '2s', '3m']);
  assert.equal(P.ultimaOperacao(OP, MAQS(), {}), 3);
});

test('programar a OP inteira: cada operação começa quando a anterior termina', () => {
  const ms = MAQS(); ms[0].fila = [{ opId: 'op1', n: 0, horas: null, inicio: AGORA }];
  const r = P.encadear(ms, OPS, PROJ, {}, AGORA, 'op1', 0);
  assert.deepEqual(r.mudadas.sort(), ['m', 's']);
  assert.equal(r.avisos.length, 0);
  const ag = P.agendarTudo(r.maquinas, OPS, PROJ, {}, AGORA);
  assert.equal(ag.f[0].fimDt, '2026-11-19T10:00');
  assert.equal(ag.s[0].inicioDt, '2026-11-19T10:00');
  assert.equal(ag.m[0].inicioDt, '2026-11-19T16:00');
  // atraso só na última operação (M2000), se passar do prazo
  assert.equal(ag.f[0].atraso, false);
  assert.equal(ag.m[0].ultima, true);
});

test('máquina seguinte ocupada: vai para o fim da fila e avisa, sem empurrar', () => {
  const ms = MAQS();
  ms[0].fila = [{ opId: 'op1', n: 0, horas: null, inicio: AGORA }];
  ms[1].fila = [{ opId: 'op2', n: 0, horas: null, inicio: AGORA }];   // San Rocco ocupada 06–16
  const r = P.encadear(ms, OPS, PROJ, {}, AGORA, 'op1', 0);
  assert.equal(r.avisos.length, 1);
  assert.deepEqual(r.avisos[0].ocupadas, ['020599']);
  const s = r.maquinas.find((m) => m.id === 's');
  assert.equal(s.fila[0].opId, 'op2');
  assert.equal(s.fila[1].opId, 'op1');
});

test('❄ congelada: as horas param durante a parada e a fila de trás é empurrada', () => {
  const ms = MAQS();
  ms[0].fila = [{ opId: 'op1', n: 0, horas: null, inicio: AGORA, congelada: { desde: '2026-11-19T07:00', ate: '2026-11-19T09:00', motivo: 'x' } },
    { opId: 'op2', n: null, horas: 2, inicio: null }];
  const ag = P.agendarTudo(ms, OPS, PROJ, {}, AGORA);
  assert.equal(ag.f[0].fimDt, '2026-11-19T12:00');   // 4 h + 2 h parada
  assert.equal(ag.f[1].inicioDt, '2026-11-19T12:00');
});

test('já feito: horas de trabalho entre dois instantes, sem as paradas', () => {
  assert.equal(P.horasTrabalhadas({}, '2026-11-19T06:00', '2026-11-19T08:30'), 2.5);
  const corte = { area: 'caldeiraria' };
  assert.equal(P.horasTrabalhadas(corte, '2026-11-19T16:00', '2026-11-20T08:00'), 2);   // 16–17 + 07–08
});

test('mandar reprogramar: as seguintes vão para o fim, sem início, marcadas', () => {
  const ms = MAQS();
  ms[1].fila = [{ opId: 'op1', n: 2, horas: null, inicio: '2026-11-19T10:00' }, { opId: 'op2', n: 0, horas: null, inicio: null }];
  const r = P.mandarReprogramar(ms, 'op1', 0, 'tirada');
  const s = r.maquinas.find((m) => m.id === 's');
  assert.deepEqual(s.fila.map((f) => f.opId), ['op2', 'op1']);
  assert.equal(s.fila[1].reprogramar, 'tirada');
  assert.equal(s.fila[1].inicio, null);
  assert.equal(P.liberarReprogramar(r.maquinas, 'op1').maquinas.find((m) => m.id === 's').fila[1].reprogramar, null);
});

test('operação dividida: a seguinte espera a parte que termina por último', () => {
  const ms = MAQS();
  ms[0].fila = [{ opId: 'op1', n: 0, horas: 1, inicio: AGORA, parte: { pecas: 1, total: 4 } }];
  ms[1].fila = [{ opId: 'op1', n: 0, horas: 3, inicio: AGORA, parte: { pecas: 3, total: 4 } }];
  ms[2].fila = [{ opId: 'op1', n: 3, horas: null, inicio: null }];
  const ag = P.agendarTudo(ms, OPS, PROJ, {}, AGORA);
  assert.equal(ag.m[0].inicioDt, '2026-11-19T09:00');
});
