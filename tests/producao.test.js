import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Producao from '../js/dominio/producao.js';
import * as Papeis from '../js/dominio/papeis.js';

const ops = [
  { area: 'caldeiraria', status: 'aprovada' }, { area: 'caldeiraria', status: 'rnc' },
  { area: 'usinagem', status: 'aprovada' }, { area: 'usinagem', status: 'aberta' }, { area: 'usinagem', status: 'aprovada' }
];

test('avanço em 3 números: geral, caldeiraria e usinagem (RNC conta como não aprovada)', () => {
  const s = Producao.estatisticas(ops);
  assert.equal(s.total, 5);
  assert.equal(s.aprovadas, 3);
  assert.equal(s.pct, 60);
  assert.equal(s.caldeiraria.pct, 50);
  assert.equal(s.usinagem.pct, 67);
  assert.equal(s.rnc, 1);
});

test('situação da produção: planejada, em produção, atrasada, concluída, sem data', () => {
  const p = { pcpFim: '2026-10-20', prodFim: '2026-10-30' };
  const abertas = Producao.estatisticas(ops);
  assert.equal(Producao.situacao(p, abertas, '2026-10-19'), 'planejada');
  assert.equal(Producao.situacao(p, abertas, '2026-10-20'), 'andamento');
  assert.equal(Producao.situacao(p, abertas, '2026-10-31'), 'atrasada');
  assert.equal(Producao.diasAtraso(p, '2026-11-02'), 3);
  const todas = Producao.estatisticas([{ area: 'usinagem', status: 'aprovada' }]);
  assert.equal(Producao.situacao(p, todas, '2026-11-05'), 'concluida');
  assert.equal(Producao.situacao({ pcpFim: '2026-10-20' }, abertas, '2026-10-25'), 'semData');
});

test('papéis: coordenador é gerente e "planejador" virou técnico', () => {
  assert.equal(Papeis.papelEfetivo('gp', true), 'gerente_pcp');
  assert.equal(Papeis.papelEfetivo('planejador', false), 'tecnico');
  assert.equal(Papeis.papelEfetivo('cq', false), 'cq');
  assert.equal(Papeis.papelEfetivo('qualquer', false), 'tecnico');
  assert.equal(Papeis.areaDoProgramador('prog_usinagem'), 'usinagem');
  assert.ok(Papeis.veProjetos('gp') && !Papeis.veProjetos('cq'));
  assert.ok(Papeis.sobePlanilha('tecnico') && !Papeis.sobePlanilha('gp'));
});
