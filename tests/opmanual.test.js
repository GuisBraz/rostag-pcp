import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as OpManual from '../js/dominio/opManual.js';
import * as Projeto from '../js/dominio/projeto.js';
import { CHECKLIST_PADRAO } from '../js/dominio/constantes.js';

const base = { projetoId: 'p1', area: 'caldeiraria', numero: '0205-01', desenho: 'D-10', posicao: '3', rev: 'A', descricao: ' Chapa  base ', qtd: '2', pesoUnit: '12,5', pesoTotal: '' };

test('OP manual: monta a OP com o mesmo id da planilha e calcula o peso total', () => {
  const v = OpManual.validar(base, [], null);
  assert.equal(v.ok, true);
  assert.equal(v.op.id, 'p1__caldeiraria__D-10__3');
  assert.equal(v.op.descricao, 'Chapa base');
  assert.equal(v.op.qtd, 2);
  assert.equal(v.op.pesoTotal, 25);
});

test('OP manual: campos obrigatórios, números e peça repetida', () => {
  const v = OpManual.validar({ projetoId: '', area: 'pintura', numero: '', desenho: '', qtd: 'abc' }, [], null);
  assert.deepEqual(Object.keys(v.erros).sort(), ['area', 'desenho', 'numero', 'projeto', 'qtd']);
  const existente = [{ id: 'p1__caldeiraria__D-10__3', numero: 'X' }];
  assert.equal(OpManual.validar(base, existente, null).erros.desenho, 'opm.ePecaExiste');
  // corrigindo a própria OP: tudo certo; mudar a peça não pode
  assert.equal(OpManual.validar(base, existente, 'p1__caldeiraria__D-10__3').ok, true);
  assert.equal(OpManual.validar(Object.assign({}, base, { desenho: 'D-11' }), existente, 'p1__caldeiraria__D-10__3').erros.desenho, 'opm.eMudouPeca');
  // nº repetido em outra OP é só aviso
  assert.deepEqual(OpManual.validar(base, [{ id: 'outra', numero: '0205-01' }], null).avisos, ['opm.aNumeroRepetido']);
});

test('checklist padrão: lista da equipe ou a de fábrica, normalizada', () => {
  assert.equal(Projeto.listaPadrao(null).length, CHECKLIST_PADRAO.length);
  const l = Projeto.listaPadrao([{ t: '  Receber   desenho ', dias: 3.4 }, { t: '' }, { t: 'Liberar', dias: 500 }]);
  assert.deepEqual(l, [{ t: 'Receber desenho', dias: 3 }, { t: 'Liberar', dias: 90 }]);
  const c = Projeto.checklistNovo([{ t: 'A', dias: 2 }]);
  assert.deepEqual(c, [{ t: 'A', dias: 2, done: false, doneAt: null, obs: '', obsEm: null }]);
});

test('checklist padrão: resumo das mudanças do editor', () => {
  const antes = [{ t: 'A', dias: 0 }, { t: 'B', dias: 0 }, { t: 'C', dias: 0 }];
  const depois = [{ t: 'C', dias: 0, orig: 2 }, { t: 'A2', dias: 1, orig: 0 }, { t: 'Nova', dias: 0, orig: null }];
  assert.deepEqual(Projeto.resumoMudancasPadrao(antes, depois),
    { total: 3, novas: 1, removidas: 1, renomeadas: 1, duracoes: 1, ordem: true, mudou: true });
  assert.equal(Projeto.resumoMudancasPadrao(antes, antes.map((x, i) => ({ ...x, orig: i }))).mudou, false);
});
