import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Com from '../js/dominio/comerciais.js';
import * as Serv from '../js/dominio/servicos.js';
import * as Ped from '../js/dominio/pedidoPdf.js';

const planilha = [
  { comercial: true, posicao: '23', descricao: 'PORCA SEXT M 24-8', qtd: 16, sc: '036205', produto: '' },
  { comercial: true, posicao: '24', descricao: 'FLANGE CEGO 150#FF DN150', qtd: 4, sc: '036971', produto: '0707000084' },
  { comercial: true, posicao: '25', descricao: 'JUNTA ESP. 2MM P/ FLANGE DN50', qtd: 28, sc: '036971', produto: '' },
  { comercial: false, desenho: '1609576', posicao: '9', descricao: 'CREMALHEIRA PARTE 1', qtd: 1, marcas: { ttat: true, servicoExterno: true } },
  { comercial: false, desenho: '1609577', posicao: '10', descricao: 'CREMALHEIRA PARTE 2', qtd: 2, marcas: { ttat: true } }
];

test('comerciais: lista com pedido e chegada parcial', () => {
  const k = Com.chaveItem(planilha[0]);
  const doc = { itens: { [k]: { pc: '057577', chegadas: [{ qtd: 10, em: '2026-11-12' }] } } };
  const l = Com.lista(planilha, doc);
  assert.equal(l.length, 3);
  assert.deepEqual([l[0].situacao, l[0].chegou, l[0].pc], ['parcial', 10, '057577']);
  assert.equal(l[1].situacao, 'semPedido');
  doc.itens[k].chegadas.push({ qtd: 6, em: '2026-11-13' });
  assert.equal(Com.lista(planilha, doc)[0].situacao, 'completo');
  assert.deepEqual(Com.resumo(Com.lista(planilha, doc)), { total: 3, completo: 1, parcial: 0, pendente: 0, semPedido: 2 });
});

test('pedido: liga pelo produto, depois pela SC (a mais parecida) e sugere pela descrição', () => {
  const itens = Com.lista(planilha, null);
  const linhas = [
    { produto: '0707000084', descricao: 'FLANGE CEGO 150#FF DN150 ANSI', sc: '036971' },
    { produto: '0704002911', descricao: 'JUNTA ESP. 2MM P/ FLANGE DN50-150#FF PAPELÃO', sc: '036971' },
    { produto: '9999999999', descricao: 'PORCA SEXT M 24-8 ZINCADA', sc: '' },
    { produto: '8888888888', descricao: 'CURVA 90 RL DN50', sc: '' }
  ];
  const r = Com.ligarPedido(linhas, itens);
  assert.deepEqual(r.map((x) => x.por), ['produto', 'sc', 'sugestao', null]);
  assert.equal(r[1].chave, Com.chaveItem(planilha[2]));
});

test('serviços: aba SERVIÇOS + peças marcadas, situação, prazo em dias úteis ou corridos', () => {
  const aba = [['📊 SERVIÇOS'], [], ['N°', 'TIPO DE SERVIÇO ', 'DESCRIÇÃO DO SERVIÇO', 'DESCRÇÃO DA PEÇA', 'DESENHO', 'POSIÇÃO', 'SOLICITAÇÃO', 'PEDIDO', 'FORNECEDOR', 'OBSERVAÇÃO'],
    ['1', 'TRATAMENTO TERMICO', 'CEMENTAÇÃO', 'CREMALHEIRA PARTE 1', '1609576', '9', '036889', '057118', 'GIOVANNI']];
  const linhas = Serv.lerAba(aba);
  assert.deepEqual([linhas.length, linhas[0].sc, linhas[0].pc], [1, '036889', '057118']);
  const l = Serv.lista(planilha, linhas, null, '2026-11-13');
  assert.deepEqual(l.map((s) => s.tipo), ['TRATAMENTO TERMICO', 'TTAT']);   // a peça 1 já está na aba; a 2 entra pela marca
  // sexta 13/11 + 3 dias úteis = quarta 18/11; corridos = segunda 16/11
  assert.equal(Serv.previsto('2026-11-13', 3, 'uteis'), '2026-11-18');
  assert.equal(Serv.previsto('2026-11-13', 3, 'corridos'), '2026-11-16');
  const k = l[1].chave;
  const doc = { itens: { [k]: { envios: [{ qtd: 2, em: '2026-11-13', prazo: 3, tipoPrazo: 'uteis' }], retornos: [] } } };
  let s = Serv.lista(planilha, linhas, doc, '2026-11-20').find((x) => x.chave === k);
  assert.deepEqual([s.situacao, s.naRua, s.previsto, s.atrasoDias], ['enviado', 2, '2026-11-18', 2]);
  doc.itens[k].retornos.push({ qtd: 1, em: '2026-11-19' });
  s = Serv.lista(planilha, linhas, doc, '2026-11-20').find((x) => x.chave === k);
  assert.deepEqual([s.situacao, s.naRua], ['parcial', 1]);
  doc.itens[k].retornos.push({ qtd: 1, em: '2026-11-20' });
  assert.equal(Serv.lista(planilha, linhas, doc, '2026-11-20').find((x) => x.chave === k).situacao, 'voltou');
});

