import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Prog from '../js/dominio/programacao.js';
import * as Fin from '../js/dominio/finalizadas.js';

// 09/11/2026 é segunda-feira
const H = '2026-11-09';

test('situação na programação: em aberto, programada, baixa do CQ, RNC, finalizada', () => {
  const cald = { area: 'caldeiraria', status: 'aberta' };
  assert.equal(Prog.situacao(cald), 'emAberto');
  assert.equal(Prog.situacao({ ...cald, programacao: { terceirizadaId: 't1', previsaoFim: '2026-11-20' } }), 'programada');
  assert.equal(Prog.situacao({ ...cald, status: 'retrabalho' }), 'rnc');
  assert.equal(Prog.situacao({ ...cald, status: 'aprovada' }), 'baixaCq');
  assert.equal(Prog.situacao({ ...cald, status: 'aprovada', encerradaEm: 'x' }), 'encerrada');
  assert.equal(Prog.situacao({ area: 'usinagem', status: 'aberta' }, true), 'programada');
  assert.equal(Prog.situacao({ area: 'usinagem', status: 'aberta' }, false), 'emAberto');
});

test('data prevista: nunca antes de hoje; depois do prazo só avisa', () => {
  assert.deepEqual(Prog.validarData('2026-11-08', H, '2026-12-01'), { erro: 'antesDeHoje', aviso: null });
  assert.deepEqual(Prog.validarData('2026-11-20', H, '2026-12-01'), { erro: null, aviso: null });
  assert.deepEqual(Prog.validarData('2026-12-05', H, '2026-12-01'), { erro: null, aviso: 'depoisDoPrazo' });
  assert.equal(Prog.validarData('', H).erro, 'vazia');
});

test('carga por terceirizada: kg das OPs em fábrica', () => {
  const ops = [
    { area: 'caldeiraria', status: 'aberta', pesoTotal: 100, programacao: { terceirizadaId: 't1', terceirizada: 'Metal A', previsaoFim: '2026-11-20' } },
    { area: 'caldeiraria', status: 'aberta', pesoTotal: 50, programacao: { terceirizadaId: 't1', terceirizada: 'Metal A', previsaoFim: '2026-11-21' } },
    { area: 'caldeiraria', status: 'aberta', pesoTotal: 999 },
    { area: 'caldeiraria', status: 'aprovada', pesoTotal: 70, programacao: { terceirizadaId: 't2', previsaoFim: '2026-11-20' } }
  ];
  const r = Prog.cargaTerceirizadas(ops, [{ id: 't1', nome: 'Metal A' }, { id: 't2', nome: 'Metal B' }]);
  assert.deepEqual(r.map(function (l) { return [l.terceirizada.nome, l.kg, l.ops.length]; }), [['Metal A', 150, 2], ['Metal B', 0, 0]]);
});

test('fila da máquina: horas por dia útil, a OP seguinte espera a anterior, "não antes de" e atraso', () => {
  const maquina = { id: 'm1', nome: 'Forest', horasDia: 8, fila: [{ opId: 'a' }, { opId: 'b', horas: 10 }, { opId: 'c', naoAntes: '2026-11-20' }, { opId: 'x' }, { opId: 'd' }] };
  const ops = {
    a: { id: 'a', area: 'usinagem', status: 'aberta', projetoId: 'p1', operacoes: [{ setor: 'FOREST', horas: 12 }, { setor: 'AJUSTADOR', horas: 1 }] },
    b: { id: 'b', area: 'usinagem', status: 'aberta', projetoId: 'p1' },
    c: { id: 'c', area: 'usinagem', status: 'aberta', projetoId: 'p2', horasPrevistas: 4 },
    d: { id: 'd', area: 'usinagem', status: 'aprovada', projetoId: 'p1', horasPrevistas: 40 }
  };
  const proj = { p1: { prodFim: '2026-12-31' }, p2: { prodFim: '2026-11-19' } };
  const ag = Prog.agendar(maquina, ops, proj, [maquina], {}, H);
  // a: 12 h = seg 8 h + ter 4 h
  assert.deepEqual([ag[0].inicio, ag[0].fim, ag[0].porDia], ['2026-11-09', '2026-11-10', { '2026-11-09': 8, '2026-11-10': 4 }]);
  // b: 10 h = ter 4 h (o que sobra) + qua 6 h
  assert.deepEqual([ag[1].inicio, ag[1].fim], ['2026-11-10', '2026-11-11']);
  // c: não antes de 20/11 (sexta); passa do prazo do projeto (19/11)
  assert.deepEqual([ag[2].inicio, ag[2].fim, ag[2].atraso], ['2026-11-20', '2026-11-20', true]);
  assert.equal(ag[3].ausente, true);
  assert.equal(ag[4].concluida, true);
  // fim de semana é pulado
  const sexta = Prog.agendar({ id: 'm', horasDia: 8, fila: [{ opId: 'b', horas: 16 }] }, ops, proj, [], {}, '2026-11-13');
  assert.deepEqual([sexta[0].inicio, sexta[0].fim], ['2026-11-13', '2026-11-16']);
});

