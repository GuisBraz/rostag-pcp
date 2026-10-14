/* ---------------------------------------------------------------------------
   Filtros do Painel e da lista de Projetos.
--------------------------------------------------------------------------- */
import { estado } from '../estado.js';
import { T, meses } from '../i18n/index.js';
import { esc } from '../nucleo/fmt.js';
import * as Projeto from '../dominio/projeto.js';
import { $, registrarAcoes } from './dom.js';
import { alternarPopup } from './app.js';
import { renderPainel } from './painel.js';
import { renderProjetos } from './projetos.js';

export function contarFiltros(f) { return Object.keys(f).filter(function (k) { return f[k]; }).length; }

export function atualizarBadge(qual, f) {
  const n = contarFiltros(f), b = $(qual + '-filter-badge');
  b.textContent = n;
  b.style.display = n ? 'inline-block' : 'none';
}
function lerCampos(prefixo, alvo) {
  Object.keys(alvo).forEach(function (k) { const el = $(prefixo + '-' + k); if (el) alvo[k] = el.value.trim(); });
}
export function limparCampos(prefixo, alvo) {
  Object.keys(alvo).forEach(function (k) { alvo[k] = ''; const el = $(prefixo + '-' + k); if (el) el.value = ''; });
}

function casaPcp(p, alvo) { return !alvo || Projeto.situacaoPcp(p) === alvo; }

export function filtrarDash() {
  const f = estado.filtroDash;
  const desc = f.descricao.toLowerCase();
  return estado.projetos.filter(function (p) {
    if (f.ano && p.entrega.slice(0, 4) !== f.ano) return false;
    if (f.mes && p.entrega.slice(5, 7) !== f.mes) return false;
    if (f.solicDe && (!p.dataSolicitacao || p.dataSolicitacao < f.solicDe)) return false;
    if (f.entregaAte && p.entrega > f.entregaAte) return false;
    if (desc && p.descricao.toLowerCase().indexOf(desc) < 0) return false;
    if (f.gp && p.gp !== f.gp) return false;
    if (f.tipo && p.tipoServico !== f.tipo) return false;
    if (f.status && Projeto.status(p) !== f.status) return false;
    return casaPcp(p, f.pcp);
  });
}
export function filtrarProj() {
  const f = estado.filtroProj;
  const busca = f.busca.toLowerCase();
  return estado.projetos.filter(function (p) {
    if (f.status && Projeto.status(p) !== f.status) return false;
    if (!casaPcp(p, f.pcp)) return false;
    if (f.gp && p.gp !== f.gp) return false;
    if (f.tipo && p.tipoServico !== f.tipo) return false;
    if (busca) {
      const alvo = (p.commessa + ' ' + p.cliente + ' ' + p.descricao + ' ' + p.om).toLowerCase();
      if (alvo.indexOf(busca) < 0) return false;
    }
    return true;
  });
}

/* ------------------------------------------------- opções dos selects */
function unicos(campo) {
  const set = {};
  estado.projetos.forEach(function (p) { if (p[campo] && p[campo] !== '—') set[p[campo]] = 1; });
  return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
}
function preencherSelect(id, valores, atual) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = '<option value="">' + esc(T('btn.todos')) + '</option>' +
    valores.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join('');
  el.value = valores.indexOf(atual) >= 0 ? atual : '';
}
function preencherDatalist(id, valores) {
  const el = $(id);
  if (el) el.innerHTML = valores.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('');
}
export function refreshOpcoes() {
  const gps = unicos('gp'), tipos = unicos('tipoServico'), clientes = unicos('cliente');
  preencherSelect('df-gp', gps, estado.filtroDash.gp);
  preencherSelect('df-tipo', tipos, estado.filtroDash.tipo);
  preencherSelect('pf-gp', gps, estado.filtroProj.gp);
  preencherSelect('pf-tipo', tipos, estado.filtroProj.tipo);
  preencherDatalist('dl-tipo', tipos);
  preencherDatalist('dl-cliente', clientes);

  const anos = {};
  estado.projetos.forEach(function (p) { if (p.entrega) anos[p.entrega.slice(0, 4)] = 1; });
  const elAno = $('df-ano');
  elAno.innerHTML = '<option value="">' + esc(T('btn.todos')) + '</option>' + Object.keys(anos).sort().reverse()
    .map(function (a) { return '<option value="' + esc(a) + '">' + esc(a) + '</option>'; }).join('');
  elAno.value = estado.filtroDash.ano in anos ? estado.filtroDash.ano : '';
  const elMes = $('df-mes');
  elMes.innerHTML = '<option value="">' + esc(T('btn.todos')) + '</option>' + meses().map(function (m, i) {
    return '<option value="' + String(i + 1).padStart(2, '0') + '">' + esc(m) + '</option>';
  }).join('');
  elMes.value = estado.filtroDash.mes;
}

registrarAcoes({
  toggleFilterPanel: function (qual, _b, el) { alternarPopup(qual + '-filter-panel', el); },
  aplicarFiltroDash: function () {
    lerCampos('df', estado.filtroDash);
    atualizarBadge('dash', estado.filtroDash);
    $('dash-filter-panel').classList.remove('open');
    renderPainel();
  },
  limparFiltroDash: function () { limparCampos('df', estado.filtroDash); atualizarBadge('dash', estado.filtroDash); renderPainel(); },
  aplicarFiltroProj: function () {
    lerCampos('pf', estado.filtroProj);
    atualizarBadge('proj', estado.filtroProj);
    $('proj-filter-panel').classList.remove('open');
    renderProjetos();
  },
  limparFiltroProj: function () { limparCampos('pf', estado.filtroProj); atualizarBadge('proj', estado.filtroProj); renderProjetos(); }
});
