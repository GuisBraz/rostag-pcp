/* ---------------------------------------------------------------------------
   Pedidos do GP à Gerência — paralisar ou cancelar um projeto — e a fila de
   pendências da Gerência. O GP pede com um motivo (o projeto não muda até a
   resposta); a Gerência aprova (aplica) ou recusa (com motivo). As duas
   pontas recebem notificação.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto } from '../estado.js';
import { esc, br, hoje, dataDoInstante } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Projeto from '../dominio/projeto.js';
import * as Papeis from '../dominio/papeis.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes } from './dom.js';
import { abrirModal, confirmar, pedirTexto } from './modal.js';
import { toast } from './toast.js';
import { persistir, redesenhar } from './app.js';
import { irPara } from './rota.js';

function souGerente() { return Papeis.ehGerente(Auth.papel()); }
function gravar(msg) {
  redesenhar();
  if ($('modal-pendencias').classList.contains('open')) renderPendencias();
  if (msg) toast(msg);
  // persistir já avisa e desfaz se o servidor recusar
  return persistir().then(function () { return true; }, function () { return false; });
}
export function pendentes() {
  return estado.projetos.filter(function (p) { return Projeto.pedidoPendente(p) && Projeto.aberto(p); })
    .sort(function (a, b) { return String(a.pedido.em || '').localeCompare(String(b.pedido.em || '')); });
}

/* ------------------------------------------------------------- o GP pede */
export function pedir(p, tipo) {
  if (!p || Projeto.pedidoPendente(p)) return;
  pedirTexto(T('ped.q.' + tipo, p.commessa), {
    titulo: T('ped.titulo.' + tipo), rotuloCampo: T('ped.motivoRot'), placeholder: T('q.motivoPh'), textoOk: T('ped.enviar')
  }).then(function (motivo) {
    if (motivo === null || !buscarProjeto(p.id)) return;
    if (!motivo) { toast(T('ped.semMotivo'), { tipo: 'erro' }); return; }
    p.pedido = { tipo: tipo, motivo: motivo.slice(0, 200), porUid: Auth.uid(), porNome: Auth.nomeExibicao(), em: new Date().toISOString() };
    gravar(T('ped.enviado')).then(function (ok) {
      if (!ok) return;
      Auth.uidsGerentes().then(function (g) {
        Auth.notificarVarios(g, 'pedido', T('notif.pedido.' + tipo, p.commessa, Auth.nomeExibicao(), motivo.slice(0, 200)), p.id);
      });
    });
  });
}
export function desistir(p) {
  if (!p || !Projeto.pedidoPendente(p)) return;
  confirmar(T('ped.qDesistir', T('ped.tipo.' + p.pedido.tipo), p.commessa), { titulo: T('ped.desistir'), textoOk: T('ped.desistir') }).then(function (ok) {
    if (!ok || !buscarProjeto(p.id)) return;
    p.pedido = null;
    gravar(T('ped.desistiu'));
  });
}

/* ----------------------------------------- a Gerência aprova ou recusa */
// Paralisar: abre o período de parada. Cancelar: fecha a parada e cancela.
export function aplicarParalisar(p, motivo) {
  p.paralisacoes = p.paralisacoes || [];
  p.paralisacoes.push({ inicio: hoje(), fim: null, motivo: String(motivo || '').slice(0, 200) });
  p.status = 'paralisado';
}
export function aplicarCancelar(p, motivo) {
  const aberta = Projeto.pausaAtual(p);
  if (aberta) aberta.fim = hoje();
  else {
    // cancelar sem parada antes: registra a parada no mesmo dia (o histórico fica coerente)
    p.paralisacoes = p.paralisacoes || [];
    p.paralisacoes.push({ inicio: hoje(), fim: hoje(), motivo: String(motivo || '').slice(0, 200) });
  }
  p.status = 'cancelado'; p.canceladoEm = hoje(); p.concluidoEm = null;
  p.motivoCancelamento = String(motivo || '').slice(0, 200);
}

