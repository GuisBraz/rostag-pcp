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
// Máquinas de corte da caldeiraria: seg a sex 07:00–17:00; extensão até 22:00
// (exceção) ligada na máquina ou numa data avulsa (m.extras[data] = 'extensao'
// | 'folga').
export const CAL_CORTES = { 1: [420, 1020], 2: [420, 1020], 3: [420, 1020], 4: [420, 1020], 5: [420, 1020] };
export const FIM_EXTENSAO = 1320;
function dataDoDia(dia) { return dataHoraDe(dia * 1440).slice(0, 10); }
// Janela de trabalho [início, fim] em minutos do dia (ou null = sem turno).
export function janelaMaquina(m, data) {
  const dow = new Date(data + 'T12:00:00Z').getUTCDay();
  if (!m || m.area !== 'caldeiraria') return CALENDARIO[dow] || null;
  const ex = (m.extras || {})[data];
  if (ex === 'folga') return null;
  const base = CAL_CORTES[dow];
  if (ex === 'extensao') return [base ? base[0] : 420, FIM_EXTENSAO];
  if (!base) return null;
  return m.extensao ? [base[0], FIM_EXTENSAO] : base;
}
function janela(dia, m) { return janelaMaquina(m, dataDoDia(dia)); }
// O primeiro minuto de trabalho a partir de t.
function proximoMinuto(t, maq) {
  for (let k = 0; k < 21; k++) {
    const dia = Math.floor(t / 1440), m = t - dia * 1440, w = janela(dia, maq);
    if (w && m < w[0]) return dia * 1440 + w[0];
    if (w && m < w[1]) return t;
    t = (dia + 1) * 1440;
  }
  return t;
}
// Soma minutos de trabalho a t; devolve o fim e os minutos usados em cada dia.
// Paradas da operação ([início, fim] em minutos): o tempo dentro delas não conta.
function dentroDe(t, bl) { for (let i = 0; i < bl.length; i++) if (t >= bl[i][0] && t < bl[i][1]) return bl[i]; return null; }
function proximoLivre(t, maq, bl) {
  for (let k = 0; k < 60; k++) { t = proximoMinuto(t, maq); const b = dentroDe(t, bl); if (!b) return t; t = b[1]; }
  return t;
}
function somarMinutos(t, minutos, maq, bloqueios) {
  const bl = bloqueios || [], porDia = {};
  t = proximoLivre(t, maq, bl);
  let resta = minutos;
  for (let guarda = 0; resta > 0 && guarda < 5000; guarda++) {
    const dia = Math.floor(t / 1440), w = janela(dia, maq);
    let ate = dia * 1440 + w[1];
    bl.forEach(function (b) { if (b[0] > t && b[0] < ate) ate = b[0]; });
    const usa = Math.min(resta, ate - t);
    if (usa > 0) {
      const d = dataHoraDe(dia * 1440).slice(0, 10);
      porDia[d] = (porDia[d] || 0) + usa / 60;
      resta -= usa; t += usa;
    }
    if (resta > 0) t = proximoLivre(t + (usa > 0 ? 0 : 1), maq, bl);
  }
  return { fim: t, porDia: porDia };
}
// Paradas do item da fila: as já retomadas (pausas) e a ❄ congelada agora.
export function paradasDoItem(item) {
  const l = [];
  (item && item.pausas || []).forEach(function (pz) { const a = minutosDe(pz.desde), b = minutosDe(pz.ate); if (a != null && b != null && b > a) l.push([a, b]); });
  const c = item && item.congelada;
  if (c) { const a = minutosDe(c.desde), b = minutosDe(c.ate); if (a != null && b != null && b > a) l.push([a, b]); }
  return l;
}
// Horas de trabalho da máquina entre dois instantes (sem as paradas): o "já feito".
export function horasTrabalhadas(maq, deDt, ateDt, bloqueios) {
  let t = minutosDe(deDt), fim = minutosDe(ateDt), soma = 0;
  if (t == null || fim == null || fim <= t) return 0;
  const bl = bloqueios || [];
  for (let k = 0; k < 400 && t < fim; k++) {
    t = proximoLivre(t, maq, bl);
    if (t >= fim) break;
    const dia = Math.floor(t / 1440), w = janela(dia, maq);
    let ate = Math.min(dia * 1440 + w[1], fim);
    bl.forEach(function (b) { if (b[0] > t && b[0] < ate) ate = b[0]; });
    soma += Math.max(0, ate - t);
    t = ate;
  }
  return Math.round(soma / 60 * 100) / 100;
}
export function fimPrevisto(inicioDt, horas, maq) { const r = somarMinutos(minutosDe(inicioDt), Math.round((Number(horas) || 0) * 60), maq); return dataHoraDe(r.fim); }

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
  const t00 = minutosDe(agora);
  let fins = {}, r = {};
  for (let passo = 0; passo < 10; passo++) {
    const novos = {};
    r = {};
    ativas.forEach(function (m) {
      let livre = proximoMinuto(t00, m);
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
        const comum = { opId: item.opId, n: n, op: o, operacao: operacao || null, horas: horas, prazo: prazo, inicioFixo: inicioFixo, fimAjustado: item.fimAjustado || null,
          parte: item.parte || null, congelada: item.congelada || null, pausas: item.pausas || [], feitas: Number(item.feitas) || 0, reprogramar: item.reprogramar || null, maquinaId: m.id };
        const s = situacao(o, true);
        if (s === 'baixaCq' || s === 'encerrada' || s === 'morta') return Object.assign(comum, { concluida: true });
        let depois = null;
        if (n != null) for (let k = n - 1; k >= 0; k--) { const f = fins[chaveItem(o.id, k)]; if (f != null) { depois = f; break; } }
        const ini = proximoMinuto(Math.max(livre, inicioFixo ? minutosDe(inicioFixo) : livre, depois == null ? livre : depois), m);
        const conta = somarMinutos(ini, Math.round(horas * 60), m, paradasDoItem(item));
        livre = conta.fim;
        // operação dividida em várias máquinas: a seguinte espera a parte que termina por último
        const kf = chaveItem(o.id, n);
        novos[kf] = Math.max(novos[kf] || 0, conta.fim);
        const inicioDt = dataHoraDe(ini), fimDt = dataHoraDe(conta.fim);
        return Object.assign(comum, { inicio: inicioDt.slice(0, 10), fim: fimDt.slice(0, 10), inicioDt: inicioDt, fimDt: fimDt, porDia: conta.porDia,
          empurrada: !!(inicioFixo && dataHoraDe(minutosDe(inicioFixo)) !== inicioDt), depoisDe: depois == null ? null : dataHoraDe(depois).slice(0, 10),
          atraso: false, atrasoItem: !!(prazo && fimDt.slice(0, 10) > prazo) });
      });
    });
    const mudou = Object.keys(novos).some(function (k) { return novos[k] !== fins[k]; }) || Object.keys(fins).length !== Object.keys(novos).length;
    fins = novos;
    if (!mudou) break;
  }
  // o atraso é acusado só pela última operação da OP (a parte que termina por último)
  const ultimaDe = {}, fimOp = {};
  Object.keys(r).forEach(function (mid) {
    r[mid].forEach(function (it) {
      if (!it.op || it.ausente || it.concluida) return;
      if (!(it.opId in ultimaDe)) ultimaDe[it.opId] = ultimaOperacao(it.op, ativas, mapa);
      if (it.n === ultimaDe[it.opId] && (!fimOp[it.opId] || it.fimDt > fimOp[it.opId])) fimOp[it.opId] = it.fimDt;
    });
  });
  Object.keys(r).forEach(function (mid) {
    r[mid].forEach(function (it) {
      if (!it.op || it.ausente || it.concluida) return;
      it.ultima = it.n === ultimaDe[it.opId];
      it.atraso = it.ultima && it.fimDt === fimOp[it.opId] && it.atrasoItem;
    });
  });
  return r;
}

