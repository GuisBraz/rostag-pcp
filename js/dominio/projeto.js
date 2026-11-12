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

// Pedido do GP aguardando a Gerência (paralisar ou cancelar o projeto).
export const PEDIDOS = ['paralisar', 'cancelar'];
export function pedidoPendente(p) { return p && p.pedido && PEDIDOS.indexOf(p.pedido.tipo) >= 0 ? p.pedido : null; }

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
export const LIMITES = { commessa: 40, cliente: 80, descricao: 160, om: 40 };

// Fonte única de verdade: usada pelo formulário e pela importação.
// Datas do cronograma são opcionais na criação, mas vêm em conjunto.
export function validar(d, projetos, idEditando) {
  const faltando = OBRIGATORIOS.filter(function (o) { return !d[o.campo]; });
  if (faltando.length) {
    return { ok: false, campos: faltando.map(function (o) { return o.campo; }),
      msg: T('fm.faltou', faltando.map(function (o) { return T(o.rot); }).join(', ')) };
  }
  const datas = ['pcpInicio', 'pcpFim', 'prodInicio', 'prodFim', 'entrega', 'dataSolicitacao'].filter(function (c) { return d[c] && !dataValida(d[c]); });
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
// o PCP vem em par (início e fim). A produção é independente do PCP (o GP
// decide): só não pode terminar antes de começar.
// Passar da entrega não bloqueia — vira aviso (avisosCronograma).
export function validarCronograma(d) {
  const algum = d.pcpInicio || d.pcpFim || d.prodInicio || d.prodFim;
  if (!algum) return { ok: true };
  const faltam = ['pcpInicio', 'pcpFim'].filter(function (c) { return !d[c]; });
  if (faltam.length) {
    return { ok: false, campos: faltam, msg: T('fm.faltou', faltam.map(function (c) { return T('fm.' + c + 'N'); }).join(', ')) };
  }
  if (d.pcpFim < d.pcpInicio) {
    return { ok: false, campos: ['pcpFim', 'pcpInicio'], msg: T('fm.errPcpFim', br(d.pcpFim), br(d.pcpInicio)) };
  }
  if (d.prodInicio && d.prodFim && d.prodFim < d.prodInicio) {
    return { ok: false, campos: ['prodFim', 'prodInicio'], msg: T('fm.errProdFim', br(d.prodFim), br(d.prodInicio)) };
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
  const dias = dividirDias(p.checklist.map(function (i) { return i.t; }), total);
  p.checklist.forEach(function (i, k) { i.dias = dias[k]; });
  return true;
}

// Datas do cronograma macro que entram no histórico de reprogramação.
export const CAMPOS_DATA = ['pcpInicio', 'pcpFim', 'prodInicio', 'prodFim', 'entrega'];

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

/* ------------------------------------------------- checklist padrão do PCP */
function chaveTarefa(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

// Tarefas que costumam levar mais tempo pesam 3 na divisão dos dias; as outras, 1.
const PESADAS = /CRIARLM|LISTADEMATERIAIS|LISTADEAVANCO|APROVEITAMENTODECHAPAS|DETALHAMENTODECHAPAS|DETALHARASPOSICOES|ORDEMDEPRODUCAO|ORDENSDEPRODUCAO/;
export function pesoTarefa(t) { return PESADAS.test(chaveTarefa(t)) ? 3 : 1; }

/**
 * Divide "total" dias úteis entre as tarefas pelo peso: a primeira começa no
 * início do PCP e a última termina no fim (a soma é o total). Com menos dias
 * que tarefas, as leves ficam com 0 (dividem o dia) e as pesadas com 1.
 */
export function dividirDias(nomes, total) {
  const pesos = nomes.map(pesoTarefa);
  const n = nomes.length;
  if (!n) return [];
  total = Math.max(0, Math.round(total || 0));
  const minimo = pesos.map(function (w) { return total >= n ? 1 : (w > 1 ? 1 : 0); });
  let base = minimo.reduce(function (a, b) { return a + b; }, 0);
  if (base > total) {   // nem as pesadas cabem: 1 dia para as primeiras pesadas
    let resta = total;
    return pesos.map(function (w) { if (w > 1 && resta > 0) { resta--; return 1; } return 0; });
  }
  const sobra = total - base, somaPesos = pesos.reduce(function (a, b) { return a + b; }, 0);
  const exato = pesos.map(function (w) { return sobra * w / somaPesos; });
  const dias = exato.map(function (x, i) { return minimo[i] + Math.floor(x); });
  let falta = total - dias.reduce(function (a, b) { return a + b; }, 0);
  // o que sobra do arredondamento vai para as maiores frações (pesadas primeiro no empate)
  const ordem = exato.map(function (x, i) { return i; }).sort(function (a, b) { return (exato[b] - Math.floor(exato[b])) - (exato[a] - Math.floor(exato[a])) || pesos[b] - pesos[a] || a - b; });
  for (let k = 0; falta > 0; k = (k + 1) % n) { dias[ordem[k]]++; falta--; }
  return dias.map(function (d) { return Math.min(DIAS_MAX_TAREFA, d); });
}

// Equivalências entre a lista antiga e a nova (o que já foi marcado não se perde).
const EQUIVALENTES = {
  ANALISEDEESCOPO: ['ANALISEDEESCOPOEDESENHOS'],
  SCITENSCRITICOS: ['SOLICITARITENSCRITICOSQUANDOAPLICAVEL', 'SOLICITARITENSCRITICOS'],
  CRIARLM: ['CRIARLISTADEMATERIAIS'],
  APROVEITAMENTODELAMINADOS: ['CRIARAPROVEITAMENTODELAMINADOS'],
  SCLAMINADOS: ['EMITIRSCDELAMINADOS'],
  APROVEITAMENTODECHAPAS: ['DETALHARASPOSICOESEMCHAPAS', 'CRIARAPROVEITAMENTODECHAPAS'],
  SCCHAPAS: ['EMITIRSCDASCHAPAS', 'EMITIRSCDECHAPAS'],
  DETALHAMENTODEDOBRAQUANDOAPLICAVEL: ['CRIARCROQUIDEDOBRAQUANDOAPLICAVEL'],
  SCDOBRAQUANDOAPLICAVEL: ['EMITIRSCDEDOBRAQUANDOAPLICAVEL'],
  CRIARORDEMDEPRODUCAO: ['CRIARASORDENSDEPRODUCAO'],
  IMPRIMIRASOPS: ['IMPRIMIRASOPS'],
  ENTREGAROSDOCUMENTOS: ['ENTREGAROSDOCUMENTOSPARAARESPONSAVELOPPGMEPP']
};

/**
 * Troca o checklist do projeto pela lista nova, se o PCP ainda não terminou.
 * Tarefas equivalentes levam o que já estava marcado (feito, data, observação);
 * os dias são redistribuídos pelo peso. Devolve true se mudou.
 */
export function migrarChecklist(p, nomesNovos) {
  if (!p || !Array.isArray(p.checklist)) return false;
  const atual = p.checklist.map(function (i) { return chaveTarefa(i.t); });
  const novos = nomesNovos.map(chaveTarefa);
  if (atual.length === novos.length && atual.every(function (k, i) { return k === novos[i]; })) return false;
  if (temCronograma(p) && p.checklist.length && Cronograma.calcular(p).concluido) return false;   // PCP já concluído: fica como está
  const usados = {};
  const acha = function (k) {
    const alvos = [k].concat(EQUIVALENTES[k] || []);
    for (let i = 0; i < p.checklist.length; i++) {
      if (!usados[i] && alvos.indexOf(atual[i]) >= 0) { usados[i] = true; return p.checklist[i]; }
    }
    return null;
  };
  const total = temCronograma(p) ? Cronograma.duracaoUtil(p.pcpInicio, p.pcpFim, p.paralisacoes) : 0;
  const dias = dividirDias(nomesNovos, total);
  p.checklist = nomesNovos.map(function (t, i) {
    const velho = acha(novos[i]);
    return { t: t, dias: temCronograma(p) ? dias[i] : 0, done: !!(velho && velho.done), doneAt: velho ? velho.doneAt || null : null,
      obs: velho ? velho.obs || '' : '', obsEm: velho ? velho.obsEm || null : null };
  });
  return true;
}
export const MAX_TAREFAS_PADRAO = 60;
export const MAX_TEXTO_TAREFA = 120;

// Limpa a lista editada: sem linhas vazias, texto e duração dentro do limite.
export function normalizarPadrao(itens) {
  return (Array.isArray(itens) ? itens : []).map(function (i) {
    return { t: String((i && i.t) || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO_TAREFA),
      dias: Math.min(DIAS_MAX_TAREFA, Math.max(0, Math.round(Number(i && i.dias) || 0))) };
  }).filter(function (i) { return i.t; }).slice(0, MAX_TAREFAS_PADRAO);
}
// Lista da equipe (config/checklist) ou, sem ela, a de fábrica.
export function listaPadrao(itensEquipe) {
  const l = normalizarPadrao(itensEquipe);
  return l.length ? l : CHECKLIST_PADRAO.map(function (t) { return { t: t, dias: 0 }; });
}
// Projeto novo nasce com as tarefas padrão. Com duração 0, o sistema
// distribui os dias da janela do PCP quando o cronograma for definido.
export function checklistNovo(itensEquipe) {
  return listaPadrao(itensEquipe).map(function (i) {
    return { t: i.t, dias: i.dias, done: false, doneAt: null, obs: '', obsEm: null };
  });
}
// Resumo das mudanças do editor. Cada item editado traz "orig" (posição na
// lista de antes) ou null quando é novo.
export function resumoMudancasPadrao(antes, depois) {
  const usados = {};
  let novas = 0, renomeadas = 0, duracoes = 0, ordem = false, ultimo = -1;
  depois.forEach(function (i) {
    if (i.orig == null || !antes[i.orig]) { novas++; return; }
    usados[i.orig] = true;
    if (antes[i.orig].t !== i.t) renomeadas++;
    if ((antes[i.orig].dias || 0) !== (i.dias || 0)) duracoes++;
    if (i.orig < ultimo) ordem = true;
    ultimo = i.orig;
  });
  const removidas = antes.filter(function (_x, k) { return !usados[k]; }).length;
  return { total: depois.length, novas: novas, removidas: removidas, renomeadas: renomeadas, duracoes: duracoes, ordem: ordem,
    mudou: !!(novas || removidas || renomeadas || duracoes || ordem) };
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
  o.prodInicio = dataValida(o.prodInicio) ? o.prodInicio : null;
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
  if (!o.prodInicio && o.prodFim && o.pcpFim && o.prodFim < o.pcpFim) o.prodFim = o.pcpFim;

  if (['ativo', 'paralisado', 'concluido', 'cancelado'].indexOf(o.status) < 0) o.status = 'ativo';
  o.paralisacoes = (Array.isArray(o.paralisacoes) ? o.paralisacoes : [])
    .filter(function (x) { return x && dataValida(x.inicio); })
    .map(function (x) { return { inicio: x.inicio, fim: dataValida(x.fim) ? x.fim : null, motivo: String(x.motivo || '') }; });
  // schema 3 cancelava direto; agora cancelar exige passar por paralisado
  if (o.status === 'cancelado' && !o.paralisacoes.length && dataValida(o.canceladoEm)) {
    o.paralisacoes.push({ inicio: o.canceladoEm, fim: o.canceladoEm, motivo: 'migrado' });
  }
  o.pedido = pedidoPendente(o) && (o.status === 'ativo' || o.status === 'paralisado') ? {
    tipo: o.pedido.tipo, motivo: String(o.pedido.motivo || '').slice(0, 200),
    porUid: o.pedido.porUid || null, porNome: String(o.pedido.porNome || ''), em: o.pedido.em || null
  } : null;
  o.motivoCancelamento = o.status === 'cancelado' ? String(o.motivoCancelamento || '').slice(0, 200) : '';
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
