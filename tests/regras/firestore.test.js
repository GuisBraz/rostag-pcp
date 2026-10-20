// Testes das regras do Firestore (firestore.rules) contra o emulador.
// Rode com: npm run test:regras (precisa de Java instalado; o comando sobe
// o emulador, roda estes testes e desliga). Não fazem parte do `npm test`,
// que roda sem emulador.
import { test, before, after, beforeEach, describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const Timestamp = firebase.firestore.Timestamp;
const horaDoServidor = () => firebase.firestore.FieldValue.serverTimestamp();
const DIA = 86400000;
// Cada recusa esperada viraria um aviso do SDK no console.
firebase.firestore.setLogLevel('silent');

// Personagens da equipe E1: C coordena (papel gravado "gp", de antes dos
// cargos — vale como Gerente de PCP), M é Gerente de PCP, G é GP, P é técnico
// com o papel antigo "planejador", T é técnico, U programa usinagem, K
// programa caldeiraria e Q é do controle de qualidade. X é de fora (quer
// entrar) e Y é membro só da outra equipe E2.
const C = 'coord', M = 'gerente', G = 'gp', P = 'plan', T = 'tec', U = 'progU', K = 'progK', Q = 'cq', X = 'fora', Y = 'outro';
const HASH_CERTO = 'hash-da-senha-certa';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rostag',
    firestore: { rules: fs.readFileSync(path.join(raiz, 'firestore.rules'), 'utf8') }
  });
});
after(async () => { if (env) await env.cleanup(); });

function op(extra) {
  return { projetoId: 'doP', commessa: '2026-001', cliente: 'Cli', descricaoProjeto: 'Proj', gpUid: G, tecnicoUid: P,
    area: 'usinagem', numero: '02052501001', desenho: '1609568', posicao: '1', rev: '0', descricao: 'SUPORTE',
    qtd: 2, pesoUnit: 436.1, pesoTotal: 872.2, status: 'aberta', criadoEm: 'x', criadoPorUid: P, atualizadoEm: 'x', ...extra };
}

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const uid of [C, M, G, P, T, U, K, Q, X, Y]) await db.doc('usuarios/' + uid).set({ nome: uid, equipesCriadas: 0 });
    await db.doc('usuarios/' + C).update({ equipesCriadas: 1 });
    await db.doc('equipes/E1').set({ nome: 'Equipe 1', coordenadorUid: C, criadoPorUid: C });
    await db.doc('equipeSegredos/E1').set({ senhaHash: HASH_CERTO });
    const papeis = { [C]: 'gp', [M]: 'gerente_pcp', [G]: 'gp', [P]: 'planejador', [T]: 'tecnico', [U]: 'prog_usinagem', [K]: 'prog_caldeiraria', [Q]: 'cq' };
    for (const [uid, papel] of Object.entries(papeis)) await db.doc('equipes/E1/membros/' + uid).set({ nome: uid, papel });
    await db.doc('equipes/E1/projetos/doP').set({ nome: 'Projeto do P', gpUid: G, responsavelUid: P, checklist: [] });
    await db.doc('equipes/E1/projetos/doT').set({ nome: 'Projeto do T', gpUid: 'outroGP', responsavelUid: T, checklist: [] });
    await db.doc('equipes/E1/ops/op1').set(op());
    await db.doc('equipes/E1/ops/op2').set(op({ projetoId: 'doT', gpUid: 'outroGP', tecnicoUid: T, area: 'caldeiraria', criadoPorUid: T }));
    await db.doc('equipes/E2').set({ nome: 'Equipe 2', coordenadorUid: Y, criadoPorUid: Y });
    await db.doc('equipes/E2/membros/' + Y).set({ nome: 'Y', papel: 'gerente_pcp' });
  });
});

const como = (uid) => env.authenticatedContext(uid).firestore();
const semLogin = () => env.unauthenticatedContext().firestore();
async function semear(caminho, dados) {
  await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc(caminho).set(dados));
}
function convite(papel, idadeDias) {
  return { criadoPor: M, equipeId: 'E1', usado: false, papel, criadoEm: '2026-01-01T00:00:00.000Z',
    emitidoEm: Timestamp.fromMillis(Date.now() - idadeDias * DIA) };
}
// Mesmo caminho do app (auth.js → entrarComConvite): transação que marca o
// convite como usado, depois /membros e o índice pessoal.
async function consumir(db, codigo, uid) {
  await db.runTransaction(async (tx) => {
    const ref = db.doc('convites/' + codigo);
    await tx.get(ref);
    tx.update(ref, { usado: true, usadoPor: uid, usadoEm: new Date().toISOString() });
  });
}

/* ---------------------------------------------------------------- projetos */
describe('projetos: técnico', () => {
  for (const [quem, uid, meu, outro] of [['papel antigo "planejador"', P, 'doP', 'doT'], ['papel "tecnico"', T, 'doT', 'doP']]) {
    test(quem + ': lê só o projeto em que é responsável', async () => {
      await assertSucceeds(como(uid).doc('equipes/E1/projetos/' + meu).get());
      await assertFails(como(uid).doc('equipes/E1/projetos/' + outro).get());
      await assertSucceeds(como(uid).collection('equipes/E1/projetos').where('responsavelUid', '==', uid).get());
      await assertFails(como(uid).collection('equipes/E1/projetos').get());
    });
  }
  test('altera só o checklist do próprio projeto', async () => {
    await assertSucceeds(como(P).doc('equipes/E1/projetos/doP').update({ checklist: [{ t: 'a', done: true }] }));
    await assertFails(como(P).doc('equipes/E1/projetos/doP').update({ nome: 'outro' }));
    await assertFails(como(P).doc('equipes/E1/projetos/doP').update({ responsavelUid: G }));
    await assertFails(como(P).doc('equipes/E1/projetos/doP').update({ checklist: [], pcpFim: '2030-01-01' }));
    await assertFails(como(P).doc('equipes/E1/projetos/doT').update({ checklist: [] }));
  });
  test('não cria nem apaga projeto', async () => {
    await assertFails(como(P).doc('equipes/E1/projetos/novo').set({ nome: 'n', responsavelUid: P, gpUid: G }));
    await assertFails(como(P).doc('equipes/E1/projetos/doP').delete());
  });
  test('perde o acesso ao sair da equipe (responsavelUid sozinho não basta)', async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('equipes/E1/membros/' + P).delete());
    await assertFails(como(P).doc('equipes/E1/projetos/doP').get());
  });
});

