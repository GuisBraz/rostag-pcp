/* ---------------------------------------------------------------------------
   Store — projetos da equipe no Firestore (um documento por projeto).

   Leitura ao vivo (onSnapshot): o que um colega muda aparece na hora para
   todos. Gravação por diferença: só os projetos que mudaram são enviados, e
   só os campos que mudaram — nunca a lista inteira. Isso evita que uma
   pessoa sobrescreva sem saber a edição que outra acabou de fazer em outro
   projeto, e é o que deixa o planejador gravar (a regra só permite a ele
   mudar o campo "checklist").

   O checklist é um campo só (uma lista). Para duas pessoas marcarem tarefas
   diferentes do mesmo projeto ao mesmo tempo sem uma apagar a outra, ele é
   gravado numa transação que lê a versão do servidor e mescla tarefa a
   tarefa (mesclarChecklist). Transação não funciona offline: sem rede, vai
   no lote comum e, ao voltar, a última gravação vence, como antes.
--------------------------------------------------------------------------- */
import { db } from './firebase.js';
import * as Auth from './auth.js';
import { migrarProjeto } from '../dominio/projeto.js';

const LOTE_MAX = 400;          // limite do Firestore é 500 operações por lote

let parar = null;
let servidor = new Map();      // id -> JSON da última versão confirmada pelo servidor
let pendentes = 0;
const emVoo = new Map();       // id -> { base, meu }: checklist em transação ainda não confirmada

function colProjetos() {
  return db().collection('equipes').doc(Auth.equipeAtualId()).collection('projetos');
}

// O planejador só pode ler os projetos dele: a consulta precisa ter o mesmo
// filtro da regra, senão o Firestore nega a consulta inteira.
function consulta() {
  return Auth.souGPouCoordenador()
    ? colProjetos()
    : colProjetos().where('responsavelUid', '==', Auth.uid());
}

export function escutar(aoReceber, aoFalhar) {
  pararEscuta();
  servidor = new Map();
  parar = consulta().onSnapshot(function (qs) {
    const lista = [];
    const novo = new Map();
    qs.forEach(function (doc) {
      try {
        // o id do documento manda — o campo "id" dentro dele pode faltar em dado antigo
        const p = migrarProjeto(Object.assign({}, doc.data(), { id: doc.id }));
        novo.set(p.id, JSON.stringify(p));
        // transação não aparece no cache local antes de confirmar: reaplica a
        // marcação em andamento para ela não piscar se chegar outra mudança
        const voo = emVoo.get(p.id);
        if (voo) p.checklist = mesclarChecklist(voo.base, voo.meu, p.checklist);
        lista.push(p);
      } catch (e) { console.warn('projeto ilegível ignorado:', doc.id, e); }
    });
    servidor = novo;
    aoReceber(lista, { local: qs.metadata.hasPendingWrites, doCache: qs.metadata.fromCache });
  }, function (e) {
    console.warn('projetos indisponíveis:', e && e.code);
    if (aoFalhar) aoFalhar(e);
  });
}

export function pararEscuta() {
  if (parar) { parar(); parar = null; }
  servidor = new Map();
}

// Cópia da última versão confirmada — usada para desfazer uma edição que o servidor recusou.
export function copiaServidor() {
  const lista = [];
  servidor.forEach(function (json) { lista.push(JSON.parse(json)); });
  return lista;
}

export function temPendentes() { return pendentes > 0; }

// Calcula o que mudou entre a lista local e a última versão do servidor.
export function diferenca(projetosAtuais, base) {
  const ops = [];
  const vistos = new Set();
  projetosAtuais.forEach(function (p) {
    vistos.add(p.id);
    const json = JSON.stringify(p);
    const antes = base.get(p.id);
    if (antes === undefined) { ops.push({ tipo: 'criar', id: p.id, dados: p }); return; }
    if (antes === json) return;
    const velho = JSON.parse(antes), campos = {};
    Object.keys(p).forEach(function (k) {
      if (JSON.stringify(p[k]) !== JSON.stringify(velho[k])) campos[k] = p[k] === undefined ? null : p[k];
    });
    if (Object.keys(campos).length) ops.push({ tipo: 'atualizar', id: p.id, dados: campos, antes: velho });
  });
  base.forEach(function (_json, id) { if (!vistos.has(id)) ops.push({ tipo: 'apagar', id: id }); });
  return ops;
}

// Identifica cada tarefa pelo texto (a tela não renomeia tarefa) e, se o
// texto se repetir, pela ordem em que aparece.
function chaves(lista) {
  const n = {};
  return lista.map(function (it) { const t = String(it && it.t); n[t] = (n[t] || 0) + 1; return t + '#' + n[t]; });
}

