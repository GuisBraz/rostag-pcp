/* ---------------------------------------------------------------------------
   Tela de acesso (entrar, criar conta, recuperar senha), hub de equipes
   (criar, entrar por nome + senha, migrar) e seletor de equipe da barra
   lateral.
--------------------------------------------------------------------------- */
import { T } from '../i18n/index.js';
import { esc } from '../nucleo/fmt.js';
import * as Papeis from '../dominio/papeis.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal, confirmar } from './modal.js';
import { toast } from './toast.js';
import { alternarPopup } from './app.js';

// ?convite=codigo na URL: quem abre o link entra direto na equipe do convite
// depois de entrar ou criar a conta. O código sai da barra de endereço na hora.
export let convitePendente = (function () {
  try {
    const c = new URLSearchParams(location.search).get('convite');
    if (c) history.replaceState(null, '', location.pathname + location.hash);
    return c && /^[\w-]{8,80}$/.test(c) ? c : null;
  } catch (e) { return null; }
})();

const VIEWS = ['entrar', 'cadastro', 'recuperar', 'hub'];

export function mostrarViewAcesso(ver) {
  VIEWS.forEach(function (v) { $('login-view-' + v).style.display = v === ver ? 'block' : 'none'; });
  $('acesso-convite-banner-entrar').style.display = (ver === 'entrar' && convitePendente) ? 'block' : 'none';
  $('acesso-convite-banner-cadastro').style.display = (ver === 'cadastro' && convitePendente) ? 'block' : 'none';
  if (ver === 'hub') prepararHub();
  const foco = { entrar: 'login-email', cadastro: 'cadastro-nome', recuperar: 'recuperar-email', hub: 'hub-nome-equipe' }[ver];
  setTimeout(function () { const el = $(foco); if (el && el.offsetParent) el.focus(); }, 30);
}

export function mostrarTelaAcesso(visivel) {
  $('tela-acesso').style.display = visivel ? 'flex' : 'none';
}

// Consome o convite pendente depois de um login/cadastro bem-sucedido.
export function consumirConviteSeHouver() {
  if (!convitePendente) return Promise.resolve(false);
  const codigo = convitePendente;
  convitePendente = null;
  return Auth.entrarComConvite(codigo).then(function () { toast(T('hub.conviteAceito')); return true; })
    .catch(function (e) { toast(T('hub.conviteErro'), { tipo: 'erro' }); console.warn(e); return false; });
}

function mensagemErroAuth(e, padrao) {
  const c = e && e.code;
  if (c === 'auth/email-already-in-use') return T('auth.emailJaExiste');
  if (c === 'auth/weak-password') return T('auth.senhaFraca');
  if (c === 'auth/invalid-email') return T('auth.emailInvalido');
  if (c === 'auth/too-many-requests') return T('auth.muitasTentativas');
  if (c === 'auth/network-request-failed') return T('auth.semRede');
  return T(padrao);
}

/* ------------------------------------------------------------------ conta */
function fazerLogin() {
  const email = $('login-email').value.trim(), senha = $('login-senha').value;
  const erro = $('login-erro');
  erro.textContent = '';
  comBotaoOcupado($('login-submit'), Auth.entrar(email, senha).then(consumirConviteSeHouver).catch(function (e) {
    erro.textContent = mensagemErroAuth(e, 'auth.erroLogin');
    console.warn(e && e.code);
  }));
}
function fazerCadastro() {
  const nome = $('cadastro-nome').value.trim().slice(0, 60);
  const email = $('cadastro-email').value.trim();
  const senha = $('cadastro-senha').value, senha2 = $('cadastro-senha2').value;
  const erro = $('cadastro-erro');
  erro.textContent = '';
  if (!nome) { erro.textContent = T('cfg.nomeVazio'); return; }
  if (senha !== senha2) { erro.textContent = T('auth.senhasDiferentes'); return; }
  comBotaoOcupado($('cadastro-submit'), Auth.cadastrar(nome, email, senha).then(consumirConviteSeHouver).catch(function (e) {
    erro.textContent = mensagemErroAuth(e, 'auth.erroCadastro');
    console.warn(e && e.code);
  }));
}
function fazerRecuperarSenha() {
  const email = $('recuperar-email').value.trim();
  const erro = $('recuperar-erro');
  erro.textContent = '';
  comBotaoOcupado($('recuperar-submit'), Auth.recuperarSenha(email).then(function () {
    toast(T('auth.recuperarEnviado'), { ms: 8000 });
    mostrarViewAcesso('entrar');
  }).catch(function (e) {
    // não revela se o e-mail existe: só erros de formato/rede aparecem
    if (e && e.code === 'auth/user-not-found') { toast(T('auth.recuperarEnviado'), { ms: 8000 }); mostrarViewAcesso('entrar'); return; }
    erro.textContent = mensagemErroAuth(e, 'auth.erroRecuperar');
  }));
}
function doLogout() {
  confirmar(T('auth.confirmarSair'), { titulo: T('btn.sair'), textoOk: T('btn.sair') }).then(function (ok) {
    if (ok) Auth.sair().then(function () { toast(T('auth.saiu')); });
  });
}

