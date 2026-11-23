/* ---------------------------------------------------------------------------
   Contratos com OM (config/contratos): a lista de commessas cujos projetos
   são separados por OM. Toda a equipe lê; só a Gerência grava.
--------------------------------------------------------------------------- */
import { agoraIso } from '../nucleo/fmt.js';
import { db } from './firebase.js';
import * as Auth from './auth.js';

function ref() { return db().collection('equipes').doc(Auth.equipeAtualId()).collection('config').doc('contratos'); }

let parar = null;
export function escutar(aoReceber) {
  pararEscuta();
  parar = ref().onSnapshot(function (snap) {
    aoReceber(snap.exists ? (snap.data().lista || null) : null);
  }, function (e) { console.warn('contratos indisponíveis:', e && e.code); aoReceber(null); });
}
export function pararEscuta() { if (parar) { parar(); parar = null; } }
export function salvar(lista) {
  return ref().set({ lista: lista, atualizadoEm: agoraIso(), atualizadoPorUid: Auth.uid() });
}
