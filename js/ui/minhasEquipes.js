/* ---------------------------------------------------------------------------
   Equipes do usuário: a janela "Entrar em uma equipe" (entrar por nome +
   senha, por link de convite, criar equipe, migrar dados antigos), o botão
   do topo para quem ainda não tem equipe e a lista "Minhas equipes" em
   Configurações → Equipe (trocar e escolher a principal).
--------------------------------------------------------------------------- */
import { T } from '../i18n/index.js';
import { esc } from '../nucleo/fmt.js';
import * as Papeis from '../dominio/papeis.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal } from './modal.js';
import { toast } from './toast.js';

const SENHA_EQUIPE_MINIMA = 6;
let aba = 'entrar';

/* --------------------------------------------------------- mensagens */
// Traduz os erros comuns em uma mensagem que ajuda a agir; o resto mostra o código.
export function mensagemErroEquipe(e) {
  const mapa = {
    'limite-equipes': 'hub.erroLimite', 'nome-indisponivel': 'hub.erroNomeIndisponivel',
    'equipe-nao-encontrada': 'hub.erroEquipeNaoEncontrada', 'senha-incorreta': 'hub.erroSenhaIncorreta',
    'senha-vazia': 'hub.erroSenhaVazia', 'ja-e-membro': 'hub.erroJaEMembro', 'nome-vazio': 'hub.erroNome',
    'convite-invalido': 'auth.conviteInvalido'
  };
  if (e && mapa[e.message]) return T(mapa[e.message]);
  return T('hub.erroCriar') + (e && e.code ? ' (' + e.code + ')' : '');
}
function validarNovaEquipe(nome, senha, senha2) {
  if (!nome) return T('hub.erroNome');
  if (nome.length > 60) return T('hub.erroNomeLongo');
  if (!senha) return T('hub.erroSenhaVazia');
  if (senha.length < SENHA_EQUIPE_MINIMA) return T('hub.erroSenhaCurta');
  if (senha !== senha2) return T('auth.senhasDiferentes');
  return null;
}
// Aceita o link inteiro (…?convite=CODIGO) ou só o código.
export function codigoDoConvite(texto) {
  const t = String(texto || '').trim();
  if (!t) return null;
  const m = t.match(/[?&]convite=([\w-]+)/);
  const c = m ? m[1] : t;
  return /^[\w-]{8,80}$/.test(c) ? c : null;
}

/* ----------------------------------------------- estado "sem equipe" */
// Topo e painel para quem está logado mas ainda não entrou em nenhuma equipe.
export function atualizarSemEquipe() {
  const semEquipe = Auth.logado() && !Auth.membro();
  document.body.classList.toggle('sem-equipe', semEquipe);
  $('btn-entrar-equipe').hidden = !semEquipe;
  if (semEquipe) $('sem-equipe-ola').textContent = T('ger.ola', (Auth.nomeExibicao() || '').split(/\s+/)[0] || '');
}

/* ----------------------------------------------------------- janela */
function mudarAba(nova) {
  aba = nova === 'criar' ? 'criar' : 'entrar';
  ['entrar', 'criar'].forEach(function (k) {
    const ativa = k === aba;
    $('eqm-tab-' + k).classList.toggle('active', ativa);
    $('eqm-tab-' + k).setAttribute('aria-selected', ativa ? 'true' : 'false');
    $('eqm-painel-' + k).hidden = !ativa;
  });
  $('eqm-confirmar').textContent = T(aba === 'criar' ? 'hub.criarBtn' : 'hub.entrarBtn');
  $('eqm-erro').textContent = '';
  if (aba === 'criar') {
    const bloco = $('eqm-migracao');
    bloco.hidden = true;
    Auth.verificarEquipeAntiga().then(function (achou) { bloco.hidden = !achou; }).catch(function () {});
  }
}

export function abrirJanelaEquipe(abaInicial) {
  if (!Auth.logado()) return;
  ['eqm-entrar-nome', 'eqm-entrar-senha', 'eqm-convite', 'eqm-criar-nome', 'eqm-criar-senha', 'eqm-criar-senha2'].forEach(function (id) { $(id).value = ''; });
  const u = Auth.usuarioAtual();
  $('equipe-conta').textContent = T('eq.contaLogada', u && u.email ? u.email : '—');
  mudarAba(abaInicial);
  abrirModal('modal-equipe', { foco: aba === 'criar' ? 'eqm-criar-nome' : 'eqm-entrar-nome' });
}

function entrou(msg) {
  fecharModal('modal-equipe');
  toast(msg);
}