function toggleSenhaVisivel(inputId, _b, btn) {
  const el = $(inputId);
  const mostrando = el.type === 'text';
  el.type = mostrando ? 'password' : 'text';
  btn.classList.toggle('ativo', !mostrando);
  const rotulo = T(mostrando ? 'auth.mostrarSenha' : 'auth.esconderSenha');
  btn.title = rotulo;
  btn.setAttribute('aria-label', rotulo);
  btn.setAttribute('aria-pressed', mostrando ? 'false' : 'true');
}

/* -------------------------------------------------------------------- hub */
function prepararHub() {
  ['hub-nome-equipe', 'hub-senha-equipe', 'hub-senha-equipe2', 'hub-entrar-nome', 'hub-entrar-senha'].forEach(function (id) { $(id).value = ''; });
  $('hub-erro').textContent = '';
  $('hub-entrar-erro').textContent = '';
  hubMudarAba('criar');
  const bloco = $('hub-migracao');
  bloco.style.display = 'none';
  Auth.verificarEquipeAntiga().then(function (encontrou) { bloco.style.display = encontrou ? 'block' : 'none'; });
}
function hubMudarAba(aba) {
  $('hub-tab-criar').classList.toggle('active', aba === 'criar');
  $('hub-tab-entrar').classList.toggle('active', aba === 'entrar');
  $('hub-tab-criar').setAttribute('aria-selected', aba === 'criar' ? 'true' : 'false');
  $('hub-tab-entrar').setAttribute('aria-selected', aba === 'entrar' ? 'true' : 'false');
  $('hub-painel-criar').style.display = aba === 'criar' ? 'block' : 'none';
  $('hub-painel-entrar').style.display = aba === 'entrar' ? 'block' : 'none';
  $('hub-criar-submit').style.display = aba === 'criar' ? 'inline-block' : 'none';
  $('hub-entrar-submit').style.display = aba === 'entrar' ? 'inline-block' : 'none';
}

// Traduz os erros comuns em uma mensagem que ajuda a agir; o resto mostra o código.
function mensagemErroEquipe(e) {
  const mapa = {
    'limite-equipes': 'hub.erroLimite', 'nome-indisponivel': 'hub.erroNomeIndisponivel',
    'equipe-nao-encontrada': 'hub.erroEquipeNaoEncontrada', 'senha-incorreta': 'hub.erroSenhaIncorreta',
    'senha-vazia': 'hub.erroSenhaVazia', 'ja-e-membro': 'hub.erroJaEMembro', 'nome-vazio': 'hub.erroNome'
  };
  if (e && mapa[e.message]) return T(mapa[e.message]);
  return T('hub.erroCriar') + (e && e.code ? ' (' + e.code + ')' : '');
}

// Valida nome e senha (com confirmação) de uma equipe nova.
function validarNovaEquipe(nome, senha, senha2) {
  if (!nome) return T('hub.erroNome');
  if (nome.length > 60) return T('hub.erroNomeLongo');
  if (!senha) return T('hub.erroSenhaVazia');
  if (senha.length < 6) return T('hub.erroSenhaCurta');
  if (senha !== senha2) return T('auth.senhasDiferentes');
  return null;
}