test('aviso de cobrança para o técnico quando o prazo chega', () => {
  const docs = [{ projetoId: 'p1', itens: { 'S|A|1|TTAT': { qtd: 2, tipo: 'TTAT', peca: 'Engrenagem', fornecedor: 'Metaltemper',
    envios: [{ qtd: 2, em: '2026-11-13', prazo: 3, tipoPrazo: 'uteis' }], retornos: [] } } }];
  const proj = { p1: { id: 'p1', commessa: 'C1', responsavelUid: 'tec' } };
  assert.equal(Serv.avisos(docs, proj, 'tec', '2026-11-17').length, 0);
  const hoje = Serv.avisos(docs, proj, 'tec', '2026-11-18');
  assert.deepEqual([hoje.length, hoje[0].nivel], [1, 'aviso']);
  assert.equal(Serv.avisos(docs, proj, 'tec', '2026-11-20')[0].nivel, 'alerta');
  assert.equal(Serv.avisos(docs, proj, 'outro', '2026-11-20').length, 0);
});

test('pedido de compra: cabeçalho, itens em 2 linhas e a SC que quebra', () => {
  const pg = [
    { x: 246, y: 33, s: 'P' }, { x: 252, y: 33, s: 'E' }, { x: 259, y: 33, s: 'D' }, { x: 265, y: 33, s: 'I' }, { x: 272, y: 33, s: 'D' }, { x: 278, y: 33, s: 'O' },
    { x: 288, y: 33, s: 'D' }, { x: 295, y: 33, s: 'E' }, { x: 304, y: 33, s: 'C' }, { x: 311, y: 33, s: 'O' }, { x: 317, y: 33, s: 'M' }, { x: 324, y: 33, s: 'P' },
    { x: 330, y: 33, s: 'R' }, { x: 337, y: 33, s: 'A' }, { x: 343, y: 33, s: 'S' }, { x: 356, y: 33, s: 'REAL' }, { x: 442, y: 33, s: '099999' }, { x: 465, y: 33, s: '/1' },
    { x: 245, y: 48, s: 'Razão' }, { x: 265, y: 48, s: 'Social:FORNECEDOR TESTE LTDA' }, { x: 453, y: 48, s: 'Codigo:000123 Loja:01' },
    { x: 20, y: 93, s: 'Ite' }, { x: 34, y: 93, s: 'Produto' }, { x: 81, y: 93, s: 'Descricao' }, { x: 210, y: 93, s: 'U' },
    { x: 238, y: 93, s: 'Quantidade' }, { x: 502, y: 93, s: 'Comessa' }, { x: 531, y: 93, s: 'Nro.S' },
    { x: 19, y: 105, s: '000' }, { x: 34, y: 105, s: '0700000001' }, { x: 81, y: 105, s: 'PARAFUSO SEXT' }, { x: 140, y: 105, s: 'M24X80' }, { x: 210, y: 105, s: 'P' },
    { x: 240, y: 105, s: '16,000000' }, { x: 317, y: 105, s: '0,000000' }, { x: 369, y: 105, s: '4,500000 0,00' }, { x: 443, y: 105, s: '72,00 23/11/2099' },
    { x: 500, y: 105, s: '2099-001' }, { x: 530, y: 105, s: '03697' },
    { x: 81, y: 111, s: 'ZINCADO CL 8.8' }, { x: 537, y: 111, s: '1' },
    { x: 28, y: 576, s: 'Condicao de Pagto' }, { x: 267, y: 576, s: 'Data de' }, { x: 293, y: 576, s: 'Emissao' },
    { x: 28, y: 585, s: '30 DD' }, { x: 267, y: 585, s: '11/11/2099' },
    { x: 412, y: 645, s: 'Total' }, { x: 431, y: 645, s: 'Geral' }, { x: 451, y: 645, s: ':' }, { x: 470, y: 645, s: '72,00' },
    { x: 28, y: 705, s: 'Comprador' }, { x: 61, y: 705, s: 'Responsavel : Comprador Teste' }
  ];
  const r = Ped.lerPedido([pg]);
  assert.equal(r.ok, true);
  assert.deepEqual([r.numero, r.fornecedor, r.codigoFornecedor, r.emissao, r.total], ['099999', 'FORNECEDOR TESTE LTDA', '000123', '11/11/2099', 72]);
  assert.equal(r.itens.length, 1);
  const it = r.itens[0];
  assert.deepEqual([it.produto, it.descricao, it.unidade, it.qtd, it.valorUnit, it.valorTotal, it.commessa, it.sc],
    ['0700000001', 'PARAFUSO SEXT M24X80 ZINCADO CL 8.8', 'PC', 16, 4.5, 72, '2099-001', '036971']);
  assert.deepEqual(Ped.lerPedido([[]]), { ok: false, motivo: 'semTexto' });
});

