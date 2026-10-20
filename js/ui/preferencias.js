/* ---------------------------------------------------------------------------
   Preferências: tema, idioma, alertas, conta e abas de Configurações.
--------------------------------------------------------------------------- */
import { prefs, salvarPrefsLocais, lembrarTema, CAMPOS_PERFIL, temaValido } from '../nucleo/prefs.js';
import * as Auth from '../dados/auth.js';
import * as Cronograma from '../dominio/cronograma.js';
import { VERSAO } from '../dominio/constantes.js';
import * as Projeto from '../dominio/projeto.js';
import * as Papeis from '../dominio/papeis.js';
import { T, codigoIdioma } from '../i18n/index.js';
import { estado } from '../estado.js';
import { $, $$, registrarAcoes } from './dom.js';
import { toast } from './toast.js';
import { renderTudo, atualizarInfoArmazenamento, atualizarChip, redesenhar } from './app.js';
import { aplicarRota } from './rota.js';
import { renderAtalhos } from './atalhos.js';
import { renderEquipe } from './equipe.js';
import { renderPainel } from './painel.js';
import { renderDetalhe } from './detalhe.js';
import { atualizarBotaoRecolher } from './sidebar.js';

/* ------------------------------------------------------------------ tema */
// Fonte própria de cada identidade (Google Fonts), carregada só quando usada.
const FONTE_TEMA = {
  pastel: 'Nunito:wght@400;600;700;800',
  tecnico: 'IBM+Plex+Sans:wght@400;500;600;700',
  st: 'Space+Grotesk:wght@500;600;700',
  grego: 'Cinzel:wght@500;600;700',
  prata: 'Exo+2:wght@500;600;700'
};
// Cor da barra do navegador (celular) em cada tema.
const COR_BARRA = { claro: '#0E1B3D', escuro: '#06090F', pastel: '#1B2A4A', tecnico: '#0F172A', st: '#0A0A0A', grego: '#F2EBDA', prata: '#23282E' };

function carregarFonte(t) {
  const familia = FONTE_TEMA[t];
  if (!familia || document.getElementById('fonte-tema-' + t)) return;
  const l = document.createElement('link');
  l.id = 'fonte-tema-' + t;
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=' + familia + '&display=swap';
  document.head.appendChild(l);
}

export function aplicarTema() {
  const t = temaValido(prefs.tema);
  carregarFonte(t);
  document.documentElement.setAttribute('data-tema', t);
  $$('.palette-option').forEach(function (b) {
    b.classList.toggle('selected', b.dataset.arg === t);
    b.setAttribute('aria-pressed', b.dataset.arg === t ? 'true' : 'false');
  });
  const btn = $('tema-btn');
  if (btn) btn.textContent = t === 'escuro' ? '☀' : '◐';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', COR_BARRA[t]);
  lembrarTema(t);
}
export function definirTema(t) {
  const novo = temaValido(t);
  // o botão ◐ alterna entre o escuro e o último tema claro escolhido
  if (novo === 'escuro' && prefs.tema !== 'escuro') prefs.temaClaro = prefs.tema;
  prefs.tema = novo;
  aplicarTema();
  salvarPrefsLocais();
  sincronizarPerfil({ tema: prefs.tema });
  if (estado.carregado) renderPainel();
}

export function alternarTema() { definirTema(prefs.tema === 'escuro' ? temaValido(prefs.temaClaro) : 'escuro'); }

/* ---------------------------------------------------------------- idioma */
// Percorre o HTML estático trocando textos, placeholders e títulos.
export function aplicarIdioma() {
  document.documentElement.setAttribute('lang', codigoIdioma());
  $$('[data-i18n]').forEach(function (el) {
    const v = T(el.dataset.i18n);
    // só chaves marcadas como HTML (texto fixo do dicionário, nunca dado de usuário)
    if (el.dataset.i18nHtml === '1') el.innerHTML = v; else el.textContent = v;
  });
  $$('[data-i18n-ph]').forEach(function (el) { el.placeholder = T(el.dataset.i18nPh); });
  $$('[data-i18n-title]').forEach(function (el) {
    const v = T(el.dataset.i18nTitle);
    el.title = v;
    if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', v);
  });
}
export function definirIdioma(id) {
  prefs.idioma = id === 'en' ? 'en' : 'pt';
  salvarPrefsLocais();
  sincronizarPerfil({ idioma: prefs.idioma });
  aplicarIdioma();
  aplicarPrefs();
  renderAtalhos();
  atualizarChip();
  aplicarRota();          // título e subtítulo da página seguem o idioma
  redesenhar();
}

