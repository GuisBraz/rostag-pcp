/* ---------------------------------------------------------------------------
   Cronograma — o encadeamento das tarefas do PCP.
   Uma tarefa começa quando a anterior termina. Se uma atrasa, as seguintes
   andam junto; a data prevista é sempre recalculada, nunca gravada.
--------------------------------------------------------------------------- */
import { prefs } from '../nucleo/prefs.js';
import { hoje, addDias, difDias, fds } from '../nucleo/fmt.js';
import { SIT_ORDEM } from './constantes.js';

const GUARDA = 40000;   // trava contra laço infinito com dados corrompidos

function contaFimDeSemana() { return prefs.fimDeSemana === 'sim'; }

// Dia que não produz: fim de semana (quando configurado) ou projeto parado.
function morto(d, pausas) {
  if (!contaFimDeSemana() && fds(d)) return true;
  if (!pausas || !pausas.length) return false;
  const h = hoje();
  return pausas.some(function (p) { return d >= p.inicio && d <= (p.fim || h); });
}
export function proximoUtil(d, pausas) {
  let guarda = 0;
  while (morto(d, pausas) && guarda++ < GUARDA) d = addDias(d, 1);
  return d;
}
// avança n dias produtivos a partir de d
export function avancar(d, n, pausas) {
  let atual = proximoUtil(d, pausas), i = 0, guarda = 0;
  while (i < n && guarda++ < GUARDA) { atual = addDias(atual, 1); if (!morto(atual, pausas)) i++; }
  return atual;
}
export function recuar(d, n) {
  if (contaFimDeSemana()) return addDias(d, -n);
  let atual = d, i = 0;
  while (i < n) { atual = addDias(atual, -1); if (!fds(atual)) i++; }
  return atual;
}
export function duracaoUtil(a, b, pausas) {
  let n = 0, d = a, guarda = 0;
  while (d <= b && guarda++ < GUARDA) { if (!morto(d, pausas)) n++; d = addDias(d, 1); }
  return n;
}

function situacao(item, fim, inicio, h, alerta, parado) {
  if (item.done) return 'concluida';
  if (parado) return 'parada';
  if (fim < h) return 'atrasada';
  if (fim <= addDias(h, alerta)) return 'chegando';
  if (inicio <= h) return 'andamento';
  return 'planejada';
}

// Devolve o cronograma calculado do projeto, sem alterar os dados gravados.
export function recalcular(p) {
  const h = hoje();
  const alerta = Number(prefs.alertaTarefa) || 2;
  // enquanto o projeto está parado o cronograma congela — o tempo de
  // paralisação não é contado contra as tarefas
  const pausas = p.paralisacoes || [];
  let fimAnterior = null;
  const itens = (p.checklist || []).map(function (item, idx) {
    const dias = Math.max(0, Number(item.dias) || 0);
    let inicio, fim;
    if (dias === 0) {
      // duração 0 = fecha no mesmo dia da tarefa anterior
      inicio = fim = fimAnterior || proximoUtil(p.pcpInicio, pausas);
    } else {
      inicio = proximoUtil(fimAnterior ? addDias(fimAnterior, 1) : p.pcpInicio, pausas);
      fim = avancar(inicio, dias - 1, pausas);
    }
    if (item.done && item.doneAt) fim = item.doneAt;
    fimAnterior = fim;
    return {
      idx: idx, t: item.t, dias: dias, done: !!item.done, doneAt: item.doneAt || null,
      inicio: inicio, fim: fim,
      situacao: situacao(item, fim, inicio, h, alerta, p.status === 'paralisado'),
      atrasoDias: (!item.done && fim < h) ? difDias(fim, h) : 0
    };
  });
  const fimPrevisto = itens.length ? itens[itens.length - 1].fim : p.pcpInicio;
  const concluido = itens.length > 0 && itens.every(function (i) { return i.done; });
  return {
    itens: itens,
    fimPrevisto: fimPrevisto,
    concluido: concluido,
    estouro: (p.pcpFim && fimPrevisto > p.pcpFim) ? difDias(p.pcpFim, fimPrevisto) : 0,
    duracaoTotal: itens.length ? duracaoUtil(itens[0].inicio, fimPrevisto, pausas) : 0,
    pausas: pausas,
    proxima: itens.find(function (i) { return !i.done; }) || null
  };
}

// O cálculo é puro (mesmo projeto + mesmas preferências + mesmo dia = mesmo
// resultado), então vale memorizar: o painel recalcula tudo a cada render.
// A chave é o próprio objeto: projeto alterado vira objeto novo ou é
// invalidado explicitamente.
let cache = new WeakMap(), chaveCache = '';
export function invalidar() { cache = new WeakMap(); }
export function calcular(p) {
  const k = hoje() + '|' + prefs.alertaTarefa + '|' + prefs.fimDeSemana;
  if (k !== chaveCache) { chaveCache = k; cache = new WeakMap(); }
  let v = cache.get(p);
  if (!v) { v = recalcular(p); cache.set(p, v); }
  return v;
}

// Pior situação entre as tarefas — é o que aparece na lista de projetos.
export function resumo(p) {
  const c = calcular(p);
  if (c.concluido) return { situacao: 'concluida', crono: c };
  const presentes = {};
  c.itens.forEach(function (i) { presentes[i.situacao] = (presentes[i.situacao] || 0) + 1; });
  const pior = SIT_ORDEM.find(function (s) { return presentes[s]; }) || 'planejada';
  return { situacao: pior, contagem: presentes, crono: c };
}
