/* ---------------------------------------------------------------------------
   OPs — ordens de produção da equipe no Firestore (equipes/{id}/ops).
   Leitura ao vivo com o mesmo filtro da regra de cada cargo:
     gerente e CQ → todas · programador → a área dele
     GP → gpUid · técnico → tecnicoUid
--------------------------------------------------------------------------- */
import { db } from './firebase.js';
import * as Auth from './auth.js';
import * as Planilha from '../dominio/planilha.js';

const LOTE_MAX = 400;
let parar = null;

function colOps() { return db().collection('equipes').doc(Auth.equipeAtualId()).collection('ops'); }
function agoraIso() { return new Date().toISOString(); }

function consulta() {
  const papel = Auth.papel();
  if (papel === 'gerente_pcp' || papel === 'cq') return colOps();
  const area = Auth.areaProgramador();
  if (area) return colOps().where('area', '==', area);
  if (papel === 'gp') return colOps().where('gpUid', '==', Auth.uid());
  return colOps().where('tecnicoUid', '==', Auth.uid());
}

export function escutar(aoReceber, aoFalhar) {
  pararEscuta();
  parar = consulta().onSnapshot(function (qs) {
    const lista = [];
    qs.forEach(function (doc) { lista.push(Object.assign({ id: doc.id }, doc.data())); });
    aoReceber(lista);
  }, function (e) {
    console.warn('OPs indisponíveis:', e && e.code);
    if (aoFalhar) aoFalhar(e);
  });
}
export function pararEscuta() { if (parar) { parar(); parar = null; } }

// Grava a planilha comparada (Planilha.comparar): cria as novas e atualiza
// só os dados das que mudaram. GP e técnico vão copiados do projeto.
export function gravarPlanilha(projeto, comparacao) {
  const col = colOps();
  const agora = agoraIso();
  const base = {
    projetoId: projeto.id, commessa: String(projeto.commessa || ''), cliente: String(projeto.cliente || ''),
    descricaoProjeto: String(projeto.descricao || '').slice(0, 160),
    gpUid: projeto.gpUid || null, tecnicoUid: projeto.responsavelUid || null
  };
  const escritas = [];
  comparacao.novas.forEach(function (o) {
    escritas.push(function (lote) {
      lote.set(col.doc(o.id), Object.assign({}, base, {
        area: o.area, numero: o.numero, desenho: o.desenho, posicao: o.posicao, rev: o.rev, descricao: o.descricao,
        qtd: o.qtd, pesoUnit: o.pesoUnit, pesoTotal: o.pesoTotal, status: 'aberta',
        criadoEm: agora, criadoPorUid: Auth.uid(), atualizadoEm: agora
      }));
    });
  });
  comparacao.atualizadas.forEach(function (a) {
    escritas.push(function (lote) {
      lote.update(col.doc(a.id), Object.assign({}, a.campos, {
        commessa: base.commessa, cliente: base.cliente, descricaoProjeto: base.descricaoProjeto,
        gpUid: base.gpUid, tecnicoUid: base.tecnicoUid, atualizadoEm: agora
      }));
    });
  });
  const envios = [];
  for (let i = 0; i < escritas.length; i += LOTE_MAX) {
    const lote = db().batch();
    escritas.slice(i, i + LOTE_MAX).forEach(function (fn) { fn(lote); });
    envios.push(lote.commit());
  }
  return Promise.all(envios).then(function () { return escritas.length; });
}

export function idOp(projetoId, area, desenho, posicao) { return Planilha.idOp(projetoId, area, desenho, posicao); }

// CQ: Aprovada ou Com RNC (observação obrigatória). Uma vez só (regra).
export function finalizar(opId, status, rncObs) {
  const dados = { status: status, finalizadoPorUid: Auth.uid(), finalizadoPorNome: Auth.nomeExibicao(), finalizadoEm: agoraIso() };
  if (status === 'rnc') dados.rncObs = String(rncObs || '').slice(0, 1000);
  return colOps().doc(opId).update(dados);
}

export function apagar(opId) { return colOps().doc(opId).delete(); }

// Projeto trocou de GP ou de técnico: as OPs dele acompanham (quem vê muda junto).
export function sincronizarDesignacao(projeto, ops) {
  const alvo = (ops || []).filter(function (o) {
    return o.projetoId === projeto.id && (o.gpUid !== (projeto.gpUid || null) || o.tecnicoUid !== (projeto.responsavelUid || null));
  });
  if (!alvo.length) return Promise.resolve(0);
  const envios = [];
  for (let i = 0; i < alvo.length; i += LOTE_MAX) {
    const lote = db().batch();
    alvo.slice(i, i + LOTE_MAX).forEach(function (o) {
      lote.update(colOps().doc(o.id), { gpUid: projeto.gpUid || null, tecnicoUid: projeto.responsavelUid || null });
    });
    envios.push(lote.commit());
  }
  return Promise.all(envios).then(function () { return alvo.length; });
}