describe('projetos: GP', () => {
  test('lê e lista só os projetos em que é o GP', async () => {
    await assertSucceeds(como(G).doc('equipes/E1/projetos/doP').get());
    await assertFails(como(G).doc('equipes/E1/projetos/doT').get());
    await assertSucceeds(como(G).collection('equipes/E1/projetos').where('gpUid', '==', G).get());
    await assertFails(como(G).collection('equipes/E1/projetos').get());
  });
  test('cria projeto sendo ele o GP; não cria em nome de outro GP', async () => {
    await assertSucceeds(como(G).doc('equipes/E1/projetos/novo').set({ nome: 'n', gpUid: G, responsavelUid: T }));
    await assertFails(como(G).doc('equipes/E1/projetos/novo2').set({ nome: 'n', gpUid: 'outroGP', responsavelUid: T }));
  });
  test('altera datas e técnico do próprio projeto, mas não passa o projeto adiante', async () => {
    await assertSucceeds(como(G).doc('equipes/E1/projetos/doP').update({ pcpInicio: '2026-10-17', responsavelUid: T }));
    await assertFails(como(G).doc('equipes/E1/projetos/doP').update({ gpUid: 'outroGP' }));
    await assertFails(como(G).doc('equipes/E1/projetos/doT').update({ nome: 'x' }));
  });
  test('apaga só o próprio projeto', async () => {
    await assertFails(como(G).doc('equipes/E1/projetos/doT').delete());
    await assertSucceeds(como(G).doc('equipes/E1/projetos/doP').delete());
  });
});

describe('projetos: Gerente de PCP', () => {
  for (const [quem, uid] of [['gerente', M], ['coordenador (papel antigo)', C]]) {
    test(quem + ' lê, cria, designa qualquer GP e apaga', async () => {
      const db = como(uid);
      await assertSucceeds(db.collection('equipes/E1/projetos').get());
      await assertSucceeds(db.doc('equipes/E1/projetos/novo').set({ nome: 'n', gpUid: G, responsavelUid: P }));
      await assertSucceeds(db.doc('equipes/E1/projetos/doT').update({ gpUid: G, responsavelUid: P }));
      await assertSucceeds(db.doc('equipes/E1/projetos/novo').delete());
    });
  }
});

describe('projetos: fábrica e quem é de fora', () => {
  test('programadores leem todos os projetos (linha do tempo e carga), sem editar', async () => {
    for (const uid of [U, K]) {
      await assertSucceeds(como(uid).doc('equipes/E1/projetos/doP').get());
      await assertSucceeds(como(uid).collection('equipes/E1/projetos').get());
      await assertFails(como(uid).doc('equipes/E1/projetos/doP').update({ nome: 'outro' }));
      await assertFails(como(uid).doc('equipes/E1/projetos/doP').update({ checklist: [] }));
      await assertFails(como(uid).doc('equipes/E1/projetos/doP').delete());
    }
  });
  test('CQ não vê projetos; ninguém da fábrica cria projeto', async () => {
    await assertFails(como(Q).doc('equipes/E1/projetos/doP').get());
    for (const uid of [U, K, Q]) await assertFails(como(uid).doc('equipes/E1/projetos/novo').set({ nome: 'n', gpUid: uid }));
  });
  test('quem é de fora não lê nada da equipe', async () => {
    await assertFails(como(X).doc('equipes/E1/projetos/doP').get());
    await assertFails(como(X).doc('equipes/E1').get());
    await assertFails(como(Y).collection('equipes/E1/membros').get());
    await assertFails(semLogin().doc('equipes/E1/projetos/doP').get());
  });
  test('chat: quem vê o projeto conversa; a fábrica não', async () => {
    const msg = (uid) => ({ autorUid: uid, autorNome: uid, texto: 'oi', criadoEm: 'x' });
    await assertSucceeds(como(G).collection('equipes/E1/projetos/doP/chat').add(msg(G)));
    await assertSucceeds(como(P).collection('equipes/E1/projetos/doP/chat').add(msg(P)));
    await assertSucceeds(como(M).collection('equipes/E1/projetos/doP/chat').get());
    await assertFails(como(T).collection('equipes/E1/projetos/doP/chat').add(msg(T)));
    await assertFails(como(U).collection('equipes/E1/projetos/doP/chat').get());
  });
});

/* ------------------------------------------------------------------ carga */
describe('carga máquina e carga fábrica', () => {
  const prog = (uid, extra) => ({ maquinaId: 'm1', horasPrevistas: 6, programadoEm: 'x', programadoPorUid: uid, ...extra });
  test('programador de usinagem programa máquina e horas da OP de usinagem', async () => {
    await assertSucceeds(como(U).doc('equipes/E1/ops/op1').update(prog(U)));
    await assertSucceeds(como(U).doc('equipes/E1/ops/op1').update(prog(U, { maquinaId: null, horasPrevistas: null })));
    await assertSucceeds(como(M).doc('equipes/E1/ops/op1').update(prog(M)));
  });
  test('programação não mexe em outros campos, nem em OP de caldeiraria, nem por outro cargo', async () => {
    await assertFails(como(U).doc('equipes/E1/ops/op1').update({ ...prog(U), status: 'aprovada' }));
    await assertFails(como(U).doc('equipes/E1/ops/op1').update(prog(U, { horasPrevistas: -1 })));
    await assertFails(como(U).doc('equipes/E1/ops/op1').update(prog(U, { programadoPorUid: K })));
    await assertFails(como(K).doc('equipes/E1/ops/op2').update(prog(K)));
    for (const uid of [K, G, P, Q]) await assertFails(como(uid).doc('equipes/E1/ops/op1').update(prog(uid)));
  });
  const maq = { nome: 'Torno CNC 1', horasDia: 8, ativa: true, criadoEm: 'x', atualizadoEm: 'x' };
  test('máquinas: programador de usinagem e gerente cadastram; a equipe lê', async () => {
    await assertSucceeds(como(U).doc('equipes/E1/maquinas/m1').set(maq));
    await assertSucceeds(como(M).doc('equipes/E1/maquinas/m2').set(maq));
    await assertSucceeds(como(G).collection('equipes/E1/maquinas').get());
    await assertSucceeds(como(U).doc('equipes/E1/maquinas/m1').delete());
    for (const uid of [K, G, T, Q]) await assertFails(como(uid).doc('equipes/E1/maquinas/m3').set(maq));
    await assertFails(como(U).doc('equipes/E1/maquinas/m4').set({ ...maq, horasDia: 30 }));
    await assertFails(como(U).doc('equipes/E1/maquinas/m4').set({ ...maq, extra: 1 }));
    await assertFails(como(X).collection('equipes/E1/maquinas').get());
  });
  test('capacidade da fábrica: programador de caldeiraria e gerente gravam', async () => {
    const cfg = (uid, kg) => ({ capacidadeKgSemana: kg, atualizadoEm: 'x', atualizadoPorUid: uid });
    await assertSucceeds(como(K).doc('equipes/E1/config/fabrica').set(cfg(K, 20000)));
    await assertSucceeds(como(M).doc('equipes/E1/config/fabrica').set(cfg(M, 25000)));
    await assertSucceeds(como(U).doc('equipes/E1/config/fabrica').get());
    for (const uid of [U, G, T, Q]) await assertFails(como(uid).doc('equipes/E1/config/fabrica').set(cfg(uid, 1000)));
    await assertFails(como(K).doc('equipes/E1/config/fabrica').set(cfg(K, 0)));
    await assertFails(como(K).doc('equipes/E1/config/outra').set(cfg(K, 1000)));
    await assertFails(como(K).doc('equipes/E1/config/fabrica').delete());
  });
});

