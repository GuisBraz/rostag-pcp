/* ---------------------------------------------------------------------------
   App — gravação, redesenho e elementos comuns (indicador de salvamento,
   menus suspensos).
--------------------------------------------------------------------------- */
import { estado } from '../estado.js';
import * as Store from '../dados/store.js';
import * as Auth from '../dados/auth.js';
import * as Cronograma from '../dominio/cronograma.js';
import { T, plural } from '../i18n/index.js';
import { bytes } from '../nucleo/fmt.js';
import { $, $$, registrarAcoes } from './dom.js';
import { toast } from './toast.js';
import { abaAtual } from './rota.js';
import { renderPainel } from './painel.js';
import { renderProjetos } from './projetos.js';
import { refreshOpcoes } from './filtros.js';
import { renderLinha } from './linha.js';
import { renderDetalhe } from './detalhe.js';
import { renderNotificacoes } from './notificacoes.js';

/* ---------------------------------------------------------- salvamento */
let estadoChip = 'ok';   // ok · salvando · erro · offline
let chipTimer = null;

export function atualizarChip(novo) {
  if (novo) estadoChip = novo;
  const chip = $('save-chip');
  if (!chip) return;
  clearTimeout(chipTimer);
  chip.classList.toggle('warn', estadoChip === 'erro' || estadoChip === 'offline');
  chip.classList.toggle('salvando', estadoChip === 'salvando');
  if (estadoChip === 'salvando') { chip.textContent = T('chip.salvando'); chip.title = ''; return; }
  if (estadoChip === 'erro') { chip.textContent = T('chip.erro'); chip.title = T('chip.erroT'); return; }
  if (estadoChip === 'offline') { chip.textContent = T('chip.offline'); chip.title = T('chip.offlineT'); return; }
  chip.title = T('chip.salvoNuvemT');
  if (novo === 'ok') {
    chip.textContent = '✓ ' + T('chip.flash');
    chipTimer = setTimeout(function () { chip.textContent = T('chip.salvoNuvem'); }, 1600);
  } else {
    chip.textContent = T('chip.salvoNuvem');
  }
}

// Grava o estado local. As telas mudam os objetos em estado.projetos e
// chamam persistir(); só o que mudou vai para o servidor. Se o servidor
// recusar, a tela volta para a última versão confirmada e avisa.
export function persistir() {
  Cronograma.invalidar();
  if (!Auth.podeEntrar()) return Promise.resolve(false);
  atualizarChip(navigator.onLine === false ? 'offline' : 'salvando');
  return Store.salvar(estado.projetos).then(function (n) {
    atualizarChip(navigator.onLine === false ? 'offline' : 'ok');
    atualizarInfoArmazenamento();
    return n;
  }).catch(function (e) {
    console.error('gravação recusada:', e);
    atualizarChip('erro');
    toast(e && e.code === 'permission-denied' ? T('t.semPermissao') : T('t.erroSalvar'), { tipo: 'erro' });
    estado.projetos = Store.copiaServidor();
    Cronograma.invalidar();
    redesenhar();
    throw e;
  });
}

// Redesenha só a tela visível; as outras se atualizam quando a rota muda.
export function renderTudo() {
  const a = abaAtual();
  if (a === 'projetos') renderProjetos();
  if (a === 'linha') renderLinha();
  if (a === 'painel') renderPainel(); else renderNotificacoes();
  atualizarInfoArmazenamento();
}

// Depois de dados novos (do servidor ou desfeitos): tudo que depende da lista.
export function redesenhar() {
  refreshOpcoes();
  renderTudo();
  if (estado.idDetalhe) renderDetalhe();
}

export function atualizarInfoArmazenamento() {
  const el = $('storage-info');
  if (!el) return;
  const qtd = plural(estado.projetos.length, 'lista.projeto', 'lista.projetos');
  el.textContent = T('cfg.dadosInfoNuvem', qtd, bytes(Store.tamanhoAproximado(estado.projetos)));
}

/* ------------------------------------------------------------- popups */
export function fecharPopups() {
  $$('.filter-panel.open, .notif-panel.open, .profile-menu.open').forEach(function (p) { p.classList.remove('open'); });
  $$('[aria-expanded="true"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
}
export function alternarPopup(id, gatilho) {
  const painel = $(id);
  const aberto = painel.classList.contains('open');
  fecharPopups();
  if (!aberto) {
    painel.classList.add('open');
    if (gatilho) gatilho.setAttribute('aria-expanded', 'true');
  }
  return !aberto;
}

document.addEventListener('click', function (e) {
  if (!e.target.closest('.actionbar')) $$('.filter-panel.open').forEach(function (p) { p.classList.remove('open'); });
  if (!e.target.closest('#sidebar-profile') && !e.target.closest('#profile-menu')) $('profile-menu').classList.remove('open');
  if (!e.target.closest('#sidebar-equipe')) $('equipe-menu').classList.remove('open');
  if (!e.target.closest('.sino-wrap')) $('notif-panel').classList.remove('open');
});

window.addEventListener('online', function () { if (estadoChip === 'offline') atualizarChip('ok'); });
window.addEventListener('offline', function () { atualizarChip('offline'); });

registrarAcoes({
  toggleProfileMenu: function (_a, _b, el) { alternarPopup('profile-menu', el); },
  pularConteudo: function () { const m = $('conteudo'); m.setAttribute('tabindex', '-1'); m.focus(); }
});

export function avisoErro(e, chavePadrao) {
  console.error(e);
  toast(T(chavePadrao || 'cfg.equipeErroAcao') + (e && e.code ? ' (' + e.code + ')' : ''), { tipo: 'erro' });
}
