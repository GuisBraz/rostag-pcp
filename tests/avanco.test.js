import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Avanco from '../js/dominio/avanco.js';
import * as Planilha from '../js/dominio/planilha.js';

// Planilha de avanço no mesmo layout da real (dados fictícios).
const CAB = ['N°', '', 'DESENHO', 'POSIÇÃO', 'REV.', 'DESCRIÇÃO DO ITEM', 'QTE TOTAL', 'PESO UNIT (KG)', 'PESO TOTAL (KG)', 'COMERCIAL',
  '🔨 CALD', '⚙️ USINAGEM', '🎨 PINTURA', 'OXIDAÇÃO NEGRA', 'SERVIÇO EXT', '🔥 TTAT', 'N° PRODUTO (OP)', 'N° OP CALD', 'N° OP USINAGEM',
  'SC/Item', 'PC/ Item', 'Prev. Entrega', 'Fornecedor', 'MONT', 'SOLD', 'ACAB', 'PINTURA', null, 'AVANÇO TOTAL', 'Avanço Usi(%)', 'observações'];
function linha(vals) { const l = new Array(CAB.length).fill(null); Object.keys(vals).forEach(function (k) { l[CAB.indexOf(k)] = vals[k]; }); return l; }
function matriz() {
  const topo = [
    [null, null, 'RESUMO DE AVANÇO USINAGEM', null, null, null, 'RESUMO DE AVANÇO CALDEIRARIA'],
    [null, null, 'QTD - PEÇAS', null, null, 0, 'QTD - PEÇAS', null, null, 0],
    [null, null, 'QTD - AVANÇO', null, null, null, 'QTD - AVANÇO', null, null, null, null, 'OP PINTURA', '8000000099'],
    [null, null, null, null, null, null, 'Avanço Cald'],
    [null, null, null, null, null, null, 'Avanço Solda'],
    [null, null, null, null, null, null, 'Avanço Acab'],
    ['GESTÃO DE PROJETO - COMMESSA']
  ];
  return topo.concat([CAB,
    linha({ 'N°': 1, 'DESENHO': '9000001', 'DESCRIÇÃO DO ITEM': 'CONJUNTO TESTE', 'QTE TOTAL': 1 }),
    linha({ 'N°': 2, 'DESENHO': '9000002', 'POSIÇÃO': '1', 'DESCRIÇÃO DO ITEM': 'SUPORTE', 'QTE TOTAL': 5, 'PESO UNIT (KG)': 10, '🔨 CALD': '🔨',
      '⚙️ USINAGEM': '⚙️', '🎨 PINTURA': '🎨', 'N° PRODUTO (OP)': '8000000001', 'N° OP CALD': '09990101001', 'N° OP USINAGEM': '09990201001', 'observações': 'VER CROQUI' }),
    linha({ 'N°': 3, 'DESENHO': '9000003', 'POSIÇÃO': '1.1', 'DESCRIÇÃO DO ITEM': 'EIXO', 'QTE TOTAL': 2, '⚙️ USINAGEM': '⚙️', '🔥 TTAT': '🔥',
      'N° OP USINAGEM': '09990301001' }),
    linha({ 'N°': 4, 'POSIÇÃO': '2', 'DESCRIÇÃO DO ITEM': 'PARAFUSO M10', 'QTE TOTAL': 8, 'COMERCIAL': 'X' }),
    linha({ 'Avanço Usi(%)': '-' }), linha({ 'Avanço Usi(%)': '-' })
  ]);
}
const merges = [{ s: { r: 1, c: 2 }, e: { r: 1, c: 4 } }, { s: { r: 1, c: 6 }, e: { r: 1, c: 8 } },
  { s: { r: 2, c: 2 }, e: { r: 2, c: 4 } }, { s: { r: 2, c: 6 }, e: { r: 2, c: 8 } },
  { s: { r: 3, c: 6 }, e: { r: 3, c: 8 } }, { s: { r: 4, c: 6 }, e: { r: 4, c: 8 } }, { s: { r: 5, c: 6 }, e: { r: 5, c: 8 } }];

