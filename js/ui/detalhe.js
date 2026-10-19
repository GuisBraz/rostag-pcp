/* ---------------------------------------------------------------------------
   Detalhe do projeto — janelas de prazo, informações, ações de status,
   histórico, cronograma, observações por tarefa e conversa.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, projetoAtual, opsDoProjeto } from '../estado.js';
import * as Producao from '../dominio/producao.js';
import { abrirEditarProjeto } from './formulario.js';
import { prefs } from '../nucleo/prefs.js';
import { esc, br, hoje, difDias, dataDoInstante, horaDoInstante } from '../nucleo/fmt.js';
import { T, plural, STATUS_LABEL, SIT_LABEL } from '../i18n/index.js';
import { DIAS_MAX_TAREFA } from '../dominio/constantes.js';
import * as Projeto from '../dominio/projeto.js';
import * as Cronograma from '../dominio/cronograma.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes } from './dom.js';
import { abrirModal, fecharModal, confirmar, pedirTexto } from './modal.js';
import { toast } from './toast.js';
import { persistir, redesenhar } from './app.js';
import { irPara } from './rota.js';
import { renderProjetos } from './projetos.js';
import { renderNotificacoes } from './notificacoes.js';
import { souGerencia, renderAcompanhamento } from './gerencia.js';

function janela(rot, corpo, obs, corObs) {
  return '<div class="rot">' + rot + '</div><div class="datas">' + corpo + '</div>' +
    (obs ? '<div class="obs" style="color:' + (corObs || 'var(--ink-dim)') + '">' + esc(obs) + '</div>' : '');
}
function linha(k, vHtml) { return '<div class="info-row"><span class="k">' + esc(k) + '</span><span class="v">' + vHtml + '</span></div>'; }

export function renderDetalhe() {
  const p = projetoAtual();
  if (!p) { irPara('projetos'); return; }
  const st = Projeto.status(p), pr = Projeto.progresso(p), h = hoje();
  const c = Cronograma.calcular(p);
  const parado = st === 'paralisado';
  const podeGerir = Auth.souGPouCoordenador();

  $('detail-commessa').textContent = p.commessa;
  $('detail-titulo').textContent = p.descricao;
  $('detail-sub').textContent = p.cliente + ' · ' + T('f.gp') + ' ' + p.gp + ' · ' + T('d.tecnico') + ' ' + (p.tecnico || '—');
  const pill = $('detail-status-pill');
  pill.textContent = STATUS_LABEL(st);
  pill.className = 'pill pill-' + st;
  document.title = p.commessa + ' · ROSTAG PCP';

  // --- janela do PCP ---
  const sitPcp = Projeto.situacaoPcp(p);
  if (Projeto.aguardandoCronograma(p)) {
    $('janela-pcp').innerHTML = janela(esc(T('d.janelaPcp')) + ' <span class="dot dot-aguardando" style="margin-left:4px"></span>',
      esc(T('sit.aguardando')), T(podeGerir ? 'd.aguardandoGestor' : 'd.aguardandoNota'), 'var(--amber-ink)') +
      (podeGerir ? '<button type="button" class="btn btn-primary btn-mini" style="margin-top:8px" data-acao="abrirEditarProjeto" data-arg="f-pcpInicio">' +
        esc(T('d.definirCronograma')) + '</button>' : '');
  } else {
    let obsPcp, corPcp;
    if (parado) { obsPcp = T('d.pcpParado', plural(Projeto.diasParadoAtual(p), 'x.dia', 'x.dias')); corPcp = 'var(--amber-ink)'; }
    else if (c.concluido) { obsPcp = T('d.pcpConcluido', br(c.fimPrevisto)); corPcp = 'var(--green)'; }
    else if (Projeto.pcpAtrasado(p)) { obsPcp = T('d.pcpAtrasado', plural(difDias(p.pcpFim, h), 'x.dia', 'x.dias')); corPcp = 'var(--rust)'; }
    else if (c.estouro > 0) { obsPcp = T('d.pcpEstouro', br(c.fimPrevisto), plural(c.estouro, 'x.dia', 'x.dias')); corPcp = 'var(--rust)'; }
    else { obsPcp = T('d.pcpProjecao', br(c.fimPrevisto), plural(c.duracaoTotal, 'x.dia', 'x.dias')); corPcp = 'var(--ink-dim)'; }
    $('janela-pcp').innerHTML = janela(
      esc(T('d.janelaPcp')) + ' <span class="dot dot-' + sitPcp + '" style="margin-left:4px" title="' + esc(SIT_LABEL(sitPcp)) + '"></span>',
      br(p.pcpInicio) + ' → ' + br(p.pcpFim), obsPcp, corPcp);
  }

  // --- janela da produção (começa no fim do PCP; avanço pelas OPs aprovadas) ---
  const stOps = Producao.estatisticas(opsDoProjeto(p.id));
  const sitProd = Producao.situacao(p, stOps, h);
  const corProd = { atrasada: 'var(--rust)', concluida: 'var(--green)', andamento: 'var(--violet)' }[sitProd] || 'var(--ink-dim)';
  let obsProd = T('prod.' + sitProd);
  if (sitProd === 'atrasada') obsProd += ' — ' + plural(Producao.diasAtraso(p, h), 'x.dia', 'x.dias');
  if (p.prodFim && p.entrega && p.prodFim > p.entrega) obsProd += ' · ' + T('d.prodDepoisEntrega', plural(difDias(p.entrega, p.prodFim), 'x.dia', 'x.dias'));
  const avanco = stOps.total
    ? '<div class="prod-avanco">' + [['fab.geral', stOps], ['area.caldeiraria', stOps.caldeiraria], ['area.usinagem', stOps.usinagem]].map(function (x) {
      return '<span><b>' + x[1].pct + '%</b> ' + esc(T(x[0])) + ' <span class="hint-inline">(' + x[1].aprovadas + '/' + x[1].total + ')</span></span>';
    }).join('') + (stOps.rnc ? '<span class="prod-rnc">' + esc(T('fab.comRnc', stOps.rnc)) + '</span>' : '') + '</div>'
    : '<div class="hint-inline">' + esc(T('d.semOps')) + '</div>';
  $('janela-producao').innerHTML = janela(esc(T('d.janelaProd')) + ' <span class="pill-prod prod-' + sitProd + '">' + esc(T('prod.' + sitProd)) + '</span>',
    p.pcpFim ? br(p.pcpFim) + ' → ' + br(p.prodFim) : '—', obsProd, corProd) + avanco;

  // --- entrega ---
  const dEnt = difDias(h, p.entrega);
  let obsEnt, corEnt;
  if (p.concluidoEm) {
    const dv = Projeto.desvio(p);
    obsEnt = dv > 0 ? T('d.entregue', br(p.concluidoEm), plural(dv, 'x.dia', 'x.dias'))
      : T('d.entregueAdiantado', br(p.concluidoEm), plural(Math.abs(dv), 'x.dia', 'x.dias'));
    corEnt = dv > 0 ? 'var(--rust)' : 'var(--green)';
  } else if (p.canceladoEm) { obsEnt = T('d.cancelado', br(p.canceladoEm)); corEnt = 'var(--ink-faint)'; }
  else if (dEnt < 0) { obsEnt = T('d.entregaAtraso', plural(-dEnt, 'x.dia', 'x.dias')); corEnt = 'var(--rust)'; }
  else {
    obsEnt = dEnt === 0 ? T('d.entregaHoje') : T('d.entregaFaltam', plural(dEnt, 'x.dia', 'x.dias'));
    corEnt = dEnt <= prefs.alerta ? 'var(--amber-ink)' : 'var(--ink-dim)';
  }
  $('janela-entrega').innerHTML = janela(esc(T('d.entregaProjeto')), br(p.entrega), obsEnt, corEnt);

  // --- informações gerais ---
  let info = linha(T('d.solicitacao'), br(p.dataSolicitacao)) +
    linha(T('d.tipoServico'), esc(p.tipoServico || '—')) +
    linha(T('d.om'), esc(p.om || '—')) +
    linha(T('d.tarefasConcluidas'), esc(T('d.deN', p.checklist.filter(function (i) { return i.done; }).length, p.checklist.length)));
  if (c.proxima && !parado) info += linha(T('d.proximaTarefa'), esc(c.proxima.t) + ' <span class="hint-inline">(' + br(c.proxima.fim) + ')</span>');
  const pausa = Projeto.pausaAtual(p);
  if (pausa) info += linha(T('d.paradoAgora'), br(pausa.inicio) + ' <span style="color:var(--amber-ink)">(' + esc(plural(Projeto.diasParadoAtual(p), 'x.dia', 'x.dias')) + ')</span>');
  const totalParado = Projeto.diasParadoTotal(p);
  if (totalParado > 0) info += linha(T('d.paradoTotal'), esc(plural(totalParado, 'x.dia', 'x.dias')));
  if (p.concluidoEm) info += linha(T('d.cicloTotal'), esc(plural(Projeto.ciclo(p), 'x.dia', 'x.dias')));
  $('detail-info').innerHTML = info;

  // --- ações: cancelar só existe depois de paralisar; planejador só cuida do checklist ---
  $('detail-btn-editar').style.display = podeGerir ? '' : 'none';
  $('detail-btn-excluir').style.display = podeGerir ? '' : 'none';
  function botao(classe, acao, rotulo) { return '<button type="button" class="btn ' + classe + '" data-acao="' + acao + '">' + esc(rotulo) + '</button>'; }
  let acoes = '';
  if (podeGerir) {
    if (parado) {
      acoes = botao('btn-success', 'retomarProjeto', T('d.retomar')) + botao('btn-danger', 'cancelarProjeto', T('d.cancelarProj')) +
        botao('btn-outline', 'abrirReagendar', T('d.reagendar'));
    } else if (Projeto.aberto(p)) {
      acoes = botao('btn-success', 'concluirProjeto', T('d.concluir')) + botao('btn-warn', 'paralisarProjeto', T('d.paralisar')) +
        botao('btn-outline', 'abrirReagendar', T('d.reagendar')) +
        (pr === 100 ? '<span class="nota-ok">' + esc(T('d.cronograma100')) + '</span>' : '<span class="hint-txt">' + esc(T('d.avisoCancelar')) + '</span>');
    } else {
      acoes = botao('btn-outline', 'reabrirProjeto', T('d.reabrir'));
    }
  }
  $('detail-actions').innerHTML = acoes;

  // --- histórico ---
  const evs = [];
  if (p.dataSolicitacao) evs.push({ d: p.dataSolicitacao, t: T('h.solicitado') });
  if (p.pcpInicio) evs.push({ d: p.pcpInicio, t: T('h.inicioPcp') });
  const nomeCampo = { pcpInicio: T('d.inicioPcp'), pcpFim: T('d.fimPcp'), prodFim: T('d.fimProd'), entrega: T('d.entregaCampo') };
  p.reagendamentos.forEach(function (r) {
    if (!r.em) return;
    evs.push({ d: r.em, t: T('h.movido', nomeCampo[r.campo] || r.campo, br(r.de), br(r.para)) +
      (r.motivo === 'edição' ? T('h.movidoEdicao') : '') + (r.por ? ' — ' + r.por : '') });
  });
  (p.paralisacoes || []).forEach(function (x) {
    evs.push({ d: x.inicio, t: T('h.paralisado', x.motivo ? ' — ' + x.motivo : '') });
    if (x.fim) evs.push({ d: x.fim, t: T('h.retomado', plural(difDias(x.inicio, x.fim), 'x.dia', 'x.dias')) });
  });
  p.checklist.forEach(function (it) { if (it.obs && it.obsEm) evs.push({ d: it.obsEm, t: T('h.obs', it.t) }); });
  if (p.concluidoEm) evs.push({ d: p.concluidoEm, t: T('h.entregue') });
  if (p.canceladoEm) evs.push({ d: p.canceladoEm, t: T('h.cancelado') });
  evs.sort(function (a, b) { return a.d.localeCompare(b.d); });
  $('detail-hist').innerHTML = '<h4>' + esc(T('d.historico')) + '</h4>' +
    evs.map(function (e) { return '<div class="ev"><b>' + br(e.d) + '</b> · ' + esc(e.t) + '</div>'; }).join('');

  // --- cronograma: a Gerência acompanha (só leitura); quem executa edita o checklist ---
  if (souGerencia()) { renderAcompanhamento(p); return; }
  $('detail-progress-bar').style.width = pr + '%';
  $('detail-progress-pct').textContent = pr + '%';
  // não redesenha a lista de tarefas enquanto alguém digita a duração de uma delas
  const editando = document.activeElement && document.activeElement.closest && document.activeElement.closest('#detail-checklist');
  if (!editando) {
    $('detail-checklist').innerHTML = c.itens.map(function (it) {
      const classePrev = it.situacao === 'atrasada' ? ' prev-atrasada' : (it.situacao === 'chegando' ? ' prev-chegando' : '');
      const temObs = !!(p.checklist[it.idx].obs || '').trim();
      return '<div class="crono-item ' + (it.done ? 'done' : '') + '">' +
        '<input type="checkbox" ' + (it.done ? 'checked' : '') + ' data-change="marcarItem" data-arg="' + it.idx + '" aria-label="' + esc(it.t) + '">' +
        '<span class="nome"><span class="dot dot-' + it.situacao + '" title="' + esc(SIT_LABEL(it.situacao)) + '"></span>' +
          '<span title="' + esc(it.t) + '">' + esc(it.t) + '</span></span>' +
        '<input class="dias" type="number" min="0" max="' + DIAS_MAX_TAREFA + '" value="' + it.dias + '" data-change="mudarDias" data-arg="' + it.idx + '" ' +
          (it.done ? 'disabled' : '') + ' aria-label="' + esc(T('cr.duracao') + ' — ' + it.t) + '">' +
        '<span class="data' + classePrev + '" title="' + esc(T('cr.deAte', br(it.inicio), br(it.fim))) + '">' + br(it.fim) + '</span>' +
        '<span class="data real">' + (it.done ? br(it.doneAt) : '—') + '</span>' +
        '<button type="button" class="obs-btn' + (temObs ? ' tem' : '') + '" data-acao="abrirObs" data-arg="' + it.idx + '" title="' +
          esc(temObs ? T('cr.obsVer') : T('cr.obsAdd')) + '" aria-label="' + esc(T('cr.obs') + ' — ' + it.t) + '">' + (temObs ? '📝' : '＋') + '</button>' +
        '<button type="button" class="rm" data-acao="removerItem" data-arg="' + it.idx + '" title="' + esc(T('cr.remover')) + '" aria-label="' + esc(T('cr.remover') + ' — ' + it.t) + '">✕</button></div>';
    }).join('');
  }

  const cont = { atrasada: 0, chegando: 0 };
  c.itens.forEach(function (i) { if (cont[i.situacao] != null) cont[i.situacao]++; });
  $('crono-resumo').innerHTML =
    '<span>' + esc(T('cr.termino')) + ': <b>' + br(c.fimPrevisto) + '</b></span>' +
    '<span>' + esc(T('cr.duracaoTotal')) + ': <b>' + c.duracaoTotal + '</b> ' + esc(T(c.duracaoTotal === 1 ? 'x.dia' : 'x.dias')) + '</span>' +
    (cont.atrasada ? '<span style="color:var(--rust)">' + esc(T('cr.atrasadas')) + ': <b>' + cont.atrasada + '</b></span>' : '') +
    (cont.chegando ? '<span style="color:var(--amber-ink)">' + esc(T('cr.vencendo')) + ': <b>' + cont.chegando + '</b></span>' : '');
  $('crono-alerta').innerHTML = (c.estouro > 0 && !parado)
    ? '<div class="crono-alerta">' + esc(T('cr.alertaEstouro', plural(c.estouro, 'x.dia', 'x.dias'), br(p.pcpFim))) + '</div>' : '';
}

// Toda mudança feita no detalhe passa por aqui.
function aplicar(mensagem) {
  renderDetalhe();
  renderProjetos();          // mantém a ordem usada pelo ↑/↓ coerente
  renderNotificacoes();
  if (mensagem) toast(mensagem);
  return persistir().catch(function () { /* persistir já avisou e desfez */ });
}

