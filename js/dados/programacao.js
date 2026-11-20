/* ---------------------------------------------------------------------------
   Programação das OPs no Firestore:
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

/* --------------------------------- recursos da caldeiraria (config/recursosCald) */
let pararRec = null;
export function escutarRecursos(aoReceber) {
  pararRecursos();
  pararRec = equipe().collection('config').doc('recursosCald').onSnapshot(function (snap) {
    aoReceber(snap.exists ? snap.data() : {});
  }, function (e) { console.warn('recursos indisponíveis:', e && e.code); aoReceber({}); });
}
export function pararRecursos() { if (pararRec) { pararRec(); pararRec = null; } }
export function salvarRecursos(cfg) {
  return equipe().collection('config').doc('recursosCald').set({
    tipos: cfg.tipos, empresas: cfg.empresas, dias: cfg.dias, extras: cfg.extras,
    atualizadoEm: agoraIso(), atualizadoPorUid: Auth.uid()
  });
}
// Programa (ou reprograma) as OPs por etapas: empresa, recurso, pessoas, início e
// fim. Várias OPs juntas dividem a equipe (mesmo grupo). Se o término mudar, o
// anterior entra no histórico (a OP fica "reagendada").
export function programarEtapas(ops, empresa, etapas, grupo, semRecurso) {
  const lote = db().batch(), agora = agoraIso();
  const ini = etapas.map(function (e) { return e.i; }).sort()[0], fim = etapas.map(function (e) { return e.f; }).sort().pop();
  (ops || []).forEach(function (o) {
    const ant = o.programacao || null;
    const hist = ant && ant.previsaoFim && ant.previsaoFim !== fim ? (ant.historico || []).concat([ant.previsaoFim]).slice(-30) : ((ant && ant.historico) || []);
    lote.update(refOp(o.id), { programacao: { terceirizadaId: empresa.id, terceirizada: String(empresa.nome || '').slice(0, 60), inicio: ini, previsaoFim: fim,
      historico: hist, etapas: etapas, grupo: grupo || null, semRecurso: !!semRecurso, em: (ant && ant.em) || agora, porUid: Auth.uid() } });
  });
  return lote.commit();
}
// Baixa de uma etapa (ex.: montagem concluída): o recurso fica livre a partir daí.
export function baixaEtapa(ops, indice, dia) {
  const lote = db().batch();
  (ops || []).forEach(function (o) {
    const pr = Object.assign({}, o.programacao);
    pr.etapas = pr.etapas.map(function (e, i) { return i === indice ? Object.assign({}, e, { b: dia }) : e; });
    pr.porUid = Auth.uid();
    lote.update(refOp(o.id), { programacao: pr });
  });
  return lote.commit();
}

/* ------------------------------------------------------------ caldeiraria */
/* --------------------------------------------------------------- usinagem */
function itemFila(f) {
  const r = { opId: String(f.opId) };
  // operação do roteiro (índice); sem ela, a OP inteira
  r.n = f.n == null || f.n === '' ? null : Number(f.n);
  r.horas = Number(f.horas) > 0 ? Math.min(10000, Number(f.horas)) : null;
  // início dado pelo programador (data e hora) e fim ajustado à mão (só registro)
  r.inicio = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(f.inicio || '') ? f.inicio : null;
  r.fimAjustado = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(f.fimAjustado || '') ? f.fimAjustado : null;
  const dt = function (v) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v || '') ? v : null; };
  // parte de uma operação dividida (peças desta máquina / total da OP)
  if (f.parte && Number(f.parte.pecas) > 0) r.parte = { pecas: Math.floor(Number(f.parte.pecas)), total: Math.max(1, Math.floor(Number(f.parte.total) || 1)) };
  // ❄ congelada até "ate"; paradas já retomadas (histórico)
  if (f.congelada && dt(f.congelada.desde) && dt(f.congelada.ate)) r.congelada = { desde: f.congelada.desde, ate: f.congelada.ate, motivo: String(f.congelada.motivo || '').slice(0, 120) };
  const pz = (f.pausas || []).filter(function (x) { return x && dt(x.desde) && dt(x.ate); }).slice(-20)
    .map(function (x) { return { desde: x.desde, ate: x.ate, motivo: String(x.motivo || '').slice(0, 120) }; });
  if (pz.length) r.pausas = pz;
  // horas já feitas (OP retirada da máquina por uma urgência)
  if (Number(f.feitas) > 0) r.feitas = Math.min(10000, Math.round(Number(f.feitas) * 100) / 100);
  // ⟳ aguardando reprogramação (a operação anterior saiu, foi congelada ou interrompida)
  if (f.reprogramar) r.reprogramar = String(f.reprogramar).slice(0, 30);
  return r;
}
// Várias filas de uma vez (programar a OP inteira, urgência, dividir...).
export function salvarFilas(lista) {
  const lote = db().batch(), agora = agoraIso();
  (lista || []).forEach(function (x) { lote.update(refMaquina(x.id), { fila: (x.fila || []).map(itemFila), atualizadoEm: agora }); });
  return lote.commit();
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
