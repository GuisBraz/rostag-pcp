import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Rnc from '../js/dominio/rnc.js';
import * as Tar from '../js/dominio/tarefas.js';

const op = { numero: '02052513', area: 'usinagem', commessa: '2026-101', desenho: '1609574', posicao: '7', rev: '0', descricao: 'TRILHO', qtd: 5 };

test('RNC: etapas aguardando disposição → aguardando o CQ → encerrada', () => {
  const r = Rnc.abertura(op, { descricao: ' furo fora ', qtdNc: 2, procedencia: 'externo' }, '2026-11-12', 'Qualidade', '005');
  assert.deepEqual([r.numero, r.descricao, r.qtdNc, r.procedencia, r.inspetor, r.data, r.setor.usinagem, r.item], ['005', 'furo fora', '2', 'externo', 'Qualidade', '2026-11-12', true, '7']);
  assert.equal(Rnc.validar(r, op.qtd).ok, true);
  r.situacao = 'aberta';
  assert.equal(Rnc.etapa(r), 'disposicao');
  r.disposicao = 'Retrabalhar';
  assert.equal(Rnc.etapa(r), 'cq');
  assert.equal(Rnc.etapa({ ...r, situacao: 'encerrada' }), 'encerrada');
  assert.equal(Rnc.abertura(op, { descricao: 'x', procedencia: 'outra' }, 'h', 'q', '1').procedencia, '');
});

test('RNC: seguimento do CQ vira o efeito da reinspeção', () => {
  const r = { numero: '1', descricao: 'x', inspetor: 'Q', qtdNc: '1', disposicao: 'ok', observacoes: '' };
  const conf = Rnc.seguimento(r, 'conforme', '', 'Q', '2026-11-13', 'liberado');
  assert.deepEqual([conf.reResultado, conf.reInspetor, conf.reData, conf.observacoes], ['conforme', 'Q', '2026-11-13', 'liberado']);
  assert.equal(Rnc.efeitoReinspecao(conf).opStatus, 'aprovada');
  assert.equal(Rnc.efeitoReinspecao(Rnc.seguimento(r, 'desvio', '', 'Q', 'd')).opStatus, 'desvio');
  assert.deepEqual(Rnc.efeitoReinspecao(Rnc.seguimento(r, 'nao_conforme', '', 'Q', 'd')), { opStatus: 'retrabalho', encerra: true });
  const nova = Rnc.efeitoReinspecao(Rnc.seguimento(r, 'novaOp', ' 0205999 ', 'Q', 'd'));
  assert.deepEqual([nova.opStatus, nova.criarOp], ['morta', '0205999']);
});

test('tarefas: duração, prazo, ordem e avisos', () => {
  assert.deepEqual(Tar.duracao('2026-11-10T08:00:00Z', '2026-11-12T12:30:00Z'), { dias: 2, horas: 4, minutos: 30 });
  assert.equal(Tar.duracao('', 'x'), null);
  const h = '2026-11-12';
  const l = [
    { id: 'a', status: 'aberta', prazo: '2026-11-20', paraUid: 'u', criadoEm: '1' },
    { id: 'b', status: 'aberta', prazo: '2026-11-10', paraUid: 'u', criadoEm: '2', projetoId: 'p', commessa: 'C', titulo: 'B' },
    { id: 'c', status: 'concluida', prazo: '2026-11-01', paraUid: 'u', concluidaEm: '2026-11-02' },
    { id: 'd', status: 'aberta', prazo: '', paraUid: 'u', criadoEm: '0' },
    { id: 'e', status: 'aberta', prazo: h, paraUid: 'outro' }
  ];
  assert.deepEqual(l.map((t) => Tar.prazo(t, h)), ['noPrazo', 'atrasada', 'semPrazo', 'semPrazo', 'hoje']);
  assert.deepEqual(Tar.ordenar(l, h).map((t) => t.id), ['b', 'e', 'a', 'd', 'c']);
  const av = Tar.avisos(l, 'u', h);
  assert.deepEqual(av.map((a) => [a.id, a.tipo, a.nivel, a.atrasoDias]), [['tarefa-prazo:b', 'tarefa-atrasada', 'alerta', 2]]);
  assert.equal(Tar.avisos(l, 'outro', h)[0].tipo, 'tarefa-vence');
});

