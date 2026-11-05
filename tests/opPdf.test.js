import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as OpPdf from '../js/dominio/opPdf.js';

// Página no mesmo layout do PDF do sistema (dados fictícios).
function pagina(setor, op, horas, juntarPesoTempo, etapa) {
  const it = [
    { x: 236, y: 48, s: 'ORDEM DE PRODUÇÃO' }, { x: 436, y: 48, s: '09990101001' },
    { x: 136, y: 75, s: 'COMESSE/CLIENTE:' }, { x: 246, y: 75, s: '2099-001 / CLIENTE TESTE LTDA' },
    { x: 456, y: 75, s: 'DT EMISSÃO: 01/02/2099' }, { x: 636, y: 75, s: 'DT IMPRESSÃO: 03/02/2099' },
    { x: 56, y: 99, s: 'SETOR:' }, { x: 136, y: 99, s: setor },
    { x: 586, y: 108, s: '0999010100101' },
    { x: 56, y: 120, s: 'OPERAÇÃO:' }, { x: 136, y: 120, s: op },
    { x: 56, y: 138, s: 'OP' }, { x: 126, y: 138, s: 'Produto' }, { x: 186, y: 138, s: 'Descrição' }, { x: 536, y: 138, s: 'Qtd' },
    { x: 56, y: 168, s: '09990101001' }, { x: 126, y: 168, s: '8000000001' }, { x: 186, y: 168, s: 'DES. 1234567' },
    { x: 529, y: 168, s: '5,00' }, { x: 586, y: 168, s: 'PC' },
    { x: 126, y: 183, s: 'EIXO DE TESTE' },
    { x: 56, y: 219, s: etapa + ':' },
    { x: 56, y: 264, s: 'LER TODA OP JUNTO AO OPERADOR;' }
  ];
  if (juntarPesoTempo) it.push({ x: 646, y: 168, s: '1.234,50 ' + horas });
  else it.push({ x: 646, y: 168, s: '1.234,50' }, { x: 689, y: 168, s: horas });
  return it;
}

test('lê o PDF do sistema: cabeçalho, peça e uma operação por página', () => {
  const r = OpPdf.lerOp([
    pagina('MANDRILHADORA TESTE', '01', '8,00', false, 'PRIMEIRA ETAPA'),
    pagina('AJUSTADOR', '02', '25,50', true, 'PRIMEIRA ETAPA'),
    pagina('CONTROLE DE QUALIDAD', '03', '0,15', false, 'SEGUNDA ETAPA')
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.numero, '09990101001');
  assert.equal(r.commessa, '2099-001');
  assert.equal(r.cliente, 'CLIENTE TESTE LTDA');
  assert.equal(r.emissao, '01/02/2099');
  assert.equal(r.produto, '8000000001');
  assert.equal(r.desenho, '1234567');
  assert.equal(r.descricao, 'EIXO DE TESTE');
  assert.equal(r.qtd, 5);
  assert.equal(r.um, 'PC');
  assert.equal(r.pesoUnit, 1234.5);
  assert.deepEqual(r.operacoes.map(function (o) { return [o.n, o.setor, o.horas, o.etapa]; }), [
    ['01', 'MANDRILHADORA TESTE', 8, 'PRIMEIRA ETAPA'],
    ['02', 'AJUSTADOR', 25.5, 'PRIMEIRA ETAPA'],
    ['03', 'CONTROLE DE QUALIDAD', 0.15, 'SEGUNDA ETAPA']
  ]);
  assert.equal(r.horas, 33.65);
});

test('PDF impresso (só imagem) e PDF que não é OP', () => {
  assert.deepEqual(OpPdf.lerOp([[], []]), { ok: false, motivo: 'semTexto' });
  assert.deepEqual(OpPdf.lerOp([[{ x: 10, y: 10, s: 'Relatório qualquer' }]]), { ok: false, motivo: 'naoEhOp' });
});

test('divergências entre o PDF e a OP da planilha (a planilha manda)', () => {
  const pdf = { desenho: '1234567', produto: '8000000001', qtd: 5, pesoUnit: 3131.1, commessa: '2099-001' };
  const op = { desenho: '1234567', produto: '8000000001', qtd: 5, pesoUnit: 318.3, commessa: '2099-001' };
  assert.deepEqual(OpPdf.divergencias(pdf, op), [{ campo: 'pesoUnit', pdf: 3131.1, op: 318.3 }]);
  assert.deepEqual(OpPdf.divergencias(pdf, Object.assign({}, op, { pesoUnit: 3131.1, produto: '' })), []);
});
