/* ---------------------------------------------------------------------------
   Auth — conta, equipes e papéis.
   A garantia de acesso de verdade são as regras do Firestore; este módulo
   só sabe quem está logado, em que equipe e com qual papel, para a
   interface se ajustar.

   O papel vem do meu /equipes/{id}/membros/{uid} (escutado ao vivo): é o que
   as regras usam. O índice pessoal /usuarios/{uid}/minhasEquipes serve só
   para listar as equipes e seus nomes — eu mesmo posso editá-lo, então não
   é confiável para decidir permissão, e fica desatualizado quando o
   coordenador muda meu papel.
--------------------------------------------------------------------------- */
import { FIREBASE_PRONTO, db, auth, apagarCampo, horaDoServidor } from './firebase.js';

let usuario = null;        // usuário do Firebase Authentication
let perfil = null;         // /usuarios/{uid}: nome e preferências
let minhasEquipes = [];    // [{id, papel, nomeEquipe, entrouEm}]
let equipeAtualId_ = null; // equipe em uso (lembrada por navegador)
let equipeAtual = null;    // /equipes/{id}: nome, coordenadorUid...
let meuMembro = null;      // /equipes/{id}/membros/{meu uid}
let pararMembro = null;    // cancela o listener do meu membro
let pronto = false;
const ouvintes = [];
const CHAVE_EQUIPE = 'rostag_pcp_equipe_atual';
const ITERACOES_SENHA = 150000;

function docPerfil(uid) { return db().collection('usuarios').doc(uid); }
function colMinhasEquipes(uid) { return docPerfil(uid).collection('minhasEquipes'); }
function docEquipe(id) { return db().collection('equipes').doc(id); }
function colMembros(equipeId) { return docEquipe(equipeId).collection('membros'); }
function docSegredoEquipe(equipeId) { return db().collection('equipeSegredos').doc(equipeId); }
function docCoordenadorAntigo() { return db().collection('sistema').doc('coordenador'); }
function agoraIso() { return new Date().toISOString(); }

/* ------------------------------------------------------------- senha/hash */
// Nome de equipe normalizado (busca ignora maiúsculas e espaços extras).
export function normalizarNome(nome) { return (nome || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function hexDe(buf) {
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}
function sha256Hex(texto) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)).then(hexDe);
}
function docNomeEquipe(nomeNormalizado) {
  return sha256Hex(nomeNormalizado).then(function (h) { return db().collection('equipeNomes').doc(h); });
}
function novoSal() { return hexDe(crypto.getRandomValues(new Uint8Array(16))); }
// PBKDF2 com sal aleatório por equipe. O sal fica em /equipeNomes (legível
// pelo nome); o hash fica em /equipeSegredos, que nenhum cliente lê — só a
// regra compara. Equipe antiga (sem sal) ainda usa SHA-256 puro até o
// coordenador redefinir a senha.
function hashSenhaEquipe(senha, sal) {
  if (!sal) return sha256Hex(senha || '');
  const enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(senha || ''), 'PBKDF2', false, ['deriveBits']).then(function (chave) {
    return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(sal), iterations: ITERACOES_SENHA, hash: 'SHA-256' }, chave, 256);
  }).then(hexDe);
}

function lerEquipeLocal() { try { return localStorage.getItem(CHAVE_EQUIPE); } catch (e) { return null; } }
function gravarEquipeLocal(id) { try { localStorage.setItem(CHAVE_EQUIPE, id); } catch (e) { /* sem armazenamento */ } }

/* ------------------------------------------------------------ carregamento */
function avisar() { ouvintes.slice().forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }

function carregarPerfil(uid) {
  // No cadastro, este get pode correr antes de o perfil novo ser gravado:
  // aí mantém o perfil que o próprio cadastrar() acabou de montar.
  return docPerfil(uid).get().then(function (snap) { if (snap.exists || !perfil) perfil = snap.exists ? snap.data() : null; })
    .catch(function (e) { console.warn(e); perfil = null; });
}
function carregarMinhasEquipes(uid) {
  return colMinhasEquipes(uid).get().then(function (qs) {
    const lista = [];
    qs.forEach(function (doc) { lista.push(Object.assign({ id: doc.id }, doc.data())); });
    lista.sort(function (a, b) { return (a.nomeEquipe || '').localeCompare(b.nomeEquipe || '', 'pt-BR'); });
    minhasEquipes = lista;
  }).catch(function (e) { console.warn(e); minhasEquipes = []; });
}

function pararEscutaMembro() { if (pararMembro) { pararMembro(); pararMembro = null; } }

// Escuta meu /membros: papel trocado pelo coordenador vale na hora; se eu for
// removido da equipe, a equipe some e a interface volta para o hub.
function escutarMeuMembro(equipeId) {
  pararEscutaMembro();
  return new Promise(function (resolve) {
    let primeira = true;
    pararMembro = colMembros(equipeId).doc(usuario.uid).onSnapshot(function (snap) {
      if (equipeId !== equipeAtualId_) return;
      const antes = meuMembro ? meuMembro.papel : null;
      meuMembro = snap.exists ? snap.data() : null;
      if (primeira) { primeira = false; resolve(); return; }
      if (!meuMembro) { saiuDaEquipe(equipeId); return; }
      if (meuMembro.papel !== antes) avisar();
    }, function (e) {
      console.warn('acesso à equipe perdido:', e && e.code);
      meuMembro = null;
      if (primeira) { primeira = false; resolve(); return; }
      saiuDaEquipe(equipeId);
    });
  });
}

function saiuDaEquipe(equipeId) {
  minhasEquipes = minhasEquipes.filter(function (e) { return e.id !== equipeId; });
  const outra = minhasEquipes[0];
  equipeAtualId_ = null; equipeAtual = null; meuMembro = null;
  pararEscutaMembro();
  if (outra) { selecionarEquipe(outra.id).then(avisar, avisar); } else { avisar(); }
}

// Carrega a equipe e meu membro nela. Falha (equipe sumiu, sem acesso) zera a seleção.
function selecionarEquipe(equipeId) {
  return docEquipe(equipeId).get().then(function (snap) {
    if (!snap.exists) throw new Error('equipe-nao-encontrada');
    equipeAtualId_ = equipeId;
    equipeAtual = Object.assign({ id: snap.id }, snap.data());
    gravarEquipeLocal(equipeId);
    return escutarMeuMembro(equipeId);
  }).then(function () {
    if (!meuMembro) throw new Error('sem-acesso');
  }).catch(function (e) {
    equipeAtualId_ = null; equipeAtual = null; meuMembro = null;
    pararEscutaMembro();
    throw e;
  });
}

// Quem é removido continua com a equipe no próprio índice (o coordenador não
// pode apagar o índice de outra pessoa). Acesso negado de verdade — não falta
// de rede — limpa essa entrada velha.
function acessoPerdido(e) {
  return e && (e.code === 'permission-denied' || e.message === 'sem-acesso' || e.message === 'equipe-nao-encontrada');
}
function esquecerEquipe(equipeId) {
  minhasEquipes = minhasEquipes.filter(function (e) { return e.id !== equipeId; });
  colMinhasEquipes(usuario.uid).doc(equipeId).delete().catch(function (e) { console.warn('índice da equipe não apagado:', e && e.code); });
}

// Tenta a equipe lembrada; se não der, as outras na ordem; sem nenhuma, vai pro hub.
function escolherEquipeInicial() {
  const salva = lerEquipeLocal();
  const ordem = minhasEquipes.map(function (e) { return e.id; });
  if (salva && ordem.indexOf(salva) > 0) { ordem.splice(ordem.indexOf(salva), 1); ordem.unshift(salva); }
  function tentar(i) {
    if (i >= ordem.length) { equipeAtualId_ = null; equipeAtual = null; return Promise.resolve(); }
    return selecionarEquipe(ordem[i]).catch(function (e) {
      if (acessoPerdido(e)) esquecerEquipe(ordem[i]);
      return tentar(i + 1);
    });
  }
  return tentar(0);
}

