/* ---------------------------------------------------------------------------
   PGMs (programas de corte da caldeiraria) no Firestore: equipes/{id}/pgms.
   O técnico do projeto (e a Gerência) inclui e apaga; a programadora de
   caldeiraria muda a situação (cortando / cortado). A fila fica na máquina
   (maquinas/{id}.fila, item com opId 'pgm:<id>').
--------------------------------------------------------------------------- */
import { agoraIso } from '../nucleo/fmt.js';
import { db } from './firebase.js';
import * as Auth from './auth.js';
import { idPgm } from '../dominio/pgm.js';

function col() { return db().collection('equipes').doc(Auth.equipeAtualId()).collection('pgms'); }

let parar = null;
export function escutar(aoReceber) {
  pararEscuta();
  parar = col().onSnapshot(function (qs) {
    const lista = [];
    qs.forEach(function (d) { lista.push(Object.assign({ id: d.id }, d.data())); });
    aoReceber(lista);
  }, function (e) { console.warn('PGMs indisponíveis:', e && e.code); aoReceber([]); });
}
export function pararEscuta() { if (parar) { parar(); parar = null; } }

function txt(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }
// Grava os PGMs lidos (um por nº dentro do projeto: subir de novo atualiza).
export function gravar(projeto, lidos) {
  const lote = db().batch(), agora = agoraIso();
  (lidos || []).forEach(function (r) {
    const id = idPgm(projeto.id, r.numero);
    lote.set(col().doc(id), {
      numero: txt(r.numero, 30), projetoId: projeto.id, commessa: txt(projeto.commessa, 60),
      maquinaTexto: txt(r.maquinaTexto, 120), maquina: r.maquina === 'plasma' || r.maquina === 'oxicorte' ? r.maquina : '',
      tempoMin: Number(r.tempoMin) || 0, quantidade: Math.max(1, Math.min(999, Math.floor(Number(r.quantidade) || 1))), horas: Number(r.horas) || 0,
      chapa: txt(r.chapa, 120), dimensoes: txt(r.dimensoes, 60), material: txt(r.material, 60), peso: Number(r.peso) || 0,
      trabalho: txt(r.trabalho, 60), data: txt(r.data, 20), arquivo: txt(r.arquivo, 160),
      situacao: null, criadoEm: agora, criadoPorUid: Auth.uid(), atualizadoEm: agora
    });
  });
  return lote.commit();
}
export function apagar(id) { return col().doc(id).delete(); }
// Cortando / cortado / voltar para a fila (programadora de caldeiraria)
export function mudarSituacao(id, situacao) {
  const agora = agoraIso(), d = { situacao: situacao || null, porUid: Auth.uid(), atualizadoEm: agora };
  if (situacao === 'cortando') d.iniciadoEm = agora;
  if (situacao === 'cortado') d.cortadoEm = agora;
  return col().doc(id).update(d);
}
