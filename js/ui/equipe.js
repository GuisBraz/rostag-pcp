/* ---------------------------------------------------------------------------
   Equipe (Configurações → Equipe): membros, papéis, convites e senha.
--------------------------------------------------------------------------- */
import { atualizarSeletorEquipe } from './acesso.js';
import { esc, br, dataDoInstante } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Auth from '../dados/auth.js';
import { PAPEIS, papelEfetivo } from '../dominio/papeis.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { confirmar, pedirTexto } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';

// Membros e convites ficam escutados ao vivo enquanto o painel está à vista:
// quem entra por convite, sai ou muda de papel aparece sem recarregar.
let escuta = null;          // { equipeId, gestor, parar: [fn] }
let membrosCache = null, convitesCache = null;

function linkConvite(codigo) { return location.origin + location.pathname + '?convite=' + encodeURIComponent(codigo); }
function painelVisivel() { return $('stab-equipe').offsetParent !== null; }

function pararEscutas() {
  if (escuta) escuta.parar.forEach(function (fn) { fn(); });
  escuta = null; membrosCache = null; convitesCache = null;
}

// Liga as escutas da equipe atual (ou religa, se a equipe ou o papel mudou).
// Fora do painel, a primeira notícia que chegar já desliga tudo.
function garantirEscutas() {
  const equipeId = Auth.equipeAtualId(), gestor = Auth.souGerente();
  if (escuta && escuta.equipeId === equipeId && escuta.gestor === gestor) return;
  pararEscutas();
  const atual = escuta = { equipeId: equipeId, gestor: gestor, parar: [] };
  function seAindaVale(fn) {
    return function (dados) {
      if (escuta !== atual) return;
      if (!painelVisivel()) { pararEscutas(); return; }
      fn(dados);
    };
  }
  atual.parar.push(Auth.escutarMembros(seAindaVale(function (m) { membrosCache = m; desenharMembros(); }), function (e) {
    console.warn(e);
    if (escuta === atual) $('equipe-lista').innerHTML = '<div class="hint-txt erro-txt">' + esc(T('cfg.equipeErro')) + '</div>';
  }));
  if (gestor) {
    atual.parar.push(Auth.escutarConvites(seAindaVale(function (c) { convitesCache = c; desenharConvites(); }), function (e) {
      console.warn(e);
      if (escuta === atual) $('equipe-convites').innerHTML = '<div class="hint-txt erro-txt">' + esc(T('cfg.equipeErro')) + '</div>';
    }));
  }
}

function opcoesPapel(selecionado) {
  return PAPEIS.map(function (p) {
    return '<option value="' + p + '"' + (p === selecionado ? ' selected' : '') + '>' + esc(T('papel.' + p)) + '</option>';
  }).join('');
}

export function renderEquipe() {
  if (!Auth.podeEntrar()) { pararEscutas(); return; }
  atualizarSeletorEquipe();
  const gerente = Auth.souGerente();
  $('btn-convidar').style.display = gerente ? 'flex' : 'none';
  const sel = $('convite-papel');
  if (sel && !sel.options.length) sel.innerHTML = opcoesPapel('tecnico');
  // qualquer gerente troca a senha; gerente não sai sozinho (ver Auth.sairDaEquipe)
  $('equipe-senha-bloco').style.display = gerente ? 'block' : 'none';
  $('equipe-senha-aviso').style.display = (gerente && Auth.senhaFormatoAntigo()) ? 'block' : 'none';
  $('equipe-sair-bloco').style.display = gerente ? 'none' : 'block';
  $('equipe-convites-bloco').style.display = gerente ? 'block' : 'none';
  garantirEscutas();
  desenharMembros();
  desenharConvites();
}

function desenharMembros() {
  const lista = $('equipe-lista');
  if (!membrosCache) { lista.innerHTML = '<div class="hint-txt">' + esc(T('cfg.equipeCarregando')) + '</div>'; return; }
  const gerente = Auth.souGerente(), meuUid = Auth.uid(), coordUid = Auth.coordenadorUidAtual();
  lista.innerHTML = membrosCache.map(function (m) {
    const voce = m.uid === meuUid, ehCoord = m.uid === coordUid;
    const efetivo = papelEfetivo(m.papel, ehCoord);
    const papelTxt = T('papel.' + efetivo);
    const classePapel = efetivo === 'gerente_pcp' ? 'papel-coord' : (efetivo === 'gp' ? 'papel-gp' : 'papel-planejador');
    let acoes = '';
    // qualquer gerente muda o cargo e remove os outros (inclusive outro
    // gerente); o próprio cargo ninguém muda, para a equipe nunca ficar sem Gerência
    if (gerente && !voce) {
      const dados = ' data-arg="' + esc(m.uid) + '" data-arg2="' + esc(m.nome || m.email || '') + '"';
      acoes = '<select class="papel-select" data-change="mudarPapelMembro"' + dados + ' aria-label="' + esc(T('cfg.papelDe', m.nome || m.email || '')) + '">' +
          opcoesPapel(efetivo) + '</select>' +
        '<button type="button" class="btn btn-danger" data-acao="removerDaEquipe"' + dados + '>' + esc(T('cfg.equipeRemover')) + '</button>';
    }
    return '<div class="membro-linha"><div class="membro-info">' +
        '<div class="membro-nome">' + esc(m.nome || '—') + (voce ? ' <span class="hint-txt">(' + esc(T('cfg.equipeVoce')) + ')</span>' : '') + '</div>' +
        '<div class="hint-txt">' + esc(m.email || '') + ' · <span class="' + classePapel + '">' + esc(papelTxt) + '</span></div>' +
      '</div><div class="membro-acoes">' + acoes + '</div></div>';
  }).join('') || '<div class="hint-txt">' + esc(T('cfg.equipeVazia')) + '</div>';
}

