import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/dominio/controle.js';
import * as K from '../js/dominio/contratos.js';

const EXC = ['2025-016', '2025-031', '2026-003'];

const CAB = ['', 'Item Mont', 'Item', 'Commesses', 'Cliente', 'Descrição', 'Classificação', 'Local Fabricação', 'Status', 'Prazo de entrega PC', 'Prazo de embarque previsto'];
const lin = (com, cli, desc, st, emb, pc) => ['', '', '', com, cli, desc, 'Fábrica', 'Contagem', st, pc || '', emb || ''];
const M = [['CONTROLE DE COMMESSE'], CAB,
  lin('2025-006', 'STELLANTIS', 'PLATAFORMA TP03', 'Em dia', new Date(2026, 10, 26)),
  lin('2025-006', 'STELLANTIS', 'PLATAFORMA TP05', 'Em dia', new Date(2026, 11, 10)),
  lin('2025-006', 'STELLANTIS', 'PLATAFORMA TP06', 'Entregue', new Date(2026, 8, 3)),
  lin('2025-016 OM 9000371989', 'AMT', 'MATERIAIS', 'Em dia', '20/12/2026'),
  lin('2025-016 OM 9000380948', 'AMT', 'Terças', 'Em espera', new Date(2026, 11, 1)),
  lin('2026-003 P.3785', 'MOSAIC', 'CAVALETES', 'Em dia', new Date(2026, 10, 23)),
  lin('2026-099', 'X', 'SEM DATA', 'Em dia', ''),
  lin('2026-050', 'Aperam', 'Carcaça', 'Em dia', new Date(2026, 11, 15)),
  lin('2025-031 - OM 900039551172', 'AMT', 'A01 – FAB ANEL', 'Em dia', new Date(2026, 11, 17))];
const SITE = [{ id: 'a', commessa: '2026-050', om: '' }, { id: 'b', commessa: '2025-031', om: '', descricao: 'A01 – FAB ANEL' }];

test('lê a aba Controle: commessa, OM, cliente, descrição, status e embarque', () => {
  const r = C.lerControle(M);
  assert.equal(r.ok, true);
  assert.equal(r.linhas.length, 9);
  assert.deepEqual(C.partesCommessa('2025-016 OM 9000371989'), { base: '2025-016', om: '9000371989' });
  assert.deepEqual(C.partesCommessa('2025-031 - OM 900039551172'), { base: '2025-031', om: '900039551172' });
  assert.equal(C.partesCommessa('2026-003 P.3785').om, 'P.3785');
  assert.equal(r.linhas[3].entrega, '2026-12-20');
});

test('regras: sem Entregue, repetida vira uma, exceções por OM, ignora o que já existe', () => {
  const r = C.novosProjetos(M, SITE, EXC);
  const k = r.novos.map((c) => c.commessa + (c.om ? ' ' + c.om : ''));
  assert.deepEqual(k.sort(), ['2025-006', '2025-016 9000371989', '2025-016 9000380948', '2026-003 P.3785']);
  const p6 = r.novos.find((c) => c.commessa === '2025-006');
  assert.equal(p6.linhas, 2);                       // o Entregue ficou de fora
  assert.equal(p6.entrega, '2026-12-10');           // o embarque mais longe
  assert.equal(p6.descricao, 'PLATAFORMA TP03 · PLATAFORMA TP05');
  assert.deepEqual(r.semData.map((c) => c.commessa), ['2026-099']);
  assert.equal(r.entregues, 1);
});

test('id fixo: a mesma linha gera o mesmo projeto (não duplica)', () => {
  const c = C.agrupar(C.lerControle(M).linhas, EXC).find((x) => x.om === '9000371989');
  assert.equal(C.idDe(c), 'ctl_2025_016_9000371989');
  assert.equal(C.novosProjetos(M, SITE.concat([{ id: 'ctl_2025_016_9000371989', commessa: 'outro' }]), EXC).novos.some((x) => x.om === '9000371989'), false);
});

test('contrato sem OM na linha (2025-006): cada descrição vira um subprojeto', () => {
  const r = C.novosProjetos(M, SITE, EXC.concat(['2025-006']));
  const s = r.novos.filter((c) => c.commessa === '2025-006').map((c) => c.descricao).sort();
  assert.deepEqual(s, ['PLATAFORMA TP03', 'PLATAFORMA TP05']);
  assert.equal(C.idDe(r.novos.find((c) => c.descricao === 'PLATAFORMA TP03')), 'ctl_2025_006_plataforma_tp03');
  // já cadastrado no site com a mesma descrição → não entra de novo
  const r2 = C.novosProjetos(M, SITE.concat([{ id: 'x', commessa: '2025-006', om: '', descricao: 'Plataforma TP03' }]), EXC.concat(['2025-006']));
  assert.equal(r2.novos.some((c) => c.descricao === 'PLATAFORMA TP03'), false);
});

test('contratos: base, nome do projeto e agrupamento', () => {
  assert.equal(K.base('2026-004 - OM 900038789147'), '2026-004');
  assert.equal(K.ehContrato('2026-004', ['2026-004']), true);
  assert.equal(K.ehContrato('2026-050', ['2026-004']), false);
  assert.equal(K.nomeProjeto({ commessa: '2026-003', om: 'P.3785' }), '2026-003 · OM P.3785');
  assert.equal(K.nomeProjeto({ commessa: '2026-004 OM 900038789147', om: '900038789147' }), '2026-004 OM 900038789147');
  assert.deepEqual(K.normalizar('2025-016, 2026-004 2025-016; x'), ['2025-016', '2026-004']);
  const g = K.agrupar([{ id: 1, commessa: '2026-004', om: 'A' }, { id: 2, commessa: '2026-050' }, { id: 3, commessa: '2026-004', om: 'B' }], ['2026-004']);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].projetos.map((p) => p.id), [1, 3]);
});

test('id sem acento e descrições iguais (maiúscula/minúscula) não repetem', () => {
  assert.equal(C.idDe({ base: '2025-006', om: '', contrato: true, descricao: 'MOTORIZAÇÃO GKW (1X)' }), 'ctl_2025_006_motorizacao_gkw_1x');
  const g = C.agrupar([{ base: '2025-006', om: '', descricao: 'RODA (4X)', status: 'Em dia', entrega: '2026-12-01' },
    { base: '2025-006', om: '', descricao: 'RODA (4x)', status: 'Em dia', entrega: '2026-12-10' }], ['2025-006']);
  assert.equal(g.length, 1);
  assert.equal(g[0].descricao, 'RODA (4X)');
  assert.equal(g[0].entrega, '2026-12-10');
});
