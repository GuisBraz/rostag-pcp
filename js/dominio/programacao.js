/* ---------------------------------------------------------------------------
   Programação das OPs pelos programadores. Puro cálculo, sem DOM.

   Caldeiraria (por peso, terceirizadas):
     Em aberto → Em fábrica (terceirizada + data prevista) → Baixa do CQ →
     Finalizada pelo programador. RNC fica "aguardando disposição".
   Usinagem (por horas, como no MS Project):
     uma fila por máquina; cada OP consome as horas dela naquela máquina,
     dia útil a dia útil (horas/dia da máquina), a partir de hoje ou de
     "não iniciar antes de". Máquina ocupada empurra a OP para a frente.
   Finalizar (programador): só depois da baixa do CQ; a OP sai da
   programação e o técnico e o GP são avisados do próximo passo.
--------------------------------------------------------------------------- */
import { hoje, addDias, fds, difDias } from '../nucleo/fmt.js';
import { statusOp } from './producao.js';
import * as Projeto from './projeto.js';
import { horasPorMaquina } from './carga.js';

export const DIAS_SEM_PROGRAMACAO = 2;
export const DIAS_OP_VENCENDO = 2;
export const DIAS_PROJETO_VENCENDO = 7;
export const MAX_FILA = 300;

export function encerrada(o) { return !!(o && o.encerradaEm); }

// Onde a OP está na programação. naFila: a OP de usinagem está em alguma fila.
//   emAberto · programada · baixaCq · rnc · encerrada · morta
export function situacao(o, naFila) {
  const s = statusOp(o);
  if (s === 'morta') return 'morta';
  if (encerrada(o)) return 'encerrada';
  if (s === 'aprovada' || s === 'desvio') return 'baixaCq';
  if (s === 'retrabalho') return 'rnc';
  if (o.area === 'usinagem') return naFila ? 'programada' : 'emAberto';
  return o.programacao && o.programacao.previsaoFim ? 'programada' : 'emAberto';
}

// Está "na mão do programador" (aparece na programação e nas Ordens de Produção)?
export function emProducao(o) { const s = situacao(o, false); return s !== 'encerrada' && s !== 'morta'; }

// Projeto oficialmente atrasado: passou do fim da produção e não terminou.
export function projetoAtrasado(p, h) {
  return !!(p && p.prodFim && (h || hoje()) > p.prodFim && Projeto.aberto(p) && Projeto.status(p) !== 'paralisado');
}

/**
 * Data prevista de uma programação: não pode ser antes de hoje; passar do
 * fim da produção do projeto só gera aviso.
 * Devolve { erro: 'vazia' | 'antesDeHoje' | null, aviso: 'depoisDoPrazo' | null }
 */
export function validarData(data, h, prazo) {
  h = h || hoje();
  if (!data) return { erro: 'vazia', aviso: null };
  if (data < h) return { erro: 'antesDeHoje', aviso: null };
  return { erro: null, aviso: prazo && data > prazo ? 'depoisDoPrazo' : null };
}

/* ------------------------------------------------------------ caldeiraria */
// Peso que está com cada terceirizada (OPs em fábrica). Sem capacidade fixa.
export function cargaTerceirizadas(ops, terceirizadas) {
  const linhas = {};
  (terceirizadas || []).forEach(function (t) { linhas[t.id] = { terceirizada: t, kg: 0, ops: [] }; });
  (ops || []).forEach(function (o) {
    if (o.area !== 'caldeiraria' || situacao(o) !== 'programada') return;
    const id = o.programacao.terceirizadaId || '';
    const l = linhas[id] = linhas[id] || { terceirizada: { id: id, nome: o.programacao.terceirizada || '—' }, kg: 0, ops: [] };
    l.kg += Number(o.pesoTotal) || 0;
    l.ops.push(o);
  });
  return Object.keys(linhas).map(function (k) { return linhas[k]; })
    .sort(function (a, b) { return b.kg - a.kg || String(a.terceirizada.nome).localeCompare(String(b.terceirizada.nome)); });
}

/* --------------------------------------------------------------- usinagem */
function proximoUtil(d) { let x = d; while (fds(x)) x = addDias(x, 1); return x; }

// Horas da OP naquela máquina: do PDF (setor → máquina) ou as horas previstas.
export function horasNaMaquina(o, maquinaId, maquinas, mapa) {
  const hm = horasPorMaquina(o, maquinas || [], mapa).porMaquina;
  if (hm[maquinaId]) return hm[maquinaId];
  return Number(o.horasPrevistas) || 0;
}

