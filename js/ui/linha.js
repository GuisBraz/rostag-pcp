/* ---------------------------------------------------------------------------
   Linha do tempo — posicionada pela entrega, colorida pelo status.
--------------------------------------------------------------------------- */
import { estado } from '../estado.js';
import { esc, br, hoje } from '../nucleo/fmt.js';
import { T, STATUS_LABEL } from '../i18n/index.js';
import * as Projeto from '../dominio/projeto.js';
import { $, registrarAcoes } from './dom.js';
import { corStatus, cor } from './graficos.js';
import * as Auth from '../dados/auth.js';
import * as Store from '../dados/store.js';

function idElemento(id) { return 'tl-item-' + String(id).replace(/[^\w-]/g, '_'); }

// Visão "Fábrica" (todos os projetos da equipe, para todos os cargos) ou
// "Meus projetos" (os de cada um). Lembrada neste navegador.
let visao = lerVisao();
function lerVisao() { try { return localStorage.getItem('rostag.linha.visao') === 'meus' ? 'meus' : 'fabrica'; } catch (e) { return 'fabrica'; } }
// quem tem projetos "seus": GP, técnico e programadores (a Gerência vê todos; o CQ, só a fábrica)
function temMeus() { const p = Auth.papel(); return p === 'gp' || p === 'tecnico' || !!Auth.areaProgramador(); }
function meus() {
  const area = Auth.areaProgramador();
  if (!area) return estado.projetos;
  const ids = new Set(estado.ops.filter(function (o) { return o.area === area; }).map(function (o) { return o.projetoId; }));
  return estado.projetos.filter(function (p) { return ids.has(p.id); });
}
function daFabrica() {
  if (Auth.souGerente()) return estado.projetos;
  if (!estado.projetosFabrica) {
    Store.escutarTodos(function (l) { estado.projetosFabrica = l; if (document.getElementById('tab-linha').classList.contains('active')) renderLinha(); },
      function () { estado.projetosFabrica = null; });
  }
  return estado.projetosFabrica || estado.projetos;
}

export function renderLinha() {
  if (!temMeus()) visao = 'fabrica';
  const v = $('tl-visao');
  if (v) v.innerHTML = temMeus() ? ['fabrica', 'meus'].map(function (k) {
    return '<button type="button" role="tab" aria-selected="' + (visao === k) + '" class="' + (visao === k ? 'ativa' : '') + '" data-acao="visaoLinha" data-arg="' + k + '">' + esc(T('tl.visao.' + k)) + '</button>';
  }).join('') : '';
  const fonte = visao === 'meus' ? meus() : daFabrica();
  const ordenados = fonte.slice().sort(function (a, b) { return a.entrega.localeCompare(b.entrega); });
  $('tl-sidebar-list').innerHTML = ordenados.length ? ordenados.map(function (p) {
    return '<button type="button" class="tl-sidebar-item" data-acao="focarNaLinha" data-arg="' + esc(p.id) + '">' +
      '<span class="cm">' + esc(p.commessa) + '</span>' + esc(p.descricao) + '</button>';
  }).join('') : '<div class="empty-state">' + esc(T(estado.carregado ? 'lista.semProjetos' : 'x.carregandoDados')) + '</div>';

  const itens = ordenados.map(function (p) { return { tipo: 'projeto', data: p.entrega, p: p }; });
  itens.push({ tipo: 'hoje', data: hoje() });
  itens.sort(function (a, b) { return a.data.localeCompare(b.data) || (a.tipo === 'hoje' ? -1 : 1); });

  let lado = 0;   // a alternância conta só os projetos, não a faixa HOJE
  $('timeline-track').innerHTML = itens.map(function (e) {
    if (e.tipo === 'hoje') {
      return '<div class="tl-row" id="tl-hoje" style="grid-template-columns:1fr;">' +
        '<div class="tl-today-row"><span class="tl-today-label">' + esc(T('x.hojeLinha', br(e.data))) + '</span></div></div>';
    }
    const p = e.p, st = Projeto.status(p), sitPcp = Projeto.situacaoPcp(p);
    const cls = st === 'atrasado' ? 'urgent' : (Projeto.aberto(p) ? '' : 'muted');
    const esquerda = lado++ % 2 === 0;
    // só abre o projeto de quem é do projeto (os outros só consultam aqui)
    const abre = (Auth.veProjetos() || !!Auth.areaProgramador()) && estado.projetos.some(function (x) { return x.id === p.id; });
    const card = '<' + (abre ? 'button type="button"' : 'div') + ' class="tl-card ' + cls + (abre ? '' : ' tl-so-leitura') + '" id="' + idElemento(p.id) + '"' +
      (abre ? ' data-acao="abrirProjeto" data-arg="' + esc(p.id) + '"' : '') + '>' +
      '<div class="tl-date" style="color:' + corStatus(st) + '">' + br(p.entrega) + ' · ' + esc(STATUS_LABEL(st)) + '</div>' +
      '<div class="tl-commessa">' + esc(p.commessa) + '</div>' +
      '<div class="tl-desc">' + esc(p.descricao) + '</div>' +
      '<div class="tl-meta"><span class="dot dot-' + sitPcp + '"></span>PCP ' + Projeto.progresso(p) + '% · ' + esc(p.cliente) + (p.gp && p.gp !== '—' ? ' · ' + esc(T('tl.gp', p.gp)) : '') + '</div></' + (abre ? 'button' : 'div') + '>';
    return '<div class="tl-row"><div class="tl-side ' + (esquerda ? '' : 'empty') + '">' + (esquerda ? card : '') + '</div>' +
      '<div class="tl-center"><div class="tl-dot" style="background:' + corStatus(st) + '"></div></div>' +
      '<div class="tl-side ' + (!esquerda ? '' : 'empty') + '">' + (!esquerda ? card : '') + '</div></div>';
  }).join('');
}

registrarAcoes({
  visaoLinha: function (k) {
    visao = k === 'meus' ? 'meus' : 'fabrica';
    try { localStorage.setItem('rostag.linha.visao', visao); } catch (e) { /* sem armazenamento */ }
    renderLinha();
  },
  focarNaLinha: function (id) {
    const el = $(idElemento(id));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.boxShadow = '0 0 0 2px ' + cor('--teal');
    setTimeout(function () { el.style.boxShadow = ''; }, 1200);
  }
});