/* ------------------------------------------------------------ status */
function concluirProjeto() {
  const p = projetoAtual();
  confirmar(T('q.concluir', p.commessa, br(hoje())), { titulo: T('d.concluir'), textoOk: T('d.concluir') }).then(function (ok) {
    if (!ok || !buscarProjeto(p.id)) return;
    p.status = 'concluido'; p.concluidoEm = hoje(); p.canceladoEm = null;
    const aberta = Projeto.pausaAtual(p);
    if (aberta) aberta.fim = hoje();
    aplicar(T('t.entregue', plural(Projeto.ciclo(p), 'x.dia', 'x.dias')));
  });
}
/* Fluxo: em andamento → paralisado → cancelado. Retomar fecha o período
   e as datas do cronograma andam junto, porque dias parados não contam. */
function paralisarProjeto() {
  const p = projetoAtual();
  pedirTexto(T('q.paralisar', p.commessa, br(hoje())), {
    titulo: T('d.paralisar'), rotuloCampo: T('q.motivoRot'), placeholder: T('q.motivoPh'), textoOk: T('d.paralisar')
  }).then(function (motivo) {
    if (motivo === null || !buscarProjeto(p.id)) return;
    p.paralisacoes = p.paralisacoes || [];
    p.paralisacoes.push({ inicio: hoje(), fim: null, motivo: motivo.slice(0, 200) });
    p.status = 'paralisado';
    aplicar(T('t.paralisado'));
  });
}
function retomarProjeto() {
  const p = projetoAtual();
  const dias = Projeto.diasParadoAtual(p);
  confirmar(T('q.retomar', p.commessa, plural(dias, 'x.dia', 'x.dias')), { titulo: T('d.retomar'), textoOk: T('d.retomar') }).then(function (ok) {
    if (!ok || !buscarProjeto(p.id)) return;
    const aberta = Projeto.pausaAtual(p);
    if (aberta) aberta.fim = hoje();
    p.status = 'ativo';
    aplicar(T('t.retomado', plural(dias, 'x.dia', 'x.dias')));
  });
}
function cancelarProjeto() {
  const p = projetoAtual();
  if (p.status !== 'paralisado') { toast(T('d.avisoCancelar'), { tipo: 'erro' }); return; }
  confirmar(T('q.cancelar', p.commessa, plural(Projeto.diasParadoAtual(p), 'x.dia', 'x.dias')),
    { titulo: T('d.cancelarProj'), textoOk: T('d.cancelarProj'), perigo: true }).then(function (ok) {
    if (!ok || !buscarProjeto(p.id)) return;
    const aberta = Projeto.pausaAtual(p);
    if (aberta) aberta.fim = hoje();
    p.status = 'cancelado'; p.canceladoEm = hoje(); p.concluidoEm = null;
    aplicar(T('t.canceladoT'));
  });
}
function reabrirProjeto() {
  const p = projetoAtual();
  confirmar(T('q.reabrir', p.commessa), { titulo: T('d.reabrir'), textoOk: T('d.reabrir') }).then(function (ok) {
    if (!ok || !buscarProjeto(p.id)) return;
    p.status = 'ativo'; p.concluidoEm = null; p.canceladoEm = null;
    aplicar(T('t.reaberto'));
  });
}
function excluirProjeto() {
  if (!Auth.souGPouCoordenador()) return;
  const p = projetoAtual();
  confirmar(T('q.excluir', p.commessa), { titulo: T('btn.excluir'), textoOk: T('btn.excluir'), perigo: true }).then(function (ok) {
    if (!ok) return;
    const copia = JSON.parse(JSON.stringify(p));
    estado.projetos = estado.projetos.filter(function (x) { return x.id !== p.id; });
    irPara('projetos');
    redesenhar();
    toast(T('t.excluido', copia.commessa), { acao: { label: T('btn.desfazer'), fn: function () {
      if (buscarProjeto(copia.id)) return;
      estado.projetos.push(copia);
      redesenhar();
      toast(T('t.exclusaoDesfeita'));
      persistir().catch(function () {});
    } } });
    persistir().catch(function () {});
  });
}