/* --------------------------------------------------------------------- OPs */
describe('OPs: quem vê', () => {
  test('gerente e CQ veem todas', async () => {
    for (const uid of [C, M, Q]) await assertSucceeds(como(uid).collection('equipes/E1/ops').get());
  });
  test('programador vê só a área dele', async () => {
    await assertSucceeds(como(U).doc('equipes/E1/ops/op1').get());
    await assertFails(como(U).doc('equipes/E1/ops/op2').get());
    await assertSucceeds(como(U).collection('equipes/E1/ops').where('area', '==', 'usinagem').get());
    await assertFails(como(U).collection('equipes/E1/ops').get());
    await assertSucceeds(como(K).doc('equipes/E1/ops/op2').get());
    await assertFails(como(K).doc('equipes/E1/ops/op1').get());
  });
  test('GP e técnico veem as dos projetos deles', async () => {
    await assertSucceeds(como(G).doc('equipes/E1/ops/op1').get());
    await assertFails(como(G).doc('equipes/E1/ops/op2').get());
    await assertSucceeds(como(G).collection('equipes/E1/ops').where('gpUid', '==', G).get());
    await assertSucceeds(como(P).collection('equipes/E1/ops').where('tecnicoUid', '==', P).get());
    await assertFails(como(P).doc('equipes/E1/ops/op2').get());
  });
  test('quem é de fora não vê', async () => {
    await assertFails(como(Y).doc('equipes/E1/ops/op1').get());
  });
});

describe('OPs: planilha (técnico e gerente)', () => {
  test('técnico cria OP aberta do próprio projeto, com GP e técnico do projeto', async () => {
    await assertSucceeds(como(P).doc('equipes/E1/ops/nova').set(op({ area: 'caldeiraria' })));
  });
  test('não cria fora do formato', async () => {
    await assertFails(como(P).doc('equipes/E1/ops/n1').set(op({ gpUid: 'outroGP' })));
    await assertFails(como(P).doc('equipes/E1/ops/n2').set(op({ status: 'aprovada' })));
    await assertFails(como(P).doc('equipes/E1/ops/n3').set(op({ area: 'pintura' })));
    await assertFails(como(P).doc('equipes/E1/ops/n4').set(op({ finalizadoPorUid: Q })));
    await assertFails(como(P).doc('equipes/E1/ops/n5').set(op({ numero: '' })));
    await assertFails(como(P).doc('equipes/E1/ops/n6').set(op({ projetoId: 'doT', tecnicoUid: T, gpUid: 'outroGP' })));
  });
  test('programador, CQ e GP não sobem planilha; gerente sobe', async () => {
    for (const uid of [U, Q, G]) await assertFails(como(uid).doc('equipes/E1/ops/n7').set(op({ criadoPorUid: uid })));
    await assertSucceeds(como(M).doc('equipes/E1/ops/n8').set(op({ criadoPorUid: M })));
  });
  test('reenvio atualiza os dados da peça, nunca a finalização', async () => {
    await assertSucceeds(como(P).doc('equipes/E1/ops/op1').update({ descricao: 'SUPORTE NOVO', qtd: 3, atualizadoEm: 'y' }));
    await assertFails(como(P).doc('equipes/E1/ops/op1').update({ status: 'aprovada' }));
    await assertFails(como(P).doc('equipes/E1/ops/op1').update({ area: 'caldeiraria' }));
    await assertFails(como(T).doc('equipes/E1/ops/op1').update({ descricao: 'x' }));
  });
  test('técnico apaga OP aberta dele; finalizada só o gerente', async () => {
    await semear('equipes/E1/ops/op3', op({ status: 'aprovada', finalizadoPorUid: Q }));
    await assertFails(como(P).doc('equipes/E1/ops/op3').delete());
    await assertSucceeds(como(M).doc('equipes/E1/ops/op3').delete());
    await assertSucceeds(como(P).doc('equipes/E1/ops/op1').delete());
  });
});

describe('OPs: controle de qualidade', () => {
  const fim = (extra) => ({ status: 'aprovada', finalizadoPorUid: Q, finalizadoPorNome: 'Q', finalizadoEm: 'x', ...extra });
  test('CQ aprova uma vez e não desfaz', async () => {
    await assertSucceeds(como(Q).doc('equipes/E1/ops/op1').update(fim()));
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update({ status: 'retrabalho' }));
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update(fim({ status: 'desvio' })));
  });
  test('desvio só depois do retrabalho; o legado "rnc" conta como retrabalho', async () => {
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update(fim({ status: 'desvio' })));
    await semear('equipes/E1/ops/op4', op({ status: 'rnc' }));
    await assertSucceeds(como(Q).doc('equipes/E1/ops/op4').update(fim({ status: 'desvio' })));
  });
  test('CQ não finaliza em nome de outro nem mexe nos dados da peça', async () => {
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update(fim({ finalizadoPorUid: P })));
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update({ descricao: 'x' }));
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update(fim({ status: 'aberta' })));
  });
  test('retrabalho só apontando para uma RNC que existe', async () => {
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update({ status: 'retrabalho' }));
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update({ status: 'retrabalho', rncAtualId: 'naoExiste' }));
  });
  test('só o CQ finaliza', async () => {
    for (const uid of [M, G, P, U]) await assertFails(como(uid).doc('equipes/E1/ops/op1').update(fim({ finalizadoPorUid: uid })));
  });
});

