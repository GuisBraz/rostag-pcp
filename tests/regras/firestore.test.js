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

// Personagens: C coordena a equipe E1, G é GP, P é planejador, X é de fora
// (quer entrar), Y é membro só da outra equipe E2.
const C = 'coord', G = 'gp', P = 'plan', X = 'fora', Y = 'outro';
const HASH_CERTO = 'hash-da-senha-certa';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rostag',
    firestore: { rules: fs.readFileSync(path.join(raiz, 'firestore.rules'), 'utf8') }
  });
});
after(async () => { if (env) await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const uid of [C, G, P, X, Y]) await db.doc('usuarios/' + uid).set({ nome: uid, equipesCriadas: 0 });
    await db.doc('usuarios/' + C).update({ equipesCriadas: 1 });
    await db.doc('equipes/E1').set({ nome: 'Equipe 1', coordenadorUid: C, criadoPorUid: C });
    await db.doc('equipeSegredos/E1').set({ senhaHash: HASH_CERTO });
    await db.doc('equipes/E1/membros/' + C).set({ nome: 'C', papel: 'gp' });
    await db.doc('equipes/E1/membros/' + G).set({ nome: 'G', papel: 'gp' });
    await db.doc('equipes/E1/membros/' + P).set({ nome: 'P', papel: 'planejador' });
    await db.doc('equipes/E1/projetos/doP').set({ nome: 'Projeto do P', responsavelUid: P, checklist: [] });
    await db.doc('equipes/E1/projetos/doG').set({ nome: 'Projeto do G', responsavelUid: G, checklist: [] });
    await db.doc('equipes/E2').set({ nome: 'Equipe 2', coordenadorUid: Y, criadoPorUid: Y });
    await db.doc('equipes/E2/membros/' + Y).set({ nome: 'Y', papel: 'gp' });
  });
});

const como = (uid) => env.authenticatedContext(uid).firestore();
const semLogin = () => env.unauthenticatedContext().firestore();
async function semear(caminho, dados) {
  await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc(caminho).set(dados));
}
function convite(papel, idadeDias) {
  return { criadoPor: G, equipeId: 'E1', usado: false, papel, criadoEm: '2026-01-01T00:00:00.000Z',
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
describe('projetos: planejador', () => {
  test('lê o projeto em que é responsável', async () => {
    await assertSucceeds(como(P).doc('equipes/E1/projetos/doP').get());
  });
  test('não lê projeto de outra pessoa', async () => {
    await assertFails(como(P).doc('equipes/E1/projetos/doG').get());
  });
  test('lista só filtrando pelos próprios projetos', async () => {
    await assertSucceeds(como(P).collection('equipes/E1/projetos').where('responsavelUid', '==', P).get());
    await assertFails(como(P).collection('equipes/E1/projetos').get());
  });
  test('altera só o checklist do próprio projeto', async () => {
    await assertSucceeds(como(P).doc('equipes/E1/projetos/doP').update({ checklist: [{ t: 'a', done: true }] }));
    await assertFails(como(P).doc('equipes/E1/projetos/doP').update({ nome: 'outro' }));
    await assertFails(como(P).doc('equipes/E1/projetos/doP').update({ responsavelUid: G }));
    await assertFails(como(P).doc('equipes/E1/projetos/doP').update({ checklist: [], nome: 'outro' }));
    await assertFails(como(P).doc('equipes/E1/projetos/doG').update({ checklist: [] }));
  });
  test('não cria nem apaga projeto', async () => {
    await assertFails(como(P).doc('equipes/E1/projetos/novo').set({ nome: 'n', responsavelUid: P }));
    await assertFails(como(P).doc('equipes/E1/projetos/doP').delete());
  });
  test('perde o acesso ao sair da equipe (responsavelUid sozinho não basta)', async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('equipes/E1/membros/' + P).delete());
    await assertFails(como(P).doc('equipes/E1/projetos/doP').get());
  });
});