function criarEquipeHub(_a, _b, btn) {
  const nome = $('hub-nome-equipe').value.trim(), senha = $('hub-senha-equipe').value, senha2 = $('hub-senha-equipe2').value;
  const erro = $('hub-erro');
  erro.textContent = validarNovaEquipe(nome, senha, senha2) || '';
  if (erro.textContent) return;
  comBotaoOcupado(btn, Auth.criarEquipe(nome, senha).then(function () { toast(T('hub.equipeCriada', nome)); })
    .catch(function (e) { erro.textContent = mensagemErroEquipe(e); console.warn(e); }));
}
function entrarPorNomeSenha(_a, _b, btn) {
  const nome = $('hub-entrar-nome').value.trim(), senha = $('hub-entrar-senha').value;
  const erro = $('hub-entrar-erro');
  erro.textContent = '';
  if (!nome) { erro.textContent = T('hub.erroNome'); return; }
  comBotaoOcupado(btn, Auth.entrarPorNomeSenha(nome, senha).then(function () { toast(T('hub.conviteAceito')); })
    .catch(function (e) { erro.textContent = mensagemErroEquipe(e); console.warn(e); }));
}
function migrarEquipeAntiga(_a, _b, btn) {
  const nome = $('hub-nome-equipe').value.trim() || T('hub.nomeEquipeMigrada');
  const senha = $('hub-senha-equipe').value, senha2 = $('hub-senha-equipe2').value;
  const erro = $('hub-erro');
  erro.textContent = senha ? (validarNovaEquipe(nome, senha, senha2) || '') : T('hub.erroSenhaVaziaMigrar');
  if (erro.textContent) return;
  comBotaoOcupado(btn, Auth.migrarEquipeAntiga(nome, senha).then(function (r) {
    toast(r.erroProjetos ? T('hub.migracaoParcial') : T('hub.migracaoFeita', r.projetosMigrados), r.erroProjetos ? { tipo: 'erro' } : undefined);
  }).catch(function (e) { erro.textContent = mensagemErroEquipe(e); console.warn(e); }));
}

/* ------------------------------------------------- seletor de equipe */
export function atualizarSeletorEquipe() {
  $('sidebar-equipe-nome').textContent = Auth.equipeAtualNome() || '—';
}
function renderEquipeMenu() {
  const atualId = Auth.equipeAtualId();
  $('equipe-menu-lista').innerHTML = Auth.minhasEquipesLista().map(function (e) {
    const ativa = e.id === atualId;
    return '<button type="button" class="profile-menu-item' + (ativa ? ' ativa' : '') + '" data-acao="trocarEquipe" data-arg="' + esc(e.id) + '"' +
      (ativa ? ' aria-current="true"' : '') + '>' + (ativa ? '● ' : '○ ') + esc(e.nomeEquipe || '—') +
      '<span class="hint-txt"> · ' + esc(T('papel.' + Papeis.papelEfetivo(e.papel, false))) + '</span></button>';
  }).join('');
}

function criarEquipeModal(_a, _b, btn) {
  const nome = $('nova-equipe-nome').value.trim(), senha = $('nova-equipe-senha').value, senha2 = $('nova-equipe-senha2').value;
  const erro = $('nova-equipe-erro');
  erro.textContent = validarNovaEquipe(nome, senha, senha2) || '';
  if (erro.textContent) return;
  comBotaoOcupado(btn, Auth.criarEquipe(nome, senha).then(function () {
    fecharModal('modal-criar-equipe');
    toast(T('hub.equipeCriada', nome));
  }).catch(function (e) { erro.textContent = mensagemErroEquipe(e); console.warn(e); }));
}

registrarAcoes({
  fazerLogin: fazerLogin, fazerCadastro: fazerCadastro, fazerRecuperarSenha: fazerRecuperarSenha,
  doLogout: doLogout, toggleSenhaVisivel: toggleSenhaVisivel,
  mostrarViewAcesso: function (v) { if (VIEWS.indexOf(v) >= 0) mostrarViewAcesso(v); },
  hubMudarAba: function (aba) { hubMudarAba(aba === 'entrar' ? 'entrar' : 'criar'); },
  criarEquipeUI: criarEquipeHub, entrarPorNomeSenhaUI: entrarPorNomeSenha, migrarEquipeAntigaUI: migrarEquipeAntiga,
  toggleEquipeMenu: function (_a, _b, el) {
    if (alternarPopup('equipe-menu', el)) renderEquipeMenu();
  },
  trocarEquipe: function (id) {
    $('equipe-menu').classList.remove('open');
    if (id === Auth.equipeAtualId()) return;
    Auth.trocarEquipe(id).catch(function (e) { toast(T('hub.trocaErro'), { tipo: 'erro' }); console.warn(e); });
  },
  abrirCriarEquipeModal: function () {
    $('equipe-menu').classList.remove('open');
    ['nova-equipe-nome', 'nova-equipe-senha', 'nova-equipe-senha2'].forEach(function (id) { $(id).value = ''; });
    $('nova-equipe-erro').textContent = '';
    abrirModal('modal-criar-equipe', { foco: 'nova-equipe-nome' });
  },
  fecharModalCriarEquipe: function () { fecharModal('modal-criar-equipe'); },
  criarEquipeMenuUI: criarEquipeModal
});