// Operações do roteiro que vão para máquina: [{ n, operacao, maquinaId }] (a máquina do setor).
export function opsDeMaquina(o, maquinas, mapa) {
  const ativas = (maquinas || []).filter(function (m) { return m.ativa !== false; });
  return operacoesDaOp(o).filter(function (x) { return x.n != null; }).map(function (x) {
    return { n: x.n, operacao: x, maquinaId: maquinaDoSetor(x.setor, ativas, mapa) };
  }).filter(function (x) { return !!x.maquinaId; });
}
// Última operação da OP que vai para máquina (null = OP sem roteiro).
export function ultimaOperacao(o, maquinas, mapa) {
  const l = opsDeMaquina(o, maquinas, mapa);
  return l.length ? l[l.length - 1].n : null;
}
function clonar(maquinas) { return (maquinas || []).map(function (m) { return Object.assign({}, m, { fila: (m.fila || []).map(function (f) { return Object.assign({}, f); }) }); }); }
function naFilaEm(maquinas, opId, n) {
  return (maquinas || []).some(function (m) { return (m.fila || []).some(function (f) { return f.opId === opId && (f.n == null ? null : Number(f.n)) === n; }); });
}
/**
 * Programar a OP inteira: depois da operação "deN", cada operação seguinte que
 * ainda não está em fila entra na máquina dela, começando quando a anterior
 * termina. Se nesse horário a máquina já tem outras OPs, não empurra ninguém:
 * vai para o fim da fila (e avisa).
 * → { maquinas (cópias com as filas novas), mudadas: [ids], avisos: [{ n, maquinaId, ocupadas: [números] }] }
 */
