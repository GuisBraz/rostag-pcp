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
describe('checklist padrão do PCP', () => {
  const lista = (uid, extra) => ({ itens: [{ t: 'Receber o projeto', dias: 0 }], atualizadoEm: 'x', porUid: uid, porNome: uid, ...extra });
  test('Gerência e GP gravam; os outros cargos só leem', async () => {
    await assertSucceeds(como(M).doc('equipes/E1/config/checklist').set(lista(M)));
    await assertSucceeds(como(G).doc('equipes/E1/config/checklist').set(lista(G)));
    for (const uid of [P, T, U, K, Q]) {
      await assertFails(como(uid).doc('equipes/E1/config/checklist').set(lista(uid)));
      await assertSucceeds(como(uid).doc('equipes/E1/config/checklist').get());
    }
    await assertFails(como(Y).doc('equipes/E1/config/checklist').get());
  });
  test('fora do formato, vazio, grande demais ou em nome de outro', async () => {
    await assertFails(como(G).doc('equipes/E1/config/checklist').set(lista(G, { itens: [] })));
    await assertFails(como(G).doc('equipes/E1/config/checklist').set(lista(G, { itens: Array.from({ length: 61 }, (_x, i) => ({ t: 't' + i, dias: 0 })) })));
    await assertFails(como(G).doc('equipes/E1/config/checklist').set(lista(M)));
    await assertFails(como(G).doc('equipes/E1/config/checklist').set(lista(G, { extra: 1 })));
    await assertFails(como(G).doc('equipes/E1/config/checklist').delete());
  });
});

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
  test('só o CQ abre e edita tudo; ninguém apaga', async () => {
    for (const uid of [M, G, P, U]) await assertFails(abrir(como(uid), 'r1', { criadoPorUid: uid }));
    await semear('equipes/E1/rncs/r2', doc());
    await assertSucceeds(como(Q).doc('equipes/E1/rncs/r2').update({ disposicao: 'Retrabalhar furo', atualizadoEm: 'y' }));
    await assertFails(como(Q).doc('equipes/E1/rncs/r2').update({ opId: 'op2' }));
    await assertFails(como(M).doc('equipes/E1/rncs/r2').update({ descricao: 'x' }));
    await assertFails(como(Q).doc('equipes/E1/rncs/r2').delete());
    await assertFails(como(M).doc('equipes/E1/rncs/r2').delete());
  });
  test('disposição: Gerência, GP e técnico do projeto gravam só ela, com a RNC aberta', async () => {
    await semear('equipes/E1/rncs/r2', doc());
    const disp = (uid) => ({ disposicao: 'Retrabalhar furo', dispResponsavel: uid, dispData: '2026-11-12', atualizadoEm: 'y' });
    for (const uid of [M, G, P]) {
      await semear('equipes/E1/rncs/r2', doc());
      await assertSucceeds(como(uid).doc('equipes/E1/rncs/r2').update(disp(uid)));
    }
    await assertFails(como(G).doc('equipes/E1/rncs/r2').update(disp(G)));   // já tem disposição: quem deu primeiro vale
    await semear('equipes/E1/rncs/r2', doc());
    await assertFails(como(P).doc('equipes/E1/rncs/r2').update({ ...disp(P), disposicao: '' }));
    for (const uid of [T, U, K]) await assertFails(como(uid).doc('equipes/E1/rncs/r2').update(disp(uid)));   // outro técnico, programadores
    await assertFails(como(P).doc('equipes/E1/rncs/r2').update({ disposicao: 'x', reResultado: 'conforme' }));
    await assertFails(como(P).doc('equipes/E1/rncs/r2').update({ situacao: 'encerrada' }));
    await assertFails(como(P).doc('equipes/E1/rncs/r2').update({ disposicao: 'x'.repeat(3001) }));
    await semear('equipes/E1/rncs/r4', doc({ situacao: 'encerrada' }));
    await assertFails(como(P).doc('equipes/E1/rncs/r4').update(disp(P)));
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
    // r2 é de usinagem: o programador de usinagem lê (só leitura); caldeiraria e quem é de fora, não
    await assertSucceeds(como(U).doc('equipes/E1/rncs/r2').get());
    for (const uid of [K, Y]) await assertFails(como(uid).doc('equipes/E1/rncs/r2').get());
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
    paraUid, deUid, deNome: deUid, equipeId: 'E1', tipo: 'designacao', mensagem: 'Você foi designado', projetoId: null, lida: false, ...extra
  });
  test('qualquer membro avisa outro membro da equipe', async () => {
    await assertSucceeds(como(G).collection('notificacoes').add(notif(G, P)));
    await assertSucceeds(como(C).collection('notificacoes').add(notif(C, P, { tipo: 'observacao', projetoId: 'doP' })));
    await assertSucceeds(como(P).collection('notificacoes').add(notif(P, G, { tipo: 'planilhaOps' })));
    await assertSucceeds(como(Q).collection('notificacoes').add(notif(Q, M, { tipo: 'rnc' })));
  });
  test('nome do remetente limitado', async () => {
    await assertFails(como(G).collection('notificacoes').add({ paraUid: P, deUid: G, deNome: 'x'.repeat(81), equipeId: 'E1', tipo: 'designacao', mensagem: 'm', projetoId: null, lida: false }));
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
  test('encerrar a conta: só o dono apaga o próprio perfil', async () => {
    await assertFails(como(G).doc('usuarios/' + P).delete());
    await assertSucceeds(como(P).doc('usuarios/' + P).delete());
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
  test('índice pessoal: só os campos do app', async () => {
    await semear('usuarios/' + P + '/minhasEquipes/E1', { papel: 'planejador', nomeEquipe: 'Equipe 1', entrouEm: 'x' });
    await assertSucceeds(como(P).doc('usuarios/' + P + '/minhasEquipes/E1').update({ nomeEquipe: 'Equipe 1 nova' }));
    await assertFails(como(P).doc('usuarios/' + P + '/minhasEquipes/E1').update({ lixo: 'x'.repeat(1000) }));
  });
  test('equipe principal: só o dono grava, e só um id', async () => {
    await assertSucceeds(como(P).doc('usuarios/' + P).update({ equipePrincipal: 'E1' }));
    await assertFails(como(P).doc('usuarios/' + P).update({ equipePrincipal: 'x'.repeat(200) }));
    await assertFails(como(G).doc('usuarios/' + P).update({ equipePrincipal: 'E1' }));
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

describe('planilha de avanço completa, PDF da OP e RNC por peças', () => {
  const lista = (extra) => ({ projetoId: 'doP', commessa: '2026-001', arquivo: 'AVANCO.xls', aba: 'AVANÇO', opPintura: '8000000099',
    linhas: [{ c: ['N°', 'DESENHO'] }, { c: [1, '1609568'] }], merges: [], larguras: [6, 12],
    enviadoEm: 'x', enviadoPorUid: P, enviadoPorNome: 'P', ...extra });

  test('lista de avanço: técnico do projeto e gerente gravam; toda a equipe lê', async () => {
    await assertSucceeds(como(P).doc('equipes/E1/avanco/doP').set(lista()));
    await assertSucceeds(como(M).doc('equipes/E1/avanco/doT').set(lista({ projetoId: 'doT', enviadoPorUid: M })));
    for (const uid of [C, M, G, P, T, U, K, Q]) await assertSucceeds(como(uid).doc('equipes/E1/avanco/doP').get());
    await assertFails(como(Y).doc('equipes/E1/avanco/doP').get());
  });
  test('lista de avanço: outro técnico, GP e programador não gravam; formato é conferido', async () => {
    await assertFails(como(T).doc('equipes/E1/avanco/doP').set(lista({ enviadoPorUid: T })));
    for (const uid of [G, U, Q]) await assertFails(como(uid).doc('equipes/E1/avanco/doP').set(lista({ enviadoPorUid: uid })));
    await assertFails(como(P).doc('equipes/E1/avanco/doP').set(lista({ projetoId: 'doT' })));
    await assertFails(como(P).doc('equipes/E1/avanco/doP').set(lista({ enviadoPorUid: M })));
    await assertFails(como(P).doc('equipes/E1/avanco/doP').set(lista({ campoEstranho: 1 })));
    await assertFails(como(P).doc('equipes/E1/avanco/doP').set(lista({ linhas: 'x' })));
    await semear('equipes/E1/avanco/doP', lista());
    await assertFails(como(T).doc('equipes/E1/avanco/doP').delete());      // técnico de outro projeto
    await assertSucceeds(como(M).doc('equipes/E1/avanco/doP').delete());
  });
  test('OP da planilha leva produto, observação e marcas; o PDF grava as operações', async () => {
    await assertSucceeds(como(P).doc('equipes/E1/ops/op9').set(op({ numero: '02052501009', produto: '8000015633', obs: 'VER CROQUI', marcas: { pintura: true, ttat: true } })));
    await assertFails(como(P).doc('equipes/E1/ops/op8').set(op({ numero: '02052501008', obs: 'x'.repeat(301) })));
    const operacoes = [{ n: '01', setor: 'MANDRILHADORA', horas: 8, etapa: 'PRIMEIRA ETAPA' }];
    await assertSucceeds(como(P).doc('equipes/E1/ops/op1').update({ operacoes, pdfEm: 'x', pdfPorUid: P, atualizadoEm: 'y' }));
    await assertSucceeds(como(M).doc('equipes/E1/ops/op2').update({ operacoes, pdfEm: 'x', pdfPorUid: M, atualizadoEm: 'y' }));
    await assertFails(como(T).doc('equipes/E1/ops/op1').update({ operacoes, pdfEm: 'x' }));
    await assertFails(como(U).doc('equipes/E1/ops/op1').update({ operacoes, pdfEm: 'x' }));
    await assertFails(como(P).doc('equipes/E1/ops/op1').update({ operacoes: 'x', pdfEm: 'x' }));
  });
  test('RNC por peças: qtdNc inteiro de 1 até a quantidade da OP', async () => {
    const db = como(Q);
    async function abrirCom(id, qtdNc) {
      const lote = db.batch();
      lote.set(db.doc('equipes/E1/rncs/' + id), { numero: id, produto: '', desenho: '', rev: '', commessa: '', op: '', qtd: '2', tag: '', item: '',
        setor: {}, setorOutros: '', procedencia: '', descricao: 'x', inspetor: 'Q', qtdNc: String(qtdNc), data: '', disposicao: '', dispResponsavel: '',
        dispData: '', reOp: '', reInspetor: '', reData: '', reResultado: '', reResponsavel: '', observacoes: '', situacao: 'aberta', atualizadoEm: 'x',
        opId: 'op1', projetoId: 'doP', area: 'usinagem', gpUid: G, tecnicoUid: P, criadoPorUid: Q, criadoPorNome: 'Q', criadoEm: 'x' });
      lote.update(db.doc('equipes/E1/ops/op1'), { status: 'retrabalho', rncAtualId: id, rncNumero: id, retrabalhoDesde: 'x', qtdNc: qtdNc });
      return lote.commit();
    }
    await assertFails(abrirCom('r0', 0));
    await assertFails(abrirCom('r3', 3));       // a OP tem 2 peças
    await assertFails(abrirCom('rx', 1.5));
    await assertSucceeds(abrirCom('r1', 1));
    await assertSucceeds(como(Q).doc('equipes/E1/ops/op1').update({ qtdNc: 2 }));
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update({ qtdNc: 5 }));
    await assertFails(como(P).doc('equipes/E1/ops/op1').update({ qtdNc: 1 }));
  });
  test('setores do PDF → máquina: programador de usinagem e gerente', async () => {
    const cfg = (uid) => ({ mapa: { MANDRILHADORAFOREST: 'm1', AJUSTADOR: '' }, atualizadoEm: 'x', atualizadoPorUid: uid });
    await assertSucceeds(como(U).doc('equipes/E1/config/setores').set(cfg(U)));
    await assertSucceeds(como(M).doc('equipes/E1/config/setores').set(cfg(M)));
    for (const uid of [K, T, Q, G]) await assertFails(como(uid).doc('equipes/E1/config/setores').set(cfg(uid)));
    await assertFails(como(U).doc('equipes/E1/config/setores').set({ ...cfg(U), extra: 1 }));
    await assertSucceeds(como(Q).doc('equipes/E1/config/setores').get());
  });
});

describe('programação, finalizar e destino', () => {
  async function aprovada(id, extra) { await semear('equipes/E1/ops/' + id, op({ status: 'aprovada', finalizadoPorUid: Q, ...extra })); }

  test('terceirizadas: programador de caldeiraria e gerente cadastram; todos leem', async () => {
    await assertSucceeds(como(K).doc('equipes/E1/terceirizadas/t1').set({ nome: 'Metal A', ativa: true, criadoEm: 'x', atualizadoEm: 'x' }));
    await assertSucceeds(como(M).doc('equipes/E1/terceirizadas/t2').set({ nome: 'Metal B', ativa: true, criadoEm: 'x', atualizadoEm: 'x' }));
    for (const uid of [U, T, Q, G]) await assertFails(como(uid).doc('equipes/E1/terceirizadas/t9').set({ nome: 'X', ativa: true, criadoEm: 'x', atualizadoEm: 'x' }));
    await assertFails(como(K).doc('equipes/E1/terceirizadas/t3').set({ nome: '', ativa: true, criadoEm: 'x', atualizadoEm: 'x' }));
    await assertSucceeds(como(Q).doc('equipes/E1/terceirizadas/t1').get());
    await assertSucceeds(como(K).doc('equipes/E1/terceirizadas/t1').delete());
  });
  test('programação da caldeiraria: só o programador de caldeiraria (ou gerente), só OP de caldeiraria', async () => {
    const prog = (uid) => ({ programacao: { terceirizadaId: 't1', terceirizada: 'Metal A', previsaoFim: '2026-12-01', em: 'x', porUid: uid } });
    await assertSucceeds(como(K).doc('equipes/E1/ops/op2').update(prog(K)));
    await assertSucceeds(como(K).doc('equipes/E1/ops/op2').update({ programacao: null, desprogramadaEm: 'y' }));
    await assertSucceeds(como(M).doc('equipes/E1/ops/op2').update(prog(M)));
    await assertFails(como(K).doc('equipes/E1/ops/op1').update(prog(K)));       // op1 é de usinagem
    await assertFails(como(U).doc('equipes/E1/ops/op2').update(prog(U)));
    await assertFails(como(K).doc('equipes/E1/ops/op2').update(prog(M)));       // em nome de outro
    await assertFails(como(K).doc('equipes/E1/ops/op2').update({ ...prog(K), status: 'aprovada' }));
  });
  test('fila das máquinas e horas reais (usinagem)', async () => {
    await semear('equipes/E1/maquinas/m1', { nome: 'Forest', horasDia: 8, ativa: true, criadoEm: 'x', atualizadoEm: 'x' });
    await assertSucceeds(como(U).doc('equipes/E1/maquinas/m1').update({ fila: [{ opId: 'op1', horas: null, naoAntes: null }], atualizadoEm: 'y' }));
    await assertFails(como(K).doc('equipes/E1/maquinas/m1').update({ fila: [], atualizadoEm: 'y' }));
    await assertSucceeds(como(U).doc('equipes/E1/ops/op1').update({ horasReais: 12.5 }));
    await assertFails(como(U).doc('equipes/E1/ops/op1').update({ horasReais: -1 }));
    await assertFails(como(U).doc('equipes/E1/ops/op2').update({ horasReais: 3 }));   // op2 é de caldeiraria
    await assertFails(como(K).doc('equipes/E1/ops/op1').update({ horasReais: 3 }));
  });
  test('finalizar: programador da área ou gerente, só depois da baixa do CQ e uma vez', async () => {
    const fim = (uid) => ({ encerradaEm: 'x', encerradaPorUid: uid, encerradaPorNome: uid });
    await assertFails(como(U).doc('equipes/E1/ops/op1').update(fim(U)));            // ainda aberta
    await aprovada('op1');
    await assertFails(como(K).doc('equipes/E1/ops/op1').update(fim(K)));            // área errada
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update(fim(Q)));
    await assertSucceeds(como(U).doc('equipes/E1/ops/op1').update(fim(U)));
    await assertFails(como(U).doc('equipes/E1/ops/op1').update(fim(U)));            // de novo, não
    await aprovada('op7', { area: 'caldeiraria', numero: '777' });
    await assertSucceeds(como(M).doc('equipes/E1/ops/op7').update(fim(M)));
  });
  test('destino da peça: gerente, GP e técnico do projeto', async () => {
    const d = (uid) => ({ destino: 'expedicao', destinoEm: 'x', destinoPorUid: uid });
    await assertSucceeds(como(P).doc('equipes/E1/ops/op1').update(d(P)));          // técnico do projeto doP
    await assertSucceeds(como(G).doc('equipes/E1/ops/op1').update(d(G)));          // GP do projeto doP
    await assertSucceeds(como(M).doc('equipes/E1/ops/op2').update(d(M)));
    await assertFails(como(T).doc('equipes/E1/ops/op1').update(d(T)));            // técnico de outro projeto
    await assertFails(como(U).doc('equipes/E1/ops/op1').update(d(U)));
    await assertFails(como(P).doc('equipes/E1/ops/op1').update({ ...d(P), destino: 'lixo' }));
  });
  test('RNC: programadores leem só as da área deles', async () => {
    const r = { numero: '1', descricao: 'x', disposicao: '', observacoes: '', situacao: 'aberta', opId: 'op1', projetoId: 'doP', gpUid: G, tecnicoUid: P };
    await semear('equipes/E1/rncs/ru', { ...r, area: 'usinagem' });
    await semear('equipes/E1/rncs/rc', { ...r, area: 'caldeiraria' });
    await assertSucceeds(como(U).doc('equipes/E1/rncs/ru').get());
    await assertFails(como(U).doc('equipes/E1/rncs/rc').get());
    await assertSucceeds(como(K).collection('equipes/E1/rncs').where('area', '==', 'caldeiraria').get());
    await assertFails(como(U).doc('equipes/E1/rncs/ru').update({ disposicao: 'x' }));
  });
  test('notificações novas do fluxo de finalização', async () => {
    for (const tipo of ['opAprovada', 'opFinalizada']) {
      await assertSucceeds(como(Q).collection('notificacoes').add({ paraUid: U, tipo, mensagem: 'm', projetoId: 'doP', equipeId: 'E1', deUid: Q, deNome: 'Q', lida: false, criadoEm: 'x' }));
    }
  });
});

describe('excluir projeto leva as OPs e a lista de avanço', () => {
  test('GP do projeto apaga as OPs dele (qualquer situação); técnico só as abertas', async () => {
    await semear('equipes/E1/ops/op8', op({ numero: '888', status: 'aprovada', finalizadoPorUid: Q }));
    await assertSucceeds(como(G).doc('equipes/E1/ops/op8').delete());          // GP do projeto doP
    await assertFails(como(G).doc('equipes/E1/ops/op2').delete());            // op2 é do projeto doT (outro GP)
    await semear('equipes/E1/ops/op9', op({ numero: '999', status: 'aprovada', finalizadoPorUid: Q }));
    await assertFails(como(P).doc('equipes/E1/ops/op9').delete());            // técnico: aprovada não
    await assertSucceeds(como(P).doc('equipes/E1/ops/op1').delete());         // aberta sim
    await assertFails(como(U).doc('equipes/E1/ops/op2').delete());
  });
  test('lista de avanço: Gerência, GP e técnico do projeto apagam', async () => {
    const lista = { projetoId: 'doP', commessa: 'c', arquivo: 'a', aba: 'b', opPintura: '', linhas: [], merges: [], larguras: [], enviadoEm: 'x', enviadoPorUid: P, enviadoPorNome: 'P' };
    for (const uid of [G, P, M]) {
      await semear('equipes/E1/avanco/doP', lista);
      await assertSucceeds(como(uid).doc('equipes/E1/avanco/doP').delete());
    }
    await semear('equipes/E1/avanco/doP', lista);
    for (const uid of [T, U, Q]) await assertFails(como(uid).doc('equipes/E1/avanco/doP').delete());
  });
});

describe('OP extra (fora da planilha) criada pelo PDF', () => {
  test('técnico do projeto cria a OP já com o roteiro; origem conferida', async () => {
    const operacoes = [{ n: '01', setor: 'MONT. CALD TERCEIROS', horas: 2, etapa: '', texto: 'Montar.' }];
    await assertSucceeds(como(P).doc('equipes/E1/ops/extra1').set(op({ numero: '02099901001', posicao: '', origem: 'pdf', operacoes, pdfEm: 'x', pdfPorUid: P })));
    await assertFails(como(P).doc('equipes/E1/ops/extra2').set(op({ numero: '02099902001', origem: 'outra', operacoes })));
    await assertFails(como(U).doc('equipes/E1/ops/extra3').set(op({ numero: '02099903001', origem: 'pdf', operacoes, criadoPorUid: U })));
  });
});

describe('itens comerciais, valores e serviços do projeto', () => {
  const com = (extra) => ({ projetoId: 'doP', commessa: '2026-001', itens: { 'C|23|PORCA': { pc: '057577', chegadas: [{ qtd: 2, em: '2026-11-12' }] } },
    pedidos: { '057577': { fornecedor: 'F' } }, atualizadoEm: 'x', porUid: P, ...extra });
  const val = (extra) => ({ projetoId: 'doP', itens: { 'C|23|PORCA': { valorUnit: 4.5, valorTotal: 72 } }, pedidos: {}, atualizadoEm: 'x', porUid: P, ...extra });
  const serv = (extra) => ({ projetoId: 'doP', commessa: '2026-001', itens: { 'S|1|9|TTAT': { envios: [{ qtd: 1, em: '2026-11-12', prazo: 3, tipoPrazo: 'uteis' }], retornos: [] } },
    atualizadoEm: 'x', porUid: P, ...extra });

  test('comerciais e serviços: técnico, GP do projeto e Gerência gravam; toda a equipe lê', async () => {
    await assertSucceeds(como(P).doc('equipes/E1/comerciais/doP').set(com()));
    await assertSucceeds(como(G).doc('equipes/E1/comerciais/doP').set(com({ porUid: G })));
    await assertSucceeds(como(M).doc('equipes/E1/servicos/doP').set(serv({ porUid: M })));
    await assertSucceeds(como(P).doc('equipes/E1/servicos/doP').set(serv()));
    for (const uid of [C, M, G, P, T, U, K, Q]) {
      await assertSucceeds(como(uid).doc('equipes/E1/comerciais/doP').get());
      await assertSucceeds(como(uid).doc('equipes/E1/servicos/doP').get());
    }
    await assertSucceeds(como(Q).collection('equipes/E1/servicos').get());
    await assertFails(como(Y).doc('equipes/E1/comerciais/doP').get());
  });
  test('comerciais e serviços: outro técnico e programadores não gravam; formato conferido', async () => {
    for (const uid of [T, U, K, Q]) {
      await assertFails(como(uid).doc('equipes/E1/comerciais/doP').set(com({ porUid: uid })));
      await assertFails(como(uid).doc('equipes/E1/servicos/doP').set(serv({ porUid: uid })));
    }
    await assertFails(como(P).doc('equipes/E1/comerciais/doP').set(com({ porUid: M })));
    await assertFails(como(P).doc('equipes/E1/comerciais/doP').set(com({ projetoId: 'doT' })));
    await assertFails(como(P).doc('equipes/E1/comerciais/doP').set(com({ valor: 10 })));
    await assertFails(como(P).doc('equipes/E1/servicos/doP').set(serv({ itens: 'x' })));
    await semear('equipes/E1/servicos/doP', serv());
    await assertFails(como(T).doc('equipes/E1/servicos/doP').delete());
    await assertSucceeds(como(G).doc('equipes/E1/servicos/doP').delete());
  });
  test('valores: só Gerência, GP e técnico do projeto leem e gravam', async () => {
    await assertSucceeds(como(P).doc('equipes/E1/comerciaisValores/doP').set(val()));
    for (const uid of [C, M, G, P]) await assertSucceeds(como(uid).doc('equipes/E1/comerciaisValores/doP').get());
    for (const uid of [T, U, K, Q, Y]) await assertFails(como(uid).doc('equipes/E1/comerciaisValores/doP').get());
    for (const uid of [T, U, Q]) await assertFails(como(uid).doc('equipes/E1/comerciaisValores/doP').set(val({ porUid: uid })));
    await assertFails(como(U).collection('equipes/E1/comerciaisValores').get());
    await assertFails(como(P).doc('equipes/E1/comerciaisValores/doP').set(val({ commessa: 'x' })));
  });
  test('lista de avanço leva a aba SERVIÇOS', async () => {
    const lista = { projetoId: 'doP', commessa: '2026-001', arquivo: 'A.xls', aba: 'AVANÇO', opPintura: '', linhas: [], merges: [], larguras: [],
      servicos: [{ tipo: 'TTAT', desenho: '1', posicao: '9' }], enviadoEm: 'x', enviadoPorUid: P, enviadoPorNome: 'P' };
    await assertSucceeds(como(P).doc('equipes/E1/avanco/doP').set(lista));
    await assertFails(como(P).doc('equipes/E1/avanco/doP').set({ ...lista, servicos: 'x' }));
  });
});

describe('tarefas avulsas', () => {
  const tarefa = (extra) => ({ projetoId: 'doP', commessa: '2026-001', titulo: 'Refazer desenho', descricao: '', paraUid: P, paraNome: 'P', prazo: '2026-11-20',
    status: 'aberta', criadoPorUid: G, criadoPorNome: 'G', criadoEm: 'x', atualizadoEm: 'x', concluidaEm: '', concluidaPorUid: '', concluidaPorNome: '', obsConclusao: '', ...extra });
  test('GP do projeto e Gerência criam; os outros não; toda a equipe lê', async () => {
    await assertSucceeds(como(G).doc('equipes/E1/tarefas/t1').set(tarefa()));
    await assertSucceeds(como(M).doc('equipes/E1/tarefas/t2').set(tarefa({ criadoPorUid: M, projetoId: 'doT' })));
    await assertFails(como(G).doc('equipes/E1/tarefas/t3').set(tarefa({ projetoId: 'doT' })));   // GP de outro projeto
    for (const uid of [P, T, U, Q]) await assertFails(como(uid).doc('equipes/E1/tarefas/t4').set(tarefa({ criadoPorUid: uid })));
    await assertFails(como(G).doc('equipes/E1/tarefas/t5').set(tarefa({ criadoPorUid: M })));
    await assertFails(como(G).doc('equipes/E1/tarefas/t6').set(tarefa({ titulo: '' })));
    await assertFails(como(G).doc('equipes/E1/tarefas/t7').set(tarefa({ status: 'concluida' })));
    for (const uid of [C, M, G, P, T, U, K, Q]) await assertSucceeds(como(uid).doc('equipes/E1/tarefas/t1').get());
    await assertFails(como(Y).doc('equipes/E1/tarefas/t1').get());
  });
  test('quem recebeu só conclui; quem pediu edita, reabre e apaga', async () => {
    await semear('equipes/E1/tarefas/t1', tarefa());
    const fim = (uid) => ({ status: 'concluida', concluidaEm: 'y', concluidaPorUid: uid, concluidaPorNome: uid, obsConclusao: 'feito', atualizadoEm: 'y' });
    await assertFails(como(T).doc('equipes/E1/tarefas/t1').update(fim(T)));
    await assertFails(como(P).doc('equipes/E1/tarefas/t1').update({ ...fim(P), titulo: 'outro' }));
    await assertSucceeds(como(P).doc('equipes/E1/tarefas/t1').update(fim(P)));
    await assertFails(como(P).doc('equipes/E1/tarefas/t1').update({ status: 'aberta' }));
    await assertSucceeds(como(G).doc('equipes/E1/tarefas/t1').update({ status: 'aberta', concluidaEm: '', concluidaPorUid: '', concluidaPorNome: '', obsConclusao: '' }));
    await assertSucceeds(como(G).doc('equipes/E1/tarefas/t1').update({ titulo: 'Refazer desenho rev. 2' }));
    await assertFails(como(G).doc('equipes/E1/tarefas/t1').update({ projetoId: 'doT' }));
    await assertFails(como(P).doc('equipes/E1/tarefas/t1').delete());
    await assertSucceeds(como(G).doc('equipes/E1/tarefas/t1').delete());
  });
  test('notificações de tarefa', async () => {
    await assertSucceeds(como(G).collection('notificacoes').add({ paraUid: P, tipo: 'tarefa', mensagem: 'x', projetoId: 'doP', equipeId: 'E1', deUid: G, deNome: 'G', lida: false, criadoEm: 'x' }));
    await assertSucceeds(como(P).collection('notificacoes').add({ paraUid: G, tipo: 'tarefaConcluida', mensagem: 'x', projetoId: 'doP', equipeId: 'E1', deUid: P, deNome: 'P', lida: false, criadoEm: 'x' }));
  });
});

describe('CQ desfaz a baixa', () => {
  const desfaz = { status: 'aberta', finalizadoPorUid: firebase.firestore.FieldValue.delete(), finalizadoPorNome: firebase.firestore.FieldValue.delete(), finalizadoEm: firebase.firestore.FieldValue.delete() };
  const aprovada = (extra) => op({ status: 'aprovada', finalizadoPorUid: Q, finalizadoPorNome: 'Q', finalizadoEm: 'x', ...extra });
  test('aprovada direto volta para aberta; só o CQ', async () => {
    await semear('equipes/E1/ops/op1', aprovada());
    for (const uid of [M, P, U]) await assertFails(como(uid).doc('equipes/E1/ops/op1').update(desfaz));
    await assertSucceeds(como(Q).doc('equipes/E1/ops/op1').update(desfaz));
  });
  test('não desfaz depois do programador encerrar, nem aprovação vinda de RNC, nem mexendo em outros campos', async () => {
    await semear('equipes/E1/ops/op1', aprovada({ encerradaEm: 'y' }));
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update(desfaz));
    await semear('equipes/E1/ops/op1', aprovada({ rncAtualId: 'r1' }));
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update(desfaz));
    await semear('equipes/E1/ops/op1', aprovada());
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update({ ...desfaz, qtd: 9 }));
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update({ status: 'aberta' }));   // sem limpar a baixa
  });
});

