/* ---------------------------------------------------------------------------
   Lista de avanço do projeto — todas as linhas da planilha que o PCP subiu,
   cada uma com a situação das OPs dela (por peças), e o botão que devolve a
   planilha no mesmo layout com o avanço preenchido.
   Abre pelo cartão do projeto na Fábrica e pelo detalhe do projeto.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, opsDoProjeto } from '../estado.js';
import { esc, numeroBr, dataHora } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Avanco from '../dominio/avanco.js';
import * as Producao from '../dominio/producao.js';
import * as DadosAvanco from '../dados/avanco.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal } from './modal.js';
import { toast } from './toast.js';
import { kpi } from './componentes.js';
import { garantirXlsx } from './bibliotecas.js';

let aberto = null;   // { projetoId, doc, itens, filtro, busca }

const FILTROS = {
  todos: function () { return true; },
  abertos: function (it, s) { return [s.cald, s.usin].some(function (x) { return x && (x.situacao === 'aberta' || x.situacao === 'retrabalho'); }); },
  rnc: function (it, s) { return [s.cald, s.usin].some(function (x) { return x && x.pecas && x.pecas.rnc > 0; }); },
  concluidos: function (it, s) {
    const areas = [s.cald, s.usin].filter(function (x) { return x && x.situacao !== 'semOp'; });
    return areas.length > 0 && areas.every(function (x) { return x.pecas && x.pecas.total > 0 && x.pecas.feitas >= x.pecas.total; });
  },
  servico: function (it) { return !!(it.marcas.servicoExterno || it.marcas.ttat || it.marcas.oxidacao); },
  comerciais: function (it) { return it.comercial; }
};

export function abrirAvanco(projetoId) {
  const p = buscarProjeto(projetoId);
  const op = opsDoProjeto(projetoId)[0];
  aberto = { projetoId: projetoId, doc: null, itens: null, filtro: 'todos', busca: '' };
  $('av-titulo').textContent = T('av.titulo', (p && p.commessa) || (op && op.commessa) || '');
  $('av-sub').textContent = (p && p.descricao) || (op && (op.descricaoProjeto || op.cliente)) || '';
  $('av-busca').value = '';
  $('av-corpo').innerHTML = '<div class="hint-txt">' + esc(T('av.carregando')) + '</div>';
  $('av-kpis').innerHTML = '';
  $('av-rodape').textContent = '';
  $('av-baixar').disabled = true;
  abrirModal('modal-avanco', { aoFechar: function () { aberto = null; } });
  DadosAvanco.ler(projetoId).then(function (doc) {
    if (!aberto || aberto.projetoId !== projetoId) return;
    aberto.doc = doc;
    const lidos = doc ? Avanco.itens(doc.matriz) : null;
    aberto.itens = lidos ? lidos.itens : null;
    render();
  }).catch(function (e) {
    console.warn(e);
    if (aberto) $('av-corpo').innerHTML = '<div class="empty-state">' + esc(T('av.erroLer')) + '</div>';
  });
}

function pillSit(s) {
  if (!s || s.situacao === 'semOp') return '';
  if (s.situacao === 'naoEncontrada') return '<span class="mono">' + esc(s.numero) + '</span><div class="hint-txt">' + esc(T('av.semAcesso')) + '</div>';
  const pc = s.pecas;
  const txtPecas = pc ? T('av.pecas', numeroBr(pc.feitas), numeroBr(pc.total)) + (pc.rnc ? ' · ' + T('av.emRnc', numeroBr(pc.rnc)) : '') : '';
  return '<span class="mono">' + esc(s.numero) + '</span> <span class="pill-op op-' + esc(s.situacao) + '">' + esc(T('op.' + s.situacao)) + '</span>' +
    '<div class="hint-txt' + (pc && pc.rnc ? ' av-rnc-txt' : '') + '">' + esc(txtPecas) + '</div>';
}

const ICONES = { pintura: '🎨', servicoExterno: '🚚', ttat: '🔥', oxidacao: '⚫' };
function marcasHtml(it) {
  return Object.keys(ICONES).filter(function (k) { return it.marcas[k]; })
    .map(function (k) { return '<span title="' + esc(T('av.marca.' + k)) + '" aria-label="' + esc(T('av.marca.' + k)) + '">' + ICONES[k] + '</span>'; }).join(' ');
}

export function render() {
  if (!aberto || !$('modal-avanco').classList.contains('open')) return;
  const ops = opsDoProjeto(aberto.projetoId);
  const st = Producao.estatisticas(ops);
  const pct = function (a) { return a.pecas ? a.pct + '<small>%</small> <span class="hint-inline">' + esc(T('av.pecas', numeroBr(a.pecasFeitas), numeroBr(a.pecas))) + '</span>' : '—'; };
  $('av-kpis').innerHTML = kpi(T('av.kTotal'), pct(st)) + kpi(T('area.caldeiraria'), pct(st.caldeiraria)) + kpi(T('area.usinagem'), pct(st.usinagem)) +
    kpi(T('av.kRnc'), st.pecasRnc ? '<span style="color:var(--rust)">' + numeroBr(st.pecasRnc) + '</span>' : '0');
  if (!aberto.doc) {
    $('av-corpo').innerHTML = '<div class="empty-state">' + esc(T('av.semLista')) + '</div>';
    $('av-baixar').disabled = true;
    return;
  }
  if (!aberto.itens) { $('av-corpo').innerHTML = '<div class="empty-state">' + esc(T('av.erroLer')) + '</div>'; return; }
  const idx = Avanco.indexarOps(ops);
  const busca = aberto.busca.trim().toLowerCase();
  const comSit = aberto.itens.map(function (it) {
    return { it: it, s: { cald: it.opCald ? Avanco.situacaoArea(it, 'caldeiraria', idx) : null, usin: it.opUsin ? Avanco.situacaoArea(it, 'usinagem', idx) : null } };
  });
  $('av-filtros').innerHTML = Object.keys(FILTROS).map(function (k) {
    const n = comSit.filter(function (x) { return FILTROS[k](x.it, x.s); }).length;
    const ativo = k === aberto.filtro;
    return '<button type="button" role="tab" aria-selected="' + ativo + '" class="' + (ativo ? 'ativa' : '') + '" data-acao="filtroAvanco" data-arg="' + k + '">' + esc(T('av.f.' + k)) + '<b>' + n + '</b></button>';
  }).join('');
  const lista = comSit.filter(function (x) {
    if (!FILTROS[aberto.filtro](x.it, x.s)) return false;
    if (busca && [x.it.desenho, x.it.descricao, x.it.posicao, x.it.opCald, x.it.opUsin, x.it.produto, x.it.obs].join(' ').toLowerCase().indexOf(busca) < 0) return false;
    return true;
  });
  const linhas = lista.map(function (x) {
    const it = x.it;
    return '<tr class="' + (it.comercial ? 'av-comercial' : '') + '"><td class="num">' + esc(it.item || '') + '</td>' +
      '<td class="mono">' + esc(it.desenho || '—') + '</td>' +
      '<td><span class="av-pos" style="padding-left:' + (it.nivel * 12) + 'px">' + esc(it.posicao || '—') + '</span></td>' +
      '<td>' + esc(it.descricao || '—') + (it.comercial ? ' <span class="pill-area av-pill-com">' + esc(T('av.comercial')) + '</span>' : '') +
        (it.produto ? '<div class="hint-txt">' + esc(T('av.produto', it.produto)) + '</div>' : '') + '</td>' +
      '<td class="num">' + numeroBr(it.qtd) + '</td><td class="av-marcas">' + marcasHtml(it) + '</td>' +
      '<td>' + pillSit(x.s.cald) + '</td><td>' + pillSit(x.s.usin) + '</td>' +
      '<td class="av-obs">' + esc(it.obs || '') + '</td></tr>';
  }).join('');
  $('av-corpo').innerHTML = '<div class="table-wrap av-tabela"><table><thead><tr>' +
    ['av.cItem', 'fab.cDesenho', 'fab.cPos', 'fab.cDescricao', 'fab.cQtd', 'av.cMarcas', 'area.caldeiraria', 'area.usinagem', 'av.cObs']
      .map(function (k) { return '<th>' + esc(T(k)) + '</th>'; }).join('') +
    '</tr></thead><tbody>' + (linhas || '<tr><td colspan="9"><div class="empty-state">' + esc(T('fab.vazioFiltro')) + '</div></td></tr>') + '</tbody></table></div>';
  const d = aberto.doc;
  $('av-rodape').textContent = T('av.enviada', d.enviadoPorNome || '—', dataHora(d.enviadoEm), d.arquivo || '') + (d.opPintura ? ' · ' + T('fab.rPintura', d.opPintura) : '');
  $('av-baixar').disabled = false;
}

// A planilha de volta: mesma aba, com o avanço por peças e o resumo corrigido.
function baixar(_a, _b, btn) {
  if (!aberto || !aberto.doc) return;
  comBotaoOcupado(btn, exportarPlanilha(aberto.doc, aberto.projetoId));
}

// Gera o .xlsx da lista de avanço (doc lido de dados/avanco.js) com o avanço por peças.
export function exportarPlanilha(doc, projetoId) {
  return garantirXlsx().then(function (XLSX) {
    const r = Avanco.preencher(doc.matriz.map(function (l) { return l.slice(); }), doc.merges, opsDoProjeto(projetoId));
    if (!r) throw new Error('avanco-ilegivel');
    const ws = XLSX.utils.aoa_to_sheet(r.matriz.map(function (l) { return l.map(function (v) { return v == null ? null : v; }); }));
    r.celulas.forEach(function (c) {
      const ref = XLSX.utils.encode_cell({ r: c.r, c: c.c });
      const cel = { t: 'n', v: c.v };
      if (c.f) cel.f = c.f;
      if (c.z) cel.z = c.z;
      ws[ref] = cel;
    });
    const fim = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    r.celulas.forEach(function (c) { fim.e.r = Math.max(fim.e.r, c.r); fim.e.c = Math.max(fim.e.c, c.c); });
    ws['!ref'] = XLSX.utils.encode_range(fim);
    if (doc.merges && doc.merges.length) ws['!merges'] = doc.merges;
    if (doc.larguras && doc.larguras.length) ws['!cols'] = doc.larguras.map(function (w) { return w ? { wch: w } : {}; });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, String(doc.aba || 'AVANÇO').slice(0, 31));
    const p = buscarProjeto(projetoId);
    const nome = ('AVANÇO - ' + ((p && p.commessa) || doc.commessa || 'projeto')).replace(/[\\/:*?"<>|]+/g, '-');
    XLSX.writeFile(wb, nome + '.xlsx');
  }).catch(function (e) { console.warn(e); toast(T('av.erroBaixar'), { tipo: 'erro' }); });
}

document.addEventListener('input', function (e) {
  if (e.target && e.target.id === 'av-busca' && aberto) { aberto.busca = e.target.value; render(); }
});

registrarAcoes({
  abrirAvanco: abrirAvanco,
  filtroAvanco: function (f) { if (aberto && FILTROS[f]) { aberto.filtro = f; render(); } },
  baixarAvanco: baixar
});