import * as Av from '../js/dominio/avanco.js';
test('resumo da planilha: só peças finais, sem comerciais', () => {
  const l = [
    { posicao: '28', qtd: 2, pesoTotal: 9.4, cald: false, usin: false },
    { posicao: '28.1', qtd: 1, pesoTotal: 4.1, cald: true, usin: true },
    { posicao: '28.2', qtd: 1, pesoTotal: 0.6, cald: false, usin: true },
    { posicao: '9', qtd: 3, pesoTotal: 19.6, cald: false, usin: true },
    { posicao: '23', qtd: 16, pesoTotal: 2, comercial: true }
  ];
  assert.deepEqual(Av.resumoPecas(l), { pecas: 5, peso: 24.3, usinagem: 5, caldeiraria: 1 });
});

test('planilha: filtro pelo cabeçalho mantém o conjunto e os comerciais só com o filtro', () => {
  const l = [
    { posicao: '28', qtd: 2, pesoTotal: 9.4 },
    { posicao: '28.1', qtd: 1, pesoTotal: 4.1, cald: true, usin: true },
    { posicao: '28.2', qtd: 1, pesoTotal: 0.6, usin: true, marcas: { ttat: true } },
    { posicao: '9', qtd: 3, pesoTotal: 19.6, usin: true, marcas: { ttat: true } },
    { posicao: '23', qtd: 16, comercial: true }
  ];
  assert.deepEqual(Av.filtrar(l, {}).map((i) => i.posicao), ['28', '28.1', '28.2', '9']);
  assert.deepEqual(Av.filtrar(l, { cald: true }).map((i) => i.posicao), ['28', '28.1']);
  assert.deepEqual(Av.filtrar(l, { usin: true, ttat: true }).map((i) => i.posicao), ['28', '28.2', '9']);
  assert.deepEqual(Av.filtrar(l, { comercial: true }).map((i) => i.posicao), ['23']);
  assert.deepEqual(Av.resumoPecas(Av.filtrar(l, { usin: true, ttat: true })), { pecas: 4, peso: 20.2, usinagem: 4, caldeiraria: 0 });
});

test('pedido de serviço: liga pela SC (o desenho desempata), pelo desenho e sugere', () => {
  const servs = [
    { chave: 's1', tipo: 'TRATAMENTO TERMICO', servico: 'CEMENTAÇÃO', peca: 'CREMALHEIRA PARTE 1', desenho: '1609576', sc: '036889' },
    { chave: 's2', tipo: 'TRATAMENTO TERMICO', servico: 'CEMENTAÇÃO', peca: 'CREMALHEIRA PARTE 2', desenho: '1609577', sc: '036889' },
    { chave: 's3', tipo: 'ELETROEROSÃO', servico: 'RASGO CHAVETA', peca: 'DISTANCIADOR', desenho: '1609602', sc: '' },
    { chave: 's4', tipo: 'VULCANIZAÇÃO', servico: 'REVESTIR POLIURETANO', peca: 'BATENTE', desenho: '1609028', sc: '' }
  ];
  const r = Serv.ligarPedido([
    { descricao: 'CEMENTACAO CREMALHEIRA DES 1609577', sc: '036889' },
    { descricao: 'ELETROEROSAO RASGO CHAVETA DES. 1609602', sc: '' },
    { descricao: 'VULCANIZAÇÃO REVESTIR POLIURETANO BATENTE', sc: '' },
    { descricao: 'FRETE', sc: '' }
  ], servs);
  assert.deepEqual(r.map((x) => [x.chave, x.por]), [['s2', 'sc'], ['s3', 'desenho'], ['s4', 'sugestao'], [null, null]]);
});
