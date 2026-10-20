/* ---------------------------------------------------------------------------
   Notificações — avisos entre pessoas (Firestore) + alertas do Sistema
   (calculados dos projetos), no sino e numa tela cheia.

   Expiração semanal (segunda a domingo): na segunda, o que é da semana
   anterior some — cada pessoa apaga as próprias ao abrir o app (no plano
   gratuito do Firebase não há rotina agendada no servidor). Os alertas do
   Sistema que continuam valendo ganham estado novo e voltam como não lidos.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto } from '../estado.js';
import { esc, br, brCurto, hoje, addDias, dataDoInstante, horaDoInstante } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Alertas from '../dominio/alertas.js';
import * as Semana from '../dominio/semana.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes } from './dom.js';
import { toast } from './toast.js';
import { alternarPopup, fecharPopups } from './app.js';
import { irPara, abaAtual } from './rota.js';

let pararEscuta = null, pararEstado = null;
let estadoAlertas = null;              // { chave: { semana, alertaId, criadoEm, lidaEm } } — null = ainda não chegou
let registrando = new Set();           // chaves já pedidas, para não gravar duas vezes
const filtro = { aba: 'naoLidas', categoria: '', origem: '', projeto: '' };

export function escutarNotificacoes() {
  pararNotificacoes();
  pararEscuta = Auth.escutarNotificacoes(function (lista) {
    // expiradas: some da tela na hora e é apagada no servidor
    const h = hoje();
    const velhas = lista.filter(function (n) { return !Semana.daSemana(n.criadoEm, h); });
    if (velhas.length) Auth.apagarNotificacoes(velhas.map(function (n) { return n.id; }));
    estado.notifReais = lista.filter(function (n) { return Semana.daSemana(n.criadoEm, h); });
    renderNotificacoes();
  });
  pararEstado = Auth.escutarEstadoAlertas(function (mapa) {
    if (mapa) {
      const semana = Semana.inicioSemana(hoje());
      const velhas = Object.keys(mapa).filter(function (k) { return mapa[k].semana !== semana; });
      if (velhas.length) Auth.apagarEstadoAlertas(velhas);
    }
    estadoAlertas = mapa || {};
    renderNotificacoes();
  });
}
export function pararNotificacoes() {
  if (pararEscuta) { pararEscuta(); pararEscuta = null; }
  if (pararEstado) { pararEstado(); pararEstado = null; }
  estado.notifReais = [];
  estadoAlertas = null;
  registrando = new Set();
}

const TIPOS_REAIS = ['designacao', 'observacao', 'projetoCriado', 'cronograma', 'datas', 'designacaoTrocada', 'planilhaOps', 'rnc', 'chat', 'pedido', 'pedidoAprovado', 'pedidoRecusado'];
// Categorias para o filtro da tela cheia.
const CATEGORIA = {
  designacao: 'projeto', projetoCriado: 'projeto', cronograma: 'projeto', datas: 'projeto', designacaoTrocada: 'projeto',
  planilhaOps: 'fabrica', rnc: 'fabrica', chat: 'conversa', observacao: 'conversa',
  pedido: 'projeto', pedidoAprovado: 'projeto', pedidoRecusado: 'projeto'
};
function categoriaDe(n) { return n.real ? (CATEGORIA[n.tipo] || 'conversa') : (/^prod-/.test(n.tipo) ? 'fabrica' : 'prazos'); }

function mapReal(n) {
  const tipo = TIPOS_REAIS.indexOf(n.tipo) >= 0 ? n.tipo : 'observacao';
  return {
    id: 'real:' + n.id, real: true, tipo: tipo, projetoId: n.projetoId || '', equipeId: n.equipeId || '',
    nivel: tipo === 'rnc' || tipo === 'pedido' || tipo === 'pedidoRecusado' ? 'alerta' : 'aviso', titulo: T('notif.titulo.' + tipo),
    meta: n.mensagem, criadoEm: n.criadoEm || null, lidaEm: n.lidaEm || null, lida: !!n.lida,
    origem: n.deNome || '—'
  };
}

function alertasCalculados() {
  if (!Auth.podeEntrar()) return [];
  const semana = Semana.inicioSemana(hoje()), equipeId = Auth.equipeAtualId();
  const novos = [];
  const lista = Alertas.gerar(estado.projetos, { papel: Auth.papel(), uid: Auth.uid(), ops: estado.ops }).map(function (n) {
    const chave = Semana.chaveAlerta(semana, equipeId, n.id);
    const st = estadoAlertas && estadoAlertas[chave];
    if (estadoAlertas && !st && !registrando.has(chave)) {
      registrando.add(chave);
      novos.push({ chave: chave, semana: semana, equipeId: equipeId, alertaId: n.id });
    }
    return Object.assign({}, n, { chave: chave, real: false, criadoEm: st ? st.criadoEm : null, lidaEm: st ? st.lidaEm : null, lida: !!(st && st.lidaEm) });
  });
  // primeira vez que o alerta aparece nesta semana: grava quando (só com os dados já carregados)
  if (novos.length && estado.carregado) Auth.registrarAlertas(novos);
  return lista;
}

function listaAtual() {
  return estado.notifReais.map(mapReal).concat(alertasCalculados()).sort(function (a, b) {
    return String(b.criadoEm || '9').localeCompare(String(a.criadoEm || '9'));
  });
}

function quando(isoTs) { return isoTs ? brCurto(dataDoInstante(isoTs)) + ' ' + horaDoInstante(isoTs) : '—'; }
function textoOrigem(n) { return n.origem === 'sistema' ? T('n.origemSistema') : T('n.origemDe', n.origem); }

/* --------------------------------------------------------------- sino */
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
  const navCont = $('notif-nav-contador');
  if (navCont) { navCont.textContent = naoLidas > 99 ? '99+' : naoLidas; navCont.style.display = naoLidas ? '' : 'none'; }

  // o sino mostra as não lidas primeiro; a tela cheia tem o resto
  const doSino = lista.filter(function (n) { return !n.lida; }).concat(lista.filter(function (n) { return n.lida; })).slice(0, 30);
  $('notif-lista').innerHTML = doSino.length ? doSino.map(function (n) {
    const cor = n.nivel === 'alerta' ? 'var(--rust)' : 'var(--amber-ink)';
    return '<button type="button" class="notif-item ' + (n.lida ? '' : 'nao-lida') + '" data-acao="abrirNotificacao" data-arg="' + esc(n.id) + '">' +
      '<span class="dot ' + (n.nivel === 'alerta' ? 'dot-atrasada' : 'dot-chegando') + '" style="margin-top:4px"></span>' +
      '<span class="corpo"><span class="tit">' + esc(n.titulo) + '</span><span class="meta">' + esc(n.meta) + '</span>' +
        '<span class="origem">' + esc(textoOrigem(n)) + '</span></span>' +
      '<span class="quando" style="color:' + cor + '">' + esc(n.criadoEm ? brCurto(dataDoInstante(n.criadoEm)) : '') + '</span></button>';
  }).join('') : '<div class="empty-state" style="padding:28px 20px;">' + esc(T('n.vazio')) + '</div>';

  if (abaAtual() === 'notificacoes') renderTelaNotificacoes(lista);
  return lista;
}

