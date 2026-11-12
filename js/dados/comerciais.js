/* ---------------------------------------------------------------------------
   Itens comerciais e serviços externos do projeto.
     equipes/{id}/comerciais/{projetoId}         pedido, SC, fornecedor e chegadas
     equipes/{id}/comerciaisValores/{projetoId}  valores (só Gerência, GP e técnico do projeto)
     equipes/{id}/servicos/{projetoId}           envios e retornos dos serviços
   Toda a equipe lê comerciais e serviços; gravam Gerência, o GP e o técnico
   do projeto. Cada gravação troca o registro de um item inteiro (transação).
--------------------------------------------------------------------------- */
import { agoraIso } from '../nucleo/fmt.js';
import { db } from './firebase.js';
import * as Auth from './auth.js';

export const MAX_ITENS = 800;

function col(nome) { return db().collection('equipes').doc(Auth.equipeAtualId()).collection(nome); }

/* --------------------------------------------- um documento (janela aberta) */
// Escuta um documento do projeto. aoReceber(dados | null). Devolve a função de parar.
export function escutarDoc(nome, projetoId, aoReceber, aoFalhar) {
  return col(nome).doc(projetoId).onSnapshot(function (snap) { aoReceber(snap.exists ? snap.data() : null); },
    function (e) { console.warn(nome + ' indisponível:', e && e.code); if (aoFalhar) aoFalhar(e); else aoReceber(null); });
}

/**
 * Troca registros de itens (null apaga o item) e, opcionalmente, campos do
 * mapa "pedidos". mudancas: { chave: registro | null } · pedidos: { numero: dados | null }
 */
export function gravarItens(nome, projeto, mudancas, pedidos) {
  const ref = col(nome).doc(projeto.id);
  return db().runTransaction(function (tx) {
    return tx.get(ref).then(function (snap) {
      const atual = snap.exists ? snap.data() : {};
      const itens = Object.assign({}, atual.itens || {});
      Object.keys(mudancas || {}).forEach(function (k) { if (mudancas[k] == null) delete itens[k]; else itens[k] = mudancas[k]; });
      if (Object.keys(itens).length > MAX_ITENS) throw new Error('comerciais-muitos');
      const dados = { projetoId: projeto.id, itens: itens, atualizadoEm: agoraIso(), porUid: Auth.uid() };
      if (nome !== 'comerciaisValores') dados.commessa = String(projeto.commessa || '').slice(0, 40);
      if (nome !== 'servicos') {
        const ped = Object.assign({}, atual.pedidos || {});
        Object.keys(pedidos || {}).forEach(function (k) { if (pedidos[k] == null) delete ped[k]; else ped[k] = pedidos[k]; });
        dados.pedidos = ped;
      }
      tx.set(ref, dados);
    });
  });
}

/* ------------------------------------- todos os serviços (avisos do técnico) */
let parar = null;
export function escutarServicos(aoReceber) {
  pararServicos();
  parar = col('servicos').onSnapshot(function (snap) {
    aoReceber(snap.docs.map(function (d) { return Object.assign({ projetoId: d.id }, d.data()); }));
  }, function (e) { console.warn('serviços indisponíveis:', e && e.code); aoReceber([]); });
}
export function pararServicos() { if (parar) { parar(); parar = null; } }

// Excluir o projeto: apaga os três documentos (o de valores só quem pode lê-lo).
export function apagarDoProjeto(projetoId) {
  return Promise.all(['comerciais', 'comerciaisValores', 'servicos'].map(function (n) {
    return col(n).doc(projetoId).delete().catch(function (e) { console.warn(n + ' não apagado:', e && e.code); });
  }));
}
