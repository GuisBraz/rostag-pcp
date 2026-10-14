/* ---------------------------------------------------------------------------
   Notificações — alertas calculados dos projetos + avisos reais do Firestore
   (designação e observação), num só painel.
--------------------------------------------------------------------------- */
import { estado } from '../estado.js';
import { prefs, salvarPrefsLocais } from '../nucleo/prefs.js';
import { esc, brCurto, hoje } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Alertas from '../dominio/alertas.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes } from './dom.js';
import { toast } from './toast.js';
import { alternarPopup } from './app.js';
import { irPara } from './rota.js';

let pararEscuta = null;

export function escutarNotificacoes() {
  pararNotificacoes();
  pararEscuta = Auth.escutarNotificacoes(function (lista) { estado.notifReais = lista; renderNotificacoes(); });
}
export function pararNotificacoes() {
  if (pararEscuta) { pararEscuta(); pararEscuta = null; }
  estado.notifReais = [];
}

function mapReal(n) {
  return {
    id: 'real:' + n.id, projetoId: n.projetoId || '', equipeId: n.equipeId || '',
    nivel: 'aviso', titulo: T(n.tipo === 'designacao' ? 'notif.tituloDesignacao' : 'notif.tituloObservacao'),
    meta: n.mensagem, quando: String(n.criadoEm || hoje()).slice(0, 10), lida: !!n.lida
  };
}

function listaAtual() {
  const calculadas = Alertas.gerar(estado.projetos);
  if (estado.carregado) Alertas.podarLidas(calculadas);
  return estado.notifReais.map(mapReal).concat(calculadas);
}

export function renderNotificacoes() {
  const lista = listaAtual();
  const naoLidas = lista.filter(function (n) { return !n.lida; }).length;
  const temAlerta = lista.some(function (n) { return n.nivel === 'alerta' && !n.lida; });

  const cont = $('sino-contador');
  cont.textContent = naoLidas > 99 ? '99+' : naoLidas;
  cont.style.display = naoLidas ? 'block' : 'none';
  const sino = $('sino-btn');
  sino.classList.toggle('tem-alerta', temAlerta);
  sino.setAttribute('aria-label', T('tt.notificacoes') + (naoLidas ? ' (' + naoLidas + ')' : ''));

  $('notif-lista').innerHTML = lista.length ? lista.map(function (n) {
    const cor = n.nivel === 'alerta' ? 'var(--rust)' : 'var(--amber-ink)';
    return '<button type="button" class="notif-item ' + (n.lida ? '' : 'nao-lida') + '" data-acao="abrirNotificacao" data-arg="' + esc(n.id) + '">' +
      '<span class="dot ' + (n.nivel === 'alerta' ? 'dot-atrasada' : 'dot-chegando') + '" style="margin-top:4px"></span>' +
      '<span class="corpo"><span class="tit">' + esc(n.titulo) + '</span><span class="meta">' + esc(n.meta) + '</span></span>' +
      '<span class="quando" style="color:' + cor + '">' + brCurto(n.quando) + '</span></button>';
  }).join('') : '<div class="empty-state" style="padding:28px 20px;">' + esc(T('n.vazio')) + '</div>';
  return lista;
}

export function toggleNotificacoes(gatilho) {
  if (alternarPopup('notif-panel', gatilho || $('sino-btn'))) renderNotificacoes();
}

function abrirNotificacao(id) {
  $('notif-panel').classList.remove('open');
  const n = listaAtual().find(function (x) { return x.id === id; });
  if (!n) return;
  if (id.indexOf('real:') === 0) {
    const real = estado.notifReais.find(function (x) { return 'real:' + x.id === id; });
    if (real && !real.lida) { real.lida = true; Auth.marcarNotificacaoLida(real.id).catch(function (e) { console.warn(e); }); }
    if (n.equipeId && n.equipeId !== Auth.equipeAtualId()) {
      estado.rotaPendente = n.projetoId || null;
      Auth.trocarEquipe(n.equipeId).catch(function (e) { toast(T('hub.trocaErro'), { tipo: 'erro' }); console.warn(e); });
      return;
    }
  } else {
    prefs.lidas[id] = true;
    salvarPrefsLocais();
  }
  renderNotificacoes();
  if (n.projetoId) irPara('projetos', n.projetoId);
}

function marcarTodasLidas() {
  Alertas.gerar(estado.projetos).forEach(function (n) { prefs.lidas[n.id] = true; });
  salvarPrefsLocais();
  estado.notifReais.forEach(function (n) {
    if (!n.lida) { n.lida = true; Auth.marcarNotificacaoLida(n.id).catch(function (e) { console.warn(e); }); }
  });
  renderNotificacoes();
  toast(T('n.lidas'));
}

registrarAcoes({
  toggleNotificacoes: function (_a, _b, el) { toggleNotificacoes(el); },
  abrirNotificacao: abrirNotificacao,
  marcarTodasLidas: marcarTodasLidas
});
