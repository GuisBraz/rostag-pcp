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
import * as Ops from './dados/ops.js';
import * as Cronograma from './dominio/cronograma.js';
import * as Projeto from './dominio/projeto.js';
import * as Papeis from './dominio/papeis.js';
import { T } from './i18n/index.js';
import { estado, buscarProjeto, limparFiltros } from './estado.js';
import { $, iniciarDespachante } from './ui/dom.js';
import { iniciarModais, fecharTodos } from './ui/modal.js';
import { toast } from './ui/toast.js';
import { redesenhar, atualizarChip, renderTudo } from './ui/app.js';
import { aplicarRota, irPara, abaInicial } from './ui/rota.js';
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
let papelCarregado = null;     // a consulta muda conforme o cargo

/* ------------------------------------------------------------ dados */
function aoReceberProjetos(lista) {
  const primeira = !estado.carregado;
  // o técnico só recebe o projeto depois que o GP define o cronograma
  estado.projetos = Auth.papel() === 'tecnico' ? lista.filter(function (p) { return !Projeto.aguardandoCronograma(p); }) : lista;
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

function aoReceberOps(lista) {
  estado.ops = lista;
  estado.opsCarregadas = true;
  redesenhar();
}

function escutarEquipe() {
  equipeCarregada = Auth.equipeAtualId();
  papelCarregado = Auth.papel();
  estado.projetos = [];
  estado.carregado = false;
  estado.ops = [];
  estado.opsCarregadas = false;
  estado.idDetalhe = null;
  limparFiltros();
  atualizarBadge('dash', estado.filtroDash);
  atualizarBadge('proj', estado.filtroProj);
  pararInscricaoChat();
  atualizarChip(navigator.onLine === false ? 'offline' : undefined);
  redesenhar();
  aplicarRota();
  // Programadores e CQ não trabalham com projetos: nem escutam a coleção.
  if (Papeis.veProjetos(papelCarregado)) {
    Store.escutar(aoReceberProjetos, aoFalharProjetos);
  } else {
    Store.pararEscuta();
    estado.carregado = true;
    aplicarRota();
  }
  Ops.escutar(aoReceberOps, function () { estado.opsCarregadas = true; redesenhar(); });
  // equipe de antes dos cargos novos: o gerente converte os papéis uma vez
  Auth.migrarPapeisEquipe().then(function (n) { if (n) toast(T('cfg.papeisMigrados', n)); });
}

/* ------------------------------------------------------------ sessão */
function aplicarRestricoesPapel() {
  const papel = Auth.papel();
  const gestor = Papeis.gereProjetos(papel);
  const veProjetos = Papeis.veProjetos(papel);
  document.body.classList.toggle('visao-planejador', !gestor);
  document.body.classList.toggle('visao-fabrica', !veProjetos);
  document.body.classList.toggle('visao-gerente', Papeis.ehGerente(papel));
  document.body.classList.toggle('detalhe-areas', Papeis.ehGerente(papel) || papel === 'gp');
  document.body.classList.toggle('painel-novo', Papeis.ehGerente(papel) || papel === 'gp' || papel === 'tecnico');
  $('btn-novo-projeto').style.display = gestor ? '' : 'none';
  $('dados-acoes-escrita').style.display = gestor ? 'contents' : 'none';
  ['painel', 'projetos', 'linha'].forEach(function (aba) {
    const b = document.querySelector('.side-item[data-tab="' + aba + '"]');
    if (b) b.style.display = veProjetos ? '' : 'none';
  });
  const bRnc = document.querySelector('.side-item[data-tab="rnc"]');
  if (bRnc) bRnc.style.display = Papeis.veRnc(papel) ? '' : 'none';
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

// Deixa a equipe (ou a conta). As notificações são da pessoa, não da equipe:
// continuam escutadas no hub, e só param quando a conta sai (ver atualizarSessao).
function sairDoApp() {
  Store.pararEscuta();
  Ops.pararEscuta();
  pararInscricaoChat();
  fecharTodos();
  equipeCarregada = null;
  papelCarregado = null;
  estado.projetos = [];
  estado.carregado = false;
  estado.ops = [];
  estado.opsCarregadas = false;
  estado.idDetalhe = null;
}

function atualizarSessao() {
  $('tela-carregando').style.display = 'none';
  const u = Auth.usuarioAtual();

  if (!u) {
    if (uidCarregado) { uidCarregado = null; sairDoApp(); pararNotificacoes(); resetarPrefs(); prefs.tema = temaInicial(); aplicarTema(); aplicarIdioma(); }
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
  if (Auth.equipeAtualId() !== equipeCarregada || Auth.papel() !== papelCarregado) {
    const trocouEquipe = equipeCarregada && Auth.equipeAtualId() !== equipeCarregada;
    escutarEquipe();
    if (trocouEquipe) { irPara(abaInicial()); toast(T('hub.equipeCarregada', Auth.equipeAtualNome())); }
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