/* --------------------------------------------------------- reagendar */
/* Reprogramar: quem decide é o GP (ou o gerente). O fim do PCP puxa junto o
   início da produção; o fim da produção só muda se for escolhido aqui. */
function abrirReagendar() {
  const p = projetoAtual();
  if (Projeto.aguardandoCronograma(p)) { abrirEditarProjeto('f-pcpInicio'); return; }
  $('reagendar-box').style.display = 'flex';
  $('reagendar-campo').value = Projeto.status(p) === 'atrasado' ? 'entrega' : 'pcpFim';
  atualizarDataReagendar();
  $('reagendar-data').focus();
}
function atualizarDataReagendar() {
  const p = projetoAtual();
  if (p) $('reagendar-data').value = p[$('reagendar-campo').value] || '';
}
export function fecharReagendar() { const box = $('reagendar-box'); if (box) box.style.display = 'none'; }
export function reagendarAberto() { return $('reagendar-box').style.display === 'flex'; }
function confirmarReagendar() {
  const p = projetoAtual();
  const campo = Projeto.CAMPOS_DATA.indexOf($('reagendar-campo').value) >= 0 ? $('reagendar-campo').value : 'pcpFim';
  const nova = $('reagendar-data').value;
  const nomes = { pcpInicio: T('d.inicioPcp'), pcpFim: T('d.fimPcp'), prodFim: T('d.fimProd'), entrega: T('d.entregaCampo') };
  if (!nova) { toast(T('t.escolhaData'), { tipo: 'erro' }); return; }
  const novas = { pcpInicio: p.pcpInicio, pcpFim: p.pcpFim, prodFim: p.prodFim, entrega: p.entrega };
  novas[campo] = nova;
  const v = Projeto.validarCronograma(novas);
  if (!v.ok) { toast(v.msg, { tipo: 'erro' }); return; }
  const antigo = p[campo];
  if (antigo === nova) { fecharReagendar(); return; }
  Projeto.registrarReprogramacao(p, { [campo]: nova }, Auth.nomeExibicao(), 'reagendamento');
  p[campo] = nova;
  fecharReagendar();
  Projeto.avisosCronograma(p).forEach(function (a) { toast(a, { tipo: 'erro' }); });
  aplicar(T('t.novaData', nomes[campo], br(nova), br(antigo))).then(function () {
    // notificação 3: o técnico fica sabendo que as datas mudaram
    if (p.responsavelUid) Auth.criarNotificacao(p.responsavelUid, 'datas', T('notif.datasCampo', p.commessa, nomes[campo], br(nova)), p.id);
  });
}

