/* ---------------------------------------------------------------------------
   Ordens de Produção — as OPs da área que ainda estão na fábrica (até o
   programador finalizar), organizadas por projeto. Clicar abre a janela
   com tudo da OP. Projeto atrasado: as OPs dele ganham a borda vermelha.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto } from '../estado.js';
import { esc, br, numeroBr, compararNatural } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Prog from '../dominio/programacao.js';
import * as Projeto from '../dominio/projeto.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes } from './dom.js';
import { naFila, pillSituacao, classeAtraso } from './opDetalhe.js';

const FILTROS = ['todas', 'emAberto', 'programada', 'baixaCq', 'rnc'];
const filtro = { sit: 'todas', area: '', busca: '' };
const ICONES = { pintura: '🎨', servicoExterno: '🚚', ttat: '🔥', oxidacao: '⚫' };

function areaAtual() { return Auth.areaProgramador() || filtro.area; }

export function renderOrdens() {
  const area = areaAtual();
  $('ord-area').hidden = !!Auth.areaProgramador();
  $('ord-area').value = filtro.area;
  if (document.activeElement !== $('ord-busca')) $('ord-busca').value = filtro.busca;
  const busca = filtro.busca.trim().toLowerCase();
  const fila = naFila();
  const base = estado.ops.filter(function (o) {
    if (area && o.area !== area) return false;
    if (!Prog.emProducao(o)) return false;
    const p = buscarProjeto(o.projetoId);
    if (p && !Projeto.aberto(p)) return false;
    if (busca && [o.numero, o.desenho, o.descricao, o.commessa, o.produto].join(' ').toLowerCase().indexOf(busca) < 0) return false;
    return true;
  });
  const sit = function (o) { return Prog.situacao(o, o.area === 'usinagem' && fila.has(o.id)); };
  $('ord-filtros').innerHTML = FILTROS.map(function (k) {
    const n = k === 'todas' ? base.length : base.filter(function (o) { return sit(o) === k; }).length;
    const ativo = filtro.sit === k;
    return '<button type="button" role="tab" aria-selected="' + ativo + '" class="' + (ativo ? 'ativa' : '') + '" data-acao="filtroOrdens" data-arg="' + k + '">' +
      esc(T(k === 'todas' ? 'ord.todas' : 'prog.col.' + k)) + '<b>' + n + '</b></button>';
  }).join('');
  const lista = filtro.sit === 'todas' ? base : base.filter(function (o) { return sit(o) === filtro.sit; });
  const por = {};
  lista.forEach(function (o) { (por[o.projetoId] = por[o.projetoId] || []).push(o); });
  const ids = Object.keys(por).sort(function (a, b) {
    const pa = buscarProjeto(a), pb = buscarProjeto(b);
    const atrasoA = Prog.projetoAtrasado(pa) ? 0 : 1, atrasoB = Prog.projetoAtrasado(pb) ? 0 : 1;
    return atrasoA - atrasoB || String((pa && pa.prodFim) || '9').localeCompare(String((pb && pb.prodFim) || '9')) || compararNatural(por[a][0].commessa, por[b][0].commessa);
  });
  $('ord-count').textContent = T('ord.contagem', lista.length, ids.length);
  if (!ids.length) { $('ord-lista').innerHTML = '<div class="card panel-pad empty-state">' + esc(T(estado.ops.length ? 'fab.vazioFiltro' : 'ord.vazio')) + '</div>'; return; }
  $('ord-lista').innerHTML = ids.map(function (pid) {
    const ops = por[pid].sort(function (a, b) { return compararNatural(a.desenho, b.desenho) || compararNatural(a.posicao, b.posicao) || compararNatural(a.area, b.area); });
    const p = buscarProjeto(pid), o0 = ops[0];
    const atrasado = Prog.projetoAtrasado(p);
    return '<div class="card ord-projeto' + (atrasado ? ' op-proj-atrasado' : '') + '">' +
      '<div class="ord-topo"><b class="mono">' + esc(o0.commessa) + '</b> <span>' + esc((p && p.descricao) || o0.descricaoProjeto || '') + '</span>' +
        '<span class="ord-prazo">' + (p && p.prodFim ? esc(T('prog.prazo', br(p.prodFim))) : '') + (atrasado ? ' <span class="pill-prog prog-atrasado">' + esc(T('prog.projAtrasado')) + '</span>' : '') + '</span>' +
        '<span class="hint-txt">' + esc(T('ord.nOps', ops.length)) + '</span></div>' +
      '<div class="table-wrap"><table class="ord-tab"><thead><tr><th>OP</th><th>' + esc(T('fab.cArea')) + '</th><th>' + esc(T('fab.cDesenho')) + '</th><th>' + esc(T('fab.cPos')) + '</th><th>' +
        esc(T('fab.cDescricao')) + '</th><th class="num">' + esc(T('fab.cQtd')) + '</th><th class="num">' + esc(T('fab.cPeso')) + '</th><th>' + esc(T('av.cMarcas')) + '</th><th>' + esc(T('fab.cSituacao')) + '</th></tr></thead><tbody>' +
      ops.map(function (o) {
        const marcas = Object.keys(ICONES).filter(function (k) { return o.marcas && o.marcas[k]; }).map(function (k) { return '<span title="' + esc(T('av.marca.' + k)) + '">' + ICONES[k] + '</span>'; }).join(' ');
        return '<tr class="ord-linha' + classeAtraso(o) + '" data-acao="abrirOpDetalhe" data-arg="' + esc(o.id) + '" tabindex="0" role="button">' +
          '<td class="mono">' + esc(o.numero) + '</td><td><span class="pill-area area-' + esc(o.area) + '">' + esc(T('area.' + o.area)) + '</span></td>' +
          '<td class="mono">' + esc(o.desenho) + '</td><td>' + esc(o.posicao || '—') + '</td><td>' + esc(o.descricao || '—') +
          (o.obs ? '<div class="hint-txt op-obs">' + esc(o.obs) + '</div>' : '') + '</td><td class="num">' + numeroBr(o.qtd) + '</td><td class="num">' + numeroBr(o.pesoTotal) + '</td>' +
          '<td>' + marcas + '</td><td>' + pillSituacao(o) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }).join('');
}

document.addEventListener('input', function (e) {
  if (e.target && e.target.id === 'ord-busca') { filtro.busca = e.target.value; renderOrdens(); }
});

registrarAcoes({
  filtroOrdens: function (k) { if (FILTROS.indexOf(k) >= 0) { filtro.sit = k; renderOrdens(); } },
  areaOrdens: function (v) { filtro.area = v === 'caldeiraria' || v === 'usinagem' ? v : ''; renderOrdens(); }
});

