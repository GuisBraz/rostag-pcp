import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Av from '../js/dominio/avanco.js';
import { calcular } from '../js/dominio/andamento.js';
import { acharCabecalho, lerOps } from '../js/dominio/planilha.js';

const op = (area, desenho, posicao, qtd, extra) => ({ id: area + desenho + posicao, area, desenho, posicao, qtd, status: 'aprovada', numero: '02120901001', ...extra });

test('avanço da linha: média de Cald e Usi; 100% só com tudo pronto', () => {
  const linhas = Av.linhasDaBom([
    { desenho: 'CRQ-1', posicao: '1', qtd: 5, cald: true, usin: true },
    { desenho: 'CRQ-1', posicao: '2', qtd: 10, cald: true, usin: false },
    { desenho: 'PARAF', posicao: '3', qtd: 50, comercial: true }
  ]);
  assert.equal(linhas.length, 2);   // comercial fica de fora
  const ops = [op('caldeiraria', 'CRQ-1', '1', 5), op('usinagem', 'CRQ 1', '1', 5, { status: 'aberta' }), op('caldeiraria', 'CRQ-1', '2', 10, { status: 'retrabalho', qtdNc: 9 })];
  const idx = Av.indexarPorPeca(ops);
  const a = Av.avancoLinha(linhas[0], idx);
  assert.equal(a.cald.feitas, 5);
  assert.equal(a.usin.feitas, 0);
  assert.equal(a.pct, 50);
  // projeto por peça: (5 × 50% + 10 × 10%) / 15 = 23%
  const r = Av.avancoProjeto(linhas, ops);
  assert.equal(r.pct, 23);
  assert.equal(r.cald.feitas, 6);
});

test('peça marcada na BOM sem OP ainda conta como 0% (não some do total)', () => {
  const linhas = Av.linhasDaBom([{ desenho: 'A', posicao: '1', qtd: 4, cald: true }, { desenho: 'B', posicao: '1', qtd: 4, usin: true }]);
  const r = Av.avancoProjeto(linhas, [op('caldeiraria', 'A', '1', 4)]);
  assert.equal(r.pct, 50);
});

test('resumo da BOM no projeto: compacta e volta igual; o andamento usa o Avanço', () => {
  const linhas = Av.linhasDaBom([{ desenho: 'A', posicao: '1', qtd: 4, cald: true, opCald: '02120901001' }]);
  assert.deepEqual(Av.descompactar(Av.compactar(linhas)), linhas);
  const p = { entrega: '2027-01-20', status: 'ativo', checklist: [{ t: 'a', done: true }], bom: { linhas: Av.compactar(linhas) } };
  assert.equal(calcular(p, [op('caldeiraria', 'X', '9', 4, { status: 'retrabalho', qtdNc: 2, numero: '03000001001' })]).fabrica, 0);   // OP de outra peça não conta
  assert.equal(calcular(p, [op('caldeiraria', 'A', '1', 4, { status: 'retrabalho', qtdNc: 2 })]).fabrica, 50);
});

test('BOM virgem (sem as colunas de OP) é reconhecida e não cria OP', () => {
  const m = [['REV.', 'DESENHO', 'POSIÇÃO', 'DESCRIÇÃO DO ITEM', 'QTE TOTAL', 'PESO UNIT (KG)', 'PESO TOTAL (KG)', 'COMERCIAL', 'CALD', 'USINAGEM', 'PINTURA'],
    ['0', 'CRQ-1', '1', 'CALÇO', 12, 208.6, 2503.4, '', 'X', '', 'X']];
  assert.ok(acharCabecalho(m));
  const it = Av.itens(m).itens;
  assert.equal(it.length, 1);
  assert.equal(it[0].cald, true);
  assert.equal(it[0].marcas.pintura, true);
  assert.equal(lerOps(m).ops.length, 0);
});