function desenharConvites() {
  const convites = $('equipe-convites');
  if (!Auth.souGerente()) return;
  if (!convitesCache) { convites.innerHTML = '<div class="hint-txt">' + esc(T('cfg.equipeCarregando')) + '</div>'; return; }
  convites.innerHTML = convitesCache.map(function (c) {
    const link = linkConvite(c.codigo);
    return '<div class="convite-linha"><div class="hint-txt convite-link">' + esc(link) +
      ' <span class="pill-mini">' + esc(T('papel.' + papelEfetivo(c.papel, false))) + '</span>' +
      ' <span class="hint-txt">' + esc(T('cfg.equipeConviteValeAte', br(dataDoInstante(c.venceEm)))) + '</span></div>' +
      '<div class="membro-acoes">' +
        '<button type="button" class="btn btn-outline" data-acao="copiarConvite" data-arg="' + esc(link) + '">' + esc(T('cfg.equipeCopiarLink')) + '</button>' +
        '<button type="button" class="btn btn-danger" data-acao="revogarConvite" data-arg="' + esc(c.codigo) + '">' + esc(T('cfg.equipeRevogarConvite')) + '</button>' +
      '</div></div>';
  }).join('') || '<div class="hint-txt">' + esc(T('cfg.equipeSemConvites')) + '</div>';
}

function copiarConvite(link) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(function () { toast(T('cfg.equipeLinkCopiado')); })
      .catch(function () { mostrarLink(link); });
  } else { mostrarLink(link); }
}
function mostrarLink(link) {
  // sem acesso à área de transferência: mostra o link selecionável num diálogo
  pedirTexto(T('cfg.equipeLinkPronto'), { titulo: T('cfg.equipeCopiarLink'), valor: link, soAviso: true });
}

function alterarPapel(uid, nome, papelNovo) {
  confirmar(T('cfg.papel.confirmarTrocar', nome, T('papel.' + papelNovo)), { titulo: T('cfg.equipe') }).then(function (ok) {
    if (!ok) { desenharMembros(); return; }   // volta o seletor para o cargo atual
    Auth.alterarPapel(uid, papelNovo).then(function () { toast(T('cfg.papel.trocado', nome)); renderEquipe(); })
      .catch(function (e) { avisoErro(e); });
  });
}

function redefinirSenhaEquipe(_a, _b, btn) {
  const campo = $('equipe-senha-nova'), campo2 = $('equipe-senha-nova2'), erro = $('equipe-senha-erro');
  erro.textContent = '';
  if (campo.value.length < 6) { erro.textContent = T('hub.erroSenhaCurta'); return; }
  if (campo.value !== campo2.value) { erro.textContent = T('auth.senhasDiferentes'); return; }
  comBotaoOcupado(btn, Auth.redefinirSenhaEquipe(campo.value).then(function () {
    campo.value = ''; campo2.value = '';
    toast(T('cfg.equipeSenhaTrocada'));
    renderEquipe();
  }).catch(function (e) {
    erro.textContent = T('cfg.equipeErroAcao') + (e && e.code ? ' (' + e.code + ')' : '');
    console.warn(e);
  }));
}

registrarAcoes({
  convidarMembro: function (_a, _b, btn) {
    const papelConvite = $('convite-papel').value || 'tecnico';
    comBotaoOcupado(btn, Auth.criarConvite(papelConvite).then(function (codigo) {
      copiarConvite(linkConvite(codigo));
      renderEquipe();
    }).catch(function (e) { avisoErro(e); }));
  },
  mudarPapelMembro: function (papelNovo, _b, el) { alterarPapel(el.dataset.arg, el.dataset.arg2, papelNovo); },
  copiarConvite: copiarConvite,
  revogarConvite: function (codigo) {
    Auth.revogarConvite(codigo).then(function () { toast(T('cfg.equipeConviteRevogado')); renderEquipe(); })
      .catch(function (e) { avisoErro(e); });
  },
  removerDaEquipe: function (uid, nome) {
    confirmar(T('cfg.equipeConfirmarRemover', nome), { titulo: T('cfg.equipeRemover'), textoOk: T('cfg.equipeRemover'), perigo: true }).then(function (ok) {
      if (!ok) return;
      Auth.removerMembro(uid).then(function () { toast(T('cfg.equipeRemovidoFeito', nome)); renderEquipe(); })
        .catch(function (e) { avisoErro(e); });
    });
  },
  sairDaEquipe: function () {
    confirmar(T('cfg.equipeSairConfirm', Auth.equipeAtualNome()), { titulo: T('cfg.equipeSair'), textoOk: T('cfg.equipeSair'), perigo: true }).then(function (ok) {
      if (!ok) return;
      Auth.sairDaEquipe().then(function () { toast(T('cfg.equipeSaiu')); }).catch(function (e) { avisoErro(e); });
    });
  },
  redefinirSenhaEquipeUI: redefinirSenhaEquipe
});
