/* ---------------------------------------------------------------------------
   Carga — máquinas da usinagem (equipes/{id}/maquinas), capacidade da
   fábrica (equipes/{id}/config/fabrica) e a programação das OPs de
   usinagem (máquina e horas previstas, gravadas na própria OP).
   Quem grava cada coisa é decidido nas regras do Firestore.
--------------------------------------------------------------------------- */
import { db } from './firebase.js';
import * as Auth from './auth.js';

let pararMaquinas = null, pararConfig = null;

function equipe() { return db().collection('equipes').doc(Auth.equipeAtualId()); }
function agoraIso() { return new Date().toISOString(); }

export function escutar(aoMaquinas, aoConfig) {
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
}
export function pararEscuta() {
  if (pararMaquinas) { pararMaquinas(); pararMaquinas = null; }
  if (pararConfig) { pararConfig(); pararConfig = null; }
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

// Máquina e horas previstas de uma OP de usinagem (null limpa).
export function programarOp(opId, maquinaId, horas) {
  return equipe().collection('ops').doc(opId).update({
    maquinaId: maquinaId || null,
    horasPrevistas: horas === '' || horas == null || isNaN(Number(horas)) ? null : Number(horas),
    programadoEm: agoraIso(), programadoPorUid: Auth.uid()
  });
}
