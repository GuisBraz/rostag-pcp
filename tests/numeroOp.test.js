import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaveOp } from '../js/dominio/planilha.js';
import { indexarOps, situacaoArea } from '../js/dominio/avanco.js';
import { validar as validarOpManual } from '../js/dominio/opManual.js';

test('número da OP: o sufixo fixo 01001 não conta', () => {
  assert.equal(chaveOp('021209'), chaveOp('02120901001'));
  assert.equal(chaveOp('021209-01001'), '021209');
  assert.equal(chaveOp(' 021209 01001 '), '021209');
  assert.notEqual(chaveOp('02120901002'), chaveOp('021209'));   // outro final: outra OP
  assert.equal(chaveOp('ABC123'), 'ABC123');
});

test('planilha com o número completo acha a OP gravada só com 6 dígitos (e o contrário)', () => {
  const idx = indexarOps([{ id: 'a', area: 'caldeiraria', numero: '021209', status: 'aberta', qtd: 1 }]);
  assert.equal(situacaoArea({ opCald: '02120901001' }, 'caldeiraria', idx).op.id, 'a');
  const idx2 = indexarOps([{ id: 'b', area: 'usinagem', numero: '02120901001', status: 'aberta', qtd: 1 }]);
  assert.equal(situacaoArea({ opUsin: '021209' }, 'usinagem', idx2).op.id, 'b');
});

test('OP manual com o mesmo número (com ou sem 01001) avisa repetido', () => {
  const r = validarOpManual({ projetoId: 'p1', area: 'caldeiraria', numero: '02120901001', desenho: 'D1', posicao: '1', qtd: 1, pesoUnit: 1, pesoTotal: 1 },
    [{ id: 'x', numero: '021209', area: 'caldeiraria' }], null);
  assert.ok(r.avisos.indexOf('opm.aNumeroRepetido') >= 0);
});
