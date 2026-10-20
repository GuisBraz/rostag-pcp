/* ---------------------------------------------------------------------------
   Checklist padrão do PCP da equipe (equipes/{id}/config/checklist).
   Sem o documento, vale a lista de fábrica (CHECKLIST_PADRAO). Gerência e
   GP editam; a lista só é usada ao criar projeto novo.
--------------------------------------------------------------------------- */
import { db } from './firebase.js';
import * as Auth from './auth.js';

let parar = null;

function doc() { return db().collection('equipes').doc(Auth.equipeAtualId()).collection('config').doc('checklist'); }

export function escutar(aoReceber) {
  pararEscuta();
  parar = doc().onSnapshot(function (snap) { aoReceber(snap.exists ? snap.data() : null); },
    function (e) { console.warn('checklist padrão indisponível:', e && e.code); aoReceber(null); });
}
export function pararEscuta() { if (parar) { parar(); parar = null; } }

// Grava a lista nova. "base" é o atualizadoEm que o editor carregou: se
// alguém salvou depois disso, recusa (erro 'checklist-conflito') em vez de
// sobrescrever sem perceber.
export function salvar(itens, base) {
  const ref = doc();
  return db().runTransaction(function (tx) {
    return tx.get(ref).then(function (snap) {
      const atual = snap.exists ? (snap.data().atualizadoEm || null) : null;
      if (atual !== (base || null)) {
        const e = new Error('checklist-conflito');
        e.por = snap.exists ? snap.data().porNome : '';
        e.em = atual;
        throw e;
      }
      tx.set(ref, { itens: itens, atualizadoEm: new Date().toISOString(), porUid: Auth.uid(), porNome: Auth.nomeExibicao() });
    });
  });
}