/* ------------------------------------------------------------ preferências */
function sincronizarPerfil(campos) {
  if (!Auth.logado()) return;
  Auth.salvarPerfil(campos).catch(function (e) { console.warn('preferência não salva na conta:', e && e.code); });
}

export function aplicarPrefs() {
  $('cfg-alerta').value = String(prefs.alerta);
  $('cfg-alertaTarefa').value = String(prefs.alertaTarefa);
  $('cfg-fimDeSemana').value = prefs.fimDeSemana;
  $('cfg-idioma').value = prefs.idioma;
  const nome = prefs.nome || Auth.nomeExibicao();
  $('cfg-nome').value = nome;
  const user = Auth.usuarioAtual();
  $('cfg-email').value = user ? (user.email || '') : '';
  $('sidebar').classList.toggle('collapsed', !!prefs.sidebarRecolhida);
  atualizarBotaoRecolher(!!prefs.sidebarRecolhida);
  $('sobre-versao').textContent = T('cfg.versao', VERSAO);
  renderChecklistInfo();
  atualizarInfoArmazenamento();
}

// Bloco do checklist padrão na aba Geral (atualiza quando a lista muda).
export function renderChecklistInfo() {
  const lista = Projeto.listaPadrao(estado.checklistPadrao && estado.checklistPadrao.itens);
  const cp = estado.checklistPadrao;
  $('checklist-bloco').style.display = Papeis.gereProjetos(Auth.papel()) ? '' : 'none';
  $('checklist-info').textContent = T('cfg.checklistNota', lista.length, lista[0] ? lista[0].t : '—', lista.length ? lista[lista.length - 1].t : '—') +
    (cp && cp.atualizadoEm ? ' ' + T('ckp.ultima', cp.porNome || '—', new Date(cp.atualizadoEm).toLocaleDateString(codigoIdioma())) : '');
}

// Alertas e fim de semana: mudam na hora (change dos selects).
function salvarPrefsGerais() {
  ['alerta', 'alertaTarefa'].forEach(function (k) {
    const n = Number($('cfg-' + k).value);
    if (n > 0) prefs[k] = n;
  });
  prefs.fimDeSemana = $('cfg-fimDeSemana').value === 'sim' ? 'sim' : 'nao';
  salvarPrefsLocais();
  sincronizarPerfil({ alerta: prefs.alerta, alertaTarefa: prefs.alertaTarefa, fimDeSemana: prefs.fimDeSemana });
  Cronograma.invalidar();
  renderTudo();
  if (estado.idDetalhe) renderDetalhe();
  toast(T('t.prefs'));
}

function salvarConta() {
  const nome = $('cfg-nome').value.trim().slice(0, 60);
  if (!nome) { toast(T('cfg.nomeVazio'), { tipo: 'erro' }); $('cfg-nome').focus(); return; }
  prefs.nome = nome;
  salvarPrefsLocais();
  aplicarPrefs();
  if (!Auth.logado()) return;
  const campos = {};
  CAMPOS_PERFIL.forEach(function (k) { campos[k] = prefs[k]; });
  Auth.salvarPerfil(campos).then(function () { toast(T('t.prefs')); })
    .catch(function (e) { console.warn(e); toast(T('t.erroSalvar'), { tipo: 'erro' }); });
}

export function toggleSidebar() {
  prefs.sidebarRecolhida = !$('sidebar').classList.contains('collapsed');
  $('sidebar').classList.toggle('collapsed', prefs.sidebarRecolhida);
  atualizarBotaoRecolher(prefs.sidebarRecolhida);
  salvarPrefsLocais();
}

/* --------------------------------------------------- abas de configurações */
export function abaConfig(k) {
  $$('.settings-tab-btn[data-stab]').forEach(function (b) {
    const ativo = b.dataset.stab === k;
    b.classList.toggle('active', ativo);
    b.setAttribute('aria-selected', ativo ? 'true' : 'false');
  });
  $$('.settings-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'stab-' + k); });
  if (k === 'atalhos') renderAtalhos();
  if (k === 'equipe') renderEquipe();
}

registrarAcoes({
  definirTema: function (t) { definirTema(t); },
  alternarTema: function () { alternarTema(); },
  definirIdioma: function (valor) { definirIdioma(valor); },
  salvarPrefs: function () { salvarPrefsGerais(); },
  salvarConta: function () { salvarConta(); },
  toggleSidebar: function () { toggleSidebar(); },
  abaConfig: function (k) { abaConfig(k); }
});