test('avisos graduais do programador', () => {
  const proj = {
    p1: { id: 'p1', commessa: 'C1', status: 'ativo', prodFim: '2026-11-12' },
    p2: { id: 'p2', commessa: 'C2', status: 'ativo', prodFim: '2026-11-05' },
    p3: { id: 'p3', commessa: 'C3', status: 'ativo', prodFim: '2027-03-01' }
  };
  const ops = [
    { id: 'o1', area: 'caldeiraria', status: 'aberta', projetoId: 'p3', criadoEm: '2026-11-01T10:00:00Z' },
    { id: 'o2', area: 'caldeiraria', status: 'aberta', projetoId: 'p3', criadoEm: '2026-11-08T10:00:00Z' },
    { id: 'o3', area: 'caldeiraria', status: 'aberta', projetoId: 'p3', criadoEm: '2026-11-01T10:00:00Z', programacao: { previsaoFim: '2026-11-10' } },
    { id: 'o4', area: 'caldeiraria', status: 'aberta', projetoId: 'p1', criadoEm: '2026-11-08T10:00:00Z' },
    { id: 'o5', area: 'caldeiraria', status: 'aberta', projetoId: 'p2', criadoEm: '2026-11-08T10:00:00Z' },
    { id: 'o6', area: 'usinagem', status: 'aberta', projetoId: 'p2', criadoEm: '2026-10-01T10:00:00Z' }
  ];
  const ids = Prog.avisos(ops, proj, 'caldeiraria', new Set(), {}, H).map(function (a) { return a.id; });
  assert.deepEqual(ids, ['prog-proj-atrasado:p2', 'prog-vence:o3', 'prog-proj-vence:p1', 'prog-sem:p3']);
  assert.equal(Prog.avisos(ops, proj, 'caldeiraria', new Set(), {}, H).find(function (a) { return a.tipo === 'prog-sem'; }).n, 1);
  assert.ok(Prog.projetoAtrasado(proj.p2, H) && !Prog.projetoAtrasado(proj.p1, H));
});

test('próximas etapas pelas marcas da planilha', () => {
  assert.deepEqual(Prog.proximasEtapas({ marcas: { pintura: true, ttat: true, servicoExterno: true } }), ['ttat', 'servicoExterno', 'pintura']);
  assert.deepEqual(Prog.proximasEtapas({}), []);
});

test('peças finalizadas, destino, commessas e romaneio', () => {
  const base = { projetoId: 'p1', commessa: 'C1', qtd: 2, pesoUnit: 10, pesoTotal: 20 };
  const ops = [
    // peça A: cald + usi finalizadas, destino gravado expedição
    { ...base, id: 'a1', area: 'caldeiraria', numero: '1', desenho: 'D1', posicao: '1', status: 'aprovada', encerradaEm: '2026-11-01', destino: 'expedicao' },
    { ...base, id: 'a2', area: 'usinagem', numero: '2', desenho: 'D1', posicao: '1', status: 'aprovada', encerradaEm: '2026-11-03', destino: 'expedicao' },
    // peça B: só uma das OPs finalizada
    { ...base, id: 'b1', area: 'caldeiraria', numero: '3', desenho: 'D2', posicao: '2', status: 'aprovada', encerradaEm: '2026-11-01' },
    { ...base, id: 'b2', area: 'usinagem', numero: '4', desenho: 'D2', posicao: '2', status: 'aberta' },
    // peça C: morta + retrabalho finalizada, pintura marcada
    { ...base, id: 'c1', area: 'usinagem', numero: '5', desenho: 'D3', posicao: '3', status: 'morta', marcas: { pintura: true } },
    { ...base, id: 'c2', area: 'usinagem', numero: '6', desenho: 'D3', posicao: '3', status: 'aprovada', encerradaEm: '2026-11-04', origemOpId: 'c1' },
    // peça D: pronta sem destino
    { ...base, id: 'd1', area: 'caldeiraria', numero: '7', desenho: 'D4', posicao: '4', status: 'desvio', encerradaEm: '2026-11-05' },
    // outro projeto, concluído
    { ...base, projetoId: 'p9', id: 'z1', area: 'caldeiraria', numero: '9', desenho: 'D9', posicao: '1', status: 'aprovada', encerradaEm: 'x' }
  ];
  const lista = Fin.pecas(ops);
  const por = function (d) { return lista.find(function (p) { return p.desenho === d; }); };
  assert.deepEqual([por('D1').pronta, por('D1').destino, por('D1').finalizadaEm], [true, 'expedicao', '2026-11-03']);
  assert.equal(por('D2').pronta, false);
  assert.deepEqual([por('D3').pronta, por('D3').destino, por('D3').destinoGravado], [true, 'pintura', null]);
  assert.equal(Fin.grupo(por('D4')), 'semDestino');
  const aberto = function (pid) { return pid !== 'p9'; };
  assert.deepEqual(Fin.contagem(lista, aberto), { expedicao: 1, montagem: 0, pintura: 1, decapagem: 0, servicoExterno: 0, semDestino: 1 });
  assert.deepEqual(Fin.commessas(lista, 'expedicao', aberto).map(function (c) { return [c.commessa, c.prontas, c.total]; }), [['C1', 1, 4]]);
  const itens = Fin.itensDaCommessa(lista, 'p1', 'expedicao');
  assert.deepEqual(itens.map(function (i) { return i.desenho + ':' + i.situacao; }), ['D1:disponivel', 'D2:emProducao', 'D3:outroDestino', 'D4:outroDestino']);
  const r = Fin.romaneio(itens);
  assert.equal(r.linhas.length, 1);
  assert.deepEqual([r.linhas[0].ops, r.totais.qtd, r.totais.peso], ['1 / 2', 2, 20]);
});