export function encadear(maquinas, opsPorId, projetosPorId, mapa, agora, opId, deN) {
  let ms = clonar(maquinas);
  const o = opsPorId[opId], mudadas = {}, avisos = [];
  if (!o) return { maquinas: ms, mudadas: [], avisos: [] };
  opsDeMaquina(o, ms, mapa).forEach(function (x) {
    if (deN != null && x.n <= deN) return;
    if (naFilaEm(ms, opId, x.n)) return;
    const m = ms.find(function (y) { return y.id === x.maquinaId; });
    if (!m || (m.fila || []).length >= MAX_FILA) return;
    const ag = agendarTudo(ms, opsPorId, projetosPorId, mapa, agora);
    let prevFim = null;
    Object.keys(ag).forEach(function (mid) { ag[mid].forEach(function (it) { if (it.opId === opId && it.n != null && it.n < x.n && it.fimDt && (!prevFim || it.fimDt > prevFim)) prevFim = it.fimDt; }); });
    const horas = x.operacao.horas || 0;
    const item = { opId: opId, n: x.n, horas: null, inicio: prevFim, fimAjustado: null };
    const enc = prevFim ? encaixar(m.fila, ag[m.id], Object.assign({}, item, { horasCalc: horas }), m) : { fila: m.fila.concat([item]), conflitos: [] };
    if (enc.conflitos.length) {
      m.fila = m.fila.concat([Object.assign({}, item, { inicio: null })]);
      avisos.push({ n: x.n, maquinaId: m.id, ocupadas: enc.conflitos.map(function (c) { return c.op ? c.op.numero : ''; }) });
    } else {
      m.fila = enc.fila;
    }
    mudadas[m.id] = true;
  });
  return { maquinas: ms, mudadas: Object.keys(mudadas), avisos: avisos };
}
/**
 * As operações seguintes da OP (depois de "deN") vão para o fim da fila de cada
 * máquina, sem início, marcadas "aguardando reprogramação" (motivo).
 */
export function mandarReprogramar(maquinas, opId, deN, motivo) {
  const ms = clonar(maquinas), mudadas = {}, itens = [];
  ms.forEach(function (m) {
    const fica = [], vai = [];
    (m.fila || []).forEach(function (f) {
      const n = f.n == null ? null : Number(f.n);
      if (f.opId === opId && n != null && deN != null && n > deN) vai.push(Object.assign({}, f, { inicio: null, reprogramar: motivo || 'reprogramar' }));
      else fica.push(f);
    });
    if (vai.length) { m.fila = fica.concat(vai); mudadas[m.id] = true; vai.forEach(function (f) { itens.push({ n: f.n, maquina: m.nome }); }); }
  });
  return { maquinas: ms, mudadas: Object.keys(mudadas), itens: itens };
}
// A operação anterior voltou ao normal: tira a marca das seguintes da OP.
export function liberarReprogramar(maquinas, opId) {
  const ms = clonar(maquinas), mudadas = {};
  ms.forEach(function (m) { (m.fila || []).forEach(function (f) { if (f.opId === opId && f.reprogramar) { f.reprogramar = null; mudadas[m.id] = true; } }); });
  return { maquinas: ms, mudadas: Object.keys(mudadas) };
}

/**
 * Pôr uma operação na fila da máquina com início (data e hora) ou no fim.
 * Devolve { fila, conflitos } — a fila nova (na posição pelo início) e as
 * operações que estavam nesse horário e serão empurradas para frente.
 * fila: a fila atual (sem o item) · agenda: os itens agendados dessa fila
 */
export function encaixar(fila, agenda, item, maq) {
  const lista = (fila || []).slice();
  if (!item.inicio) return { fila: lista.concat([item]), conflitos: [] };
  const ini = minutosDe(item.inicio), fim = minutosDe(fimPrevisto(item.inicio, item.horasCalc || 0, maq));
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
export function aguardandoNaMaquina(maquina, ops, maquinas, mapa, area) {
  const ar = area || 'usinagem';
  const naFila = {};
  (maquinas || []).forEach(function (m) { (m.fila || []).forEach(function (f) { naFila[chaveItem(f.opId, f.n == null ? null : Number(f.n))] = true; }); });
  const r = [];
  (ops || []).forEach(function (o) {
    if (o.area !== ar || !emProducao(o) || situacao(o, true) !== 'programada' && situacao(o, true) !== 'emAberto') return;
    // OP inteira já na fila: nada a programar
    if (naFila[chaveItem(o.id, null)]) return;
    const deMaq = opsDeMaquina(o, maquinas, mapa);
    const primeira = deMaq.find(function (y) { return !naFila[chaveItem(o.id, y.n)]; });
    operacoesDaOp(o).forEach(function (x) {
      if (naFila[chaveItem(o.id, x.n)]) return;
      if (x.n != null && deMaq.length && (!primeira || primeira.n !== x.n)) return;
      if (maquinasDaOperacao(x, maquinas, mapa).indexOf(maquina.id) < 0) return;
      if (x.n == null && Array.isArray(o.operacoes) && o.operacoes.length) return;
      r.push({ op: o, operacao: x, chave: chaveItem(o.id, x.n) });
    });
  });
  return r;
}