test('valor da célula: número com zero à esquerda fica texto; erro e vazio somem', () => {
  assert.equal(Avanco.valorCelula({ t: 'n', v: 9990101001, w: '09990101001' }), '09990101001');
  assert.equal(Avanco.valorCelula({ t: 'n', v: 436.1, w: '436.10' }), 436.1);
  assert.equal(Avanco.valorCelula({ t: 'e', v: 7, w: '#DIV/0!' }), null);
  assert.equal(Avanco.valorCelula({ t: 's', v: '  ' }), null);
  assert.equal(Avanco.valorCelula(undefined), null);
});

test('enxugar corta o que vem depois do último item e guarda sem lista dentro de lista', () => {
  const m = Avanco.enxugar(matriz());
  assert.equal(m.length, 12);
  assert.deepEqual(Avanco.daGravacao(Avanco.paraGravar(m)), m);
  assert.ok(Avanco.paraGravar(m).every(function (l) { return Array.isArray(l.c); }));
});

test('itens: todas as linhas, com marcas, comerciais, níveis e a OP de pintura', () => {
  const r = Avanco.itens(Avanco.enxugar(matriz()));
  assert.equal(r.itens.length, 4);
  const [conj, sup, eixo, paraf] = r.itens;
  assert.equal(conj.opCald + conj.opUsin, '');
  assert.deepEqual(sup.marcas, { pintura: true });
  assert.equal(sup.produto, '8000000001');
  assert.equal(sup.obs, 'VER CROQUI');
  assert.ok(sup.cald && sup.usin);
  assert.deepEqual(eixo.marcas, { ttat: true });
  assert.equal(eixo.nivel, 1);
  assert.ok(paraf.comercial);
  assert.equal(Avanco.opPintura(matriz(), r.cabecalho), '8000000099');
  // o leitor de OPs pega produto, marcas e observação
  const ops = Planilha.lerOps(matriz()).ops;
  assert.equal(ops.length, 3);
  assert.deepEqual([ops[0].produto, ops[0].obs, ops[0].marcas], ['8000000001', 'VER CROQUI', { pintura: true }]);
});

test('planilha de volta: peças feitas por linha e resumo com fórmula certa', () => {
  const m = Avanco.enxugar(matriz());
  const ops = [
    { id: 'a', area: 'caldeiraria', numero: '09990101001', qtd: 5, status: 'aprovada' },
    { id: 'b', area: 'usinagem', numero: '09990201001', qtd: 5, status: 'retrabalho', qtdNc: 3 },
    { id: 'c', area: 'usinagem', numero: '09990301001', qtd: 2, status: 'morta', qtdNc: 2 },
    { id: 'd', area: 'usinagem', numero: '09990301002', qtd: 2, status: 'aprovada', origemOpId: 'c' }
  ];
  const r = Avanco.preencher(m, merges, ops);
  const em = function (rr, cc) { return r.celulas.find(function (x) { return x.r === rr && x.c === cc; }); };
  const col = function (nome) { return CAB.indexOf(nome); };
  // suporte (linha 9): cald 5 feitas em MONT/SOLD/ACAB/PINTURA; usinagem 2 de 5
  ['MONT', 'SOLD', 'ACAB'].forEach(function (k) { assert.equal(em(9, col(k)).v, 5); });
  assert.equal(em(9, 26).v, 5);
  assert.equal(em(9, col('AVANÇO TOTAL')).v, 2);
  assert.equal(em(9, col('Avanço Usi(%)')).v, 0.4);
  // eixo: a OP morreu e a de retrabalho foi aprovada → 2 de 2
  assert.equal(em(10, col('AVANÇO TOTAL')).v, 2);
  assert.deepEqual(r.totais, { caldeiraria: { qtd: 5, feitas: 5 }, usinagem: { qtd: 7, feitas: 4 } });
  assert.deepEqual(em(1, 5), { r: 1, c: 5, v: 7, f: 'SUMIF(S9:S12,"<>",G9:G12)' });
  assert.equal(em(2, 5).f, 'IF(F2>0,SUMIF(S9:S12,"<>",AC9:AC12)/F2,0)');
  assert.equal(em(2, 9).f, 'IF(J2>0,SUMIF(R9:R12,"<>",AA9:AA12)/J2,0)');
  assert.equal(em(3, 9).f, 'IF(J2>0,SUMIF(R9:R12,"<>",X9:X12)/J2,0)');
  assert.equal(em(2, 9).v, 1);
});
