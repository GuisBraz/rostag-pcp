/* ---------------------------------------------------------------------------
   OPs — ordens de produção da equipe no Firestore (equipes/{id}/ops).
   Leitura ao vivo com o mesmo filtro da regra de cada cargo:
     gerente e CQ → todas · programador → a área dele
     GP → gpUid · técnico → tecnicoUid
--------------------------------------------------------------------------- */
import { agoraIso } from '../nucleo/fmt.js';
import { db, apagarCampo } from './firebase.js';
import * as Auth from './auth.js';
import * as Planilha from '../dominio/planilha.js';

const LOTE_MAX = 400;
let parar = null;

function colOps() { return db().collection('equipes').doc(Auth.equipeAtualId()).collection('ops'); }

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
        produto: o.produto || '', obs: o.obs || '', marcas: o.marcas || {},
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
  // OPs duplicadas de antes do agrupamento (mesmo nº de OP), ainda em aberto
  (comparacao.juntar || []).forEach(function (id) { escritas.push(function (lote) { lote.delete(col.doc(id)); }); });
  const envios = [];
  for (let i = 0; i < escritas.length; i += LOTE_MAX) {
    const lote = db().batch();
    escritas.slice(i, i + LOTE_MAX).forEach(function (fn) { fn(lote); });
    envios.push(lote.commit());
  }
  return Promise.all(envios).then(function () { return escritas.length; });
}

function operacoesLimpa(lista) {
  return (lista || []).map(function (o) {
    return { n: String(o.n || '').slice(0, 6), setor: String(o.setor || '').slice(0, 60), horas: Number(o.horas) || 0, etapa: String(o.etapa || '').slice(0, 40),
      texto: String(o.texto || '').slice(0, 1500) };
  }).slice(0, 60);
}

// OP que veio só pelo PDF (não está na planilha de avanço): uma OP extra.
// O PDF não tem posição; o id usa o nº da OP para não colidir com as da planilha.
export function criarDoPdf(projeto, pdf, area) {
  const agora = agoraIso();
  const qtd = pdf.qtd == null ? null : Number(pdf.qtd);
  const pesoUnit = pdf.pesoUnit == null ? null : Number(pdf.pesoUnit);
  const id = Planilha.idOp(projeto.id, area, pdf.desenho || 'sem-desenho', 'OP' + pdf.numero);
  return colOps().doc(id).set({
    projetoId: projeto.id, commessa: String(projeto.commessa || ''), cliente: String(projeto.cliente || ''),
    descricaoProjeto: String(projeto.descricao || '').slice(0, 160),
    gpUid: projeto.gpUid || null, tecnicoUid: projeto.responsavelUid || null,
    area: area, numero: String(pdf.numero).slice(0, 40), desenho: String(pdf.desenho || '').slice(0, 60), posicao: '', rev: '',
    descricao: String(pdf.descricao || '').slice(0, 200), qtd: qtd, pesoUnit: pesoUnit,
    pesoTotal: qtd != null && pesoUnit != null ? Math.round(qtd * pesoUnit * 100) / 100 : null,
    produto: String(pdf.produto || '').slice(0, 40), obs: '', marcas: {}, origem: 'pdf',
    operacoes: operacoesLimpa(pdf.operacoes), pdfEm: agora, pdfPorUid: Auth.uid(),
    status: 'aberta', criadoEm: agora, criadoPorUid: Auth.uid(), atualizadoEm: agora
  }).then(function () { return id; });
}

// Operações lidas do PDF da OP (setor, horas, etapa). Os dados da peça
// continuam os da planilha; o PDF só acrescenta o roteiro.
export function gravarPdf(opId, pdf) {
  return colOps().doc(opId).update({
    operacoes: operacoesLimpa(pdf.operacoes),
    pdfEm: agoraIso(), pdfPorUid: Auth.uid(), atualizadoEm: agoraIso()
  });
}

export function idOp(projetoId, area, desenho, posicao) { return Planilha.idOp(projetoId, area, desenho, posicao); }

// CQ aprova a OP (aberta, ou em retrabalho depois de reinspecionada). A RNC
// e a reinspeção vão por dados/rncs.js.
export function aprovar(opId, passo) {
  const agora = agoraIso();
  const dados = { status: 'aprovada', finalizadoPorUid: Auth.uid(), finalizadoPorNome: Auth.nomeExibicao(), finalizadoEm: agora };
  if (passo) { dados.proximoPasso = passo; dados.proximoPassoEm = agora; }
  return colOps().doc(opId).update(dados);
}

// CQ desfaz a baixa (aprovação direta, ainda não encerrada pelo programador): volta para em aberto.
export function desfazerAprovacao(opId) {
  return colOps().doc(opId).update({ status: 'aberta', finalizadoPorUid: apagarCampo(), finalizadoPorNome: apagarCampo(), finalizadoEm: apagarCampo(),
    proximoPasso: apagarCampo(), proximoPassoEm: apagarCampo() });
}

export function apagar(opId) { return colOps().doc(opId).delete(); }

// Apaga várias OPs (excluir o projeto, apagar a lista e as OPs dele), em lotes.
export function apagarVarias(ids) {
  const envios = [];
  for (let i = 0; i < ids.length; i += LOTE_MAX) {
    const lote = db().batch();
    ids.slice(i, i + LOTE_MAX).forEach(function (id) { lote.delete(colOps().doc(id)); });
    envios.push(lote.commit());
  }
  return Promise.all(envios).then(function () { return ids.length; });
}

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
