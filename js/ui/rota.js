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

const PAGINAS = { painel: 1, projetos: 1, linha: 1, config: 1 };

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
  let aba = partes[0] || 'painel';
  if (!PAGINAS[aba]) aba = 'painel';
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
  $('page-sub').textContent = T('sub.' + aba);
  fecharPopups();
  document.title = 'ROSTAG PCP';   // o detalhe troca pelo nome do projeto

  if (aba === 'painel') renderPainel();
  if (aba === 'linha') renderLinha();
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