describe('RNC (formulário R02)', () => {
  const fim = (extra) => ({ status: 'aprovada', finalizadoPorUid: Q, finalizadoPorNome: 'Q', finalizadoEm: 'x', ...extra });
  function form(extra) {
    return { numero: '001', produto: 'SUPORTE', desenho: '1609568', rev: '0', commessa: '2026-001', op: '02052501001', qtd: '2',
      tag: '', item: '1', setor: { usinagem: true, caldeiraria: false, pintura: false, fornecedor: false, outros: false }, setorOutros: '',
      procedencia: 'interno', descricao: 'Furo fora de posição', inspetor: 'Q', qtdNc: '1', data: '2026-10-20',
      disposicao: '', dispResponsavel: '', dispData: '', reOp: '', reInspetor: '', reData: '', reResultado: '', reResponsavel: '',
      observacoes: '', situacao: 'aberta', atualizadoEm: 'x', ...extra };
  }
  function doc(extra) {
    return { ...form(), opId: 'op1', projetoId: 'doP', area: 'usinagem', gpUid: G, tecnicoUid: P,
      criadoPorUid: Q, criadoPorNome: 'Q', criadoEm: 'x', ...extra };
  }
  // Mesmo caminho do app (dados/rncs.js → abrir): RNC + OP em retrabalho no mesmo lote.
  async function abrir(db, id, extraRnc, extraOp) {
    const lote = db.batch();
    lote.set(db.doc('equipes/E1/rncs/' + id), doc(extraRnc));
    lote.update(db.doc('equipes/E1/ops/' + ((extraRnc && extraRnc.opId) || 'op1')),
      { status: 'retrabalho', rncAtualId: id, rncNumero: '001', retrabalhoDesde: 'x', ...extraOp });
    return lote.commit();
  }

  test('CQ abre a RNC e a OP vai para retrabalho no mesmo lote', async () => {
    await assertSucceeds(abrir(como(Q), 'r1'));
  });
  test('sem mexer na OP, a RNC não é criada; nem a OP vai para retrabalho sozinha', async () => {
    await assertFails(como(Q).doc('equipes/E1/rncs/r1').set(doc()));
    await assertFails(abrir(como(Q), 'r1', {}, { rncAtualId: 'outra' }));
  });
  test('RNC fora do formato ou com dados que não batem com a OP', async () => {
    await assertFails(abrir(como(Q), 'r1', { descricao: '' }));
    await assertFails(abrir(como(Q), 'r1', { numero: 'x'.repeat(31) }));
    await assertFails(abrir(como(Q), 'r1', { gpUid: 'outroGP' }));
    await assertFails(abrir(como(Q), 'r1', { projetoId: 'doT' }));
    await assertFails(abrir(como(Q), 'r1', { criadoPorUid: P }));
    await assertFails(abrir(como(Q), 'r1', { campoEstranho: 1 }));
  });
  test('não abre RNC de OP já aprovada', async () => {
    await semear('equipes/E1/ops/op5', op({ status: 'aprovada', finalizadoPorUid: Q }));
    await assertFails(abrir(como(Q), 'r1', { opId: 'op5' }));
  });
  test('só o CQ abre e edita; ninguém apaga', async () => {
    for (const uid of [M, G, P, U]) await assertFails(abrir(como(uid), 'r1', { criadoPorUid: uid }));
    await semear('equipes/E1/rncs/r2', doc());
    await assertSucceeds(como(Q).doc('equipes/E1/rncs/r2').update({ disposicao: 'Retrabalhar furo', atualizadoEm: 'y' }));
    await assertFails(como(Q).doc('equipes/E1/rncs/r2').update({ opId: 'op2' }));
    await assertFails(como(M).doc('equipes/E1/rncs/r2').update({ disposicao: 'x' }));
    await assertFails(como(Q).doc('equipes/E1/rncs/r2').delete());
    await assertFails(como(M).doc('equipes/E1/rncs/r2').delete());
  });
  test('quem lê: Gerência e CQ todas; GP e técnico só as dos projetos deles', async () => {
    await semear('equipes/E1/rncs/r2', doc());
    await semear('equipes/E1/rncs/r3', doc({ opId: 'op2', projetoId: 'doT', area: 'caldeiraria', gpUid: 'outroGP', tecnicoUid: T }));
    for (const uid of [C, M, Q]) await assertSucceeds(como(uid).collection('equipes/E1/rncs').get());
    await assertSucceeds(como(G).collection('equipes/E1/rncs').where('gpUid', '==', G).get());
    await assertFails(como(G).doc('equipes/E1/rncs/r3').get());
    await assertSucceeds(como(P).doc('equipes/E1/rncs/r2').get());
    await assertSucceeds(como(T).doc('equipes/E1/rncs/r3').get());
    await assertFails(como(T).doc('equipes/E1/rncs/r2').get());
    for (const uid of [U, K, Y]) await assertFails(como(uid).doc('equipes/E1/rncs/r2').get());
  });
  test('reinspeção conforme aprova; desvio libera com desvio', async () => {
    await assertSucceeds(abrir(como(Q), 'r1'));
    await assertSucceeds(como(Q).doc('equipes/E1/ops/op1').update(fim({ status: 'desvio' })));
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update(fim()));
  });
  test('nova RNC na OP que continua em retrabalho', async () => {
    await assertSucceeds(abrir(como(Q), 'r1'));
    await assertSucceeds(abrir(como(Q), 'r9', { numero: '002' }, { rncNumero: '002' }));
  });
  test('Nº OP de retrabalho: nasce a OP nova ligada e a original vira peça morta', async () => {
    await assertSucceeds(abrir(como(Q), 'r1'));
    const db = como(Q);
    const nova = op({ numero: '02052501099', criadoPorUid: Q, origemOpId: 'op1', origemRncId: 'r1' });
    const lote = db.batch();
    lote.set(db.doc('equipes/E1/ops/op1__rt1'), nova);
    lote.update(db.doc('equipes/E1/ops/op1'), { status: 'morta', mortaEm: 'x', opNovaId: 'op1__rt1', opNovaNumero: '02052501099' });
    await assertSucceeds(lote.commit());
    // morta é final
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update(fim()));
  });
  test('peça morta exige a OP nova no mesmo lote, e OP nova exige a morta', async () => {
    await assertSucceeds(abrir(como(Q), 'r1'));
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update({ status: 'morta', mortaEm: 'x', opNovaId: 'naoExiste' }));
    await assertFails(como(Q).doc('equipes/E1/ops/op1__rt2').set(op({ criadoPorUid: Q, origemOpId: 'op1', origemRncId: 'r1' })));
    // de OP aberta (sem RNC) não dá
    const db = como(Q);
    const lote = db.batch();
    lote.set(db.doc('equipes/E1/ops/op2__rt'), op({ projetoId: 'doT', gpUid: 'outroGP', tecnicoUid: T, area: 'caldeiraria', criadoPorUid: Q, origemOpId: 'op2', origemRncId: 'r1' }));
    lote.update(db.doc('equipes/E1/ops/op2'), { status: 'morta', mortaEm: 'x', opNovaId: 'op2__rt' });
    await assertFails(lote.commit());
  });
});

