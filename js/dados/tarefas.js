/* ---------------------------------------------------------------------------
   Tarefas avulsas (equipes/{id}/tarefas/{id}). Toda a equipe lê; GP do
   projeto e Gerência criam, editam, reabrem e apagam; quem recebeu conclui.
--------------------------------------------------------------------------- */
import { agoraIso } from '../nucleo/fmt.js';
import { db } from './firebase.js';
import * as Auth from './auth.js';
import { LIMITES } from '../dominio/tarefas.js';

let parar = null;
function col() { return db().collection('equipes').doc(Auth.equipeAtualId()).collection('tarefas'); }
function nome() { return String(Auth.nomeExibicao() || '').slice(0, 60); }

export function escutar(aoReceber) {
  pararEscuta();
  parar = col().onSnapshot(function (qs) {
    aoReceber(qs.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }));
  }, function (e) { console.warn('tarefas indisponíveis:', e && e.code); aoReceber([]); });
}
export function pararEscuta() { if (parar) { parar(); parar = null; } }

function campos(d) {
  return {
    titulo: String(d.titulo || '').trim().slice(0, LIMITES.titulo), descricao: String(d.descricao || '').trim().slice(0, LIMITES.descricao),
    paraUid: d.paraUid, paraNome: String(d.paraNome || '').slice(0, 60), prazo: d.prazo || ''
  };
}

// Nova tarefa no projeto. Devolve o id.
export function criar(projeto, d) {
  const ref = col().doc();
  const agora = agoraIso();
  return ref.set(Object.assign(campos(d), {
    projetoId: projeto.id, commessa: String(projeto.commessa || '').slice(0, 40), status: 'aberta',
    criadoPorUid: Auth.uid(), criadoPorNome: nome(), criadoEm: agora, atualizadoEm: agora,
    concluidaEm: '', concluidaPorUid: '', concluidaPorNome: '', obsConclusao: ''
  })).then(function () { return ref.id; });
}
export function editar(id, d) { return col().doc(id).update(Object.assign(campos(d), { atualizadoEm: agoraIso() })); }
export function concluir(id, obs) {
  const agora = agoraIso();
  return col().doc(id).update({ status: 'concluida', concluidaEm: agora, concluidaPorUid: Auth.uid(), concluidaPorNome: nome(),
    obsConclusao: String(obs || '').trim().slice(0, LIMITES.obsConclusao), atualizadoEm: agora });
}
export function reabrir(id) {
  return col().doc(id).update({ status: 'aberta', concluidaEm: '', concluidaPorUid: '', concluidaPorNome: '', obsConclusao: '', atualizadoEm: agoraIso() });
}
export function apagar(id) { return col().doc(id).delete(); }
// Excluir o projeto: apaga as tarefas dele.
export function apagarDoProjeto(lista) {
  return Promise.all((lista || []).map(function (t) { return apagar(t.id).catch(function (e) { console.warn('tarefa não apagada:', e && e.code); }); }));
}
