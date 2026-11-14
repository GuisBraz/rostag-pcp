/* ---------------------------------------------------------------------------
   Rota por hash (#/projetos/p_123) — recarregar mantém a tela e o projeto.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto } from '../estado.js';
import { T } from '../i18n/index.js';
import { esc } from '../nucleo/fmt.js';
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
import { renderOrdens } from './ordens.js';
import { renderFinalizadas } from './finalizadas.js';
import { fecharChecklist } from './projetoTecnico.js';
import * as Auth from '../dados/auth.js';
import * as Papeis from '../dominio/papeis.js';

const PAGINAS = { painel: 1, projetos: 1, linha: 1, ordens: 1, fabrica: 1, carga: 1, rnc: 1, finalizadas: 1, notificacoes: 1, config: 1 };

// Telas que cada cargo usa. Programador de caldeiraria: painel, linha do
// tempo, Ordens de Produção, Fábrica (a programação), RNC e OPs finalizadas.
// Programador de usinagem: o mesmo, com a Carga Máquina no lugar da Fábrica.
// CQ: painel de indicadores, Fábrica e RNC. Todos: OPs finalizadas.
export function abaPermitida(aba) {
  // sem equipe ainda: só o painel de boas-vindas, notificações e configurações
  if (!Auth.membro()) return aba === 'painel' || aba === 'notificacoes' || aba === 'config';
  const papel = Auth.papel();
  const area = Papeis.areaDoProgramador(papel);
  const gerOuGp = Papeis.ehGerente(papel) || papel === 'gp';   // as OPs deles ficam em Ordens de Produção
  if (aba === 'finalizadas') return !gerOuGp;
  if (aba === 'config' || aba === 'notificacoes') return true;
  if (aba === 'fabrica') return area !== 'usinagem' && papel !== 'tecnico' && !gerOuGp;   // o técnico vê as OPs dentro do projeto
  if (aba === 'ordens') return !!area || gerOuGp || papel === 'tecnico';
  if (aba === 'rnc') return Papeis.veRnc(papel) || Papeis.ehCQ(papel) || !!area;
  if (aba === 'painel' && Papeis.ehCQ(papel)) return true;
  if (aba === 'carga') return Papeis.veCarga(papel) && area !== 'caldeiraria' && !gerOuGp;
  if (aba === 'painel' || aba === 'linha') return Papeis.leProjetos(papel);
  return Papeis.veProjetos(papel);
}
export function abaInicial() { const p = Auth.papel(); return !Auth.membro() || Papeis.leProjetos(p) || Papeis.ehCQ(p) ? 'painel' : 'finalizadas'; }

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
  // no Painel Geral o título diz o módulo de quem está logado
  const modulo = aba === 'painel' ? Papeis.moduloDe(Auth.papel()) : null;
  const nomeAba = aba === 'carga' && Auth.areaProgramador() === 'usinagem' ? 'cargaMaquina' : (aba === 'fabrica' && Auth.areaProgramador() === 'caldeiraria' ? 'cargaFabrica' : aba);
  $('page-title').innerHTML = esc(T('nav.' + nomeAba)) + (modulo ? '<span class="titulo-modulo"><span class="titulo-traco"> — </span>' + esc(T('modulo.' + modulo)) + '</span>' : '');
  // o Painel Geral não tem subtítulo (a saudação ocupa o topo)
  // o Painel Geral e a Carga não têm subtítulo (a Carga usa o espaço para a programação)
  $('page-sub').textContent = aba === 'painel' || aba === 'carga' ? '' : T('sub.' + aba);
  fecharPopups();
  document.title = (modulo ? T('nav.painel') + ' — ' + T('modulo.' + modulo) + ' · ' : '') + 'ROSTAG PCP';   // o detalhe troca pelo nome do projeto

  if (aba === 'painel') renderPainel();
  if (aba === 'linha') renderLinha();
  if (aba === 'fabrica') renderFabrica();
  if (aba === 'carga') renderCarga();
  if (aba === 'ordens') renderOrdens();
  if (aba === 'finalizadas') renderFinalizadas();
  if (aba === 'rnc') renderRnc();
  if (aba === 'notificacoes') renderTelaNotificacoes();
  if (aba === 'config') abaConfig(arg && $('stab-' + arg) ? arg : 'geral');
  if (aba === 'projetos') {
    const existe = !!(arg && buscarProjeto(arg));
    estado.idDetalhe = existe ? arg : null;
    $('projetos-list-view').style.display = existe ? 'none' : 'block';
    $('projeto-detail-view').style.display = existe ? 'block' : 'none';
    renderProjetos();
    if (existe) { fecharReagendar(); fecharChecklist(); renderDetalhe(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
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
