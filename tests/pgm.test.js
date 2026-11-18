import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../js/dominio/pgm.js';
import * as Prog from '../js/dominio/programacao.js';

// itens {x, y, s} como o leitor de PDF entrega (linhas reais de um PGM do Plasma)
function pagina(linhas) {
  const it = [];
  linhas.forEach((partes, y) => partes.forEach((s, x) => it.push({ x: x * 50, y: y * 20, s })));
  return [it];
}
const PLASMA = pagina([
  ['CH 1/2" ASTM A36', 'Quantidade', '2'], ['Ref'], ['Trabalho', 'OM 5056-JOB000142'],
  ['CNC', '0X0989', '4000', 'x', '1500', 'x', '12.7', '26/10/2026'], ['Commessa', '2025-016', '08:40:05.00'],
  ['Máquina', 'White Martins ATC3 PLASMA HPR130XD', 'Peso', '601.98', 'kg'], ['Material', 'A-36', 'X', '3899'],
  ['Tempo total', '00:22:01.36', 'Y', '1429']
]);

test('lê o PGM: nº, máquina, tempo × chapas, chapa, peso, commessa', () => {
  const r = P.lerPgm(PLASMA, 'PGM 0X0989.pdf');
  assert.equal(r.ok, true);
  assert.equal(r.numero, '0X0989');
  assert.equal(r.maquina, 'plasma');
  assert.equal(r.tempoMin, 22.02);
  assert.equal(r.quantidade, 2);
  assert.equal(r.horas, Math.round(22.02 * 2 / 60 * 1000) / 1000);
  assert.equal(r.chapa, 'CH 1/2" ASTM A36');
  assert.equal(r.dimensoes, '4000 x 1500 x 12.7');
  assert.equal(r.peso, 601.98);
  assert.equal(r.commessa, '2025-016');
  assert.equal(r.trabalho, 'OM 5056-JOB000142');
});

test('oxicorte pelo nome; sem nº nem tempo não grava', () => {
  assert.equal(P.maquinaDoTexto('White Martins OXICORTE XYZ'), 'oxicorte');
  assert.equal(P.daMaquina({ maquina: 'oxicorte' }, { nome: 'Oxicorte', tipo: 'Corte' }), true);
  assert.equal(P.daMaquina({ maquina: 'plasma' }, { nome: 'Oxicorte' }), false);
  assert.equal(P.lerPgm(pagina([['Trabalho', 'x']]), 'sem.pdf').ok, false);
});

test('situação do PGM e "OP" para a fila', () => {
  assert.equal(P.situacao({}, false), 'aguardando');
  assert.equal(P.situacao({}, true), 'fila');
  assert.equal(P.situacao({ situacao: 'cortando' }, true), 'cortando');
  const o = P.comoOp({ id: 'p1_0X0989', numero: '0X0989', horas: 1.5, situacao: 'cortado', cortadoEm: '2026-11-18' });
  assert.equal(o.id, 'pgm:p1_0X0989');
  assert.equal(P.ehPgm(o.id), true);
  assert.equal(Prog.situacao(o, true), 'encerrada');
});

test('turno do corte: seg–sex 07–17; extensão até 22 na máquina ou na data; usinagem igual', () => {
  const corte = { area: 'caldeiraria' };
  assert.deepEqual(Prog.janelaMaquina(corte, '2026-11-18'), [420, 1020]);
  assert.equal(Prog.janelaMaquina(corte, '2026-11-21'), null);   // sábado
  assert.deepEqual(Prog.janelaMaquina({ area: 'caldeiraria', extensao: true }, '2026-11-18'), [420, 1320]);
  assert.deepEqual(Prog.janelaMaquina({ area: 'caldeiraria', extras: { '2026-11-18': 'extensao' } }, '2026-11-18'), [420, 1320]);
  assert.equal(Prog.janelaMaquina({ area: 'caldeiraria', extras: { '2026-11-18': 'folga' } }, '2026-11-18'), null);
  assert.deepEqual(Prog.janelaMaquina({}, '2026-11-21'), [420, 840]);   // usinagem: sábado 07–14
  // 4 h a partir das 15:00 no corte: 2 h hoje (até 17:00) + 2 h amanhã (07:00–09:00)
  assert.equal(Prog.fimPrevisto('2026-11-18T15:00', 4, corte), '2026-11-19T09:00');
  assert.equal(Prog.fimPrevisto('2026-11-18T15:00', 4, { area: 'caldeiraria', extensao: true }), '2026-11-18T19:00');
});
