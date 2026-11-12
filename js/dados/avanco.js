/* ---------------------------------------------------------------------------
   Lista de avanço do projeto (equipes/{id}/avanco/{projetoId}): a aba da
   planilha que o PCP sobe pronta, guardada como valores. Toda a equipe lê
   (é a lista do projeto exposta para todos); grava quem sobe a planilha
   (Gerência ou o técnico do projeto). Lida só quando alguém abre a lista.
--------------------------------------------------------------------------- */
import { agoraIso } from '../nucleo/fmt.js';
import { db } from './firebase.js';
import * as Auth from './auth.js';
import * as Avanco from '../dominio/avanco.js';

function doc(projetoId) { return db().collection('equipes').doc(Auth.equipeAtualId()).collection('avanco').doc(projetoId); }

export function ler(projetoId) {
  return doc(projetoId).get().then(function (snap) {
    if (!snap.exists) return null;
    const d = snap.data();
    return Object.assign({}, d, { matriz: Avanco.daGravacao(d.linhas) });
  });
}

/**
 * Grava a aba inteira. lista: { matriz, merges, larguras, arquivo, aba, opPintura, servicos }.
 * Rejeita com Error('avanco-grande') se não couber num documento.
 */
export function salvar(projeto, lista) {
  const dados = {
    projetoId: projeto.id, commessa: String(projeto.commessa || '').slice(0, 40),
    arquivo: String(lista.arquivo || '').slice(0, 160), aba: String(lista.aba || '').slice(0, 60),
    opPintura: String(lista.opPintura || '').slice(0, 40),
    linhas: Avanco.paraGravar(lista.matriz),
    servicos: (lista.servicos || []).slice(0, 300).map(function (x) {
      const r = {};
      ['tipo', 'servico', 'peca', 'desenho', 'posicao', 'sc', 'pc', 'fornecedor', 'obs'].forEach(function (k) { r[k] = String(x[k] || '').slice(0, k === 'servico' || k === 'obs' ? 200 : 80); });
      return r;
    }),
    merges: (lista.merges || []).slice(0, 400).map(function (m) { return { s: { r: m.s.r, c: m.s.c }, e: { r: m.e.r, c: m.e.c } }; }),
    larguras: (lista.larguras || []).slice(0, Avanco.MAX_COLUNAS).map(function (w) { return Number(w) || null; }),
    enviadoEm: agoraIso(), enviadoPorUid: Auth.uid(), enviadoPorNome: String(Auth.nomeExibicao() || '').slice(0, 60)
  };
  if (lista.matriz.length > Avanco.MAX_LINHAS || JSON.stringify(dados).length > Avanco.MAX_BYTES) return Promise.reject(new Error('avanco-grande'));
  esquecer(projeto.id);
  return doc(projeto.id).set(dados);
}

// Apaga a lista de avanço do projeto (subir de novo ou excluir o projeto).
export function apagar(projetoId) { esquecer(projetoId); return doc(projetoId).delete(); }

// Leitura guardada por projeto (cartões e janelas da página do projeto leem a
// mesma planilha uma vez só). Subir ou apagar a lista limpa a guardada.
const guardadas = {};
export function lerGuardada(projetoId) {
  const k = Auth.equipeAtualId() + '/' + projetoId;
  // vale por 2 minutos: outra pessoa pode ter subido a planilha de novo
  if (!guardadas[k] || Date.now() - guardadas[k].t > 120000) {
    guardadas[k] = { t: Date.now(), p: ler(projetoId).catch(function (e) { delete guardadas[k]; throw e; }) };
  }
  return guardadas[k].p;
}
export function esquecer(projetoId) { delete guardadas[Auth.equipeAtualId() + '/' + projetoId]; }
