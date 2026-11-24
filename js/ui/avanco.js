/* ---------------------------------------------------------------------------
   Avanço do projeto — a planilha viva. Nasce da BOM (a planilha subida, o
   escopo) e se completa sozinha com as OPs do site: cada peça acha as OPs
   dela pelo desenho + posição e mostra Produto, OP Cald, OP Usi (6 dígitos) e
   o % pela baixa do programador. % da linha = média de Cald e Usi; % do
   projeto = por peça. Pintura, serviços e comercial são só marcas, por ora.
   Exportar (Excel) só Gerência, GP e técnico do projeto.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, opsDoProjeto, nomeProjeto } from '../estado.js';
import { esc, numeroBr, dataHora } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Avanco from '../dominio/avanco.js';
import * as Producao from '../dominio/producao.js';
import * as DadosAvanco from '../dados/avanco.js';
import * as BomResumo from './bomResumo.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal } from './modal.js';
import { toast } from './toast.js';
import { kpi } from './componentes.js';
import { garantirXlsx } from './bibliotecas.js';

let aberto = null;   // { projetoId, doc, itens, filtro, busca }

const SIMB = { comercial: '🛒', cald: '🔨', usin: '⚙️', pintura: '🎨', servicoExterno: '🚚' };

// Cada linha: { it (item da BOM), a (avancoLinha ou null) }
const FILTROS = {
  todos: function () { return true; },
  andamento: function (x) { return !!x.a && x.a.pct > 0 && x.a.pct < 100; },
  semOp: function (x) { return !!x.a && [x.a.cald, x.a.usin].some(function (s) { return s && !s.ops.length; }); },
  concluidos: function (x) { return !!x.a && x.a.pct === 100; },
  rnc: function (x) { return !!x.a && [x.a.cald, x.a.usin].some(function (s) { return s && s.rnc > 0; }); },
  comerciais: function (x) { return x.it.comercial; }
};

export function abrirAvanco(projetoId) {
  const p = buscarProjeto(projetoId);
  aberto = { projetoId: projetoId, doc: undefined, itens: null, filtro: 'todos', busca: '' };
  $('av-titulo').textContent = T('av.titulo', (p && nomeProjeto(p)) || '');
  $('av-sub').textContent = (p && p.descricao) || '';
  $('av-busca').value = '';
  $('av-filtros').innerHTML = '';
  $('av-corpo').innerHTML = '<div class="hint-txt">' + esc(T('av.carregando')) + '</div>';
  $('av-kpis').innerHTML = '';
  $('av-rodape').textContent = '';
  $('av-baixar').hidden = !BomResumo.podeMexer(p);
  $('av-baixar').disabled = true;
  abrirModal('modal-avanco', { aoFechar: function () { aberto = null; } });
  DadosAvanco.lerGuardada(projetoId).then(function (doc) {
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

function marca(k, v) {
  return v ? '<span class="pl-simb" role="img" title="' + esc(T('pl.marca.' + k)) + '" aria-label="' + esc(T('pl.marca.' + k)) + '">' + SIMB[k] + '</span>' : '';
}
// Cald/Usi: o símbolo e as peças com baixa ("3/5")
function celArea(k, s, it) {
  // programador: a área do outro fica trancada (ele não vê essas OPs)
  const area = k === 'cald' ? 'caldeiraria' : 'usinagem', so = Auth.areaProgramador();
  if (so && so !== area) return '<td class="pl-c">' + ((k === 'cald' ? it.cald : it.usin) ? '<span class="avv-tranca" title="' + esc(T('avv.foraArea', T('area.' + area))) + '">' + SIMB[k] + '🔒</span>' : '') + '</td>';
  if (!s) return '<td class="pl-c"></td>';
  const cor = s.feitas >= s.total ? ' ok' : s.feitas > 0 ? ' meio' : '';
  return '<td class="pl-c"><span class="pl-simb" role="img" aria-label="' + esc(T('pl.marca.' + k)) + '">' + SIMB[k] + '</span>' +
    '<div class="avv-n' + cor + '" title="' + esc(T('avv.dicaArea', T('pl.marca.' + k), numeroBr(s.feitas), numeroBr(s.total))) + '">' + numeroBr(s.feitas) + '/' + numeroBr(s.total) + '</div></td>';
}
// OP: só os 6 primeiros dígitos; a situação na cor do ponto e na dica
function celOp(s, area) {
  const so = Auth.areaProgramador();
  if (so && so !== area) return '<td class="mono"></td>';
  if (!s || !s.numero) return '<td class="mono">' + (s ? '<span class="avv-semop" title="' + esc(T('avv.semOp')) + '">—</span>' : '') + '</td>';
  const o = s.ops.filter(function (x) { return !x.origemOpId; })[0] || s.ops[0];
  const st = o ? Producao.statusOp(o) : 'semOp';
  const num = String(s.numero);
  const curto = /^\d{6}01001$/.test(num) ? num.slice(0, 6) : num;
  const dica = 'OP ' + num + (o ? ' · ' + T('op.' + st) : ' · ' + T('av.semAcesso')) + (s.rnc ? ' · ' + T('av.emRnc', numeroBr(s.rnc)) : '');
  return '<td class="mono nowrap" title="' + esc(dica) + '"><span class="avv-dot op-' + esc(st) + '"></span>' + esc(curto) + (s.ops.length > 1 ? '<sup>+' + (s.ops.length - 1) + '</sup>' : '') + '</td>';
}
function celPct(a) {
  if (!a) return '<td></td>';
  const partes = [];
  if (a.cald) partes.push(T('pl.marca.cald') + ' ' + Producao.pctPecas(a.cald.feitas, a.cald.total) + '%');
  if (a.usin) partes.push(T('pl.marca.usin') + ' ' + Producao.pctPecas(a.usin.feitas, a.usin.total) + '%');
  return '<td class="avv-pct" title="' + esc(partes.join(' · ')) + '"><div class="avv-trilho' + (a.pct === 100 ? ' ok' : '') + '"><div style="width:' + a.pct + '%"></div></div><b>' + a.pct + '%</b></td>';
}

export function render() {
  if (!aberto || !$('modal-avanco').classList.contains('open')) return;
  const ops = opsDoProjeto(aberto.projetoId);
  if (aberto.doc === undefined) return;
  if (!aberto.doc) {
    $('av-kpis').innerHTML = '';
    $('av-corpo').innerHTML = '<div class="empty-state">' + esc(T('avv.semBom')) + '</div>';
    $('av-baixar').disabled = true;
    return;
  }
  if (!aberto.itens) { $('av-corpo').innerHTML = '<div class="empty-state">' + esc(T('av.erroLer')) + '</div>'; return; }
  const idx = Avanco.indexarPorPeca(ops);
  const so = Auth.areaProgramador() || undefined;   // programador: só a área dele
  const linhas = aberto.itens.map(function (it) {
    const row = { k: Avanco.chavePeca(it.desenho, it.posicao), q: Number(it.qtd) > 0 ? Number(it.qtd) : 0, c: !!it.cald, u: !!it.usin, opCald: it.opCald || '', opUsin: it.opUsin || '' };
    return { it: it, a: it.comercial ? null : Avanco.avancoLinha(row, idx, so) };
  });
  const tot = Avanco.avancoProjeto(Avanco.linhasDaBom(aberto.itens), ops, so);
  const rnc = linhas.reduce(function (s, x) { return s + (x.a ? (x.a.cald ? x.a.cald.rnc : 0) + (x.a.usin ? x.a.usin.rnc : 0) : 0); }, 0);
  const pct = function (v, f, t) { return t ? v + '<small>%</small> <span class="hint-inline">' + esc(T('av.pecas', numeroBr(Math.round(f)), numeroBr(t))) + '</span>' : '—'; };
  $('av-kpis').innerHTML = (so ? '' : kpi(T('av.kTotal'), pct(tot.pct, tot.feitas, tot.pecas))) +
    (so !== 'usinagem' ? kpi(T('area.caldeiraria'), pct(tot.cald.pct, tot.cald.feitas, tot.cald.total)) : '') +
    (so !== 'caldeiraria' ? kpi(T('area.usinagem'), pct(tot.usin.pct, tot.usin.feitas, tot.usin.total)) : '') +
    kpi(T('av.kRnc'), rnc ? '<span style="color:var(--rust)">' + numeroBr(rnc) + '</span>' : '0');

  const base = linhas.filter(function (x) { return aberto.filtro === 'comerciais' || !x.it.comercial; });
  $('av-filtros').innerHTML = Object.keys(FILTROS).map(function (k) {
    const n = (k === 'comerciais' ? linhas : base).filter(FILTROS[k]).length;
    const ativo = k === aberto.filtro;
    return '<button type="button" role="tab" aria-selected="' + ativo + '" class="' + (ativo ? 'ativa' : '') + '" data-acao="filtroAvanco" data-arg="' + k + '">' + esc(T('avv.f.' + k)) + '<b>' + n + '</b></button>';
  }).join('');
  const busca = aberto.busca.trim().toLowerCase();
  const lista = base.filter(function (x) {
    if (!FILTROS[aberto.filtro](x)) return false;
    if (!busca) return true;
    const a = x.a || {};
    return [x.it.desenho, x.it.descricao, x.it.posicao, a.cald && a.cald.numero, a.usin && a.usin.numero, x.it.obs].join(' ').toLowerCase().indexOf(busca) >= 0;
  });
  const cab = [['pl.rev', 'pl-c'], ['pl.desenho', ''], ['pl.posicao', 'pl-c'], ['pl.descricao', ''], ['pl.qtdC', 'num'], ['pl.pesoUnitC', 'num'], ['pl.pesoTotalC', 'num'],
    ['pl.comercialC', 'pl-c', 'pl.comercial'], ['pl.caldC', 'pl-c', 'pl.cald'], ['pl.usinagemC', 'pl-c', 'pl.usinagem'], ['pl.pinturaC', 'pl-c', 'pl.pintura'], ['pl.servicosC', 'pl-c', 'pl.servicos'],
    ['pl.produto', ''], ['pl.opCald', ''], ['pl.opUsin', ''], ['avv.cAvanco', '']]
    .map(function (c) { return '<th class="' + c[1] + '"' + (c[2] ? ' title="' + esc(T(c[2])) + '"' : '') + '>' + esc(T(c[0])) + '</th>'; }).join('');
  const corpo = lista.map(function (x) {
    const it = x.it, a = x.a;
    const produto = (a && ((a.cald && a.cald.produto) || (a.usin && a.usin.produto))) || '';
    return '<tr class="' + (it.comercial ? 'av-comercial' : '') + (it.nivel ? ' pl-nivel' + Math.min(it.nivel, 3) : '') + '">' +
      '<td class="pl-c">' + esc(it.rev || '') + '</td><td class="mono">' + esc(it.desenho || '—') + '</td><td class="pl-c">' + esc(it.posicao || '—') + '</td>' +
      '<td class="pl-descricao">' + esc(it.descricao || '—') + '</td>' +
      '<td class="num">' + (it.qtd == null ? '' : numeroBr(it.qtd)) + '</td><td class="num">' + (it.pesoUnit == null ? '' : numeroBr(it.pesoUnit)) + '</td>' +
      '<td class="num">' + (it.pesoTotal == null ? '' : numeroBr(it.pesoTotal)) + '</td>' +
      '<td class="pl-c">' + marca('comercial', it.comercial) + '</td>' + celArea('cald', a && a.cald, it) + celArea('usin', a && a.usin, it) +
      '<td class="pl-c">' + marca('pintura', it.marcas && it.marcas.pintura) + '</td>' +
      '<td class="pl-c">' + marca('servicoExterno', it.marcas && (it.marcas.servicoExterno || it.marcas.ttat || it.marcas.oxidacao)) + '</td>' +
      '<td class="mono pl-cod">' + esc(produto) + '</td>' + celOp(a && a.cald, 'caldeiraria') + celOp(a && a.usin, 'usinagem') + celPct(a) + '</tr>';
  }).join('');
  $('av-corpo').innerHTML = '<div class="table-wrap pl-wrap"><table class="ord-tab pl-tab avv-tab"><thead><tr>' + cab + '</tr></thead><tbody>' +
    (corpo || '<tr><td colspan="16"><div class="empty-state">' + esc(T('fab.vazioFiltro')) + '</div></td></tr>') + '</tbody></table></div>';
  const d = aberto.doc;
  $('av-rodape').textContent = T('avv.rodape', d.enviadoPorNome || '—', dataHora(d.enviadoEm), d.arquivo || '');
  $('av-baixar').disabled = false;
}

function baixar(_a, _b, btn) {
  if (!aberto || !aberto.doc || !BomResumo.podeMexer(buscarProjeto(aberto.projetoId))) return;
  comBotaoOcupado(btn, exportarPlanilha(aberto.doc, aberto.projetoId));
}

/**
 * Gera o .xlsx da planilha do projeto (doc lido de dados/avanco.js).
 * opcoes.bom: a BOM como foi subida (sem preencher nada); sem ela: o Avanço,
 * com as peças com baixa do programador preenchidas no layout da planilha.
 */