describe('próximo passo na baixa do CQ', () => {
  test('CQ aprova com o próximo passo; valor fora da lista é recusado', async () => {
    const fim = (extra) => ({ status: 'aprovada', finalizadoPorUid: Q, finalizadoPorNome: 'Q', finalizadoEm: 'x', ...extra });
    await assertSucceeds(como(Q).doc('equipes/E1/ops/op1').update(fim({ proximoPasso: 'pintura', proximoPassoEm: 'x' })));
    await semear('equipes/E1/ops/op1', op());
    await assertFails(como(Q).doc('equipes/E1/ops/op1').update(fim({ proximoPasso: 'lixar', proximoPassoEm: 'x' })));
    await semear('equipes/E1/ops/op1', op({ status: 'aprovada', finalizadoPorUid: Q, finalizadoPorNome: 'Q', finalizadoEm: 'x', proximoPasso: 'embarque', proximoPassoEm: 'x' }));
    const del = firebase.firestore.FieldValue.delete();
    await assertSucceeds(como(Q).doc('equipes/E1/ops/op1').update({ status: 'aberta', finalizadoPorUid: del, finalizadoPorNome: del, finalizadoEm: del, proximoPasso: del, proximoPassoEm: del }));
  });
});

describe('carga fábrica: programar, início e reagendar', () => {
  test('programadora de caldeiraria grava início, previsão e histórico; outro cargo não', async () => {
    await semear('equipes/E1/ops/op2', op({ projetoId: 'doT', area: 'caldeiraria', tecnicoUid: T, gpUid: 'outroGP' }));
    const prog = (uid, extra) => ({ programacao: { terceirizadaId: 'sofir', terceirizada: 'SOFIR', inicio: '2026-11-13', previsaoFim: '2026-11-30', historico: [], em: 'x', porUid: uid, ...extra } });
    await assertSucceeds(como(K).doc('equipes/E1/ops/op2').update(prog(K)));
    await assertSucceeds(como(K).doc('equipes/E1/ops/op2').update(prog(K, { previsaoFim: '2026-12-05', historico: ['2026-11-30'] })));
    await assertFails(como(K).doc('equipes/E1/ops/op2').update(prog(K, { historico: 'x' })));
    await assertFails(como(K).doc('equipes/E1/ops/op2').update(prog(K, { outro: 1 })));
    await assertFails(como(U).doc('equipes/E1/ops/op2').update(prog(U)));
    await assertSucceeds(como(K).collection('notificacoes').add({ paraUid: T, tipo: 'opReagendada', mensagem: 'x', projetoId: 'doT', equipeId: 'E1', deUid: K, deNome: 'K', lida: false, criadoEm: 'x' }));
  });
});

describe('máquina com tipo e fila por operação', () => {
  test('programador de usinagem grava o tipo e a fila com a operação; tipo longo é recusado', async () => {
    const maq = (extra) => ({ nome: 'San Rocco', horasDia: 16, ativa: true, tipo: 'Mandrilhadora', criadoEm: 'x', atualizadoEm: 'x', fila: [{ opId: 'op1', n: 0, horas: null, naoAntes: null }], ...extra });
    await assertSucceeds(como(U).doc('equipes/E1/maquinas/m1').set(maq()));
    await assertFails(como(U).doc('equipes/E1/maquinas/m2').set(maq({ tipo: 'x'.repeat(41) })));
    await assertFails(como(K).doc('equipes/E1/maquinas/m3').set(maq()));
  });
});