export function aprovar(p) {
  const ped = Projeto.pedidoPendente(p);
  if (!ped || !souGerente()) return;
  confirmar(T('ped.qAprovar.' + ped.tipo, p.commessa, ped.porNome || '—', ped.motivo), {
    titulo: T('ped.aprovar'), textoOk: T('ped.aprovar'), perigo: ped.tipo === 'cancelar'
  }).then(function (ok) {
    if (!ok || !buscarProjeto(p.id)) return;
    if (ped.tipo === 'paralisar') aplicarParalisar(p, ped.motivo); else aplicarCancelar(p, ped.motivo);
    p.pedido = null;
    gravar(T('ped.aprovado.' + ped.tipo, p.commessa)).then(function (ok2) {
      if (ok2 && ped.porUid) Auth.criarNotificacao(ped.porUid, 'pedidoAprovado', T('notif.pedidoAprovado.' + ped.tipo, p.commessa, Auth.nomeExibicao()), p.id);
    });
  });
}
export function recusar(p) {
  const ped = Projeto.pedidoPendente(p);
  if (!ped || !souGerente()) return;
  pedirTexto(T('ped.qRecusar', T('ped.tipo.' + ped.tipo), p.commessa), {
    titulo: T('ped.recusar'), rotuloCampo: T('ped.motivoRot'), placeholder: T('ped.recusarPh'), textoOk: T('ped.recusar')
  }).then(function (motivo) {
    if (motivo === null || !buscarProjeto(p.id)) return;
    if (!motivo) { toast(T('ped.semMotivo'), { tipo: 'erro' }); return; }
    p.pedido = null;
    gravar(T('ped.recusado')).then(function (ok) {
      if (ok && ped.porUid) Auth.criarNotificacao(ped.porUid, 'pedidoRecusado', T('notif.pedidoRecusado', T('ped.tipo.' + ped.tipo), p.commessa, Auth.nomeExibicao(), motivo.slice(0, 200)), p.id);
    });
  });
}

// Faixa no detalhe do projeto enquanto há pedido.
export function htmlFaixaPedido(p) {
  const ped = Projeto.pedidoPendente(p);
  if (!ped) return '';
  const quem = T('ped.faixa', T('ped.tipo.' + ped.tipo), ped.porNome || '—', ped.em ? br(dataDoInstante(ped.em)) : '—');
  let botoes = '';
  if (souGerente()) {
    botoes = '<button type="button" class="btn btn-success btn-mini" data-acao="aprovarPedido" data-arg="' + esc(p.id) + '">' + esc(T('ped.aprovar')) + '</button>' +
      '<button type="button" class="btn btn-danger btn-mini" data-acao="recusarPedido" data-arg="' + esc(p.id) + '">' + esc(T('ped.recusar')) + '</button>';
  } else if (ped.porUid === Auth.uid()) {
    botoes = '<button type="button" class="btn btn-outline btn-mini" data-acao="desistirPedido" data-arg="' + esc(p.id) + '">' + esc(T('ped.desistir')) + '</button>';
  }
  return '<div class="faixa-pedido"><div><b>' + esc(T('ped.aguardando')) + '</b> ' + esc(quem) +
    '<div class="hint-txt">' + esc(T('ped.motivo', ped.motivo)) + '</div></div><div class="faixa-pedido-botoes">' + botoes + '</div></div>';
}

/* ------------------------------------------------ fila de pendências */
export function renderPendencias() {
  const lista = pendentes();
  $('pend-resumo').textContent = lista.length ? T('pend.resumo', lista.length) : T('pend.vazio');
  $('pend-lista').innerHTML = lista.map(function (p) {
    const ped = p.pedido;
    return '<div class="card panel-pad pend-card pend-' + esc(ped.tipo) + '">' +
      '<div class="pend-topo"><span class="pill-prod ' + (ped.tipo === 'cancelar' ? 'prod-atrasada' : 'prod-parada') + '">' + esc(T('ped.tipo.' + ped.tipo)) + '</span>' +
        '<b class="mono">' + esc(p.commessa) + '</b><span class="hint-txt">' + esc(p.descricao || '') + '</span></div>' +
      '<div class="pend-motivo">' + esc(ped.motivo) + '</div>' +
      '<div class="hint-txt">' + esc(T('pend.porEm', ped.porNome || '—', ped.em ? br(dataDoInstante(ped.em)) : '—')) +
        (Projeto.status(p) === 'paralisado' ? ' · ' + esc(T('pend.paradoDesde', plural0(Projeto.diasParadoAtual(p)))) : '') + '</div>' +
      '<div class="pend-acoes">' +
        '<button type="button" class="btn btn-success btn-mini" data-acao="aprovarPedido" data-arg="' + esc(p.id) + '">' + esc(T('ped.aprovar')) + '</button>' +
        '<button type="button" class="btn btn-danger btn-mini" data-acao="recusarPedido" data-arg="' + esc(p.id) + '">' + esc(T('ped.recusar')) + '</button>' +
        '<button type="button" class="link-btn" data-acao="pendVerProjeto" data-arg="' + esc(p.id) + '">' + esc(T('rnc.verProjeto')) + '</button>' +
      '</div></div>';
  }).join('');
}
function plural0(n) { return n + ' ' + T(n === 1 ? 'x.dia' : 'x.dias'); }

function abrirPendencias() {
  renderPendencias();
  abrirModal('modal-pendencias');
}

function comProjeto(fn) { return function (id) { const p = buscarProjeto(id); if (p) fn(p); }; }
registrarAcoes({
  abrirPendencias: abrirPendencias,
  aprovarPedido: comProjeto(aprovar),
  recusarPedido: comProjeto(recusar),
  desistirPedido: comProjeto(desistir),
  pendVerProjeto: function (id) {
    const m = $('modal-pendencias');
    if (m.classList.contains('open')) m.querySelector('.modal-close').click();
    irPara('projetos', id);
  }
});