describe('OPs: designação acompanha o projeto', () => {
  test('GP atualiza o técnico copiado na OP quando o projeto mudou', async () => {
    await assertSucceeds(como(G).doc('equipes/E1/projetos/doP').update({ responsavelUid: T }));
    await assertFails(como(G).doc('equipes/E1/ops/op1').update({ tecnicoUid: T, descricao: 'x' }));
    await assertSucceeds(como(G).doc('equipes/E1/ops/op1').update({ tecnicoUid: T }));
    await assertFails(como(G).doc('equipes/E1/ops/op1').update({ tecnicoUid: X }));
  });
});

/* ---------------------------------------------------------------- convites */
describe('convites', () => {
  test('Gerente de PCP e coordenador criam convite de qualquer cargo, com a hora do servidor', async () => {
    for (const papel of ['gerente_pcp', 'gp', 'tecnico', 'prog_usinagem', 'prog_caldeiraria', 'cq']) {
      await assertSucceeds(como(M).doc('convites/cM' + papel).set(
        { criadoPor: M, equipeId: 'E1', usado: false, papel, criadoEm: 'x', emitidoEm: horaDoServidor() }));
    }
    await assertSucceeds(como(C).doc('convites/cC123456').set(
      { criadoPor: C, equipeId: 'E1', usado: false, papel: 'gp', criadoEm: 'x', emitidoEm: horaDoServidor() }));
  });
  test('não cria convite com data do cliente, sem data, cargo inválido, ou se não for gerente', async () => {
    const base = { criadoPor: M, equipeId: 'E1', usado: false, papel: 'tecnico', criadoEm: 'x' };
    await assertFails(como(M).doc('convites/c1').set({ ...base, emitidoEm: Timestamp.fromMillis(Date.now() + 30 * DIA) }));
    await assertFails(como(M).doc('convites/c2').set(base));
    await assertFails(como(M).doc('convites/c3').set({ ...base, papel: 'coordenador', emitidoEm: horaDoServidor() }));
    for (const uid of [G, P, Q, Y]) await assertFails(como(uid).doc('convites/c4' + uid).set({ ...base, emitidoEm: horaDoServidor() }));
  });
  test('entrar por convite: vira membro com o papel do convite', async () => {
    await semear('convites/abc12345', convite('gp', 1));
    const db = como(X);
    await assertSucceeds(consumir(db, 'abc12345', X));
    await assertSucceeds(db.doc('equipes/E1/membros/' + X).set({ nome: 'X', papel: 'gp', viaConvite: 'abc12345' }));
    await assertSucceeds(db.doc('usuarios/' + X + '/minhasEquipes/E1').set({ papel: 'gp', nomeEquipe: 'Equipe 1', viaConvite: 'abc12345' }));
  });
  test('entrar por convite de CQ vira CQ, não outro cargo', async () => {
    await semear('convites/cq123456', convite('cq', 1));
    await consumir(como(X), 'cq123456', X);
    await assertFails(como(X).doc('equipes/E1/membros/' + X).set({ nome: 'X', papel: 'gerente_pcp', viaConvite: 'cq123456' }));
    await assertSucceeds(como(X).doc('equipes/E1/membros/' + X).set({ nome: 'X', papel: 'cq', viaConvite: 'cq123456' }));
  });
  test('não dá pra entrar com papel diferente do convite', async () => {
    await semear('convites/abc12345', convite('tecnico', 1));
    const db = como(X);
    await consumir(db, 'abc12345', X);
    await assertFails(db.doc('equipes/E1/membros/' + X).set({ nome: 'X', papel: 'gp', viaConvite: 'abc12345' }));
    await assertFails(db.doc('usuarios/' + X + '/minhasEquipes/E1').set({ papel: 'gp', viaConvite: 'abc12345' }));
  });
  test('uso único: o segundo não consome nem aproveita o convite já usado', async () => {
    await semear('convites/abc12345', convite('tecnico', 1));
    await consumir(como(X), 'abc12345', X);
    await assertFails(consumir(como(Y), 'abc12345', Y));
    await assertFails(como(Y).doc('equipes/E1/membros/' + Y).set({ nome: 'Y', papel: 'tecnico', viaConvite: 'abc12345' }));
  });
  test('sem consumir antes, não vira membro', async () => {
    await semear('convites/abc12345', convite('tecnico', 1));
    await assertFails(como(X).doc('equipes/E1/membros/' + X).set({ nome: 'X', papel: 'tecnico', viaConvite: 'abc12345' }));
  });
  test('convite de outra equipe não serve', async () => {
    await semear('convites/abc12345', { ...convite('gp', 1), equipeId: 'E2' });
    await consumir(como(X), 'abc12345', X);
    await assertFails(como(X).doc('equipes/E1/membros/' + X).set({ nome: 'X', papel: 'gp', viaConvite: 'abc12345' }));
  });
  test('ao consumir, não muda papel, equipe nem data, nem marca em nome de outro', async () => {
    await semear('convites/abc12345', convite('tecnico', 1));
    const ref = como(X).doc('convites/abc12345');
    await assertFails(ref.update({ usado: true, usadoPor: X, papel: 'gp' }));
    await assertFails(ref.update({ usado: true, usadoPor: X, equipeId: 'E2' }));
    await assertFails(ref.update({ usado: true, usadoPor: X, emitidoEm: Timestamp.now() }));
    await assertFails(ref.update({ usado: true, usadoPor: Y }));
  });
  test('validade de 7 dias: vale com 6, vencido com 8, convite antigo sem data não vale', async () => {
    await semear('convites/seisdias', convite('tecnico', 6));
    await semear('convites/oitodias', convite('tecnico', 8));
    const antigo = convite('tecnico', 0); delete antigo.emitidoEm;
    await semear('convites/semdata0', antigo);
    await assertSucceeds(consumir(como(X), 'seisdias', X));
    await assertFails(consumir(como(Y), 'oitodias', Y));
    await assertFails(consumir(como(Y), 'semdata0', Y));
  });
  test('listar só da própria equipe e só o gerente; apagar idem', async () => {
    await semear('convites/abc12345', convite('tecnico', 1));
    await assertSucceeds(como(M).collection('convites').where('equipeId', '==', 'E1').get());
    await assertFails(como(M).collection('convites').get());
    await assertFails(como(G).collection('convites').where('equipeId', '==', 'E1').get());
    await assertFails(como(G).doc('convites/abc12345').delete());
    await assertSucceeds(como(M).doc('convites/abc12345').delete());
  });
});

