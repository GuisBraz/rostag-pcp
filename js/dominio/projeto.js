/* ---------------------------------------------------------------------------
   Projeto — regras de negócio, sem DOM nem Firebase.
--------------------------------------------------------------------------- */
import { hoje, difDias, dataValida, br } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Cronograma from './cronograma.js';
import { CHECKLIST_PADRAO, DIAS_MAX_TAREFA } from './constantes.js';

// Status do PROJETO: marcados à mão têm prioridade; o resto vem da entrega.
export function status(p) {
  if (p.status === 'cancelado') return 'cancelado';
  if (p.status === 'concluido') return 'concluido';
  if (p.status === 'paralisado') return 'paralisado';
  return p.entrega < hoje() ? 'atrasado' : 'andamento';
}
// "Aberto" = ainda dá trabalho. Paralisado conta como aberto.
export function aberto(p) { const s = status(p); return s !== 'concluido' && s !== 'cancelado'; }

// Paralisações: a última sem 'fim' é a que está correndo agora.
export function pausaAtual(p) {
  const ps = p.paralisacoes || [];
  const u = ps[ps.length - 1];
  return (u && !u.fim) ? u : null;
}
export function diasParadoAtual(p) {
  const a = pausaAtual(p);
  return a ? difDias(a.inicio, hoje()) : 0;
}
export function diasParadoTotal(p) {
  const h = hoje();
  return (p.paralisacoes || []).reduce(function (soma, x) { return soma + difDias(x.inicio, x.fim || h); }, 0);
}
export function progresso(p) {
  if (!p.checklist || !p.checklist.length) return 0;
  return Math.round(p.checklist.filter(function (i) { return i.done; }).length / p.checklist.length * 100);
}
export function ciclo(p) { return p.concluidoEm ? difDias(p.dataSolicitacao || p.pcpInicio, p.concluidoEm) : null; }
export function desvio(p) { return p.concluidoEm ? difDias(p.entrega, p.concluidoEm) : null; }
// Cronograma macro: PCP (início e fim) + fim da Produção. A Produção começa
// no fim do PCP. Projeto novo nasce sem datas, "aguardando cronograma", até
// o GP definir — e o técnico só passa a vê-lo depois disso.
export function temCronograma(p) { return !!(p.pcpInicio && p.pcpFim); }
export function aguardandoCronograma(p) { return !temCronograma(p) || p.cronogramaDefinido === false; }

// Situação do PCP: só faz sentido em projeto aberto.
export function situacaoPcp(p) {
  if (!aberto(p)) return 'concluida';
  if (aguardandoCronograma(p)) return 'aguardando';
  return Cronograma.resumo(p).situacao;
}

// PCP passou do fim com tarefa aberta (notificação 15).
export function pcpAtrasado(p) {
  return aberto(p) && temCronograma(p) && p.pcpFim < hoje() && !Cronograma.calcular(p).concluido;
}

const OBRIGATORIOS = [
  { campo: 'commessa', rot: 'fm.commessaN' },
  { campo: 'descricao', rot: 'fm.descricaoN' },
  { campo: 'entrega', rot: 'fm.entregaN' }
];
export const LIMITES = { commessa: 40, cliente: 80, descricao: 160, tipoServico: 60, om: 40 };

// Fonte única de verdade: usada pelo formulário e pela importação.
// Datas do cronograma são opcionais na criação, mas vêm em conjunto.
export function validar(d, projetos, idEditando) {
  const faltando = OBRIGATORIOS.filter(function (o) { return !d[o.campo]; });
  if (faltando.length) {
    return { ok: false, campos: faltando.map(function (o) { return o.campo; }),
      msg: T('fm.faltou', faltando.map(function (o) { return T(o.rot); }).join(', ')) };
  }
  const datas = ['pcpInicio', 'pcpFim', 'prodFim', 'entrega', 'dataSolicitacao'].filter(function (c) { return d[c] && !dataValida(d[c]); });
  if (datas.length) return { ok: false, campos: datas, msg: T('fm.errData') };
  const longos = Object.keys(LIMITES).filter(function (c) { return d[c] && String(d[c]).length > LIMITES[c]; });
  if (longos.length) return { ok: false, campos: longos, msg: T('fm.errLongo') };
  const v = validarCronograma(d);
  if (!v.ok) return v;
  if (d.dataSolicitacao && d.pcpInicio && d.dataSolicitacao > d.pcpInicio) {
    return { ok: false, campos: ['dataSolicitacao'], msg: T('fm.errSolic') };
  }
  const chave = String(d.commessa).trim().toLowerCase();
  const dup = projetos.some(function (p) { return p.id !== idEditando && String(p.commessa).trim().toLowerCase() === chave; });
  if (dup) return { ok: false, campos: ['commessa'], msg: T('fm.errDup', d.commessa) };
  return { ok: true, avisos: avisosCronograma(d) };
}