export function toggleNotificacoes(gatilho) {
  if (alternarPopup('notif-panel', gatilho || $('sino-btn'))) renderNotificacoes();
}

/* --------------------------------------------------------- tela cheia */
function rotuloDia(dia) {
  const h = hoje();
  if (dia === h) return T('n.hoje');
  if (dia === addDias(h, -1)) return T('n.ontem');
  return br(dia);
}

export function renderTelaNotificacoes(listaPronta) {
  const lista = listaPronta || listaAtual();
  const naoLidas = lista.filter(function (n) { return !n.lida; }).length;
  ['naoLidas', 'lidas', 'todas'].forEach(function (aba) {
    const b = $('ntab-' + aba);
    if (!b) return;
    b.classList.toggle('active', filtro.aba === aba);
    b.setAttribute('aria-selected', String(filtro.aba === aba));
  });
  $('ntab-naoLidas-n').textContent = naoLidas ? ' (' + naoLidas + ')' : '';

  // projetos citados nas notificações (para o filtro)
  const sel = $('nf-projeto');
  const ids = Array.from(new Set(lista.map(function (n) { return n.projetoId; }).filter(Boolean)));
  sel.innerHTML = '<option value="">' + esc(T('btn.todos')) + '</option>' + ids.map(function (id) {
    const p = buscarProjeto(id);
    return '<option value="' + esc(id) + '">' + esc(p ? p.commessa : id) + '</option>';
  }).join('');
  if (ids.indexOf(filtro.projeto) < 0) filtro.projeto = '';
  sel.value = filtro.projeto;
  $('nf-categoria').value = filtro.categoria;
  $('nf-origem').value = filtro.origem;

  const visiveis = lista.filter(function (n) {
    if (filtro.aba === 'naoLidas' && n.lida) return false;
    if (filtro.aba === 'lidas' && !n.lida) return false;
    if (filtro.categoria && categoriaDe(n) !== filtro.categoria) return false;
    if (filtro.origem === 'sistema' && n.real) return false;
    if (filtro.origem === 'pessoas' && !n.real) return false;
    if (filtro.projeto && n.projetoId !== filtro.projeto) return false;
    return true;
  });
  $('notif-tela-info').textContent = T('n.telaInfo', Semana.inicioSemana(hoje()).split('-').reverse().join('/'));

  if (!visiveis.length) {
    $('notif-tela-lista').innerHTML = '<div class="card panel-pad empty-state">' +
      esc(T(filtro.aba === 'naoLidas' ? 'n.vazioNaoLidas' : 'n.vazioFiltro')) + '</div>';
    return;
  }
  let html = '', diaAtual = null;
  visiveis.forEach(function (n) {
    const dia = n.criadoEm ? dataDoInstante(n.criadoEm) : hoje();
    if (dia !== diaAtual) {
      if (diaAtual) html += '</div>';
      html += '<div class="notif-dia">' + esc(rotuloDia(dia)) + '</div><div class="card notif-grupo">';
      diaAtual = dia;
    }
    const p = n.projetoId ? buscarProjeto(n.projetoId) : null;
    html += '<div class="notif-linha' + (n.lida ? '' : ' nao-lida') + '">' +
      '<span class="dot ' + (n.nivel === 'alerta' ? 'dot-atrasada' : 'dot-chegando') + '"></span>' +
      '<div class="notif-corpo">' +
        '<div class="tit">' + esc(n.titulo) + '</div>' +
        '<div class="meta">' + esc(n.meta) + '</div>' +
        '<div class="notif-info">' +
          '<span>' + esc(textoOrigem(n)) + '</span>' +
          '<span>' + esc(T('n.recebida', quando(n.criadoEm))) + '</span>' +
          '<span>' + (n.lida ? esc(T('n.lidaEm', quando(n.lidaEm))) : '<b class="nao-lida-txt">' + esc(T('n.naoLida')) + '</b>') + '</span>' +
          (p ? '<span class="pill-mini mono">' + esc(p.commessa) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="notif-acoes">' +
        (n.projetoId ? '<button type="button" class="btn btn-outline btn-mini" data-acao="abrirNotificacao" data-arg="' + esc(n.id) + '">' + esc(T('n.abrir')) + '</button>' : '') +
        '<button type="button" class="btn btn-outline btn-mini" data-acao="alternarLida" data-arg="' + esc(n.id) + '">' + esc(T(n.lida ? 'n.marcarNaoLida' : 'n.marcarLida')) + '</button>' +
      '</div></div>';
  });
  $('notif-tela-lista').innerHTML = html + '</div>';
}

/* --------------------------------------------------------------- ações */
function marcar(n, lida) {
  n.lida = lida;
  if (n.real) {
    const real = estado.notifReais.find(function (x) { return 'real:' + x.id === n.id; });
    if (real) { real.lida = lida; real.lidaEm = lida ? new Date().toISOString() : null; }
    return Auth.marcarNotificacaoLida(n.id.slice(5), lida).catch(function (e) { console.warn(e); });
  }
  if (estadoAlertas && estadoAlertas[n.chave]) estadoAlertas[n.chave].lidaEm = lida ? new Date().toISOString() : null;
  return Auth.marcarAlertas([n.chave], lida);
}

function abrirNotificacao(id) {
  $('notif-panel').classList.remove('open');
  const n = listaAtual().find(function (x) { return x.id === id; });
  if (!n) return;
  if (!n.lida) marcar(n, true);
  if (n.real && n.equipeId && n.equipeId !== Auth.equipeAtualId()) {
    estado.rotaPendente = n.projetoId || null;
    Auth.trocarEquipe(n.equipeId).catch(function (e) { toast(T('hub.trocaErro'), { tipo: 'erro' }); console.warn(e); });
    return;
  }
  renderNotificacoes();
  if (n.projetoId && buscarProjeto(n.projetoId)) irPara('projetos', n.projetoId);
}

function alternarLida(id) {
  const n = listaAtual().find(function (x) { return x.id === id; });
  if (!n) return;
  marcar(n, !n.lida);
  renderNotificacoes();
}

function marcarTodasLidas() {
  const lista = listaAtual().filter(function (n) { return !n.lida; });
  const chaves = lista.filter(function (n) { return !n.real && n.chave && estadoAlertas && estadoAlertas[n.chave]; }).map(function (n) { return n.chave; });
  chaves.forEach(function (c) { estadoAlertas[c].lidaEm = new Date().toISOString(); });
  Auth.marcarAlertas(chaves, true);
  lista.filter(function (n) { return n.real; }).forEach(function (n) { marcar(n, true); });
  renderNotificacoes();
  toast(T('n.lidas'));
}

function verTodas() { fecharPopups(); irPara('notificacoes'); }

registrarAcoes({
  toggleNotificacoes: function (_a, _b, el) { toggleNotificacoes(el); },
  abrirNotificacao: abrirNotificacao,
  alternarLida: alternarLida,
  marcarTodasLidas: marcarTodasLidas,
  verTodasNotificacoes: verTodas,
  abaNotificacoes: function (aba) { filtro.aba = aba; renderTelaNotificacoes(); },
  filtrarNotificacoes: function () {
    filtro.categoria = $('nf-categoria').value;
    filtro.origem = $('nf-origem').value;
    filtro.projeto = $('nf-projeto').value;
    renderTelaNotificacoes();
  }
});
