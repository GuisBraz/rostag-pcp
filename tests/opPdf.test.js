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

test('texto girado 90° (OP impressa em retrato) volta para a leitura normal', () => {
  // horizontal: x = e, y = altura - f
  assert.deepEqual(OpPdf.posicao([13, 0, 0, 13, 239, 534], 842, 595), { x: 239, y: 61 });
  // girado: a linha passa a ser o "e" e a leitura segue o "f"
  assert.deepEqual(OpPdf.posicao([0, 13, -13, 0, 62, 251], 595, 842), { x: 251, y: 62 });
  assert.deepEqual(OpPdf.posicao([0, -13, 13, 0, 62, 251], 595, 842), { x: 591, y: 533 });
});

test('instrução da operação: só o texto, sem as linhas fixas do formulário', () => {
  const pg = [
    { x: 236, y: 48, s: 'ORDEM DE PRODUÇÃO' }, { x: 436, y: 48, s: '09990101001' },
    { x: 56, y: 99, s: 'SETOR:' }, { x: 136, y: 99, s: 'AJUSTADOR' },
    { x: 56, y: 168, s: '09990101001' }, { x: 126, y: 168, s: '8000000001' }, { x: 186, y: 168, s: 'DES. 1234567' },
    { x: 529, y: 168, s: '1,00' }, { x: 586, y: 168, s: 'PC' }, { x: 646, y: 168, s: '10,00' }, { x: 689, y: 168, s: '2,00' },
    { x: 126, y: 183, s: 'EIXO' },
    { x: 56, y: 219, s: 'SEGUNDA ETAPA:' }, { x: 56, y: 249, s: 'LIDER:' },
    { x: 56, y: 264, s: 'LER TODA OP JUNTO AO OPERADOR PARA ESCLARECIMENTO;' },
    { x: 56, y: 279, s: 'ASS:_______DATA__/__/____HORAS INICIAL____:' },
    { x: 56, y: 309, s: 'Rebarbar e devolver para aguardar a segunda etapa.' },
    { x: 56, y: 324, s: 'Abrir roscas conforme desenho.' },
    { x: 56, y: 354, s: 'CERTIFICAR SE FORAM EXECUTADAS TODAS AS TAREFAS;' },
    { x: 36, y: 450, s: 'PC' }, { x: 56, y: 450, s: 'Data' }, { x: 101, y: 450, s: 'Assinatura' }
  ];
  const r = OpPdf.lerOp([pg]);
  assert.equal(r.operacoes[0].etapa, 'SEGUNDA ETAPA');
  assert.equal(r.operacoes[0].texto, 'Rebarbar e devolver para aguardar a segunda etapa.\nAbrir roscas conforme desenho.');
});

test('área provável da OP extra pelos setores do roteiro', () => {
  assert.equal(OpPdf.areaProvavel({ operacoes: [{ setor: 'MONT. CALD TERCEIROS' }, { setor: 'SOLDA TERCEIROS' }] }), 'caldeiraria');
  assert.equal(OpPdf.areaProvavel({ operacoes: [{ setor: 'MANDRILHADORA FOREST' }, { setor: 'AJUSTADOR' }] }), 'usinagem');
  assert.equal(OpPdf.areaProvavel({ operacoes: [] }), 'usinagem');
});

// OCR: palavras do Tesseract (bbox em pixels, escala 3) no layout da OP que
// veio só como imagem — desenho "SM…" sem "DES.", letra no lugar de algarismo,
// vírgula perdida, página de continuação e quadro de assinaturas.
function linhaOcr(y, palavras) {
  let x = 150;
  return { baseline: { y0: y, y1: y }, words: palavras.map(function (p) {
    if (typeof p === 'number') { x += p; return null; }
    const w = { text: p, bbox: { x0: x, y0: y - 30, x1: x + p.length * 22, y1: y } };
    x = w.bbox.x1 + 12;
    return w;
  }).filter(Boolean) };
}
function paginaOcr(setor, op, horas) {
  return OpPdf.itensDoOcr([
    linhaOcr(183, ['ORDEM', 'DE', 'PRODUÇÃO', 400, '02106401001']),
    linhaOcr(255, ['COMESSE/CLIENTE:', 200, '2025-061P', '/', 'STELLANTIS-PE', '25-288', 300, 'DT', 'EMISSÃO:', '10/11/2026']),
    linhaOcr(327, ['SETOR:', 200].concat(setor.split(' '))),
    linhaOcr(384, ['OPERAÇÃO:', 200, op]),
    linhaOcr(525, ['02106401001', 200, '8000016064', 200, 'SMO6125010103', 900, '40,00', 200, 'PC', 200, '1148', 100, horas]),
    linhaOcr(570, ['BRACCIO', '1']),
    linhaOcr(669, ['Traçar', 'a', 'sapata', 'posição', '02;']),
    linhaOcr(1068, ['PC', 100, 'Data', 100, 'Assinatura']),
    linhaOcr(1113, ['001', '//', 100, '62', 'S/S', '7', 100, '003', '//'])
  ], 3);
}

test('OP lida por OCR: mesmos campos do PDF com texto', () => {
  const continuacao = OpPdf.itensDoOcr([linhaOcr(183, ['ORDEM', 'DE', 'PRODUÇÃO', 400, '02106401001'])], 3);
  const r = OpPdf.lerOp([paginaOcr('MONT. CALD TERCEIROS', 'o1', '40,00'), continuacao, paginaOcr('CONTROLE DE QUALIDAD', 'o4', '4,00')]);
  assert.equal(r.ok, true);
  assert.equal(r.numero, '02106401001');
  assert.equal(r.commessa, '2025-061P');
  assert.equal(r.produto, '8000016064');
  assert.equal(r.desenho, 'SM06125010103');
  assert.equal(r.descricao, 'BRACCIO 1');
  assert.equal(r.qtd, 40);
  assert.equal(r.um, 'PC');
  assert.equal(r.pesoUnit, 11.48);
  assert.deepEqual(r.operacoes.map(function (o) { return [o.n, o.setor, o.horas, o.texto]; }), [
    ['01', 'MONT. CALD TERCEIROS', 40, 'Traçar a sapata posição 02;'],
    ['04', 'CONTROLE DE QUALIDAD', 4, 'Traçar a sapata posição 02;']
  ]);
  assert.equal(r.horas, 44);
});

test('OCR: palavras próximas viram uma frase, vão de coluna separa', () => {
  const itens = OpPdf.itensDoOcr([linhaOcr(300, ['SETOR:', 200, 'MONT.', 'CALD', 'TERCEIROS'])], 3);
  assert.deepEqual(itens.map(function (i) { return i.s; }), ['SETOR:', 'MONT. CALD TERCEIROS']);
  assert.equal(itens[0].y, 100);
  assert.equal(OpPdf.codigoOcr('o4'), '04');
  assert.equal(OpPdf.codigoOcr('SMO6125010103'), 'SM06125010103');
  assert.equal(OpPdf.codigoOcr('CALD'), 'CALD');
});