// Ordem das datas do cronograma macro. Tudo vazio vale (aguardando cronograma);
// o PCP vem em par (início e fim); o fim da Produção pode vir depois.
// Passar da entrega não bloqueia — vira aviso (avisosCronograma).
export function validarCronograma(d) {
  const algum = d.pcpInicio || d.pcpFim || d.prodFim;
  if (!algum) return { ok: true };
  const faltam = ['pcpInicio', 'pcpFim'].filter(function (c) { return !d[c]; });
  if (faltam.length) {
    return { ok: false, campos: faltam, msg: T('fm.faltou', faltam.map(function (c) { return T('fm.' + c + 'N'); }).join(', ')) };
  }
  if (d.pcpFim < d.pcpInicio) {
    return { ok: false, campos: ['pcpFim', 'pcpInicio'], msg: T('fm.errPcpFim', br(d.pcpFim), br(d.pcpInicio)) };
  }
  if (d.prodFim && d.prodFim < d.pcpFim) {
    return { ok: false, campos: ['prodFim', 'pcpFim'], msg: T('fm.errProdFim', br(d.prodFim), br(d.pcpFim)) };
  }
  return { ok: true };
}
export function avisosCronograma(d) {
  const avisos = [];
  if (d.entrega && d.prodFim && d.prodFim > d.entrega) avisos.push(T('fm.avisoProdDepoisEntrega', br(d.prodFim), br(d.entrega), difDias(d.entrega, d.prodFim)));
  else if (d.entrega && d.pcpFim && d.pcpFim > d.entrega) avisos.push(T('fm.avisoPcpDepoisEntrega', br(d.pcpFim), br(d.entrega)));
  return avisos;
}

// Distribui os dias úteis da janela do PCP entre as tarefas que ainda estão
// com duração 0 (projeto recém-definido). Tarefas já ajustadas à mão ficam
// como estão. Primeira versão — o ajuste fino fica para depois.
export function distribuirTarefas(p) {
  if (!temCronograma(p) || !p.checklist || !p.checklist.length) return false;
  if (p.checklist.some(function (i) { return Number(i.dias) > 0 || i.done; })) return false;
  const total = Cronograma.duracaoUtil(p.pcpInicio, p.pcpFim, p.paralisacoes);
  const n = p.checklist.length;
  const base = Math.floor(total / n), sobra = total - base * n;
  p.checklist.forEach(function (i, k) { i.dias = Math.min(DIAS_MAX_TAREFA, base + (k < sobra ? 1 : 0)); });
  return true;
}

// Datas do cronograma macro que entram no histórico de reprogramação.
export const CAMPOS_DATA = ['pcpInicio', 'pcpFim', 'prodFim', 'entrega'];

// Registra no histórico o que mudou entre as datas antigas e as novas.
export function registrarReprogramacao(p, novas, quem, motivo) {
  const mudou = [];
  CAMPOS_DATA.forEach(function (c) {
    if (novas[c] === undefined || (p[c] || null) === (novas[c] || null)) return;
    if (p[c]) p.reagendamentos.push({ campo: c, de: p[c], para: novas[c] || null, em: hoje(), motivo: motivo || 'reagendamento', por: quem || null });
    mudou.push(c);
  });
  return mudou;
}

export function novoId() {
  const aleatorio = (typeof crypto !== 'undefined' && crypto.getRandomValues)
    ? Array.from(crypto.getRandomValues(new Uint8Array(5)), function (b) { return b.toString(36).padStart(2, '0'); }).join('').slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return 'p_' + Date.now().toString(36) + '_' + aleatorio;
}

// Projeto novo nasce com as tarefas padrão em 0 dias — quem distribui o
// cronograma é o planejador, tarefa por tarefa.
export function checklistNovo() {
  return CHECKLIST_PADRAO.map(function (t) {
    return { t: t, dias: 0, done: false, doneAt: null, obs: '', obsEm: null };
  });
}

