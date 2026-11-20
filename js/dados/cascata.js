/* ---------------------------------------------------------------------------
   Excluir um projeto e tudo o que é dele (Gerência ou GP do projeto):
   OPs, RNCs, PGMs, tarefas, conversa, lista de avanço, itens comerciais,
   serviços e os itens das filas das máquinas (quando quem exclui pode mexer
   nelas). As notificações são de cada pessoa: cada um apaga as suas quando o
   site vê que o projeto não existe mais (notificacoes.js).
   Ordem: primeiro os filhos (as regras conferem o projeto), por último o projeto.
--------------------------------------------------------------------------- */
import { db } from './firebase.js';
import * as Auth from './auth.js';
import { agoraIso } from '../nucleo/fmt.js';

const LOTE = 400;
function equipe() { return db().collection('equipes').doc(Auth.equipeAtualId()); }
function apagarRefs(refs) {
  const envios = [];
  for (let i = 0; i < refs.length; i += LOTE) {
    const lote = db().batch();
    refs.slice(i, i + LOTE).forEach(function (r) { lote.delete(r); });
    envios.push(lote.commit());
  }
  return Promise.all(envios);
}
function porProjeto(colecao, pid) {
  // OPs e RNCs: o GP só lê as dele, então a consulta leva o mesmo filtro da regra
  let q = equipe().collection(colecao).where('projetoId', '==', pid);
  if ((colecao === 'ops' || colecao === 'rncs') && !Auth.souGerente()) q = q.where('gpUid', '==', Auth.uid());
  return q.get().then(function (qs) { return qs.docs.map(function (d) { return d.ref; }); })
    .catch(function (e) { console.warn(colecao + ' não listado:', e && e.code); return []; });
}
// Cada parte é tentada sozinha: o que a pessoa não pode apagar fica (e é limpo depois).
function tentar(nome, p) { return p.then(function (n) { return { nome: nome, ok: true, n: n }; }, function (e) { console.warn(nome + ' não apagado:', e && e.code); return { nome: nome, ok: false }; }); }

/**
 * p: projeto · opIds: OPs do projeto (já carregadas) · maquinas: para tirar os itens das filas
 * → Promise<{ partes: [{ nome, ok, n }] }>
 */
export function apagarProjeto(p, opIds, maquinas) {
  const pid = p.id, partes = [];
  const opSet = new Set(opIds || []);
  // 1) PGMs, RNCs e tarefas do projeto (consultados no servidor)
  return Promise.all([porProjeto('pgms', pid), porProjeto('rncs', pid), porProjeto('tarefas', pid), porProjeto('ops', pid)]).then(function (r) {
    const pgmRefs = r[0], rncRefs = r[1], tarRefs = r[2];
    r[3].forEach(function (ref) { opSet.add(ref.id); });
    const pgmIds = new Set(pgmRefs.map(function (x) { return 'pgm:' + x.id; }));
    // 2) itens das filas das máquinas (só quem pode mexer nas máquinas)
    const filas = (maquinas || []).filter(function (m) { return (m.fila || []).some(function (f) { return opSet.has(f.opId) || pgmIds.has(f.opId); }); });
    const pFilas = filas.length ? tentar('filas', (function () {
      const lote = db().batch();
      filas.forEach(function (m) { lote.update(equipe().collection('maquinas').doc(m.id), { fila: m.fila.filter(function (f) { return !opSet.has(f.opId) && !pgmIds.has(f.opId); }), atualizadoEm: agoraIso() }); });
      return lote.commit().then(function () { return filas.length; });
    })()) : Promise.resolve({ nome: 'filas', ok: true, n: 0 });
    return pFilas.then(function (x) {
      partes.push(x);
      // OPs antes das RNCs (RNC só sai quando a OP dela já não existe)
      const refs = Array.from(opSet).map(function (id) { return equipe().collection('ops').doc(id); });
      return apagarRefs(refs).then(function () { partes.push({ nome: 'ops', ok: true, n: refs.length }); });
    }).then(function () {
      return Promise.all([
        tentar('rncs', apagarRefs(rncRefs).then(function () { return rncRefs.length; })),
        tentar('pgms', apagarRefs(pgmRefs).then(function () { return pgmRefs.length; })),
        tentar('tarefas', apagarRefs(tarRefs).then(function () { return tarRefs.length; }))
      ]);
    });
  }).then(function (r) {
    r.forEach(function (x) { partes.push(x); });
    // 3) conversa do projeto
    return tentar('chat', equipe().collection('projetos').doc(pid).collection('chat').get().then(function (qs) {
      const refs = qs.docs.map(function (d) { return d.ref; });
      return apagarRefs(refs).then(function () { return refs.length; });
    }));
  }).then(function (x) {
    partes.push(x);
    // 5) planilha, comerciais, serviços e valores
    return Promise.all(['avanco', 'comerciais', 'comerciaisValores', 'servicos'].map(function (c) {
      return tentar(c, equipe().collection(c).doc(pid).delete().then(function () { return 1; }));
    }));
  }).then(function (r) {
    r.forEach(function (x) { partes.push(x); });
    // 6) o projeto
    return equipe().collection('projetos').doc(pid).delete();
  }).then(function () { return { partes: partes }; });
}

// Existe no servidor? (antes de limpar algo "órfão", confere de verdade)
export function existe(colecao, id) {
  return equipe().collection(colecao).doc(id).get({ source: 'server' }).then(function (d) { return d.exists; });
}