export function inicializar() {
  if (!FIREBASE_PRONTO) { pronto = true; avisar(); return; }
  auth().onAuthStateChanged(function (u) {
    usuario = u;
    pronto = false;
    const seguir = function () { pronto = true; avisar(); };
    pararEscutaMembro();
    perfil = null; minhasEquipes = []; equipeAtualId_ = null; equipeAtual = null; meuMembro = null;
    if (u) {
      carregarPerfil(u.uid).then(function () { return carregarMinhasEquipes(u.uid); })
        .then(escolherEquipeInicial).then(seguir, seguir);
    } else {
      seguir();
    }
  });
}

/* ----------------------------------------------------------------- estado */
export function estaPronto() { return pronto; }
export function logado() { return !!usuario; }
export function usuarioAtual() { return usuario; }
export function uid() { return usuario ? usuario.uid : null; }
export function perfilAtual() { return perfil; }
export function minhasEquipesLista() {
  return minhasEquipes.map(function (e) {
    return e.id === equipeAtualId_ && meuMembro ? Object.assign({}, e, { papel: meuMembro.papel }) : e;
  });
}
export function equipeAtualId() { return equipeAtualId_; }
export function equipeAtualNome() { return equipeAtual ? equipeAtual.nome : ''; }
export function membro() { return !!(equipeAtualId_ && equipeAtual && meuMembro); }
export function podeEntrar() { return logado() && membro(); }
export function souCoordenador() { return !!(equipeAtual && usuario && equipeAtual.coordenadorUid === usuario.uid); }
export function coordenadorUidAtual() { return equipeAtual ? equipeAtual.coordenadorUid : null; }
export function papel() { return meuMembro ? meuMembro.papel : null; }
// GP e coordenador têm o mesmo poder de edição; planejador só mexe no
// checklist do que foi designado a ele.
export function souGPouCoordenador() { return membro() && (souCoordenador() || papel() === 'gp'); }
export function nomeExibicao() {
  return (perfil && perfil.nome) || (usuario && (usuario.displayName || (usuario.email || '').split('@')[0])) || '';
}
export function aoMudar(fn) { ouvintes.push(fn); if (pronto) fn(); }

// Espera o próximo ciclo de carregamento do onAuthStateChanged — sem
// duplicar a lógica de carregar perfil/equipes (fazer isso em paralelo
// causa corrida nas mesmas variáveis).
function aguardarProximaSincronizacao() {
  let fn;
  const p = new Promise(function (resolve) {
    fn = function () { if (!pronto) return; const i = ouvintes.indexOf(fn); if (i >= 0) ouvintes.splice(i, 1); resolve(); };
    ouvintes.push(fn);
  });
  p.cancelar = function () { const i = ouvintes.indexOf(fn); if (i >= 0) ouvintes.splice(i, 1); };
  return p;
}

/* ------------------------------------------------------------------ conta */
export function entrar(email, senha) {
  if (!FIREBASE_PRONTO) return Promise.reject(new Error('sem-firebase'));
  const espera = aguardarProximaSincronizacao();
  return auth().signInWithEmailAndPassword(email, senha).then(function () { return espera; })
    .catch(function (e) { espera.cancelar(); throw e; });
}

