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

function idElemento(id) { return 'tl-item-' + String(id).replace(/[^\w-]/g, '_'); }

export function renderLinha() {
  const ordenados = estado.projetos.slice().sort(function (a, b) { return a.entrega.localeCompare(b.entrega); });
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
    // programadores só consultam: o cartão não abre o projeto
    const abre = Auth.veProjetos();
    const card = '<' + (abre ? 'button type="button"' : 'div') + ' class="tl-card ' + cls + (abre ? '' : ' tl-so-leitura') + '" id="' + idElemento(p.id) + '"' +
      (abre ? ' data-acao="abrirProjeto" data-arg="' + esc(p.id) + '"' : '') + '>' +
      '<div class="tl-date" style="color:' + corStatus(st) + '">' + br(p.entrega) + ' · ' + esc(STATUS_LABEL(st)) + '</div>' +
      '<div class="tl-commessa">' + esc(p.commessa) + '</div>' +
      '<div class="tl-desc">' + esc(p.descricao) + '</div>' +
      '<div class="tl-meta"><span class="dot dot-' + sitPcp + '"></span>PCP ' + Projeto.progresso(p) + '% · ' + esc(p.cliente) + '</div></' + (abre ? 'button' : 'div') + '>';
    return '<div class="tl-row"><div class="tl-side ' + (esquerda ? '' : 'empty') + '">' + (esquerda ? card : '') + '</div>' +
      '<div class="tl-center"><div class="tl-dot" style="background:' + corStatus(st) + '"></div></div>' +
      '<div class="tl-side ' + (!esquerda ? '' : 'empty') + '">' + (!esquerda ? card : '') + '</div></div>';
  }).join('');
}

registrarAcoes({
  focarNaLinha: function (id) {
    const el = $(idElemento(id));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.boxShadow = '0 0 0 2px ' + cor('--teal');
    setTimeout(function () { el.style.boxShadow = ''; }, 1200);
  }
});