/* ---------------------------------------------------------- checklist */
function marcarItem(_valor, _b, el) {
  const p = projetoAtual(), i = Number(el.dataset.arg), it = p && p.checklist[i];
  if (!it) return;
  it.done = el.checked;
  it.doneAt = it.done ? hoje() : null;
  el.blur();
  aplicar();
}
function mudarDias(valor, _b, el) {
  const p = projetoAtual(), i = Number(el.dataset.arg);
  if (!p || !p.checklist[i]) return;
  p.checklist[i].dias = Math.min(DIAS_MAX_TAREFA, Math.max(0, Math.round(Number(valor)) || 0));
  el.blur();
  aplicar();
}
function addItemChecklist() {
  const input = $('detail-checklist-new'), t = input.value.trim().slice(0, 160);
  const p = projetoAtual();
  if (!t || !p) { input.focus(); return; }
  const dias = Math.min(DIAS_MAX_TAREFA, Math.max(0, Number($('detail-checklist-dias').value) || 0));
  p.checklist.push({ t: t, dias: dias, done: false, doneAt: null, obs: '', obsEm: null });
  input.value = '';
  aplicar();
  input.focus();
}
function removerItem(idx) {
  const p = projetoAtual(), i = Number(idx), it = p && p.checklist[i];
  if (!it) return;
  const id = p.id, copia = JSON.parse(JSON.stringify(it));
  p.checklist.splice(i, 1);
  aplicar();
  toast(T('t.tarefaRemovida'), { acao: { label: T('btn.desfazer'), fn: function () {
    const atual = buscarProjeto(id);
    if (!atual) return;
    atual.checklist.splice(Math.min(i, atual.checklist.length), 0, copia);
    if (estado.idDetalhe === id) aplicar(); else persistir().catch(function () {});
  } } });
}

