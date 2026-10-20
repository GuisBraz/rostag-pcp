/* ---------------------------------------------------------------------------
   RNCs — Registros de Não Conformidade (equipes/{id}/rncs), sempre ligados a
   uma OP. Abrir a RNC e mexer na OP vão no mesmo lote: a regra do Firestore
   confere que a OP foi para "retrabalho" apontando para esta RNC.

   Quem lê: gerente e CQ (todas), GP e técnico (as dos projetos deles).
   Quem escreve: só o CQ.
--------------------------------------------------------------------------- */
import { db } from './firebase.js';
import * as Auth from './auth.js';
import * as Rnc from '../dominio/rnc.js';

let parar = null;

function colEquipe(nome) { return db().collection('equipes').doc(Auth.equipeAtualId()).collection(nome); }
function agoraIso() { return new Date().toISOString(); }

function consulta() {
  const papel = Auth.papel();
  if (papel === 'gerente_pcp' || papel === 'cq') return colEquipe('rncs');
  if (papel === 'gp') return colEquipe('rncs').where('gpUid', '==', Auth.uid());
  if (papel === 'tecnico') return colEquipe('rncs').where('tecnicoUid', '==', Auth.uid());
  return null;
}

export function escutar(aoReceber) {
  pararEscuta();
  const q = consulta();
  if (!q) { aoReceber([]); return; }
  parar = q.onSnapshot(function (qs) {
    const lista = [];
    qs.forEach(function (doc) { lista.push(Object.assign({ id: doc.id }, doc.data())); });
    aoReceber(lista);
  }, function (e) { console.warn('RNCs indisponíveis:', e && e.code); aoReceber([]); });
}
export function pararEscuta() { if (parar) { parar(); parar = null; } }

// Só os campos do formulário (o resto é controlado pelo sistema).
function campos(f) {
  const r = {};
  Object.keys(Rnc.LIMITES).forEach(function (k) { r[k] = String(f[k] == null ? '' : f[k]).slice(0, Rnc.LIMITES[k]); });
  r.setor = {};
  Rnc.SETORES.forEach(function (k) { r.setor[k] = !!(f.setor && f.setor[k]); });
  r.procedencia = f.procedencia === 'interno' || f.procedencia === 'externo' ? f.procedencia : '';
  r.data = f.data || ''; r.dispData = f.dispData || ''; r.reData = f.reData || '';
  r.reResultado = Rnc.RESULTADOS.indexOf(f.reResultado) >= 0 ? f.reResultado : '';
  return r;
}

// CQ abre a RNC: a OP vai para "retrabalho" no mesmo lote.
export function abrir(op, form) {
  const ref = colEquipe('rncs').doc();
  const agora = agoraIso();
  const lote = db().batch();
  lote.set(ref, Object.assign(campos(form), {
    opId: op.id, projetoId: op.projetoId, area: op.area, gpUid: op.gpUid || null, tecnicoUid: op.tecnicoUid || null,
    situacao: 'aberta', criadoPorUid: Auth.uid(), criadoPorNome: Auth.nomeExibicao(), criadoEm: agora, atualizadoEm: agora
  }));
  const dadosOp = { status: 'retrabalho', rncAtualId: ref.id, rncNumero: String(form.numero || '').slice(0, 30) };
  if (!op.retrabalhoDesde) dadosOp.retrabalhoDesde = agora;
  lote.update(colEquipe('ops').doc(op.id), dadosOp);
  return lote.commit().then(function () { return ref.id; });
}

/**
 * Salva a RNC já aberta (disposição, reinspeção, observações). Se a
 * reinspeção decide o destino da OP, aplica no mesmo lote:
 *  conforme → aprovada · desvio → liberada com desvio
 *  nº de OP de retrabalho → OP nova ligada e a original vira peça morta
 */
export function salvar(rnc, form, op) {
  const agora = agoraIso();
  const efeito = Rnc.efeitoReinspecao(form);
  const lote = db().batch();
  const dados = Object.assign(campos(form), { atualizadoEm: agora, situacao: efeito.encerra ? 'encerrada' : 'aberta' });
  lote.update(colEquipe('rncs').doc(rnc.id), dados);
  let novaId = null;
  const opAtiva = op && (op.status === 'retrabalho' || op.status === 'rnc') && op.rncAtualId === rnc.id;
  if (opAtiva) {
    const refOp = colEquipe('ops').doc(op.id);
    if (efeito.opStatus === 'morta') {
      novaId = op.id + '__rt' + Date.now().toString(36);
      lote.set(colEquipe('ops').doc(novaId), {
        projetoId: op.projetoId, commessa: op.commessa || '', cliente: op.cliente || '', descricaoProjeto: op.descricaoProjeto || '',
        gpUid: op.gpUid || null, tecnicoUid: op.tecnicoUid || null, area: op.area, numero: efeito.criarOp.slice(0, 40),
        desenho: op.desenho || '', posicao: op.posicao || '', rev: op.rev || '', descricao: op.descricao || '',
        qtd: op.qtd == null ? null : op.qtd, pesoUnit: op.pesoUnit == null ? null : op.pesoUnit, pesoTotal: op.pesoTotal == null ? null : op.pesoTotal,
        status: 'aberta', criadoEm: agora, criadoPorUid: Auth.uid(), atualizadoEm: agora, origemOpId: op.id, origemRncId: rnc.id
      });
      lote.update(refOp, { status: 'morta', mortaEm: agora, opNovaId: novaId, opNovaNumero: efeito.criarOp.slice(0, 40) });
    } else if (efeito.opStatus === 'aprovada' || efeito.opStatus === 'desvio') {
      lote.update(refOp, { status: efeito.opStatus, finalizadoPorUid: Auth.uid(), finalizadoPorNome: Auth.nomeExibicao(), finalizadoEm: agora });
    }
  }
  return lote.commit().then(function () { return { efeito: opAtiva ? efeito : null, novaId: novaId }; });
}
