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
import { horasPorMaquina, maquinaDoSetor } from './carga.js';

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

/* ------------------------------------- carga máquina por operação (usinagem) */
// Cada operação do roteiro (PDF) é uma linha na fila da máquina do tipo dela;
// a próxima operação da OP só começa quando a anterior termina. OP sem
// roteiro vai inteira (n = null), em qualquer máquina.
function grupoMaq(m) { return String((m && m.tipo) || '').trim().toUpperCase() || ('#' + (m && m.id)); }
export function chaveItem(opId, n) { return opId + '#' + (n == null ? '*' : n); }

// Operações agendáveis da OP: [{ n, setor, texto, horas }] (n = índice no roteiro).
export function operacoesDaOp(o) {
  if (Array.isArray(o.operacoes) && o.operacoes.length) {
    return o.operacoes.map(function (x, n) { return { n: n, setor: x.setor || '', texto: x.texto || x.setor || '', horas: Number(x.horas) || 0, num: x.n || String(n + 1) }; });
  }
  return [{ n: null, setor: '', texto: '', horas: Number(o.horasPrevistas) || 0, num: '' }];
}
// Máquinas que podem fazer a operação: a do setor do PDF e as do mesmo tipo dela.
export function maquinasDaOperacao(op, maquinas, mapa) {
  const ativas = (maquinas || []).filter(function (m) { return m.ativa !== false; });
  if (op.n == null) return ativas.map(function (m) { return m.id; });
  const id = maquinaDoSetor(op.setor, ativas, mapa);
  if (!id) return [];
  const g = grupoMaq(ativas.find(function (m) { return m.id === id; }));
  return ativas.filter(function (m) { return grupoMaq(m) === g; }).map(function (m) { return m.id; });
}

/* ------------------------------------------------ calendário das máquinas */
// Por enquanto o mesmo para todas: seg a sex 06:00–23:00, sáb 07:00–14:00,
// domingo parado. O tempo é contado em minutos (data e hora locais, sem fuso).
export const CALENDARIO = { 1: [360, 1380], 2: [360, 1380], 3: [360, 1380], 4: [360, 1380], 5: [360, 1380], 6: [420, 840] };
function minutosDe(dt) {   // 'AAAA-MM-DDTHH:MM' (ou só a data) → minutos
  const m = String(dt || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) / 60000;
}
export function dataHoraDe(min) {
  const d = new Date(min * 60000), p = function (n) { return String(n).padStart(2, '0'); };
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
}
function janela(dia) { return CALENDARIO[new Date(dia * 1440 * 60000).getUTCDay()] || null; }
// O primeiro minuto de trabalho a partir de t.
function proximoMinuto(t) {
  for (let k = 0; k < 14; k++) {
    const dia = Math.floor(t / 1440), m = t - dia * 1440, w = janela(dia);
    if (w && m < w[0]) return dia * 1440 + w[0];
    if (w && m < w[1]) return t;
    t = (dia + 1) * 1440;
  }
  return t;
}
// Soma minutos de trabalho a t; devolve o fim e os minutos usados em cada dia.
function somarMinutos(t, minutos) {
  const porDia = {};
  t = proximoMinuto(t);
  let resta = minutos;
  while (resta > 0) {
    const dia = Math.floor(t / 1440), w = janela(dia), ate = dia * 1440 + w[1], usa = Math.min(resta, ate - t);
    const d = dataHoraDe(dia * 1440).slice(0, 10);
    porDia[d] = (porDia[d] || 0) + usa / 60;
    resta -= usa; t += usa;
    if (resta > 0) t = proximoMinuto(t);
  }
  return { fim: t, porDia: porDia };
}
export function fimPrevisto(inicioDt, horas) { const r = somarMinutos(minutosDe(inicioDt), Math.round((Number(horas) || 0) * 60)); return dataHoraDe(r.fim); }

/**
 * Agenda de todas as máquinas ativas. A fila de cada máquina vale na ordem
 * gravada; cada item começa no início que o programador deu (data e hora) ou,
 * sem ele, quando o anterior termina — nunca antes do anterior terminar, nem
 * antes da operação anterior da mesma OP. O fim ajustado à mão só é guardado
 * (estimado × feito); não empurra as outras.
 * agora: 'AAAA-MM-DDTHH:MM' (ou só a data = 00:00 do dia).
 * → { maquinaId: [{ opId, n, op, operacao, horas, inicio, fim, inicioDt, fimDt, fimAjustado, porDia, prazo, atraso, ... }] }
 */