/* -------------------------------------------------------- observação */
let obs = null;   // { id, idx }
function abrirObs(idx) {
  const p = projetoAtual(), i = Number(idx), it = p && p.checklist[i];
  if (!it) return;
  obs = { id: p.id, idx: i };
  $('obs-tarefa').textContent = it.t;
  $('obs-texto').value = it.obs || '';
  $('obs-apagar').style.display = (it.obs || '').trim() ? 'inline-block' : 'none';
  abrirModal('modal-obs', { foco: 'obs-texto', aoFechar: function () { obs = null; } });
}
function salvarObs(apagar) {
  if (!obs) return;
  const p = buscarProjeto(obs.id), it = p && p.checklist[obs.idx];
  if (!it) { fecharModal('modal-obs'); return; }
  const txt = apagar ? '' : $('obs-texto').value.trim().slice(0, 2000);
  it.obs = txt;
  it.obsEm = txt ? hoje() : null;
  fecharModal('modal-obs');
  aplicar(T(txt ? 'cr.obsSalva' : 'cr.obsApagada')).then(function () {
    // observação de GP/coordenador avisa quem cuida do projeto
    if (txt && p.responsavelUid && Auth.souGPouCoordenador()) {
      Auth.criarNotificacao(p.responsavelUid, 'observacao', T('notif.observacao', it.t, p.commessa), p.id);
    }
  });
}