import * as Prod from '../js/dominio/producao.js';
import * as Fin from '../js/dominio/finalizadas.js';
test('próximo passo: sugestão pela planilha e grupo da peça pronta', () => {
  const cald = { id: 'c', projetoId: 'p', area: 'caldeiraria', desenho: 'D1', posicao: '1', status: 'aberta', marcas: { pintura: true } };
  const usi = { id: 'u', projetoId: 'p', area: 'usinagem', desenho: 'D1', posicao: '1', status: 'aberta' };
  assert.equal(Prod.passoSugerido(cald, [cald, usi]), 'usinagem');
  assert.equal(Prod.passoSugerido(cald, [cald, { ...usi, status: 'aprovada' }]), 'pintura');
  assert.equal(Prod.passoSugerido({ ...usi, marcas: { ttat: true } }, [usi]), 'servicoExterno');
  assert.equal(Prod.passoSugerido(usi, [usi]), 'embarque');
  const pronta = (passo) => Fin.pecas([{ ...usi, status: 'aprovada', encerradaEm: 'x', finalizadoEm: 'x', proximoPasso: passo }])[0];
  assert.deepEqual(['pintura', 'decapagem', 'servicoExterno', 'embarque', 'usinagem'].map((p) => Fin.grupo(pronta(p))),
    ['pintura', 'decapagem', 'servicoExterno', 'expedicao', 'semDestino']);
});

import * as ProgD from '../js/dominio/programacao.js';
test('carga fábrica: SOFIR sempre na lista, prazo, reagendada e aviso de atraso', () => {
  assert.deepEqual(ProgD.empresasCald([{ id: 't1', nome: 'Alfa' }, { id: 't2', nome: 'Velha', ativa: false }]).map((e) => e.id), ['sofir', 't1']);
  const o = (fim, extra) => ({ id: 'o' + fim, area: 'caldeiraria', status: 'aberta', projetoId: 'p', numero: '1', tecnicoUid: 'tec', gpUid: 'gp',
    programacao: { terceirizadaId: 'sofir', terceirizada: 'SOFIR', previsaoFim: fim, historico: [] }, ...extra });
  const h = '2026-11-13';
  assert.deepEqual(['2026-11-10', '2026-11-15', '2026-11-30'].map((d) => ProgD.prazoCald(o(d), h).k), ['atraso', 'vence', 'prazo']);
  assert.equal(ProgD.reagendada(o('2026-11-30', { programacao: { previsaoFim: '2026-11-30', historico: ['2026-11-20'] } })), true);
  const ops = [o('2026-11-10'), o('2026-11-30'), o('2026-11-09', { status: 'aprovada' }), o('2026-11-08', { area: 'usinagem' })];
  assert.deepEqual(ProgD.avisosCaldAtraso(ops, 'tec', h).map((a) => [a.id, a.dias]), [['prod-cald-atraso:o2026-11-10', 3]]);
  assert.equal(ProgD.avisosCaldAtraso(ops, 'gp', h).length, 1);
  assert.equal(ProgD.avisosCaldAtraso(ops, 'outro', h).length, 0);
});

test('carga máquina por operação: tipo de máquina, dependência e aguardando', () => {
  const maqs = [
    { id: 'sr', nome: 'San Rocco', tipo: 'Mandrilhadora', horasDia: 8, fila: [{ opId: 'o1', n: 0 }] },
    { id: 'fo', nome: 'Forest', tipo: 'Mandrilhadora', horasDia: 8, fila: [] },
    { id: 'ra', nome: 'Radial', tipo: 'Furadeira', horasDia: 8, fila: [{ opId: 'o1', n: 1 }] }
  ];
  const o1 = { id: 'o1', area: 'usinagem', status: 'aberta', projetoId: 'p', operacoes: [{ setor: 'SAN ROCCO', horas: 16 }, { setor: 'RADIAL', horas: 4 }, { setor: 'AJUSTE', horas: 2 }] };
  const o2 = { id: 'o2', area: 'usinagem', status: 'aberta', projetoId: 'p', operacoes: [{ setor: 'FOREST', horas: 8 }] };
  const porId = { o1, o2 };
  // sexta 13/11: 16 h na San Rocco (8 h/dia) = sex e seg 16/11; a furação só começa depois (seg 16/11)
  const ag = ProgD.agendarTudo(maqs, porId, { p: { prodFim: '2026-11-30' } }, {}, '2026-11-13');
  assert.deepEqual([ag.sr[0].inicio, ag.sr[0].fim], ['2026-11-13', '2026-11-16']);
  assert.deepEqual([ag.ra[0].inicio, ag.ra[0].fim, ag.ra[0].depoisDe], ['2026-11-16', '2026-11-16', '2026-11-16']);
  // a mandrilhadora Forest é do mesmo tipo: pode receber a operação da San Rocco e a da OP 2
  assert.deepEqual(ProgD.maquinasDaOperacao({ n: 0, setor: 'SAN ROCCO' }, maqs, {}), ['sr', 'fo']);
  assert.deepEqual(ProgD.aguardandoNaMaquina(maqs[1], [o1, o2], maqs, {}).map((x) => x.chave), ['o2#0']);
  assert.deepEqual(ProgD.maquinasDaOperacao({ n: 2, setor: 'AJUSTE' }, maqs, {}), []);   // setor sem máquina
});