// Ids das OPs que estão em alguma fila.
export function opsNaFila(maquinas) {
  const s = new Set();
  (maquinas || []).forEach(function (m) { (m.fila || []).forEach(function (f) { if (f && f.opId) s.add(f.opId); }); });
  return s;
}

/**
 * Agenda da fila de uma máquina, na ordem. Cada item:
 *  { opId, op, horas, inicio, fim, porDia {data: horas}, atraso, prazo, concluida, ausente }
 *  - concluida: o CQ já deu baixa (não ocupa mais a máquina)
 *  - ausente: a OP não existe mais (ou não é visível para quem olha)
 *  - atraso: termina depois do fim da produção do projeto
 */
export function agendar(maquina, opsPorId, projetosPorId, maquinas, mapa, h) {
  h = h || hoje();
  const cap = Number(maquina && maquina.horasDia) || 0;
  let dia = proximoUtil(h), usado = 0;
  return ((maquina && maquina.fila) || []).map(function (item) {
    const o = opsPorId[item.opId];
    if (!o) return { opId: item.opId, ausente: true };
    const s = situacao(o, true);
    const p = projetosPorId ? projetosPorId[o.projetoId] : null;
    const prazo = p ? p.prodFim || null : null;
    const horas = Number(item.horas) > 0 ? Number(item.horas) : horasNaMaquina(o, maquina.id, maquinas, mapa);
    if (s === 'baixaCq' || s === 'encerrada' || s === 'morta') return { opId: item.opId, op: o, horas: horas, concluida: true, prazo: prazo, naoAntes: item.naoAntes || null };
    if (item.naoAntes && item.naoAntes > dia) { dia = proximoUtil(item.naoAntes); usado = 0; }
    if (cap <= 0) return { opId: item.opId, op: o, horas: horas, semCapacidade: true, prazo: prazo, naoAntes: item.naoAntes || null };
    if (usado >= cap - 1e-9) { dia = proximoUtil(addDias(dia, 1)); usado = 0; }
    const inicio = dia, porDia = {};
    let resta = horas;
    while (resta > 1e-9) {
      const livre = cap - usado;
      if (livre <= 1e-9) { dia = proximoUtil(addDias(dia, 1)); usado = 0; continue; }
      const q = Math.min(livre, resta);
      porDia[dia] = (porDia[dia] || 0) + q;
      usado += q; resta -= q;
    }
    const fim = dia;
    return { opId: item.opId, op: o, horas: horas, inicio: inicio, fim: fim, porDia: porDia, prazo: prazo,
      atraso: !!(prazo && fim > prazo), naoAntes: item.naoAntes || null };
  });
}

// Horas reais passaram das previstas?
export function excedeuHoras(o, previstas) {
  const r = Number(o && o.horasReais), p = Number(previstas);
  return r > 0 && p > 0 && r > p + 1e-9;
}

/* ------------------------------------------------------- avisos graduais */
// Desde quando a OP espera programação (voltou para "em aberto" ou chegou).
function esperaDesde(o) { return String(o.desprogramadaEm || o.criadoEm || '').slice(0, 10); }

/**
 * Avisos para o programador da área (calculados, não gravados):
 *  prog-sem:{projeto}        OPs em aberto há mais de 2 dias (por projeto)
 *  prog-vence:{op}           OP programada (caldeiraria) com a data a 2 dias ou vencida
 *  prog-atraso:{op}          OP na fila (usinagem) que termina depois do prazo
 *  prog-proj-vence:{projeto} fim da produção a 7 dias ou menos, com OPs abertas
 *  prog-proj-atrasado:{p}    projeto atrasado com OPs abertas (alerta)
 * Cada aviso: { id, tipo, nivel, projetoId, opId?, n, data, commessa }
 */