/* --------------------------------------------------------------- chat */
let pararChat = null, chatDoProjeto = null;
export function atualizarInscricaoChat() {
  const alvo = Auth.logado() ? estado.idDetalhe : null;
  if (alvo === chatDoProjeto && pararChat) return;
  if (pararChat) { pararChat(); pararChat = null; }
  chatDoProjeto = alvo;
  const lista = $('detail-chat-lista');
  if (lista) lista.innerHTML = '';
  if (alvo) pararChat = Auth.escutarChat(alvo, renderChat);
}
export function pararInscricaoChat() {
  if (pararChat) { pararChat(); pararChat = null; }
  chatDoProjeto = null;
}
function renderChat(msgs) {
  const el = $('detail-chat-lista');
  if (!el) return;
  if (msgs === null) { el.innerHTML = '<div class="hint-txt">' + esc(T('chat.indisponivel')) + '</div>'; return; }
  const meuUid = Auth.uid();
  const noFim = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.innerHTML = msgs.length ? msgs.map(function (m) {
    const meu = m.autorUid === meuUid;
    const quando = m.criadoEm && dataDoInstante(m.criadoEm) ? br(dataDoInstante(m.criadoEm)) + ' ' + horaDoInstante(m.criadoEm) : '';
    return '<div class="chat-msg' + (meu ? ' meu' : '') + '">' +
      '<div class="chat-autor">' + esc(m.autorNome || '—') + (quando ? ' <span class="chat-quando">' + esc(quando) + '</span>' : '') + '</div>' +
      '<div class="chat-texto">' + esc(m.texto) + '</div></div>';
  }).join('') : '<div class="hint-txt">' + esc(T('chat.vazio')) + '</div>';
  if (noFim || msgs.length && msgs[msgs.length - 1].autorUid === meuUid) el.scrollTop = el.scrollHeight;
}
function enviarChat() {
  const input = $('detail-chat-texto');
  const txt = input.value.trim().slice(0, 2000);
  if (!txt || !estado.idDetalhe) return;
  input.value = '';
  const p = projetoAtual();
  Auth.enviarMensagemChat(estado.idDetalhe, txt).then(function () {
    // notificação 13: GP e técnico do projeto (menos quem escreveu)
    if (p) Auth.notificarVarios([p.gpUid, p.responsavelUid], 'chat', T('notif.chat', p.commessa, Auth.nomeExibicao(), txt.slice(0, 200)), p.id);
  }).catch(function (e) {
    input.value = txt;
    toast(T('chat.erro'), { tipo: 'erro' });
    console.warn(e);
  });
}

document.addEventListener('change', function (e) {
  if (e.target && e.target.id === 'reagendar-campo') atualizarDataReagendar();
});

registrarAcoes({
  concluirProjeto: concluirProjeto, paralisarProjeto: paralisarProjeto, retomarProjeto: retomarProjeto,
  cancelarProjeto: cancelarProjeto, reabrirProjeto: reabrirProjeto, excluirProjeto: excluirProjeto,
  abrirReagendar: abrirReagendar, fecharReagendar: fecharReagendar, confirmarReagendar: confirmarReagendar,
  marcarItem: marcarItem, mudarDias: mudarDias, addItemChecklist: addItemChecklist, removerItem: removerItem,
  abrirObs: abrirObs, salvarObs: function () { salvarObs(false); }, apagarObs: function () { salvarObs(true); },
  fecharObs: function () { fecharModal('modal-obs'); },
  enviarChat: enviarChat
});
