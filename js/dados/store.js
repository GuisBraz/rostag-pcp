/* ---------------------------------------------------------------------------
   Store — projetos da equipe no Firestore (um documento por projeto).

   Leitura ao vivo (onSnapshot): o que um colega muda aparece na hora para
   todos. Gravação por diferença: só os projetos que mudaram são enviados, e
   só os campos que mudaram — nunca a lista inteira. Isso evita que uma
   pessoa sobrescreva sem saber a edição que outra acabou de fazer em outro
   projeto, e é o que deixa o planejador gravar (a regra só permite a ele
   mudar o campo "checklist").
--------------------------------------------------------------------------- */
import { db } from './firebase.js';
import * as Auth from './auth.js';
import { migrarProjeto } from '../dominio/projeto.js';

const LOTE_MAX = 400;          // limite do Firestore é 500 operações por lote

let parar = null;
let servidor = new Map();      // id -> JSON da última versão confirmada pelo servidor
let pendentes = 0;

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
        lista.push(p);
        novo.set(p.id, JSON.stringify(p));
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
    if (Object.keys(campos).length) ops.push({ tipo: 'atualizar', id: p.id, dados: campos });
  });
  base.forEach(function (_json, id) { if (!vistos.has(id)) ops.push({ tipo: 'apagar', id: id }); });
  return ops;
}

// Grava as diferenças em lotes. Resolve quando o servidor confirmar; rejeita
// se ele recusar (sem permissão, offline por muito tempo etc.).
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
  pendentes++;
  return Promise.all(envios).then(function () { return ops.length; })
    .finally(function () { pendentes--; });
}

export function tamanhoAproximado(projetos) { return JSON.stringify(projetos || []).length; }