function confirmar(_a, _b, btn) {
  const erro = $('eqm-erro');
  erro.textContent = '';
  btn = btn && btn.id === 'eqm-confirmar' ? btn : $('eqm-confirmar');
  if (aba === 'criar') {
    const nome = $('eqm-criar-nome').value.trim(), senha = $('eqm-criar-senha').value, senha2 = $('eqm-criar-senha2').value;
    erro.textContent = validarNovaEquipe(nome, senha, senha2) || '';
    if (erro.textContent) return;
    comBotaoOcupado(btn, Auth.criarEquipe(nome, senha).then(function () { entrou(T('hub.equipeCriada', nome)); })
      .catch(function (e) { erro.textContent = mensagemErroEquipe(e); console.warn(e); }));
    return;
  }
  // entrar: o link de convite, se preenchido, tem prioridade sobre nome + senha
  const textoConvite = $('eqm-convite').value.trim();
  if (textoConvite) {
    const codigo = codigoDoConvite(textoConvite);
    if (!codigo) { erro.textContent = T('eq.conviteInvalido'); $('eqm-convite').focus(); return; }
    comBotaoOcupado(btn, Auth.entrarComConvite(codigo).then(function () { entrou(T('hub.conviteAceito')); })
      .catch(function (e) { erro.textContent = T('hub.conviteErro'); console.warn(e); }));
    return;
  }
  const nome = $('eqm-entrar-nome').value.trim(), senha = $('eqm-entrar-senha').value;
  if (!nome) { erro.textContent = T('hub.erroNome'); $('eqm-entrar-nome').focus(); return; }
  comBotaoOcupado(btn, Auth.entrarPorNomeSenha(nome, senha).then(function () { entrou(T('hub.conviteAceito')); })
    .catch(function (e) { erro.textContent = mensagemErroEquipe(e); console.warn(e); }));
}

function migrar(_a, _b, btn) {
  const nome = $('eqm-criar-nome').value.trim() || T('hub.nomeEquipeMigrada');
  const senha = $('eqm-criar-senha').value, senha2 = $('eqm-criar-senha2').value;
  const erro = $('eqm-erro');
  erro.textContent = senha ? (validarNovaEquipe(nome, senha, senha2) || '') : T('hub.erroSenhaVaziaMigrar');
  if (erro.textContent) return;
  comBotaoOcupado(btn, Auth.migrarEquipeAntiga(nome, senha).then(function (r) {
    fecharModal('modal-equipe');
    toast(r.erroProjetos ? T('hub.migracaoParcial') : T('hub.migracaoFeita', r.projetosMigrados), r.erroProjetos ? { tipo: 'erro' } : undefined);
  }).catch(function (e) { erro.textContent = mensagemErroEquipe(e); console.warn(e); }));
}

/* ------------------------------- minhas equipes (Configurações → Equipe) */
export function atualizarSeletorEquipe() {
  const el = $('minhas-equipes-lista');
  if (!el) return;
  const atualId = Auth.equipeAtualId(), principal = Auth.equipePrincipalId();
  const lista = Auth.minhasEquipesLista();
  el.innerHTML = lista.map(function (e) {
    const ativa = e.id === atualId, ehPrincipal = e.id === principal;
    return '<div class="minha-equipe' + (ativa ? ' atual' : '') + '"><div>' +
        '<div class="minha-equipe-nome">' + (ehPrincipal ? '<span class="minha-equipe-estrela" title="' + esc(T('eq.principal')) + '">★</span> ' : '') + esc(e.nomeEquipe || '—') + '</div>' +
        '<div class="hint-txt">' + esc(T('papel.' + Papeis.papelEfetivo(e.papel, false))) + (ehPrincipal ? ' · ' + esc(T('eq.principal')) : '') + '</div></div>' +
      '<div class="minha-equipe-acoes">' +
        (ehPrincipal || lista.length < 2 ? '' : '<button type="button" class="btn btn-outline btn-mini" data-acao="tornarPrincipal" data-arg="' + esc(e.id) + '">☆ ' + esc(T('eq.tornarPrincipal')) + '</button>') +
        (ativa ? '<span class="minha-equipe-aqui">' + esc(T('eq.voceAqui')) + '</span>'
          : '<button type="button" class="btn btn-outline btn-mini" data-acao="trocarEquipe" data-arg="' + esc(e.id) + '">' + esc(T('eq.trocar')) + '</button>') +
      '</div></div>';
  }).join('') || '<div class="hint-txt">' + esc(T('eq.nenhuma')) + '</div>';
  $('minhas-equipes-nota').textContent = T(lista.length > 1 ? 'eq.minhasNotaVarias' : 'eq.minhasNota');
}

registrarAcoes({
  abrirJanelaEquipe: function (a) { abrirJanelaEquipe(a === 'criar' ? 'criar' : 'entrar'); },
  equipeAba: mudarAba,
  equipeConfirmar: confirmar,
  migrarEquipeAntigaUI: migrar,
  trocarEquipe: function (id) {
    if (id === Auth.equipeAtualId()) return;
    Auth.trocarEquipe(id).catch(function (e) { toast(T('hub.trocaErro'), { tipo: 'erro' }); console.warn(e); });
  },
  tornarPrincipal: function (id, _b, btn) {
    comBotaoOcupado(btn, Auth.definirEquipePrincipal(id).then(function () { toast(T('eq.principalFeita')); atualizarSeletorEquipe(); })
      .catch(function (e) { toast(T('eq.principalErro'), { tipo: 'erro' }); console.warn(e); }));
  }
});