// Normaliza qualquer versão anterior do projeto para o formato atual.
// schema 1 = array cru · 2 = prazo único · 3 = PCP + entrega · 4 = documento por projeto
export function migrarProjeto(bruto) {
  const o = Object.assign({}, bruto);
  const h = hoje();
  o.id = (typeof o.id === 'string' && /^[\w-]{1,80}$/.test(o.id)) ? o.id : novoId();
  o.commessa = String(o.commessa || '—');
  o.cliente = o.cliente || '—';
  o.descricao = String(o.descricao || '');
  o.tipoServico = o.tipoServico || '';
  o.gp = o.gp || '—';
  o.gpUid = o.gpUid || null;
  o.tecnico = String(o.tecnico || '');
  o.om = o.om || '';
  o.dataSolicitacao = dataValida(o.dataSolicitacao) ? o.dataSolicitacao : null;
  o.responsavelUid = o.responsavelUid || null;
  o.prodFim = dataValida(o.prodFim) ? o.prodFim : null;
  delete o.setor;                                   // campo removido do app

  if (o.cronogramaDefinido === false) {
    // projeto novo, ainda sem cronograma: as datas ficam vazias até o GP definir
    o.pcpInicio = dataValida(o.pcpInicio) ? o.pcpInicio : null;
    o.pcpFim = dataValida(o.pcpFim) ? o.pcpFim : null;
    o.entrega = dataValida(o.entrega) ? o.entrega : (o.pcpFim || h);
  } else {
    // schema 1 e 2 tinham inicio + prazo. Viram janela do PCP + entrega.
    o.pcpInicio = dataValida(o.pcpInicio) ? o.pcpInicio : (dataValida(o.inicio) ? o.inicio : h);
    o.entrega = dataValida(o.entrega) ? o.entrega : (dataValida(o.prazo) ? o.prazo : o.pcpInicio);
    o.pcpFim = dataValida(o.pcpFim) ? o.pcpFim : (dataValida(o.prazo) ? o.prazo : o.entrega);
    if (o.pcpFim < o.pcpInicio) o.pcpFim = o.pcpInicio;
    // projeto de antes do cronograma macro: a entrega não é mais forçada a
    // vir depois do PCP (atraso agora é aviso, não erro)
  }
  delete o.inicio; delete o.prazo;
  if (o.prodFim && o.pcpFim && o.prodFim < o.pcpFim) o.prodFim = o.pcpFim;

  if (['ativo', 'paralisado', 'concluido', 'cancelado'].indexOf(o.status) < 0) o.status = 'ativo';
  o.paralisacoes = (Array.isArray(o.paralisacoes) ? o.paralisacoes : [])
    .filter(function (x) { return x && dataValida(x.inicio); })
    .map(function (x) { return { inicio: x.inicio, fim: dataValida(x.fim) ? x.fim : null, motivo: String(x.motivo || '') }; });
  // schema 3 cancelava direto; agora cancelar exige passar por paralisado
  if (o.status === 'cancelado' && !o.paralisacoes.length && dataValida(o.canceladoEm)) {
    o.paralisacoes.push({ inicio: o.canceladoEm, fim: o.canceladoEm, motivo: 'migrado' });
  }
  o.concluidoEm = o.status === 'concluido' ? (dataValida(o.concluidoEm) ? o.concluidoEm : o.entrega) : null;
  o.canceladoEm = o.status === 'cancelado' ? (dataValida(o.canceladoEm) ? o.canceladoEm : o.entrega) : null;

  o.reagendamentos = (Array.isArray(o.reagendamentos) ? o.reagendamentos : []).map(function (r) {
    return { campo: CAMPOS_DATA.indexOf(r.campo) >= 0 ? r.campo : 'entrega', de: r.de || null, para: r.para || null,
      em: r.em || null, motivo: r.motivo || 'reagendamento', por: r.por || null };
  });
  o.checklist = (Array.isArray(o.checklist) ? o.checklist : []).map(function (i) {
    return { t: String(i.t || ''), dias: Math.min(DIAS_MAX_TAREFA, Math.max(0, Number(i.dias) || 0)),
      done: !!i.done, doneAt: dataValida(i.doneAt) ? i.doneAt : null,
      obs: String(i.obs || ''), obsEm: dataValida(i.obsEm) ? i.obsEm : null };
  });
  return o;
}

export function migrar(bruto) {
  if (Array.isArray(bruto)) return bruto.map(migrarProjeto);
  if (bruto && Array.isArray(bruto.projetos)) return bruto.projetos.map(migrarProjeto);
  throw new Error('formato desconhecido');
}
