import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Carga from '../js/dominio/carga.js';

// 19/10/2026 é segunda-feira
const H = '2026-10-19';
const sems = Carga.semanas(4, H);
const proj = (extra) => Object.assign({ id: 'p1', status: 'ativo', pcpInicio: '2026-10-01', pcpFim: '2026-10-19',
  prodFim: '2026-10-30', entrega: '2026-12-01', paralisacoes: [], checklist: [] }, extra);

test('semanas começam na segunda e duram 7 dias', () => {
  assert.deepEqual(sems[0], { inicio: '2026-10-19', fim: '2026-10-25' });
  assert.deepEqual(sems[1], { inicio: '2026-10-26', fim: '2026-11-01' });
  assert.equal(Carga.semanas(2, '2026-10-22')[0].inicio, '2026-10-19');
});

test('distribui pelos dias úteis da janela restante (10 dias úteis = 2 semanas)', () => {
  const d = Carga.distribuir(100, Carga.janelaRestante(proj(), H), sems);
  assert.deepEqual(d.porSemana.map(Math.round), [50, 50, 0, 0]);
  assert.equal(d.depois, 0);
});

test('janela vencida cai toda na semana atual; sem datas não entra na conta', () => {
  const vencida = Carga.janelaRestante(proj({ prodFim: '2026-10-10' }), H);
  assert.deepEqual(Carga.distribuir(30, vencida, sems).porSemana, [30, 0, 0, 0]);
  assert.equal(Carga.janelaRestante(proj({ prodFim: null }), H), null);
});

test('carga máquina: horas da OP aberta na máquina escolhida x capacidade horasDia × 5', () => {
  const maquinas = [{ id: 'm1', nome: 'Torno', horasDia: 8 }, { id: 'm2', nome: 'Fresa', horasDia: 4 }];
  const ops = [
    { area: 'usinagem', projetoId: 'p1', status: 'aberta', maquinaId: 'm1', horasPrevistas: 20 },
    { area: 'usinagem', projetoId: 'p1', status: 'aprovada', maquinaId: 'm1', horasPrevistas: 99 },
    { area: 'usinagem', projetoId: 'p1', status: 'aberta' },
    { area: 'usinagem', projetoId: 'p1', status: 'aberta', maquinaId: 'm2' },
    { area: 'caldeiraria', projetoId: 'p1', status: 'aberta', maquinaId: 'm1', horasPrevistas: 50 }
  ];
  const r = Carga.cargaMaquinas(ops, [proj()], maquinas, sems, H);
  assert.deepEqual(r.linhas[0].porSemana.map(Math.round), [10, 10, 0, 0]);
  assert.equal(r.linhas[0].capacidade, 40);
  assert.equal(r.linhas[1].horas, 0);
  assert.equal(r.resumo.semMaquina, 1);
  assert.equal(r.resumo.semHoras, 1);
});

test('carga fábrica: kg de caldeiraria aberta; projeto parado não conta', () => {
  const ops = [
    { area: 'caldeiraria', projetoId: 'p1', status: 'aberta', pesoTotal: 1000 },
    { area: 'caldeiraria', projetoId: 'p2', status: 'aberta', pesoTotal: 500 },
    { area: 'caldeiraria', projetoId: 'p1', status: 'rnc', pesoTotal: 700 }
  ];
  const r = Carga.cargaFabrica(ops, [proj(), proj({ id: 'p2', status: 'paralisado' })], 800, sems, H);
  assert.deepEqual(r.porSemana.map(Math.round), [500, 500, 0, 0]);
  assert.equal(r.total, 1000);
  assert.equal(Carga.ocupacao(r.porSemana[0], r.capacidade), 63);
  assert.equal(Carga.faixa(63), 'ok');
  assert.equal(Carga.faixa(90), 'alta');
  assert.equal(Carga.faixa(120), 'sobrecarga');
});