describe('projetos: GP e coordenador', () => {
  for (const [quem, uid] of [['GP', G], ['coordenador', C]]) {
    test(quem + ' lê, cria, altera qualquer campo e apaga', async () => {
      const db = como(uid);
      await assertSucceeds(db.collection('equipes/E1/projetos').get());
      await assertSucceeds(db.doc('equipes/E1/projetos/doP').get());
      await assertSucceeds(db.doc('equipes/E1/projetos/novo').set({ nome: 'n', responsavelUid: P }));
      await assertSucceeds(db.doc('equipes/E1/projetos/doP').update({ nome: 'renomeado', responsavelUid: G }));
      await assertSucceeds(db.doc('equipes/E1/projetos/novo').delete());
    });
  }
  test('quem é de fora não lê nada da equipe', async () => {
    await assertFails(como(X).doc('equipes/E1/projetos/doP').get());
    await assertFails(como(X).doc('equipes/E1').get());
    await assertFails(como(Y).collection('equipes/E1/membros').get());
    await assertFails(semLogin().doc('equipes/E1/projetos/doP').get());
  });
});

/* ---------------------------------------------------------------- convites */
describe('convites', () => {
  test('GP e coordenador criam convite com a hora do servidor', async () => {
    await assertSucceeds(como(G).doc('convites/cG123456').set(
      { criadoPor: G, equipeId: 'E1', usado: false, papel: 'planejador', criadoEm: 'x', emitidoEm: horaDoServidor() }));
    await assertSucceeds(como(C).doc('convites/cC123456').set(
      { criadoPor: C, equipeId: 'E1', usado: false, papel: 'gp', criadoEm: 'x', emitidoEm: horaDoServidor() }));
  });
  test('não cria convite com data escolhida pelo cliente, sem data, papel inválido ou por planejador', async () => {
    const base = { criadoPor: G, equipeId: 'E1', usado: false, papel: 'planejador', criadoEm: 'x' };
    await assertFails(como(G).doc('convites/c1').set({ ...base, emitidoEm: Timestamp.fromMillis(Date.now() + 30 * DIA) }));
    await assertFails(como(G).doc('convites/c2').set(base));
    await assertFails(como(G).doc('convites/c3').set({ ...base, papel: 'coordenador', emitidoEm: horaDoServidor() }));
    await assertFails(como(P).doc('convites/c4').set({ ...base, emitidoEm: horaDoServidor() }));
    await assertFails(como(Y).doc('convites/c5').set({ ...base, emitidoEm: horaDoServidor() }));
  });
  test('entrar por convite: vira membro com o papel do convite', async () => {
    await semear('convites/abc12345', convite('gp', 1));
    const db = como(X);
    await assertSucceeds(consumir(db, 'abc12345', X));
    await assertSucceeds(db.doc('equipes/E1/membros/' + X).set({ nome: 'X', papel: 'gp', viaConvite: 'abc12345' }));
    await assertSucceeds(db.doc('usuarios/' + X + '/minhasEquipes/E1').set({ papel: 'gp', nomeEquipe: 'Equipe 1', viaConvite: 'abc12345' }));
  });
  test('não dá pra entrar com papel diferente do convite', async () => {
    await semear('convites/abc12345', convite('planejador', 1));
    const db = como(X);
    await consumir(db, 'abc12345', X);
    await assertFails(db.doc('equipes/E1/membros/' + X).set({ nome: 'X', papel: 'gp', viaConvite: 'abc12345' }));
    await assertFails(db.doc('usuarios/' + X + '/minhasEquipes/E1').set({ papel: 'gp', viaConvite: 'abc12345' }));
  });
  test('uso único: o segundo não consome nem aproveita o convite já usado', async () => {
    await semear('convites/abc12345', convite('planejador', 1));
    await consumir(como(X), 'abc12345', X);
    await assertFails(consumir(como(Y), 'abc12345', Y));
    await assertFails(como(Y).doc('equipes/E1/membros/' + Y).set({ nome: 'Y', papel: 'planejador', viaConvite: 'abc12345' }));
  });
  test('sem consumir antes, não vira membro', async () => {
    await semear('convites/abc12345', convite('planejador', 1));
    await assertFails(como(X).doc('equipes/E1/membros/' + X).set({ nome: 'X', papel: 'planejador', viaConvite: 'abc12345' }));
  });
  test('convite de outra equipe não serve', async () => {
    await semear('convites/abc12345', { ...convite('gp', 1), equipeId: 'E2' });
    await consumir(como(X), 'abc12345', X);
    await assertFails(como(X).doc('equipes/E1/membros/' + X).set({ nome: 'X', papel: 'gp', viaConvite: 'abc12345' }));
  });
  test('ao consumir, não muda papel, equipe nem data, nem marca em nome de outro', async () => {
    await semear('convites/abc12345', convite('planejador', 1));
    const ref = como(X).doc('convites/abc12345');
    await assertFails(ref.update({ usado: true, usadoPor: X, papel: 'gp' }));
    await assertFails(ref.update({ usado: true, usadoPor: X, equipeId: 'E2' }));
    await assertFails(ref.update({ usado: true, usadoPor: X, emitidoEm: Timestamp.now() }));
    await assertFails(ref.update({ usado: true, usadoPor: Y }));
  });
  test('validade de 7 dias: vale com 6, vencido com 8, convite antigo sem data não vale', async () => {
    await semear('convites/seisdias', convite('planejador', 6));
    await semear('convites/oitodias', convite('planejador', 8));
    const antigo = convite('planejador', 0); delete antigo.emitidoEm;
    await semear('convites/semdata0', antigo);
    await assertSucceeds(consumir(como(X), 'seisdias', X));
    await assertFails(consumir(como(Y), 'oitodias', Y));
    await assertFails(consumir(como(Y), 'semdata0', Y));
  });
  test('listar só da própria equipe e só GP/coordenador; apagar idem', async () => {
    await semear('convites/abc12345', convite('planejador', 1));
    await assertSucceeds(como(G).collection('convites').where('equipeId', '==', 'E1').get());
    await assertFails(como(G).collection('convites').get());
    await assertFails(como(P).collection('convites').where('equipeId', '==', 'E1').get());
    await assertFails(como(P).doc('convites/abc12345').delete());
    await assertSucceeds(como(G).doc('convites/abc12345').delete());
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
  test('senha certa: entra como planejador e grava o índice pessoal', async () => {
    const db = como(X);
    await assertSucceeds(lote(db, X, HASH_CERTO, 'planejador'));
    await assertSucceeds(db.doc('equipeSegredos/E1/entradas/' + X).delete());
    await assertSucceeds(db.doc('usuarios/' + X + '/minhasEquipes/E1').set({ papel: 'planejador', nomeEquipe: 'Equipe 1' }));
  });
  test('senha errada não entra', async () => {
    await assertFails(lote(como(X), X, 'hash-errado', 'planejador'));
  });
  test('senha certa não dá papel de GP', async () => {
    await assertFails(lote(como(X), X, HASH_CERTO, 'gp'));
  });
  test('sem gravar a tentativa no mesmo lote não entra', async () => {
    await assertFails(como(X).doc('equipes/E1/membros/' + X).set({ nome: X, papel: 'planejador' }));
  });
  test('índice pessoal como GP não é aceito depois de entrar por senha', async () => {
    await lote(como(X), X, HASH_CERTO, 'planejador');
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
    await assertFails(lote(como(Y), Y, 'outro', 'planejador'));
    await assertSucceeds(lote(como(X), X, 'hash-antigo', 'planejador'));
  });
});

/* ----------------------------------------------------- papéis e membros */
describe('papel e remoção de membros', () => {
  test('só o coordenador muda papel, e só para gp/planejador', async () => {
    await assertFails(como(P).doc('equipes/E1/membros/' + P).update({ papel: 'gp' }));
    await assertFails(como(G).doc('equipes/E1/membros/' + P).update({ papel: 'gp' }));
    await assertFails(como(C).doc('equipes/E1/membros/' + P).update({ papel: 'coordenador' }));
    await assertSucceeds(como(C).doc('equipes/E1/membros/' + P).update({ papel: 'gp' }));
    await assertSucceeds(como(C).doc('equipes/E1/membros/' + P).update({ papel: 'planejador' }));
  });
  test('cada um muda só o próprio nome de exibição', async () => {
    await assertSucceeds(como(P).doc('equipes/E1/membros/' + P).update({ nome: 'Novo nome' }));
    await assertFails(como(P).doc('equipes/E1/membros/' + G).update({ nome: 'x' }));
    await assertFails(como(P).doc('equipes/E1/membros/' + P).update({ nome: 'x'.repeat(61) }));
  });
  test('só o coordenador remove outro membro; cada um pode sair', async () => {
    await assertFails(como(G).doc('equipes/E1/membros/' + P).delete());
    await assertSucceeds(como(C).doc('equipes/E1/membros/' + P).delete());
    await assertSucceeds(como(G).doc('equipes/E1/membros/' + G).delete());
  });
  test('GP não se torna coordenador nem passa o cargo', async () => {
    await assertFails(como(G).doc('equipes/E1').update({ coordenadorUid: G }));
    await assertSucceeds(como(C).doc('equipes/E1').update({ coordenadorUid: G }));
  });
  test('coordenador não passa o cargo para quem não é membro', async () => {
    await assertFails(como(C).doc('equipes/E1').update({ coordenadorUid: X }));
  });
  test('ninguém se adiciona como membro sem convite nem senha', async () => {
    await assertFails(como(X).doc('equipes/E1/membros/' + X).set({ nome: X, papel: 'gp' }));
    await assertFails(como(G).doc('equipes/E1/membros/' + X).set({ nome: X, papel: 'planejador' }));
  });
});

/* ------------------------------------------------------------ notificações */
describe('notificações', () => {
  const notif = (deUid, paraUid, extra) => ({
    paraUid, deUid, equipeId: 'E1', tipo: 'designacao', mensagem: 'Você foi designado', projetoId: null, lida: false, ...extra
  });
  test('GP e coordenador criam para membros da equipe', async () => {
    await assertSucceeds(como(G).collection('notificacoes').add(notif(G, P)));
    await assertSucceeds(como(C).collection('notificacoes').add(notif(C, P, { tipo: 'observacao', projetoId: 'doP' })));
  });
  test('planejador e quem é de fora não criam', async () => {
    await assertFails(como(P).collection('notificacoes').add(notif(P, G)));
    await assertFails(como(Y).collection('notificacoes').add(notif(Y, P)));
  });
  test('não cria para quem não é da equipe, em nome de outro ou fora do formato', async () => {
    await assertFails(como(G).collection('notificacoes').add(notif(G, Y)));
    await assertFails(como(G).collection('notificacoes').add(notif(C, P)));
    await assertFails(como(G).collection('notificacoes').add(notif(G, P, { tipo: 'spam' })));
    await assertFails(como(G).collection('notificacoes').add(notif(G, P, { lida: true })));
    await assertFails(como(G).collection('notificacoes').add(notif(G, P, { mensagem: 'x'.repeat(501) })));
  });
  test('destinatário lê e só marca como lida; os outros não leem', async () => {
    await semear('notificacoes/n1', notif(G, P));
    await assertSucceeds(como(P).doc('notificacoes/n1').get());
    await assertFails(como(G).doc('notificacoes/n1').get());
    await assertSucceeds(como(P).doc('notificacoes/n1').update({ lida: true }));
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
  test('índice pessoal: só o dono lê', async () => {
    await semear('usuarios/' + P + '/minhasEquipes/E1', { papel: 'planejador' });
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
  test('depois de criar, vira membro GP da própria equipe', async () => {
    await criar(X, 'N1');
    await assertSucceeds(como(X).doc('equipes/N1/membros/' + X).set({ nome: X, papel: 'gp' }));
    await assertSucceeds(como(X).doc('usuarios/' + X + '/minhasEquipes/N1').set({ papel: 'gp', nomeEquipe: 'N1' }));
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