// Cria só a conta + perfil pessoal. Entrar numa equipe é sempre um passo
// separado (criar, convite ou nome + senha).
export function cadastrar(nome, email, senha) {
  if (!FIREBASE_PRONTO) return Promise.reject(new Error('sem-firebase'));
  const espera = aguardarProximaSincronizacao();
  return auth().createUserWithEmailAndPassword(email, senha).then(function (cred) {
    const novoPerfil = {
      nome: nome, email: email, criadoEm: agoraIso(), equipesCriadas: 0,
      tema: 'claro', idioma: 'pt', alerta: 10, alertaTarefa: 2, fimDeSemana: 'nao'
    };
    return docPerfil(cred.user.uid).set(novoPerfil).then(function () {
      perfil = novoPerfil;
      return cred.user.updateProfile({ displayName: nome });
    }).catch(function (e) {
      // o cadastro no Auth já aconteceu; sem perfil, desfaz para não deixar conta órfã
      return cred.user.delete().catch(function () {}).then(function () { throw e; });
    });
  }).then(function () { return espera; }, function (e) { espera.cancelar(); throw e; });
}

export function recuperarSenha(email) {
  if (!FIREBASE_PRONTO) return Promise.reject(new Error('sem-firebase'));
  return auth().sendPasswordResetEmail(email);
}
export function sair() {
  pararEscutaMembro();
  return FIREBASE_PRONTO ? auth().signOut() : Promise.resolve();
}

// Conta criada por versão antiga (ou cadastro interrompido) pode não ter
// /usuarios/{uid}; sem ele a regra recusa qualquer update e criar equipe.
// Cria o perfil mínimo na primeira gravação que precisar dele.
function garantirPerfil() {
  const ref = docPerfil(usuario.uid);
  if (perfil && perfil.criadoEm) return Promise.resolve();   // já veio do servidor
  return ref.get().then(function (snap) {
    if (snap.exists) return;
    const novo = { nome: nomeExibicao(), email: usuario.email || '', criadoEm: agoraIso(), equipesCriadas: 0 };
    return ref.set(novo).then(function () { perfil = Object.assign({}, novo, perfil); });
  }, function (e) { console.info('perfil não conferido (offline?):', e && e.code); });
}

// Preferências pessoais (valem em todas as equipes). Trocar o nome também
// atualiza a minha ficha em cada equipe, que é o que os colegas veem.
export function salvarPerfil(campos) {
  if (!usuario) return Promise.reject(new Error('sem-sessao'));
  const nomeMudou = campos.nome != null && (!perfil || campos.nome !== perfil.nome);
  return garantirPerfil().then(function () { return docPerfil(usuario.uid).update(campos); }).then(function () {
    perfil = Object.assign({}, perfil, campos);
    if (!nomeMudou) return;
    return Promise.all(minhasEquipes.map(function (e) {
      return colMembros(e.id).doc(usuario.uid).update({ nome: campos.nome })
        .catch(function (err) { console.warn('nome não atualizado na equipe', e.id, err && err.code); });
    }));
  });
}