export function exportarPlanilha(doc, projetoId, opcoes) {
  const bom = !!(opcoes && opcoes.bom);
  return garantirXlsx().then(function (XLSX) {
    const matriz = doc.matriz.map(function (l) { return l.slice(); });
    const r = bom ? { matriz: matriz, celulas: [] } : Avanco.preencher(matriz, doc.merges, opsDoProjeto(projetoId));
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
    XLSX.utils.book_append_sheet(wb, ws, String(doc.aba || (bom ? 'BOM' : 'AVANÇO')).slice(0, 31));
    const p = buscarProjeto(projetoId);
    const nome = ((bom ? 'BOM - ' : 'AVANÇO - ') + ((p && nomeProjeto(p)) || doc.commessa || 'projeto')).replace(/[\\/:*?"<>|]+/g, '-');
    XLSX.writeFile(wb, nome + '.xlsx');
  }).catch(function (e) { console.warn(e); toast(T('av.erroBaixar'), { tipo: 'erro' }); });
}

document.addEventListener('input', function (e) {
  if (e.target && e.target.id === 'av-busca' && aberto) { aberto.busca = e.target.value; render(); }
});

registrarAcoes({
  abrirAvanco: function (id) { const p = id || estado.idDetalhe; if (p) abrirAvanco(p); },
  filtroAvanco: function (f) { if (aberto && FILTROS[f]) { aberto.filtro = f; render(); } },
  baixarAvanco: baixar
});