/* -------------------------------------------------------------- nome+senha */
describe('entrar por nome + senha', () => {
  function lote(db, uid, hash, papel) {
    const b = db.batch();
    b.set(db.doc('equipeSegredos/E1/entradas/' + uid), { senhaHash: hash });
    b.set(db.doc('equipes/E1/membros/' + uid), { nome: uid, papel });
    return b.commit();
  }
  test('senha certa: entra como técnico e grava o índice pessoal', async () => {
    const db = como(X);
    await assertSucceeds(lote(db, X, HASH_CERTO, 'tecnico'));
    await assertSucceeds(db.doc('equipeSegredos/E1/entradas/' + X).delete());
    await assertSucceeds(db.doc('usuarios/' + X + '/minhasEquipes/E1').set({ papel: 'tecnico', nomeEquipe: 'Equipe 1' }));
  });
  test('versão antiga do app (papel "planejador") ainda entra', async () => {
    await assertSucceeds(lote(como(X), X, HASH_CERTO, 'planejador'));
  });
  test('senha errada não entra', async () => {
    await assertFails(lote(como(X), X, 'hash-errado', 'tecnico'));
  });
  test('senha certa não dá outro cargo', async () => {
    for (const papel of ['gp', 'gerente_pcp', 'cq']) await assertFails(lote(como(X), X, HASH_CERTO, papel));
  });
  test('sem gravar a tentativa no mesmo lote não entra', async () => {
    await assertFails(como(X).doc('equipes/E1/membros/' + X).set({ nome: X, papel: 'tecnico' }));
  });
  test('índice pessoal como GP não é aceito depois de entrar por senha', async () => {
    await lote(como(X), X, HASH_CERTO, 'tecnico');
    await assertFails(como(X).doc('usuarios/' + X + '/minhasEquipes/E1').set({ papel: 'gp' }));
  });
  test('ninguém lê o hash da senha nem as tentativas', async () => {
    await assertFails(como(C).doc('equipeSegredos/E1').get());
    await assertFails(como(X).doc('equipeSegredos/E1/entradas/' + X).get());
  });
  test('equipe antiga (hash ainda em /equipes) também confere', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('equipeSegredos/E1').delete();
      await ctx.firestore().doc('equipes/E1').update({ senhaHash: 'hash-antigo' });
    });
    await assertFails(lote(como(Y), Y, 'outro', 'tecnico'));
    await assertSucceeds(lote(como(X), X, 'hash-antigo', 'tecnico'));
  });
});

