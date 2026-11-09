/* ---------------------------------------------------------------------------
   Programação das OPs no Firestore:
     - terceirizadas da caldeiraria (equipes/{id}/terceirizadas)
     - programação da OP de caldeiraria (op.programacao)
     - fila de cada máquina da usinagem (maquinas/{id}.fila)
     - horas reais da OP de usinagem (op.horasReais)
     - finalizar a OP depois da baixa do CQ (op.encerradaEm)
     - destino da peça pronta (op.destino)
   Quem pode cada coisa é decidido nas regras do Firestore.
--------------------------------------------------------------------------- */
import { agoraIso } from '../nucleo/fmt.js';
import { db } from './firebase.js';
import * as Auth from './auth.js';

function equipe() { return db().collection('equipes').doc(Auth.equipeAtualId()); }
function refOp(id) { return equipe().collection('ops').doc(id); }
function refMaquina(id) { return equipe().collection('maquinas').doc(id); }

/* ---------------------------------------------------------- terceirizadas */
let parar = null;
export function escutarTerceirizadas(aoReceber) {
  pararEscuta();
  parar = equipe().collection('terceirizadas').onSnapshot(function (qs) {
    const lista = [];
    qs.forEach(function (d) { lista.push(Object.assign({ id: d.id }, d.data())); });
    lista.sort(function (a, b) { return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { numeric: true }); });
    aoReceber(lista);
  }, function (e) { console.warn('terceirizadas indisponíveis:', e && e.code); aoReceber([]); });
}
export function pararEscuta() { if (parar) { parar(); parar = null; } }
export function salvarTerceirizada(nome) {
  return equipe().collection('terceirizadas').add({ nome: String(nome || '').trim().slice(0, 60), ativa: true, criadoEm: agoraIso(), atualizadoEm: agoraIso() });
}
export function excluirTerceirizada(id) { return equipe().collection('terceirizadas').doc(id).delete(); }

/* ------------------------------------------------------------ caldeiraria */
export function programarCald(opId, terceirizada, previsaoFim) {
  return refOp(opId).update({
    programacao: { terceirizadaId: terceirizada.id, terceirizada: String(terceirizada.nome || '').slice(0, 60), previsaoFim: previsaoFim,
      em: agoraIso(), porUid: Auth.uid() }
  });
}
// Tira da fábrica: volta para a mão da programadora (conta de novo a espera).
export function tirarDaFabrica(opId) { return refOp(opId).update({ programacao: null, desprogramadaEm: agoraIso() }); }

/* --------------------------------------------------------------- usinagem */
function itemFila(f) {
  const r = { opId: String(f.opId) };
  r.horas = Number(f.horas) > 0 ? Math.min(10000, Number(f.horas)) : null;
  r.naoAntes = f.naoAntes || null;
  return r;
}
export function salvarFila(maquinaId, fila) {
  return refMaquina(maquinaId).update({ fila: (fila || []).map(itemFila), atualizadoEm: agoraIso() });
}
// A OP sai de todas as filas (e volta para "aguardando programação").
export function tirarDasFilas(opId, maquinas) {
  const lote = db().batch();
  let n = 0;
  (maquinas || []).forEach(function (m) {
    if (!(m.fila || []).some(function (f) { return f.opId === opId; })) return;
    lote.update(refMaquina(m.id), { fila: m.fila.filter(function (f) { return f.opId !== opId; }).map(itemFila), atualizadoEm: agoraIso() });
    n++;
  });
  lote.update(refOp(opId), { desprogramadaEm: agoraIso() });
  return n ? lote.commit() : refOp(opId).update({ desprogramadaEm: agoraIso() });
}
export function salvarHorasReais(opId, horas) {
  return refOp(opId).update({ horasReais: horas === '' || horas == null || isNaN(Number(horas)) ? null : Number(horas) });
}

/* ---------------------------------------------------------------- finalizar */
// Depois da baixa do CQ: a OP sai da programação (e das filas das máquinas).
export function finalizar(op, maquinas) {
  const lote = db().batch();
  lote.update(refOp(op.id), { encerradaEm: agoraIso(), encerradaPorUid: Auth.uid(), encerradaPorNome: String(Auth.nomeExibicao() || '').slice(0, 60) });
  if (op.area === 'usinagem') {
    (maquinas || []).forEach(function (m) {
      if (!(m.fila || []).some(function (f) { return f.opId === op.id; })) return;
      lote.update(refMaquina(m.id), { fila: m.fila.filter(function (f) { return f.opId !== op.id; }).map(itemFila), atualizadoEm: agoraIso() });
    });
  }
  return lote.commit();
}

/* ------------------------------------------------------------------ destino */
export function definirDestino(ops, destino) {
  const lote = db().batch();
  (ops || []).forEach(function (o) { lote.update(refOp(o.id), { destino: destino, destinoEm: agoraIso(), destinoPorUid: Auth.uid() }); });
  return lote.commit();
}
