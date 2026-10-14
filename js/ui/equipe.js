/* ---------------------------------------------------------------------------
   Equipe (Configurações → Equipe): membros, papéis, convites e senha.
--------------------------------------------------------------------------- */
import { esc } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { confirmar, pedirTexto } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';

let geracao = 0;   // descarta respostas de uma renderização anterior

function linkConvite(codigo) { return location.origin + location.pathname + '?convite=' + encodeURIComponent(codigo); }

export function renderEquipe() {
  if (!Auth.podeEntrar()) return;
  const minha = ++geracao;
  const lista = $('equipe-lista'), convitesBloco = $('equipe-convites-bloco'), convites = $('equipe-convites');
  const souCoord = Auth.souCoordenador(), souGpOuCoord = Auth.souGPouCoordenador();
  $('btn-convidar').style.display = souGpOuCoord ? 'flex' : 'none';
  $('equipe-senha-bloco').style.display = souCoord ? 'block' : 'none';
  $('equipe-senha-aviso').style.display = (souCoord && Auth.senhaFormatoAntigo()) ? 'block' : 'none';
  $('equipe-sair-bloco').style.display = souCoord ? 'none' : 'block';

  lista.innerHTML = '<div class="hint-txt">' + esc(T('cfg.equipeCarregando')) + '</div>';
  Auth.listarEquipe().then(function (membros) {
    if (minha !== geracao) return;
    const meuUid = Auth.uid(), coordUid = Auth.coordenadorUidAtual();
    lista.innerHTML = membros.map(function (m) {
      const voce = m.uid === meuUid, ehCoord = m.uid === coordUid;
      const papelTxt = ehCoord ? T('cfg.equipeCoordenador') : T('cfg.papel.' + (m.papel === 'gp' ? 'gp' : 'planejador'));
      const classePapel = ehCoord ? 'papel-coord' : (m.papel === 'gp' ? 'papel-gp' : 'papel-planejador');
      let acoes = '';
      if (souCoord && !ehCoord) {
        const outro = m.papel === 'gp' ? 'planejador' : 'gp';
        const dados = ' data-arg="' + esc(m.uid) + '" data-arg2="' + esc(m.nome || m.email || '') + '"';
        acoes = '<button type="button" class="btn btn-outline" data-acao="' + (outro === 'gp' ? 'promoverGp' : 'rebaixarPlanejador') + '"' + dados + '>' + esc(T('cfg.papel.tornar.' + outro)) + '</button>' +
          '<button type="button" class="btn btn-outline" data-acao="transferirCoordenacao"' + dados + '>' + esc(T('cfg.equipeTransferir')) + '</button>' +
          '<button type="button" class="btn btn-danger" data-acao="removerDaEquipe"' + dados + '>' + esc(T('cfg.equipeRemover')) + '</button>';
      }
      return '<div class="membro-linha"><div class="membro-info">' +
          '<div class="membro-nome">' + esc(m.nome || '—') + (voce ? ' <span class="hint-txt">(' + esc(T('cfg.equipeVoce')) + ')</span>' : '') + '</div>' +
          '<div class="hint-txt">' + esc(m.email || '') + ' · <span class="' + classePapel + '">' + esc(papelTxt) + '</span></div>' +
        '</div><div class="membro-acoes">' + acoes + '</div></div>';
    }).join('') || '<div class="hint-txt">' + esc(T('cfg.equipeVazia')) + '</div>';
  }).catch(function (e) {
    console.warn(e);
    if (minha === geracao) lista.innerHTML = '<div class="hint-txt erro-txt">' + esc(T('cfg.equipeErro')) + '</div>';
  });

  if (!souGpOuCoord) { convitesBloco.style.display = 'none'; return; }
  convitesBloco.style.display = 'block';
  convites.innerHTML = '<div class="hint-txt">' + esc(T('cfg.equipeCarregando')) + '</div>';
  Auth.listarConvites().then(function (abertos) {
    if (minha !== geracao) return;
    convites.innerHTML = abertos.map(function (c) {
      const link = linkConvite(c.codigo);
      return '<div class="convite-linha"><div class="hint-txt convite-link">' + esc(link) +
        ' <span class="pill-mini">' + esc(T('cfg.papel.' + (c.papel === 'gp' ? 'gp' : 'planejador'))) + '</span></div>' +
        '<div class="membro-acoes">' +
          '<button type="button" class="btn btn-outline" data-acao="copiarConvite" data-arg="' + esc(link) + '">' + esc(T('cfg.equipeCopiarLink')) + '</button>' +
          '<button type="button" class="btn btn-danger" data-acao="revogarConvite" data-arg="' + esc(c.codigo) + '">' + esc(T('cfg.equipeRevogarConvite')) + '</button>' +
        '</div></div>';
    }).join('') || '<div class="hint-txt">' + esc(T('cfg.equipeSemConvites')) + '</div>';
  }).catch(function (e) { console.warn(e); if (minha === geracao) convites.innerHTML = '<div class="hint-txt erro-txt">' + esc(T('cfg.equipeErro')) + '</div>'; });
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
  confirmar(T('cfg.papel.confirmarTrocar', nome, T('cfg.papel.' + papelNovo)), { titulo: T('cfg.equipe') }).then(function (ok) {
    if (!ok) return;
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
  convidarMembro: function (papelConvite, _b, btn) {
    comBotaoOcupado(btn, Auth.criarConvite(papelConvite === 'gp' ? 'gp' : 'planejador').then(function (codigo) {
      copiarConvite(linkConvite(codigo));
      renderEquipe();
    }).catch(function (e) { avisoErro(e); }));
  },
  promoverGp: function (uid, nome) { alterarPapel(uid, nome, 'gp'); },
  rebaixarPlanejador: function (uid, nome) { alterarPapel(uid, nome, 'planejador'); },
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
  transferirCoordenacao: function (uid, nome) {
    confirmar(T('cfg.equipeConfirmarTransferir', nome), { titulo: T('cfg.equipeTransferir'), textoOk: T('cfg.equipeTransferir'), perigo: true }).then(function (ok) {
      if (!ok) return;
      Auth.transferirCoordenacao(uid).then(function () { toast(T('cfg.equipeTransferido', nome)); renderEquipe(); })
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
