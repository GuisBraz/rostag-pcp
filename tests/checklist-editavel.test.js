import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redistribuir, validarProcessos, processosDe } from '../js/dominio/projeto.js';
import * as Cronograma from '../js/dominio/cronograma.js';

// janela de 10 dias úteis: 2026-11-02 (seg) a 2026-11-13 (sex)
const proj = (lista) => ({ pcpInicio: '2026-11-02', pcpFim: '2026-11-13', paralisacoes: [], status: 'ativo',
  checklist: lista.map(([t, dias, done]) => ({ t, dias, done: !!done, doneAt: done ? '2026-11-03' : null })) });
const fim = (p) => Cronograma.recalcular(p).fimPrevisto;

test('incluir uma tarefa: as não feitas encolhem e o fim continua no fim do PCP', () => {
  const p = proj([['A', 5], ['B', 5]]);
  p.checklist.push({ t: 'C', dias: 5, done: false });
  assert.equal(redistribuir(p).ok, true);
  assert.equal(p.checklist.reduce((a, i) => a + i.dias, 0), 10);
  assert.equal(fim(p), '2026-11-13');
});

test('apagar devolve o tempo; tarefa feita não muda', () => {
  const p = proj([['A', 2, true], ['B', 3], ['C', 3]]);
  p.checklist.splice(2, 1);
  redistribuir(p);
  assert.equal(p.checklist[0].dias, 2);
  assert.ok(fim(p) <= '2026-11-13');
});

test('remarcar uma tarefa: ela fica com a duração nova e as outras se ajustam; se não cabe, avisa', () => {
  const p = proj([['A', 3], ['B', 3], ['C', 4]]);
  p.checklist[0].dias = 6;
  assert.equal(redistribuir(p, 0).ok, true);
  assert.equal(p.checklist[0].dias, 6);
  assert.equal(p.checklist[1].dias + p.checklist[2].dias, 4);
  p.checklist[0].dias = 9;
  const r = redistribuir(p, 0);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'naoCabe');
});

test('processos: janela de produção sai do 1º início ao último fim; par incompleto e ordem errada barram', () => {
  const proc = { cald: { on: true, ini: '2026-12-01', fim: '2026-12-10' }, usi: { on: true, ini: '2026-12-05', fim: '2026-12-15' },
    pint: { on: false, ini: null, fim: null }, mont: { on: true, ini: null, fim: null } };
  const v = validarProcessos(proc, '2026-12-12');
  assert.equal(v.ok, true);
  assert.equal(v.prodInicio, '2026-12-01');
  assert.equal(v.prodFim, '2026-12-15');
  assert.equal(v.avisos.length, 1);    // usinagem termina depois da entrega
  assert.equal(validarProcessos({ ...proc, cald: { on: true, ini: '2026-12-01', fim: null } }).ok, false);
  assert.equal(validarProcessos({ ...proc, cald: { on: true, ini: '2026-12-10', fim: '2026-12-01' } }).ok, false);
  // projeto antigo: Cald + Usi com a janela de produção
  const velho = processosDe({ prodInicio: '2026-11-01', prodFim: '2026-11-20' });
  assert.equal(velho.cald.on && velho.usi.on && !velho.pint.on, true);
  assert.equal(velho.usi.fim, '2026-11-20');
});

import * as Prog from '../js/dominio/programacao.js';
test('carga máquina: operação finalizada sai da fila ativa e não volta para "aguardando"; registro velho é enxugado', () => {
  const o = { id: 'o1', area: 'usinagem', status: 'aberta', numero: '02100001001', projetoId: 'p', operacoes: [{ setor: 'TORNO', horas: 2 }, { setor: 'FRESA', horas: 3 }] };
  const m = { id: 'm1', nome: 'Taunos', area: 'usinagem', ativa: true, tipo: 'Torno', fila: [{ opId: 'o1', n: 0, horas: 2, feita: '2026-11-20T10:00' }] };
  const ag = Prog.agendarTudo([m], { o1: o }, {}, {}, '2026-11-23T08:00');
  assert.equal(ag.m1[0].concluida, true);
  // a operação 0 já está na fila (feita): não é oferecida de novo na máquina dela
  assert.equal(Prog.aguardandoNaMaquina(m, [o], [m], {}, 'usinagem').some((x) => x.operacao.n === 0), false);
  // OP encerrada pelo CQ: o registro antigo sai; o recente fica
  const aprovada = { ...o, status: 'aprovada', finalizadoEm: '2026-10-01T10:00' };
  assert.equal(Prog.enxugarFila([{ opId: 'o1', n: 0 }], { o1: aprovada }, '2026-10-24').length, 0);
  assert.equal(Prog.enxugarFila([{ opId: 'o1', n: 0, feita: '2026-11-20T10:00' }], { o1: aprovada }, '2026-10-24').length, 1);
  assert.equal(Prog.enxugarFila(m.fila, { o1: o }, '2026-12-31').length, 1);   // OP aberta: o registro fica
});
