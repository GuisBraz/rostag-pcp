import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Semana from '../js/dominio/semana.js';

test('a semana começa na segunda', () => {
  assert.equal(Semana.inicioSemana('2026-10-19'), '2026-10-19');   // segunda
  assert.equal(Semana.inicioSemana('2026-10-21'), '2026-10-19');   // quarta
  assert.equal(Semana.inicioSemana('2026-10-25'), '2026-10-19');   // domingo ainda é a mesma semana
  assert.equal(Semana.inicioSemana('2026-10-26'), '2026-10-26');   // próxima segunda vira
});

test('notificação da semana passada expira na segunda', () => {
  const domingo = new Date(2026, 9, 18, 22, 0).toISOString();
  const segunda = new Date(2026, 9, 19, 8, 0).toISOString();
  assert.equal(Semana.daSemana(domingo, '2026-10-21'), false);
  assert.equal(Semana.daSemana(segunda, '2026-10-21'), true);
  assert.equal(Semana.daSemana(null, '2026-10-21'), false);
});

test('chave do alerta muda a cada semana (o alerta volta como não lido)', () => {
  const a = Semana.chaveAlerta('2026-10-19', 'E1', 'tarefa-atrasada:p1');
  const b = Semana.chaveAlerta('2026-10-26', 'E1', 'tarefa-atrasada:p1');
  assert.notEqual(a, b);
  assert.ok(!a.includes('/'));
});