/* ---------------------------------------------------------------- equipes */
// Cria uma equipe e me torna coordenador (limite de 3 por pessoa, garantido
// pela regra). Equipe, segredo (hash da senha) e contador +1 vão na mesma
// transação; meu /membros e o índice pessoal vêm logo depois, porque a regra
// de /membros precisa enxergar a equipe já criada.
export function criarEquipe(nome, senha) {
  if (!usuario) return Promise.reject(new Error('sem-sessao'));
  const nomeLimpo = (nome || '').trim();
  const nomeNorm = normalizarNome(nome);
  if (!nomeNorm) return Promise.reject(new Error('nome-vazio'));
  if (!senha) return Promise.reject(new Error('senha-vazia'));
  const sal = novoSal();
  return garantirPerfil().then(function () { return docNomeEquipe(nomeNorm); }).then(function (refNome) {
    return refNome.get().then(function (snapNome) {
      if (snapNome.exists) throw new Error('nome-indisponivel');
      return hashSenhaEquipe(senha, sal);
    }).then(function (senhaHash) {
      const refEquipe = db().collection('equipes').doc();
      const novoId = refEquipe.id;
      const refPerfil = docPerfil(usuario.uid);
      return db().runTransaction(function (tx) {
        return tx.get(refPerfil).then(function (snap) {
          const atual = (snap.exists && snap.data().equipesCriadas) || 0;
          if (atual >= 3) throw new Error('limite-equipes');
          tx.set(refEquipe, { nome: nomeLimpo, coordenadorUid: usuario.uid, criadoPorUid: usuario.uid, criadoEm: agoraIso() });
          tx.set(docSegredoEquipe(novoId), { senhaHash: senhaHash });
          tx.update(refPerfil, { equipesCriadas: atual + 1 });
        });
      }).then(function () {
        return colMembros(novoId).doc(usuario.uid).set({ nome: nomeExibicao(), email: usuario.email || '', papel: 'gp', entrouEm: agoraIso() });
      }).then(function () {
        return colMinhasEquipes(usuario.uid).doc(novoId).set({ papel: 'gp', nomeEquipe: nomeLimpo, entrouEm: agoraIso() });
      }).then(function () {
        // reserva o nome por último — numa corrida rara com alguém criando o
        // mesmo nome, a equipe existe mas só não fica achável pelo nome
        return refNome.set({ equipeId: novoId, sal: sal }).catch(function (e) { console.warn('nome da equipe não reservado:', e); });
      }).then(function () { return entrouNaEquipe(novoId); });
    });
  });
}

// Nome + senha da equipe: entra como planejador. O hash digitado vai em
// /equipeSegredos/{id}/entradas/{uid} no mesmo lote que o /membros — a regra
// compara os dois ali — e é apagado em seguida.
export function entrarPorNomeSenha(nome, senha) {
  if (!usuario) return Promise.reject(new Error('sem-sessao'));
  const nomeNorm = normalizarNome(nome);
  if (!nomeNorm) return Promise.reject(new Error('nome-vazio'));
  if (!senha) return Promise.reject(new Error('senha-incorreta'));
  return docNomeEquipe(nomeNorm).then(function (refNome) {
    return refNome.get().then(function (snapNome) {
      if (!snapNome.exists) throw new Error('equipe-nao-encontrada');
      const equipeId = snapNome.data().equipeId;
      const refEntrada = docSegredoEquipe(equipeId).collection('entradas').doc(usuario.uid);
      return jaSouMembro(equipeId).then(function (sou) {
        if (sou) throw new Error('ja-e-membro');
        return hashSenhaEquipe(senha, snapNome.data().sal);
      }).then(function (senhaHash) {
        const lote = db().batch();
        lote.set(refEntrada, { senhaHash: senhaHash });
        lote.set(colMembros(equipeId).doc(usuario.uid), { nome: nomeExibicao(), email: usuario.email || '', papel: 'planejador', entrouEm: agoraIso() });
        return lote.commit().catch(function (e) {
          if (e && e.code === 'permission-denied') throw new Error('senha-incorreta');
          throw e;
        });
      }).then(function () {
        refEntrada.delete().catch(function (e) { console.warn('tentativa de senha não apagada:', e); });
        return gravarIndicePessoal(equipeId, 'planejador');
      }).then(function () { return entrouNaEquipe(equipeId); });
    });
  });
}

// O índice pessoal pode estar velho (fui removido); quem decide é o /membros.
// Sem ser membro, a regra nem deixa ler: permission-denied também é "não".
function jaSouMembro(equipeId) {
  if (!minhasEquipes.some(function (e) { return e.id === equipeId; })) return Promise.resolve(false);
  return colMembros(equipeId).doc(usuario.uid).get().then(function (snap) {
    if (!snap.exists) esquecerEquipe(equipeId);
    return snap.exists;
  }, function (e) {
    if (e && e.code === 'permission-denied') { esquecerEquipe(equipeId); return false; }
    throw e;
  });
}

