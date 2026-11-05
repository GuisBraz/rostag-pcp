/* ---------------------------------------------------------------------------
   Tela de acesso (entrar, criar conta, recuperar senha) e ações da conta
   (sair, encerrar). Equipes do usuário — entrar, criar, trocar, principal —
   ficam em minhasEquipes.js.
--------------------------------------------------------------------------- */
import { T } from '../i18n/index.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal, confirmar } from './modal.js';
import { toast } from './toast.js';

// ?convite=codigo na URL: quem abre o link entra direto na equipe do convite
// depois de entrar ou criar a conta. O código sai da barra de endereço na hora.
export let convitePendente = (function () {
  try {
    const c = new URLSearchParams(location.search).get('convite');
    if (c) history.replaceState(null, '', location.pathname + location.hash);
    return c && /^[\w-]{8,80}$/.test(c) ? c : null;
  } catch (e) { return null; }
})();

const VIEWS = ['entrar', 'cadastro', 'recuperar'];
export const SENHA_MINIMA = 8;   // contas novas; o Firebase aceita 6, mas pedimos mais
let acabouDeSair = false;

export function mostrarViewAcesso(ver) {
  VIEWS.forEach(function (v) { $('login-view-' + v).hidden = v !== ver; });
  $('acesso-convite-banner-entrar').hidden = !(ver === 'entrar' && convitePendente);
  $('acesso-convite-banner-cadastro').hidden = !(ver === 'cadastro' && convitePendente);
  $('login-sub').textContent = T(acabouDeSair ? 'auth.subSaiu' : 'auth.subLogin');
  ['login-erro', 'cadastro-erro', 'recuperar-erro'].forEach(function (id) { $(id).textContent = ''; });
  // senha nunca fica preenchida entre uma tela e outra (nem depois de sair)
  ['login-senha', 'cadastro-senha', 'cadastro-senha2'].forEach(function (id) { $(id).value = ''; $(id).type = 'password'; });
  const foco = { entrar: 'login-email', cadastro: 'cadastro-nome', recuperar: 'recuperar-email' }[ver];
  setTimeout(function () { const el = $(foco); if (el && el.offsetParent) el.focus(); }, 30);
}

export function mostrarTelaAcesso(visivel) {
  $('tela-acesso').style.display = visivel ? 'grid' : 'none';
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
  if (!email || !senha) { erro.textContent = T('auth.preencha'); return; }
  comBotaoOcupado($('login-submit'), Auth.entrar(email, senha).then(consumirConviteSeHouver).catch(function (e) {
    erro.textContent = mensagemErroAuth(e, 'auth.erroLogin');
    $('login-senha').select();
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
  if (!email) { erro.textContent = T('auth.emailInvalido'); return; }
  if (senha.length < SENHA_MINIMA) { erro.textContent = T('auth.senhaCurta', SENHA_MINIMA); return; }
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
    if (ok) { acabouDeSair = true; Auth.sair().then(function () { toast(T('auth.saiu')); }); }
  });
}

/* ---------------------------------------------------------- encerrar conta */
function abrirEncerrarConta() {
  $('encerrar-senha').value = ''; $('encerrar-palavra').value = ''; $('encerrar-erro').textContent = '';
  $('encerrar-aviso').textContent = T('enc.aviso');
  abrirModal('modal-encerrar', { foco: 'encerrar-senha' });
  // avisa logo se alguma equipe impede (Gerência não sai sozinha)
  Auth.equipesQueImpedemEncerrar().then(function (eqs) {
    if (eqs.length) $('encerrar-aviso').textContent = T('enc.aviso') + '\n\n' + T('enc.bloqueio', eqs.join(', '));
  });
}
function confirmarEncerrarConta(_a, _b, btn) {
  const senha = $('encerrar-senha').value, palavra = $('encerrar-palavra').value.trim().toUpperCase();
  const erro = $('encerrar-erro');
  erro.textContent = '';
  if (!senha) { erro.textContent = T('enc.semSenha'); $('encerrar-senha').focus(); return; }
  if (palavra !== 'ENCERRAR') { erro.textContent = T('enc.semPalavra'); $('encerrar-palavra').focus(); return; }
  comBotaoOcupado(btn, Auth.encerrarConta(senha).then(function () {
    fecharModal('modal-encerrar');
    toast(T('enc.feito'), { ms: 8000 });
  }).catch(function (e) {
    console.warn(e);
    const c = e && e.code;
    if (e && e.message === 'encerrar-gerente') erro.textContent = T('enc.bloqueio', e.equipes.join(', '));
    else if (c === 'auth/wrong-password' || c === 'auth/invalid-credential' || c === 'auth/invalid-login-credentials') erro.textContent = T('enc.senhaErrada');
    else erro.textContent = mensagemErroAuth(e, 'enc.erro');
  }));
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

registrarAcoes({
  fazerLogin: fazerLogin, fazerCadastro: fazerCadastro, fazerRecuperarSenha: fazerRecuperarSenha,
  doLogout: doLogout, toggleSenhaVisivel: toggleSenhaVisivel,
  abrirEncerrarConta: abrirEncerrarConta, confirmarEncerrarConta: confirmarEncerrarConta,
  mostrarViewAcesso: function (v) { if (VIEWS.indexOf(v) >= 0) mostrarViewAcesso(v); }
});
