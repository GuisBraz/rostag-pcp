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
