/* ===========================================================================
   ROSTAG PCP — Planejamento e Controle de Produção
   Ponto de entrada: liga a interface, o login e os dados da equipe.

   Camadas (js/):
     nucleo/   preferências e formatação (datas, escape)
     i18n/     textos em português e inglês
     dominio/  regras de negócio puras: cronograma, status, alertas, séries
     dados/    Firebase: conta/equipes (auth.js) e projetos (store.js)
     ui/       telas e componentes
   =========================================================================== */
import { prefs, carregarPrefsDoUsuario, aplicarPerfil, resetarPrefs, temaInicial } from './nucleo/prefs.js';
import { FIREBASE_PRONTO, iniciarFirebase } from './dados/firebase.js';
import * as Auth from './dados/auth.js';
import * as Store from './dados/store.js';
import * as Cronograma from './dominio/cronograma.js';
import { T } from './i18n/index.js';
import { estado, buscarProjeto, limparFiltros } from './estado.js';
import { $, iniciarDespachante } from './ui/dom.js';
import { iniciarModais, fecharTodos } from './ui/modal.js';
import { toast } from './ui/toast.js';
import { redesenhar, atualizarChip, renderTudo } from './ui/app.js';
import { aplicarRota, irPara } from './ui/rota.js';
import { aplicarTema, aplicarIdioma, aplicarPrefs } from './ui/preferencias.js';
import { renderAtalhos, iniciarAtalhos } from './ui/atalhos.js';
import { escutarNotificacoes, pararNotificacoes } from './ui/notificacoes.js';
import { pararInscricaoChat } from './ui/detalhe.js';
import { atualizarBadge } from './ui/filtros.js';
import { mostrarViewAcesso, mostrarTelaAcesso, atualizarSeletorEquipe, convitePendente, consumirConviteSeHouver } from './ui/acesso.js';
import { renderEquipe } from './ui/equipe.js';
import './ui/formulario.js';
import './ui/ano.js';
import './ui/dados.js';

let uidCarregado = null;       // de quem são as preferências aplicadas
let equipeCarregada = null;    // de qual equipe são os projetos escutados
let gestorCarregado = null;    // a consulta muda entre GP/coordenador e planejador

/* ------------------------------------------------------------ dados */
function aoReceberProjetos(lista) {
  const primeira = !estado.carregado;
  estado.projetos = lista;
  estado.carregado = true;
  Cronograma.invalidar();
  if (primeira) {
    aplicarRota();
    if (estado.rotaPendente) {
      const alvo = estado.rotaPendente;
      estado.rotaPendente = null;
      if (buscarProjeto(alvo)) irPara('projetos', alvo);
    }
  }
  redesenhar();
}

function aoFalharProjetos(e) {
  if (e && e.code === 'permission-denied') return;   // perdeu o acesso: o Auth já cuida de voltar ao hub
  atualizarChip('erro');
  toast(T('t.erroCarregar'), { tipo: 'erro' });
}

function escutarEquipe() {
  equipeCarregada = Auth.equipeAtualId();
  gestorCarregado = Auth.souGPouCoordenador();
  estado.projetos = [];
  estado.carregado = false;
  estado.idDetalhe = null;
  limparFiltros();
  atualizarBadge('dash', estado.filtroDash);
  atualizarBadge('proj', estado.filtroProj);
  pararInscricaoChat();
  atualizarChip(navigator.onLine === false ? 'offline' : undefined);
  redesenhar();
  aplicarRota();
  Store.escutar(aoReceberProjetos, aoFalharProjetos);
}

/* ------------------------------------------------------------ sessão */
function aplicarRestricoesPapel() {
  const gestor = Auth.souGPouCoordenador();
  document.body.classList.toggle('papel-planejador', !gestor);
  $('btn-novo-projeto').style.display = gestor ? '' : 'none';
  $('dados-acoes-escrita').style.display = gestor ? 'contents' : 'none';
}

function aplicarUsuario() {
  const u = Auth.usuarioAtual();
  carregarPrefsDoUsuario(u.uid);
  aplicarPerfil(Auth.perfilAtual());
  if (!prefs.nome) prefs.nome = Auth.nomeExibicao();
  aplicarTema();
  aplicarIdioma();
  aplicarPrefs();
  renderAtalhos();
  escutarNotificacoes();
}

function sairDoApp() {
  Store.pararEscuta();
  pararNotificacoes();
  pararInscricaoChat();
  fecharTodos();
  equipeCarregada = null;
  gestorCarregado = null;
  estado.projetos = [];
  estado.carregado = false;
  estado.idDetalhe = null;
}

function atualizarSessao() {
  $('tela-carregando').style.display = 'none';
  const u = Auth.usuarioAtual();

  if (!u) {
    if (uidCarregado) { uidCarregado = null; sairDoApp(); resetarPrefs(); prefs.tema = temaInicial(); aplicarTema(); aplicarIdioma(); }
    $('app-shell').style.display = 'none';
    mostrarTelaAcesso(true);
    mostrarViewAcesso(convitePendente ? 'cadastro' : 'entrar');
    return;
  }

  if (u.uid !== uidCarregado) { sairDoApp(); uidCarregado = u.uid; aplicarUsuario(); }

  if (!Auth.podeEntrar()) {
    sairDoApp();
    $('app-shell').style.display = 'none';
    mostrarTelaAcesso(true);
    // logado mas sem equipe: um convite pendente é usado direto
    if (convitePendente) { consumirConviteSeHouver().then(function (ok) { if (!ok) mostrarViewAcesso('hub'); }); return; }
    mostrarViewAcesso('hub');
    return;
  }

  mostrarTelaAcesso(false);
  $('app-shell').style.display = '';
  aplicarRestricoesPapel();
  atualizarSeletorEquipe();
  if (Auth.equipeAtualId() !== equipeCarregada || Auth.souGPouCoordenador() !== gestorCarregado) {
    const trocouEquipe = equipeCarregada && Auth.equipeAtualId() !== equipeCarregada;
    escutarEquipe();
    if (trocouEquipe) { irPara('painel'); toast(T('hub.equipeCarregada', Auth.equipeAtualNome())); }
  } else if (estado.idDetalhe) {
    redesenhar();
  }
  if ($('stab-equipe').classList.contains('active')) renderEquipe();
}

/* -------------------------------------------------------------- boot */
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (e) { console.info('service worker não registrado:', e && e.message); });
  });
}

function bootar() {
  prefs.tema = temaInicial();
  aplicarTema();
  aplicarIdioma();
  iniciarDespachante();
  iniciarModais();
  iniciarAtalhos();
  renderAtalhos();
  registrarServiceWorker();

  if (!FIREBASE_PRONTO) {
    $('tela-carregando').style.display = 'none';
    mostrarTelaAcesso(true);
    mostrarViewAcesso('entrar');
    $('login-erro').textContent = T('x.semFirebase');
    return;
  }
  iniciarFirebase();
  Auth.aoMudar(atualizarSessao);
  Auth.inicializar();

  // o dia vira com a página aberta: revalida as datas a cada 10 minutos
  setInterval(function () {
    if (estado.carregado && !document.querySelector('.modal-overlay.open')) { Cronograma.invalidar(); renderTudo(); }
  }, 600000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && estado.carregado) { Cronograma.invalidar(); renderTudo(); }
  });
}

bootar();
