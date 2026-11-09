/* ---------------------------------------------------------------------------
   Carga — máquinas da usinagem (equipes/{id}/maquinas), capacidade da
   fábrica (equipes/{id}/config/fabrica) e o setor do PDF → máquina
   (config/setores). A fila de cada máquina fica em dados/programacao.js.
   Quem grava cada coisa é decidido nas regras do Firestore.
--------------------------------------------------------------------------- */
import { agoraIso } from '../nucleo/fmt.js';
import { db } from './firebase.js';
import * as Auth from './auth.js';

let pararMaquinas = null, pararConfig = null, pararSetores = null;

function equipe() { return db().collection('equipes').doc(Auth.equipeAtualId()); }

export function escutar(aoMaquinas, aoConfig, aoSetores) {
  pararEscuta();
  pararMaquinas = equipe().collection('maquinas').onSnapshot(function (qs) {
    const lista = [];
    qs.forEach(function (doc) { lista.push(Object.assign({ id: doc.id }, doc.data())); });
    lista.sort(function (a, b) { return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { numeric: true }); });
    aoMaquinas(lista);
  }, function (e) { console.warn('máquinas indisponíveis:', e && e.code); aoMaquinas([]); });
  pararConfig = equipe().collection('config').doc('fabrica').onSnapshot(function (snap) {
    aoConfig(snap.exists ? snap.data() : {});
  }, function (e) { console.warn('configuração da fábrica indisponível:', e && e.code); aoConfig({}); });
  // setor do PDF da OP → máquina (config/setores)
  if (aoSetores) {
    pararSetores = equipe().collection('config').doc('setores').onSnapshot(function (snap) {
      aoSetores(snap.exists ? (snap.data().mapa || {}) : {});
    }, function (e) { console.warn('setores indisponíveis:', e && e.code); aoSetores({}); });
  }
}
export function pararEscuta() {
  if (pararMaquinas) { pararMaquinas(); pararMaquinas = null; }
  if (pararConfig) { pararConfig(); pararConfig = null; }
  if (pararSetores) { pararSetores(); pararSetores = null; }
}

export function salvarMaquina(m) {
  const dados = { nome: String(m.nome || '').trim().slice(0, 60), horasDia: Number(m.horasDia), ativa: m.ativa !== false, atualizadoEm: agoraIso() };
  const col = equipe().collection('maquinas');
  if (m.id) return col.doc(m.id).update(dados);
  return col.add(Object.assign({ criadoEm: agoraIso() }, dados));
}
export function excluirMaquina(id) { return equipe().collection('maquinas').doc(id).delete(); }

export function salvarCapacidade(kg) {
  return equipe().collection('config').doc('fabrica').set({
    capacidadeKgSemana: Number(kg), atualizadoEm: agoraIso(), atualizadoPorUid: Auth.uid()
  });
}

// Setor do PDF → máquina (id) ou '' = não é máquina; null tira a escolha.
export function salvarSetor(chaveSetor, maquinaId) {
  const valor = maquinaId == null ? window.firebase.firestore.FieldValue.delete() : String(maquinaId);
  return equipe().collection('config').doc('setores').set({
    mapa: { [chaveSetor]: valor }, atualizadoEm: agoraIso(), atualizadoPorUid: Auth.uid()
  }, { merge: true });
}