/* ----------------------------------------------------- papéis e membros */
describe('cargos e remoção de membros', () => {
  test('o Gerente de PCP muda o cargo de qualquer outro para um cargo válido', async () => {
    await assertSucceeds(como(M).doc('equipes/E1/membros/' + P).update({ papel: 'tecnico' }));
    await assertSucceeds(como(M).doc('equipes/E1/membros/' + T).update({ papel: 'cq' }));
    await assertSucceeds(como(C).doc('equipes/E1/membros/' + G).update({ papel: 'gerente_pcp' }));
    await assertFails(como(M).doc('equipes/E1/membros/' + P).update({ papel: 'coordenador' }));
    await assertFails(como(M).doc('equipes/E1/membros/' + P).update({ papel: 'planejador' }));
  });
  test('gerente muda o cargo de outro gerente, nunca o próprio', async () => {
    await assertFails(como(M).doc('equipes/E1/membros/' + M).update({ papel: 'tecnico' }));
    await assertSucceeds(como(M).doc('equipes/E1/membros/' + C).update({ papel: 'tecnico' }));
    for (const uid of [G, P, Q]) await assertFails(como(uid).doc('equipes/E1/membros/' + uid).update({ papel: 'gerente_pcp' }));
  });
  test('migração: o criador da equipe antiga grava o próprio gerente_pcp e marca a equipe', async () => {
    const db = como(C);
    const lote = db.batch();
    lote.update(db.doc('equipes/E1/membros/' + C), { papel: 'gerente_pcp' });
    lote.update(db.doc('equipes/E1'), { papeisMigrados: true });
    await assertSucceeds(lote.commit());
    await assertFails(como(C).doc('equipes/E1').update({ papeisMigrados: false }));
    await assertFails(como(G).doc('equipes/E1').update({ papeisMigrados: true }));
  });
  test('depois da migração o criador vale só pelo papel gravado', async () => {
    await semear('equipes/E1', { nome: 'Equipe 1', coordenadorUid: C, criadoPorUid: C, papeisMigrados: true });
    // C ficou com o papel antigo "gp" gravado: não é mais Gerência
    await assertFails(como(C).doc('equipes/E1/membros/' + P).update({ papel: 'tecnico' }));
    await assertFails(como(C).doc('equipes/E1/projetos/doT').get());
    await assertSucceeds(como(M).doc('equipes/E1/projetos/doT').get());
  });
  test('cada um muda só o próprio nome de exibição', async () => {
    await assertSucceeds(como(P).doc('equipes/E1/membros/' + P).update({ nome: 'Novo nome' }));
    await assertFails(como(P).doc('equipes/E1/membros/' + G).update({ nome: 'x' }));
    await assertFails(como(P).doc('equipes/E1/membros/' + P).update({ nome: 'x'.repeat(61) }));
  });
  test('gerente remove os outros (inclusive gerente); cada um sai, menos gerente', async () => {
    await assertFails(como(G).doc('equipes/E1/membros/' + P).delete());
    await assertSucceeds(como(M).doc('equipes/E1/membros/' + P).delete());
    await assertSucceeds(como(G).doc('equipes/E1/membros/' + G).delete());
    await assertFails(como(M).doc('equipes/E1/membros/' + M).delete());
    await assertFails(como(C).doc('equipes/E1/membros/' + C).delete());
    await assertSucceeds(como(M).doc('equipes/E1/membros/' + C).delete());
  });
  test('não existe mais passar coordenação', async () => {
    await assertFails(como(C).doc('equipes/E1').update({ coordenadorUid: M }));
    await assertFails(como(M).doc('equipes/E1').update({ coordenadorUid: M }));
  });
  test('qualquer gerente troca a senha da equipe; os outros não', async () => {
    await assertSucceeds(como(M).doc('equipeSegredos/E1').set({ senhaHash: 'nova' }));
    await assertSucceeds(como(C).doc('equipeSegredos/E1').set({ senhaHash: 'nova2' }));
    for (const uid of [G, P, Q, Y]) await assertFails(como(uid).doc('equipeSegredos/E1').set({ senhaHash: 'x' }));
  });
  test('ninguém se adiciona como membro sem convite nem senha', async () => {
    await assertFails(como(X).doc('equipes/E1/membros/' + X).set({ nome: X, papel: 'gp' }));
    await assertFails(como(M).doc('equipes/E1/membros/' + X).set({ nome: X, papel: 'tecnico' }));
  });
});

describe('pedidos do GP à Gerência', () => {
  const ped = (extra) => ({ tipo: 'paralisar', motivo: 'Cliente suspendeu', porUid: G, porNome: 'G', em: 'x', ...extra });
  test('GP pede para paralisar sem mudar o status; desiste', async () => {
    await assertSucceeds(como(G).doc('equipes/E1/projetos/doP').update({ pedido: ped() }));
    await assertSucceeds(como(G).doc('equipes/E1/projetos/doP').update({ pedido: null }));
  });
  test('pedido fora do formato ou em nome de outro', async () => {
    await assertFails(como(G).doc('equipes/E1/projetos/doP').update({ pedido: ped({ porUid: M }) }));
    await assertFails(como(G).doc('equipes/E1/projetos/doP').update({ pedido: ped({ tipo: 'apagar' }) }));
    await assertFails(como(G).doc('equipes/E1/projetos/doP').update({ pedido: ped({ motivo: '' }) }));
  });
  test('GP não paralisa nem cancela direto; retoma, conclui e reabre', async () => {
    await assertFails(como(G).doc('equipes/E1/projetos/doP').update({ status: 'paralisado' }));
    await assertFails(como(G).doc('equipes/E1/projetos/doP').update({ status: 'cancelado' }));
    await semear('equipes/E1/projetos/doP', { nome: 'Projeto do P', gpUid: G, responsavelUid: P, checklist: [], status: 'paralisado' });
    await assertSucceeds(como(G).doc('equipes/E1/projetos/doP').update({ status: 'ativo' }));
    await assertSucceeds(como(G).doc('equipes/E1/projetos/doP').update({ status: 'concluido' }));
    await assertSucceeds(como(G).doc('equipes/E1/projetos/doP').update({ status: 'ativo' }));
  });
  test('GP não cria projeto já paralisado ou com pedido', async () => {
    await assertFails(como(G).doc('equipes/E1/projetos/n1').set({ gpUid: G, status: 'paralisado' }));
    await assertFails(como(G).doc('equipes/E1/projetos/n2').set({ gpUid: G, status: 'ativo', pedido: ped() }));
    await assertSucceeds(como(G).doc('equipes/E1/projetos/n3').set({ gpUid: G, status: 'ativo' }));
  });
  test('Gerência aprova (aplica e limpa o pedido) ou recusa', async () => {
    await semear('equipes/E1/projetos/doP', { nome: 'Projeto do P', gpUid: G, responsavelUid: P, checklist: [], status: 'ativo', pedido: ped() });
    await assertSucceeds(como(M).doc('equipes/E1/projetos/doP').update({ status: 'paralisado', pedido: null }));
    await assertSucceeds(como(C).doc('equipes/E1/projetos/doP').update({ status: 'cancelado' }));
  });
});