// Convite: marca como usado numa transação (ninguém consome o mesmo código
// duas vezes) e só depois cria meu /membros e o índice pessoal.
export function entrarComConvite(codigo) {
  if (!usuario) return Promise.reject(new Error('sem-sessao'));
  if (!/^[\w-]{8,80}$/.test(codigo || '')) return Promise.reject(new Error('convite-invalido'));
  const refConvite = db().collection('convites').doc(codigo);
  let dados = null;
  return db().runTransaction(function (tx) {
    return tx.get(refConvite).then(function (snap) {
      if (!snap.exists || snap.data().usado) throw new Error('convite-invalido');
      if (conviteVencido(snap.data())) throw new Error('convite-expirado');
      dados = snap.data();
      tx.update(refConvite, { usado: true, usadoPor: usuario.uid, usadoEm: agoraIso() });
    });
  }).then(function () {
    return colMembros(dados.equipeId).doc(usuario.uid).set({
      nome: nomeExibicao(), email: usuario.email || '', papel: dados.papel, entrouEm: agoraIso(), viaConvite: codigo
    });
  }).then(function () {
    return gravarIndicePessoal(dados.equipeId, dados.papel, { viaConvite: codigo });
  }).then(function () { return entrouNaEquipe(dados.equipeId); });
}

// Só depois de virar membro dá pra ler o nome da equipe (regra de leitura).
function gravarIndicePessoal(equipeId, papelNovo, extra) {
  return docEquipe(equipeId).get().then(function (snap) {
    return colMinhasEquipes(usuario.uid).doc(equipeId).set(Object.assign({
      papel: papelNovo, nomeEquipe: snap.exists ? snap.data().nome : '', entrouEm: agoraIso()
    }, extra || {}));
  });
}

function entrouNaEquipe(equipeId) {
  return carregarMinhasEquipes(usuario.uid).then(function () { return trocarEquipe(equipeId, true); })
    .then(function () { return equipeId; });
}

export function trocarEquipe(equipeId, forcar) {
  if (equipeId === equipeAtualId_ && !forcar) return Promise.resolve();
  return selecionarEquipe(equipeId).then(avisar);
}

function membrosDe(qs) {
  const lista = [];
  qs.forEach(function (doc) { lista.push(Object.assign({ uid: doc.id }, doc.data())); });
  lista.sort(function (a, b) { return (a.nome || '').localeCompare(b.nome || '', 'pt-BR'); });
  return lista;
}
export function listarEquipe() {
  if (!equipeAtualId_) return Promise.resolve([]);
  return colMembros(equipeAtualId_).get().then(membrosDe);
}
// Ao vivo, para a tela de Equipe: quem entra, sai ou muda de papel aparece na hora.
export function escutarMembros(callback, aoFalhar) {
  if (!equipeAtualId_) return function () {};
  return colMembros(equipeAtualId_).onSnapshot(function (qs) { callback(membrosDe(qs)); }, aoFalhar);
}
export function removerMembro(alvoUid) {
  if (!equipeAtualId_) return Promise.reject(new Error('sem-equipe'));
  return colMembros(equipeAtualId_).doc(alvoUid).delete();
}
export function alterarPapel(alvoUid, papelNovo) {
  if (!equipeAtualId_) return Promise.reject(new Error('sem-equipe'));
  return colMembros(equipeAtualId_).doc(alvoUid).update({ papel: papelNovo });
}
export function transferirCoordenacao(novoUid) {
  if (!equipeAtualId_) return Promise.reject(new Error('sem-equipe'));
  const id = equipeAtualId_;
  return docEquipe(id).update({ coordenadorUid: novoUid }).then(function () {
    equipeAtual = Object.assign({}, equipeAtual, { coordenadorUid: novoUid });
    avisar();
  });
}
// Sair da equipe por conta própria (o coordenador precisa transferir antes).
export function sairDaEquipe() {
  if (!equipeAtualId_) return Promise.reject(new Error('sem-equipe'));
  if (souCoordenador()) return Promise.reject(new Error('coordenador-nao-sai'));
  const id = equipeAtualId_;
  pararEscutaMembro();
  return colMembros(id).doc(usuario.uid).delete().then(function () {
    return colMinhasEquipes(usuario.uid).doc(id).delete().catch(function () {});
  }).then(function () { saiuDaEquipe(id); });
}

