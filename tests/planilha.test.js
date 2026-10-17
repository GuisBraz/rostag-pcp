import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Planilha from '../js/dominio/planilha.js';

// Mesmo formato da planilha "CONTROLE DE AVANÇO": resumo no topo, grupos na
// linha 7, cabeçalho na 8, conjunto (sem OP) na 9 e peças a partir da 10.
function planilha(pecas) {
  const vazio = () => new Array(31).fill('');
  const linhas = [];
  for (let i = 0; i < 6; i++) linhas.push(vazio());
  linhas[0][2] = 'RESUMO DE AVANÇO USINAGEM';
  const grupos = vazio(); grupos[0] = 'GESTÃO DE PROJETO - COMMESSA'; grupos[19] = 'COMERCIAL';
  linhas.push(grupos);
  const cab = vazio();
  Object.assign(cab, { 0: 'N°', 2: 'DESENHO', 3: 'POSIÇÃO', 4: 'REV.', 5: 'DESCRIÇÃO DO ITEM', 6: 'QTE TOTAL', 7: 'PESO UNIT (KG)',
    8: 'PESO TOTAL (KG)', 16: 'N° PRODUTO (OP)', 17: 'N° OP CALD', 18: 'N° OP USINAGEM' });
  linhas.push(cab);
  const conj = vazio(); Object.assign(conj, { 0: '1', 2: '1609609', 5: 'PÓRTICO DE MARCAÇÃO DE TUBOS', 6: '1' });
  linhas.push(conj);
  pecas.forEach((p) => { const l = vazio(); Object.assign(l, p); linhas.push(l); });
  return linhas;
}
const suporte = { 0: '2', 2: '1609568', 3: '1', 4: '0', 5: 'SUPORTE', 6: '2', 7: '436,10', 8: '872,20', 16: '8000015633', 17: '02050301001', 18: '02052501001' };

test('acha o cabeçalho pelos nomes das colunas', () => {
  const cab = Planilha.acharCabecalho(planilha([]));
  assert.equal(cab.linha, 7);
  assert.equal(cab.cols.opCald, 17);
  assert.equal(cab.cols.opUsin, 18);
  assert.equal(cab.cols.desenho, 2);
});

test('peça com OP de caldeiraria e de usinagem vira duas OPs; o conjunto sem OP é ignorado', () => {
  const r = Planilha.lerOps(planilha([suporte]));
  assert.ok(r.ok);
  assert.equal(r.ops.length, 2);
  assert.equal(r.ignoradas, 1);
  const cald = r.ops.find((o) => o.area === 'caldeiraria');
  assert.equal(cald.numero, '02050301001');
  assert.equal(cald.qtd, 2);
  assert.equal(cald.pesoUnit, 436.1);
  assert.equal(cald.pesoTotal, 872.2);
  assert.equal(cald.linha, 10);
});

test('peça repetida na mesma área é recusada; OP sem desenho também', () => {
  const r = Planilha.lerOps(planilha([suporte, { ...suporte, 18: '' }, { 17: '999' }]));
  assert.equal(r.ops.length, 2);
  assert.equal(r.erros.length, 2);
  assert.equal(r.erros[0].motivo, 'pecaRepetida');
  assert.equal(r.erros[1].motivo, 'semDesenho');
});

test('mesmo nº de OP em peças diferentes só avisa', () => {
  const r = Planilha.lerOps(planilha([suporte, { ...suporte, 3: '2', 18: '' }]));
  assert.equal(r.ops.length, 3);
  assert.equal(r.avisos.length, 1);
});

test('sem as colunas de OP não reconhece a planilha', () => {
  assert.equal(Planilha.lerOps([['DESENHO', 'DESCRIÇÃO'], ['1', 'x']]).ok, false);
});

test('reenvio: novas entram, mudadas atualizam, iguais ficam', () => {
  const lidas = Planilha.lerOps(planilha([suporte])).ops;
  const idC = Planilha.idOp('p1', 'caldeiraria', '1609568', '1');
  const idU = Planilha.idOp('p1', 'usinagem', '1609568', '1');
  const existentes = {
    [idC]: { ...lidas[0], status: 'aprovada' },
    [idU]: { ...lidas[1], descricao: 'ANTIGA', status: 'aberta' }
  };
  const r = Planilha.comparar(lidas, existentes, 'p1');
  assert.equal(r.novas.length, 0);
  assert.equal(r.iguais.length, 1);
  assert.equal(r.atualizadas.length, 1);
  assert.deepEqual(r.atualizadas[0].campos, { descricao: 'SUPORTE' });
  const r2 = Planilha.comparar(lidas, {}, 'p1');
  assert.equal(r2.novas.length, 2);
});

test('números em português e inglês', () => {
  assert.equal(Planilha.numero('1.234,5'), 1234.5);
  assert.equal(Planilha.numero('872.2'), 872.2);
  assert.equal(Planilha.numero(''), null);
  assert.equal(Planilha.numero('-'), null);
});
