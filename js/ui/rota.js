/* ---------------------------------------------------------------------------
   Rota por hash (#/projetos/p_123) — recarregar mantém a tela e o projeto.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto } from '../estado.js';
import { T } from '../i18n/index.js';
import { $, $$, registrarAcoes } from './dom.js';
import { fecharPopups } from './app.js';
import { renderPainel } from './painel.js';
import { renderProjetos } from './projetos.js';
import { renderLinha } from './linha.js';
import { renderDetalhe, fecharReagendar, atualizarInscricaoChat } from './detalhe.js';
import { abaConfig } from './preferencias.js';
import { renderFabrica, renderRnc } from './fabrica.js';
import { renderTelaNotificacoes } from './notificacoes.js';
import { renderCarga } from './carga.js';
import * as Auth from '../dados/auth.js';
import * as Papeis from '../dominio/papeis.js';

const PAGINAS = { painel: 1, projetos: 1, linha: 1, fabrica: 1, carga: 1, rnc: 1, notificacoes: 1, config: 1 };

// Telas que cada cargo usa. Programadores: painel, linha do tempo, Fábrica
// e Carga (sem a lista de projetos). CQ: painel de indicadores, Fábrica e RNC.
export function abaPermitida(aba) {
  const papel = Auth.papel();
  if (aba === 'config' || aba === 'fabrica' || aba === 'notificacoes') return true;
  if (aba === 'rnc') return Papeis.veRnc(papel) || Papeis.ehCQ(papel);
  if (aba === 'painel' && Papeis.ehCQ(papel)) return true;
  if (aba === 'carga') return Papeis.veCarga(papel);
  if (aba === 'painel' || aba === 'linha') return Papeis.leProjetos(papel);
  return Papeis.veProjetos(papel);
}
export function abaInicial() { const p = Auth.papel(); return Papeis.leProjetos(p) || Papeis.ehCQ(p) ? 'painel' : 'fabrica'; }

export function irPara(aba, arg) {
  const nova = '#/' + aba + (arg ? '/' + encodeURIComponent(arg) : '');
  if (location.hash === nova) aplicarRota(); else location.hash = nova;
}

export function abaAtual() {
  const p = document.querySelector('.tabpanel.active');
  return p ? p.id.replace('tab-', '') : 'painel';
}

export function aplicarRota() {
  const partes = (location.hash || '#/painel').replace(/^#\/?/, '').split('/');
  let aba = partes[0] || abaInicial();
  if (!PAGINAS[aba] || !abaPermitida(aba)) aba = abaInicial();
  let arg = null;
  try { arg = partes[1] ? decodeURIComponent(partes[1]) : null; } catch (e) { arg = null; }

  $$('.side-item').forEach(function (b) {
    const ativo = b.dataset.tab === aba;
    b.classList.toggle('active', ativo);
    if (ativo) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('gear-btn').classList.toggle('active', aba === 'config');
  $$('.tabpanel').forEach(function (p) { p.classList.remove('active'); });
  $('tab-' + aba).classList.add('active');
  $('page-title').textContent = T('nav.' + aba);
  // o Painel Geral não tem subtítulo (a saudação ocupa o topo)
  $('page-sub').textContent = aba === 'painel' ? '' : T('sub.' + aba);
  fecharPopups();
  document.title = 'ROSTAG PCP';   // o detalhe troca pelo nome do projeto

  if (aba === 'painel') renderPainel();
  if (aba === 'linha') renderLinha();
  if (aba === 'fabrica') renderFabrica();
  if (aba === 'carga') renderCarga();
  if (aba === 'rnc') renderRnc();
  if (aba === 'notificacoes') renderTelaNotificacoes();
  if (aba === 'config') abaConfig(arg && $('stab-' + arg) ? arg : 'geral');
  if (aba === 'projetos') {
    const existe = !!(arg && buscarProjeto(arg));
    estado.idDetalhe = existe ? arg : null;
    $('projetos-list-view').style.display = existe ? 'none' : 'block';
    $('projeto-detail-view').style.display = existe ? 'block' : 'none';
    renderProjetos();
    if (existe) { fecharReagendar(); renderDetalhe(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    // link para um projeto que ainda não chegou do servidor: tenta de novo quando os dados chegarem
    if (arg && !existe && !estado.carregado) estado.rotaPendente = arg;
  } else {
    estado.idDetalhe = null;
  }
  atualizarInscricaoChat();
}

window.addEventListener('hashchange', aplicarRota);

registrarAcoes({
  irPara: function (aba, arg) { irPara(aba, arg); }
});