// Equipe criada antes do PBKDF2: o SHA-256 puro ainda está em /equipes/{id}.
export function senhaFormatoAntigo() { return !!(equipeAtual && equipeAtual.senhaHash); }
export function redefinirSenhaEquipe(senhaNova) {
  if (!equipeAtualId_ || !equipeAtual) return Promise.reject(new Error('sem-equipe'));
  if (!senhaNova) return Promise.reject(new Error('senha-vazia'));
  const equipeId = equipeAtualId_;
  const sal = novoSal();
  return docNomeEquipe(normalizarNome(equipeAtual.nome)).then(function (refNome) {
    return Promise.all([refNome.get(), hashSenhaEquipe(senhaNova, sal)]).then(function (r) {
      const snapNome = r[0], senhaHash = r[1];
      const lote = db().batch();
      lote.set(docSegredoEquipe(equipeId), { senhaHash: senhaHash });
      if (snapNome.exists && snapNome.data().equipeId === equipeId) lote.update(refNome, { sal: sal });
      if (equipeAtual.senhaHash) lote.update(docEquipe(equipeId), { senhaHash: apagarCampo() });
      return lote.commit();
    });
  }).then(function () {
    if (equipeAtual) { equipeAtual = Object.assign({}, equipeAtual); delete equipeAtual.senhaHash; }
  });
}

/* --------------------------------------------------------------- convites */
// O link vale VALIDADE_CONVITE_DIAS a partir de emitidoEm (hora do servidor);
// a regra do Firestore confere o mesmo prazo ao consumir.
export const VALIDADE_CONVITE_DIAS = 7;
// Instante (ms) em que o convite vence; sem emitidoEm (convite antigo) já venceu.
function venceEm(d) {
  const t = d.emitidoEm;
  return t && typeof t.toMillis === 'function' ? t.toMillis() + VALIDADE_CONVITE_DIAS * 86400000 : 0;
}
function conviteVencido(d) { return venceEm(d) <= Date.now(); }

export function criarConvite(papelConvite) {
  if (!equipeAtualId_) return Promise.reject(new Error('sem-equipe'));
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const codigo = hexDe(bytes);
  return db().collection('convites').doc(codigo).set({
    criadoPor: usuario.uid, equipeId: equipeAtualId_, usado: false, papel: papelConvite, criadoEm: agoraIso(),
    emitidoEm: horaDoServidor()
  }).then(function () { return codigo; });
}
// Filtra a equipe no where() (a regra só libera listar a própria equipe) e
// "usado" no cliente, para não precisar de índice composto. Convite vencido
// não aparece e é apagado aqui mesmo (quem escuta é GP/coordenador, que pode).
function convitesAbertosDe(qs) {
  const lista = [];
  qs.forEach(function (doc) {
    // recém-criado ainda sem a hora do servidor: usa a estimativa local
    const d = doc.data({ serverTimestamps: 'estimate' });
    if (d.usado) return;
    if (conviteVencido(d)) {
      if (!doc.metadata.hasPendingWrites) doc.ref.delete().catch(function (e) { console.warn('convite vencido não apagado:', e && e.code); });
      return;
    }
    lista.push(Object.assign({ codigo: doc.id, venceEm: venceEm(d) }, d));
  });
  lista.sort(function (a, b) { return b.venceEm - a.venceEm; });
  return lista;
}
export function escutarConvites(callback, aoFalhar) {
  if (!equipeAtualId_) return function () {};
  return db().collection('convites').where('equipeId', '==', equipeAtualId_)
    .onSnapshot(function (qs) { callback(convitesAbertosDe(qs)); }, aoFalhar);
}
export function revogarConvite(codigo) { return db().collection('convites').doc(codigo).delete(); }