/* ------------------------------------------------------------ notificações */
describe('notificações', () => {
  const notif = (deUid, paraUid, extra) => ({
    paraUid, deUid, equipeId: 'E1', tipo: 'designacao', mensagem: 'Você foi designado', projetoId: null, lida: false, ...extra
  });
  test('qualquer membro avisa outro membro da equipe', async () => {
    await assertSucceeds(como(G).collection('notificacoes').add(notif(G, P)));
    await assertSucceeds(como(C).collection('notificacoes').add(notif(C, P, { tipo: 'observacao', projetoId: 'doP' })));
    await assertSucceeds(como(P).collection('notificacoes').add(notif(P, G, { tipo: 'planilhaOps' })));
    await assertSucceeds(como(Q).collection('notificacoes').add(notif(Q, M, { tipo: 'rnc' })));
  });
  test('quem é de fora não cria', async () => {
    await assertFails(como(Y).collection('notificacoes').add(notif(Y, P)));
  });
  test('não cria para quem não é da equipe, em nome de outro ou fora do formato', async () => {
    await assertFails(como(G).collection('notificacoes').add(notif(G, Y)));
    await assertFails(como(G).collection('notificacoes').add(notif(C, P)));
    await assertFails(como(G).collection('notificacoes').add(notif(G, P, { tipo: 'spam' })));
    await assertFails(como(G).collection('notificacoes').add(notif(G, P, { lida: true })));
    await assertFails(como(G).collection('notificacoes').add(notif(G, P, { mensagem: 'x'.repeat(501) })));
    await assertFails(como(G).collection('notificacoes').add(notif(G, P, { extra: 'x' })));
  });
  test('destinatário lê e só marca como lida (e quando); os outros não leem', async () => {
    await semear('notificacoes/n1', notif(G, P));
    await assertSucceeds(como(P).doc('notificacoes/n1').get());
    await assertFails(como(G).doc('notificacoes/n1').get());
    await assertSucceeds(como(P).doc('notificacoes/n1').update({ lida: true, lidaEm: 'agora' }));
    await assertFails(como(P).doc('notificacoes/n1').update({ mensagem: 'trocada' }));
    await assertFails(como(G).doc('notificacoes/n1').delete());
    await assertSucceeds(como(P).doc('notificacoes/n1').delete());
  });
});

/* --------------------------------------------------------------- usuários */
describe('/usuarios', () => {
  test('só o dono lê e altera o próprio perfil', async () => {
    await assertSucceeds(como(P).doc('usuarios/' + P).get());
    await assertFails(como(G).doc('usuarios/' + P).get());
    await assertFails(como(C).collection('usuarios').get());
    await assertSucceeds(como(P).doc('usuarios/' + P).update({ nome: 'Novo', tema: 'escuro' }));
    await assertFails(como(G).doc('usuarios/' + P).update({ nome: 'x' }));
  });
  test('perfil nasce com o contador zerado e só pelo dono', async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('usuarios/' + X).delete());
    await assertFails(como(G).doc('usuarios/' + X).set({ nome: 'X', equipesCriadas: 0 }));
    await assertFails(como(X).doc('usuarios/' + X).set({ nome: 'X', equipesCriadas: -5 }));
    await assertSucceeds(como(X).doc('usuarios/' + X).set({ nome: 'X', equipesCriadas: 0 }));
  });
  test('o contador de equipes não volta nem pula', async () => {
    await assertFails(como(C).doc('usuarios/' + C).update({ equipesCriadas: 0 }));
    await assertFails(como(C).doc('usuarios/' + C).update({ equipesCriadas: 3 }));
  });
  test('estado dos alertas do Sistema: só o dono, e depois de criado só muda o lidaEm', async () => {
    const ref = (uid) => como(uid).doc('usuarios/' + P + '/alertas/2026-10-19_E1_tarefa-atrasada:doP');
    const novo = { semana: '2026-10-19', equipeId: 'E1', alertaId: 'tarefa-atrasada:doP', criadoEm: 'x', lidaEm: null };
    await assertFails(ref(G).set(novo));
    await assertFails(ref(P).set({ ...novo, extra: 1 }));
    await assertSucceeds(ref(P).set(novo));
    await assertSucceeds(ref(P).update({ lidaEm: 'agora' }));
    await assertSucceeds(ref(P).update({ lidaEm: null }));
    await assertFails(ref(P).update({ semana: '2026-10-26' }));
    await assertFails(ref(G).get());
    await assertSucceeds(ref(P).delete());
  });
  test('notificação volta a "não lida" pelo destinatário', async () => {
    await semear('notificacoes/n2', { paraUid: P, deUid: G, equipeId: 'E1', tipo: 'chat', mensagem: 'oi', projetoId: null, lida: true, lidaEm: 'x' });
    await assertSucceeds(como(P).doc('notificacoes/n2').update({ lida: false, lidaEm: null }));
  });
  test('índice pessoal: só o dono lê', async () => {
    await semear('usuarios/' + P + '/minhasEquipes/E1', { papel: 'tecnico' });
    await assertSucceeds(como(P).doc('usuarios/' + P + '/minhasEquipes/E1').get());
    await assertFails(como(C).doc('usuarios/' + P + '/minhasEquipes/E1').get());
  });
});

/* ------------------------------------------------- limite de 3 equipes */
describe('criar equipe (limite de 3)', () => {
  // Mesmo caminho do app (auth.js → criarEquipe): equipe, segredo e
  // contador +1 numa transação só.
  function criar(uid, id, opcoes = {}) {
    const db = como(uid);
    return db.runTransaction(async (tx) => {
      const refPerfil = db.doc('usuarios/' + uid);
      const atual = (await tx.get(refPerfil)).data().equipesCriadas || 0;
      tx.set(db.doc('equipes/' + id), { nome: id, coordenadorUid: uid, criadoPorUid: uid, ...(opcoes.extra || {}) });
      if (!opcoes.semSegredo) tx.set(db.doc('equipeSegredos/' + id), { senhaHash: 'h' });
      tx.update(refPerfil, { equipesCriadas: atual + (opcoes.incremento ?? 1) });
    });
  }
  test('cria até a terceira e recusa a quarta', async () => {
    await assertSucceeds(criar(X, 'N1'));
    await assertSucceeds(criar(X, 'N2'));
    await assertSucceeds(criar(X, 'N3'));
    await assertFails(criar(X, 'N4'));
  });
  test('depois de criar, vira Gerente de PCP da própria equipe', async () => {
    await criar(X, 'N1');
    await assertSucceeds(como(X).doc('equipes/N1/membros/' + X).set({ nome: X, papel: 'gerente_pcp' }));
    await assertSucceeds(como(X).doc('usuarios/' + X + '/minhasEquipes/N1').set({ papel: 'gerente_pcp', nomeEquipe: 'N1' }));
  });
  test('sem subir o contador, sem segredo ou com hash na equipe é recusado', async () => {
    await assertFails(criar(X, 'N1', { incremento: 0 }));
    await assertFails(criar(X, 'N1', { semSegredo: true }));
    await assertFails(criar(X, 'N1', { extra: { senhaHash: 'h' } }));
  });
  test('não cria equipe em nome de outra pessoa', async () => {
    await assertFails(criar(X, 'N1', { extra: { coordenadorUid: Y } }));
  });
});