export function agendarTudo(maquinas, opsPorId, projetosPorId, mapa, agora) {
  agora = agora || hoje();
  const ativas = (maquinas || []).filter(function (m) { return m.ativa !== false; });
  const t0 = proximoMinuto(minutosDe(agora));
  let fins = {}, r = {};
  for (let passo = 0; passo < 10; passo++) {
    const novos = {};
    r = {};
    ativas.forEach(function (m) {
      let livre = t0;
      r[m.id] = (m.fila || []).map(function (item) {
        const o = opsPorId[item.opId];
        const n = item.n == null ? null : Number(item.n);
        if (!o) return { opId: item.opId, n: n, ausente: true };
        const ops = operacoesDaOp(o);
        const operacao = n == null ? ops[0] : ops[n];
        const p = projetosPorId ? projetosPorId[o.projetoId] : null;
        const prazo = p ? p.prodFim || null : null;
        const base = n == null ? horasNaMaquina(o, m.id, ativas, mapa) : (operacao ? operacao.horas : 0);
        const horas = Number(item.horas) > 0 ? Number(item.horas) : base;
        const inicioFixo = item.inicio || (item.naoAntes ? item.naoAntes + 'T06:00' : null);
        const comum = { opId: item.opId, n: n, op: o, operacao: operacao || null, horas: horas, prazo: prazo, inicioFixo: inicioFixo, fimAjustado: item.fimAjustado || null };
        const s = situacao(o, true);
        if (s === 'baixaCq' || s === 'encerrada' || s === 'morta') return Object.assign(comum, { concluida: true });
        let depois = null;
        if (n != null) for (let k = n - 1; k >= 0; k--) { const f = fins[chaveItem(o.id, k)]; if (f != null) { depois = f; break; } }
        const ini = proximoMinuto(Math.max(livre, inicioFixo ? minutosDe(inicioFixo) : livre, depois == null ? livre : depois));
        const conta = somarMinutos(ini, Math.round(horas * 60));
        livre = conta.fim;
        novos[chaveItem(o.id, n)] = conta.fim;
        const inicioDt = dataHoraDe(ini), fimDt = dataHoraDe(conta.fim);
        return Object.assign(comum, { inicio: inicioDt.slice(0, 10), fim: fimDt.slice(0, 10), inicioDt: inicioDt, fimDt: fimDt, porDia: conta.porDia,
          empurrada: !!(inicioFixo && dataHoraDe(minutosDe(inicioFixo)) !== inicioDt), depoisDe: depois == null ? null : dataHoraDe(depois).slice(0, 10),
          atraso: !!(prazo && fimDt.slice(0, 10) > prazo) });
      });
    });
    const mudou = Object.keys(novos).some(function (k) { return novos[k] !== fins[k]; }) || Object.keys(fins).length !== Object.keys(novos).length;
    fins = novos;
    if (!mudou) break;
  }
  return r;
}

/**
 * Pôr uma operação na fila da máquina com início (data e hora) ou no fim.
 * Devolve { fila, conflitos } — a fila nova (na posição pelo início) e as
 * operações que estavam nesse horário e serão empurradas para frente.
 * fila: a fila atual (sem o item) · agenda: os itens agendados dessa fila
 */
export function encaixar(fila, agenda, item) {
  const lista = (fila || []).slice();
  if (!item.inicio) return { fila: lista.concat([item]), conflitos: [] };
  const ini = minutosDe(item.inicio), fim = minutosDe(fimPrevisto(item.inicio, item.horasCalc || 0));
  const vivos = (agenda || []).filter(function (a) { return a && a.inicioDt && !a.concluida && !a.ausente; });
  const conflitos = vivos.filter(function (a) { return minutosDe(a.inicioDt) < fim && minutosDe(a.fimDt) > ini; });
  // entra antes da primeira que termina depois do início dela
  const primeira = vivos.find(function (a) { return minutosDe(a.fimDt) > ini; });
  const pos = primeira ? lista.findIndex(function (f) { return chaveItem(f.opId, f.n == null ? null : Number(f.n)) === chaveItem(primeira.opId, primeira.n); }) : -1;
  if (pos < 0) lista.push(item); else lista.splice(pos, 0, item);
  // as que vêm depois e tinham início fixo antes do fim desta: passam a começar depois (empurradas)
  return { fila: lista, conflitos: conflitos };
}

// Operações de usinagem esperando programação que a máquina pode fazer.
export function aguardandoNaMaquina(maquina, ops, maquinas, mapa) {
  const naFila = {};
  (maquinas || []).forEach(function (m) { (m.fila || []).forEach(function (f) { naFila[chaveItem(f.opId, f.n == null ? null : Number(f.n))] = true; }); });
  const r = [];
  (ops || []).forEach(function (o) {
    if (o.area !== 'usinagem' || !emProducao(o) || situacao(o, true) !== 'programada' && situacao(o, true) !== 'emAberto') return;
    // OP inteira já na fila: nada a programar
    if (naFila[chaveItem(o.id, null)]) return;
    operacoesDaOp(o).forEach(function (x) {
      if (naFila[chaveItem(o.id, x.n)]) return;
      if (maquinasDaOperacao(x, maquinas, mapa).indexOf(maquina.id) < 0) return;
      if (x.n == null && Array.isArray(o.operacoes) && o.operacoes.length) return;
      r.push({ op: o, operacao: x, chave: chaveItem(o.id, x.n) });
    });
  });
  return r;
}