/* ----------------------------------------------------------- notificações */
// Designação de projeto ou observação numa tarefa. Só GP/coordenador geram
// (regra); o destinatário lê as próprias e marca como lidas.
export function criarNotificacao(paraUid, tipo, mensagem, projetoId) {
  if (!usuario || !paraUid || paraUid === usuario.uid) return Promise.resolve();
  return db().collection('notificacoes').add({
    paraUid: paraUid, tipo: tipo, mensagem: mensagem, projetoId: projetoId || null, equipeId: equipeAtualId_,
    deUid: usuario.uid, deNome: nomeExibicao(), lida: false, criadoEm: agoraIso()
  }).catch(function (e) { console.warn('notificação não enviada:', e); });
}
export function escutarNotificacoes(callback) {
  if (!usuario) return function () {};
  return db().collection('notificacoes').where('paraUid', '==', usuario.uid).onSnapshot(function (qs) {
    const lista = [];
    qs.forEach(function (doc) { lista.push(Object.assign({ id: doc.id }, doc.data())); });
    lista.sort(function (a, b) { return (b.criadoEm || '').localeCompare(a.criadoEm || ''); });
    callback(lista);
  }, function (e) { console.warn('notificações indisponíveis:', e && e.code); callback([]); });
}
export function marcarNotificacaoLida(id) {
  return db().collection('notificacoes').doc(id).update({ lida: true });
}

/* -------------------------------------------------------------------- chat */
function docProjeto(projetoId) { return docEquipe(equipeAtualId_).collection('projetos').doc(projetoId); }
export function escutarChat(projetoId, callback) {
  return docProjeto(projetoId).collection('chat').orderBy('criadoEm', 'asc').limitToLast(300).onSnapshot(function (qs) {
    const msgs = [];
    qs.forEach(function (doc) { msgs.push(Object.assign({ id: doc.id }, doc.data())); });
    callback(msgs);
  }, function (e) { console.warn('chat indisponível:', e && e.code); callback(null); });
}
export function enviarMensagemChat(projetoId, texto) {
  if (!usuario) return Promise.reject(new Error('sem-sessao'));
  return docProjeto(projetoId).collection('chat').add({
    autorUid: usuario.uid, autorNome: nomeExibicao(), texto: texto, criadoEm: agoraIso()
  });
}

/* ------------------------------------------------------ migração (legado) */
// Antes das equipes havia um espaço só. Quem era o coordenador dele pode
// criar uma equipe a partir dele; só os projetos são copiados.
export function verificarEquipeAntiga() {
  if (!usuario || !FIREBASE_PRONTO) return Promise.resolve(false);
  return docCoordenadorAntigo().get().then(function (snap) { return snap.exists && snap.data().uid === usuario.uid; })
    .catch(function () { return false; });
}
export function migrarEquipeAntiga(nomeEquipe, senha) {
  return criarEquipe(nomeEquipe, senha).then(function (novoId) {
    return db().collection('projetos').get().then(function (qs) {
      const antigos = [];
      qs.forEach(function (doc) { antigos.push(Object.assign({}, doc.data(), { id: doc.id })); });
      const col = docEquipe(novoId).collection('projetos');
      const lotes = [];
      for (let i = 0; i < antigos.length; i += 400) {
        const lote = db().batch();
        antigos.slice(i, i + 400).forEach(function (p) { lote.set(col.doc(p.id), Object.assign({ responsavelUid: null }, p)); });
        lotes.push(lote.commit());
      }
      return Promise.all(lotes).then(function () { return { equipeId: novoId, projetosMigrados: antigos.length }; });
    }).catch(function (e) {
      console.warn('projetos antigos não migrados:', e);
      return { equipeId: novoId, projetosMigrados: 0, erroProjetos: true };
    });
  });
}