export function avisos(ops, projetosPorId, area, naFila, agendaPorOp, h) {
  h = h || hoje();
  const lista = [];
  const porProjeto = {};
  (ops || []).forEach(function (o) {
    if (area && o.area !== area) return;
    if (!emProducao(o)) return;
    (porProjeto[o.projetoId] = porProjeto[o.projetoId] || []).push(o);
  });
  Object.keys(porProjeto).forEach(function (pid) {
    const lst = porProjeto[pid], p = projetosPorId[pid] || null;
    const commessa = (p && p.commessa) || lst[0].commessa || '';
    const semProg = lst.filter(function (o) {
      return situacao(o, naFila && naFila.has(o.id)) === 'emAberto' && esperaDesde(o) && difDias(esperaDesde(o), h) > DIAS_SEM_PROGRAMACAO;
    });
    if (semProg.length) lista.push({ id: 'prog-sem:' + pid, tipo: 'prog-sem', nivel: 'aviso', projetoId: pid, n: semProg.length, commessa: commessa, ordem: 3 });
    lst.forEach(function (o) {
      const s = situacao(o, naFila && naFila.has(o.id));
      if (s !== 'programada') return;
      if (o.area === 'caldeiraria' && o.programacao && o.programacao.previsaoFim && difDias(h, o.programacao.previsaoFim) <= DIAS_OP_VENCENDO) {
        lista.push({ id: 'prog-vence:' + o.id, tipo: 'prog-vence', nivel: o.programacao.previsaoFim < h ? 'alerta' : 'aviso', projetoId: pid, opId: o.id,
          numero: o.numero, data: o.programacao.previsaoFim, commessa: commessa, ordem: 2 });
      }
      const ag = agendaPorOp && agendaPorOp[o.id];
      if (o.area === 'usinagem' && ag && ag.atraso) {
        lista.push({ id: 'prog-atraso:' + o.id, tipo: 'prog-atraso', nivel: 'aviso', projetoId: pid, opId: o.id, numero: o.numero, data: ag.fim, commessa: commessa, ordem: 2.5 });
      }
    });
    if (p && p.prodFim) {
      if (projetoAtrasado(p, h)) lista.push({ id: 'prog-proj-atrasado:' + pid, tipo: 'prog-proj-atrasado', nivel: 'alerta', projetoId: pid, n: lst.length, data: p.prodFim, commessa: commessa, ordem: 1 });
      else if (Projeto.aberto(p) && difDias(h, p.prodFim) <= DIAS_PROJETO_VENCENDO) lista.push({ id: 'prog-proj-vence:' + pid, tipo: 'prog-proj-vence', nivel: 'aviso', projetoId: pid, n: lst.length, data: p.prodFim, commessa: commessa, ordem: 2.2 });
    }
  });
  return lista.sort(function (a, b) { return a.ordem - b.ordem || String(a.data || '').localeCompare(String(b.data || '')); });
}

/* --------------------------------------------- próximo passo da peça */
// Ordem das etapas depois da fabricação (marcas da planilha de avanço).
const ETAPAS = ['ttat', 'servicoExterno', 'oxidacao', 'pintura'];
export function proximasEtapas(o) {
  const m = (o && o.marcas) || {};
  return ETAPAS.filter(function (k) { return m[k]; });
}

/* ------------------------------------------------- carga fábrica (caldeiraria) */
// A fabricação interna (SOFIR) é sempre uma opção, além das terceirizadas.
export const SOFIR = { id: 'sofir', nome: 'SOFIR', interna: true };
export function empresasCald(terceirizadas) {
  return [SOFIR].concat((terceirizadas || []).filter(function (t) { return t.ativa !== false && t.id !== SOFIR.id; }));
}
// Prazo da OP programada: 'atraso' (previsão vencida) · 'vence' (até 3 dias) · 'prazo'.
export function prazoCald(o, h) {
  const pr = o && o.programacao;
  if (!pr || !pr.previsaoFim) return null;
  const d = difDias(h || hoje(), pr.previsaoFim);
  return { k: d < 0 ? 'atraso' : (d <= 3 ? 'vence' : 'prazo'), dias: d };
}
export function reagendada(o) { return !!(o && o.programacao && (o.programacao.historico || []).length); }

// Aviso para o técnico e o GP da OP: a previsão venceu e a OP ainda está na fábrica.
export function avisosCaldAtraso(ops, uid, h) {
  h = h || hoje();
  return (ops || []).filter(function (o) {
    return o.area === 'caldeiraria' && (o.tecnicoUid === uid || o.gpUid === uid) && situacao(o) === 'programada' && o.programacao.previsaoFim < h;
  }).map(function (o) {
    return { id: 'prod-cald-atraso:' + o.id, tipo: 'prod-cald-atraso', nivel: 'alerta', projetoId: o.projetoId, commessa: o.commessa || '',
      numero: o.numero, empresa: o.programacao.terceirizada || '', data: o.programacao.previsaoFim, dias: difDias(o.programacao.previsaoFim, h) };
  });
}