function mesclarItem(base, meu, atual) {
  const r = Object.assign({}, atual);
  Object.keys(meu).forEach(function (f) {
    if (JSON.stringify(meu[f]) !== JSON.stringify(base[f])) r[f] = meu[f];
  });
  return r;
}

// Mesclagem de 3 vias: base = versão do servidor de onde a minha edição
// partiu, meu = como ficou aqui, atual = o que está no servidor agora.
// Por tarefa e por campo: o que eu mudei em relação à base vence; o resto
// fica como o colega deixou. Tarefa que eu apaguei sai; a que eu incluí
// entra depois da mesma vizinha que tem na minha lista.
export function mesclarChecklist(base, meu, atual) {
  base = base || []; meu = meu || []; atual = atual || [];
  const jBase = JSON.stringify(base);
  if (JSON.stringify(meu) === jBase) return atual;
  if (JSON.stringify(atual) === jBase) return meu;
  const kMeu = chaves(meu);
  const mBase = new Map(chaves(base).map(function (k, i) { return [k, base[i]]; }));
  const mMeu = new Map(kMeu.map(function (k, i) { return [k, meu[i]]; }));
  const kAtual = chaves(atual);
  const res = [], kRes = [];
  kAtual.forEach(function (k, i) {
    const b = mBase.get(k), m = mMeu.get(k);
    if (b && !m) return;                                   // eu apaguei
    res.push(b && m ? mesclarItem(b, m, atual[i]) : atual[i]);
    kRes.push(k);
  });
  kMeu.forEach(function (k, i) {
    if (mBase.has(k) || kAtual.indexOf(k) >= 0) return;    // não é tarefa que eu incluí
    let pos = 0;
    for (let j = i - 1; j >= 0; j--) {
      const achou = kRes.indexOf(kMeu[j]);
      if (achou >= 0) { pos = achou + 1; break; }
    }
    res.splice(pos, 0, meu[i]);
    kRes.splice(pos, 0, k);
  });
  return res;
}

// Atualização com checklist, online: lê o servidor e mescla na mesma
// transação (se outro gravar no meio, o Firestore repete a função).
function gravarComMesclagem(ref, op) {
  const voo = { base: op.antes.checklist, meu: op.dados.checklist };
  emVoo.set(op.id, voo);
  return db().runTransaction(function (tx) {
    return tx.get(ref).then(function (snap) {
      if (!snap.exists) { const e = new Error('projeto não existe mais'); e.code = 'not-found'; throw e; }
      const atual = migrarProjeto(Object.assign({}, snap.data(), { id: snap.id })).checklist;
      tx.update(ref, Object.assign({}, op.dados, { checklist: mesclarChecklist(voo.base, voo.meu, atual) }));
    });
  }).finally(function () { if (emVoo.get(op.id) === voo) emVoo.delete(op.id); });
}

function gravarEmLotes(col, ops) {
  const envios = [];
  for (let i = 0; i < ops.length; i += LOTE_MAX) {
    const lote = db().batch();
    ops.slice(i, i + LOTE_MAX).forEach(function (op) {
      const ref = col.doc(op.id);
      if (op.tipo === 'criar') lote.set(ref, op.dados);
      else if (op.tipo === 'atualizar') lote.update(ref, op.dados);
      else lote.delete(ref);
    });
    envios.push(lote.commit());
  }
  return envios;
}

// Grava as diferenças. Resolve quando o servidor confirmar; rejeita se ele
// recusar (sem permissão, offline por muito tempo etc.).
export function salvar(projetosAtuais) {
  if (!Auth.equipeAtualId()) return Promise.reject(new Error('sem-equipe'));
  const ops = diferenca(projetosAtuais, servidor);
  if (!ops.length) return Promise.resolve(0);
  // marca como "já enviado" para não reenviar a mesma mudança enquanto a
  // confirmação não chega (o snapshot do servidor corrige isso de qualquer jeito)
  ops.forEach(function (op) {
    if (op.tipo === 'apagar') servidor.delete(op.id);
    else servidor.set(op.id, JSON.stringify(projetosAtuais.find(function (p) { return p.id === op.id; })));
  });
  const col = colProjetos();
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  const mesclar = online ? ops.filter(function (op) { return op.tipo === 'atualizar' && 'checklist' in op.dados; }) : [];
  const envios = gravarEmLotes(col, ops.filter(function (op) { return mesclar.indexOf(op) < 0; }));
  mesclar.forEach(function (op) {
    envios.push(gravarComMesclagem(col.doc(op.id), op).catch(function (e) {
      // caiu a rede no meio: grava no lote comum (fica na fila offline)
      if (e && e.code === 'unavailable') return Promise.all(gravarEmLotes(col, [op]));
      throw e;
    }));
  });
  pendentes++;
  return Promise.all(envios).then(function () { return ops.length; })
    .finally(function () { pendentes--; });
}

export function tamanhoAproximado(projetos) { return JSON.stringify(projetos || []).length; }
