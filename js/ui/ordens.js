/* ---------------------------------------------------------------------------
   Ordens de Produção — as OPs da área que ainda estão na fábrica (até o
   programador finalizar), organizadas por projeto. Clicar abre a janela
   com tudo da OP. Projeto atrasado: as OPs dele ganham a borda vermelha.
   Todos os cargos veem os cartões das commessas (só os seus projetos; o
   programador, só as OPs da área dele); o cartão abre, em tela cheia, as OPs
   do projeto com filtros (listaOps.js).
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, opVisivel } from '../estado.js';
import { esc, br, numeroBr, compararNatural } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Prog from '../dominio/programacao.js';
import * as Producao from '../dominio/producao.js';
import { abrirListaOps } from './listaOps.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes } from './dom.js';
import { naFila } from './opDetalhe.js';

const FILTROS = ['todas', 'emAberto', 'programada', 'baixaCq', 'rnc'];
const filtro = { sit: 'todas', area: '', busca: '' };

function areaAtual() { return Auth.areaProgramador() || filtro.area; }

function barra(rot, s) {
  return '<div class="av-linha"><span class="av-rot">' + esc(rot) + '</span><div class="bar"><div style="width:' + s.pct + '%"></div></div>' +
    '<span class="av-pct">' + s.pct + '%</span><span class="av-n">' + esc(T('fab.pecasDeN', numeroBr(s.pecasFeitas), numeroBr(s.pecas))) + '</span></div>';
}

// Todos os cargos: um cartão por projeto (só os projetos de quem está logado);
// o cartão abre, em tela cheia, as OPs do projeto (listaOps.js). Programador:
// só as OPs da área dele. Busca e situação filtram os cartões.
export function renderOrdens() {
  const areaP = Auth.areaProgramador(), area = areaAtual();
  $('ord-barra').style.display = '';
  $('ord-area').hidden = !!areaP;
  $('ord-area').value = filtro.area;
  if (document.activeElement !== $('ord-busca')) $('ord-busca').value = filtro.busca;
  const busca = filtro.busca.trim().toLowerCase();
  const fila = naFila();
  const sit = function (o) { return Prog.situacao(o, o.area === 'usinagem' && fila.has(o.id)); };
  const daArea = estado.ops.filter(function (o) { return opVisivel(o) && (!area || o.area === area); });
  const casa = function (o) { return !busca || [o.numero, o.desenho, o.descricao, o.commessa, o.produto].join(' ').toLowerCase().indexOf(busca) >= 0; };
  const base = daArea.filter(function (o) { return Prog.emProducao(o) && casa(o); });
  $('ord-filtros').innerHTML = FILTROS.map(function (k) {
    const n = k === 'todas' ? base.length : base.filter(function (o) { return sit(o) === k; }).length;
    const ativo = filtro.sit === k;
    return '<button type="button" role="tab" aria-selected="' + ativo + '" class="' + (ativo ? 'ativa' : '') + '" data-acao="filtroOrdens" data-arg="' + k + '">' +
      esc(T(k === 'todas' ? 'ord.todas' : 'prog.col.' + k)) + '<b>' + n + '</b></button>';
  }).join('');
  // projetos que aparecem: os que têm alguma OP que passa na busca e na situação
  const mostra = {};
  base.forEach(function (o) { if (filtro.sit === 'todas' || sit(o) === filtro.sit) mostra[o.projetoId] = true; });
  const por = {};
  daArea.forEach(function (o) { if (mostra[o.projetoId]) (por[o.projetoId] = por[o.projetoId] || []).push(o); });
  const ids = Object.keys(por).sort(function (a, b) {
    const pa = buscarProjeto(a), pb = buscarProjeto(b);
    const atrasoA = Prog.projetoAtrasado(pa) ? 0 : 1, atrasoB = Prog.projetoAtrasado(pb) ? 0 : 1;
    return atrasoA - atrasoB || compararNatural(por[a][0].commessa, por[b][0].commessa);
  });
  const total = ids.reduce(function (t, k) { return t + por[k].length; }, 0);
  $('ord-count').textContent = T('ord.contagem', total, ids.length);
  if (!ids.length) { $('ord-lista').innerHTML = '<div class="card panel-pad empty-state">' + esc(T(estado.ops.length && (busca || filtro.sit !== 'todas') ? 'fab.vazioFiltro' : 'ord.vazio')) + '</div>'; return; }
  $('ord-lista').innerHTML = '<div class="ord-cartoes">' + ids.map(function (pid) {
    const ops = por[pid], p = buscarProjeto(pid), o0 = ops[0];
    const s = Producao.estatisticas(ops);
    const conta = { emAberto: 0, programada: 0, baixaCq: 0, rnc: 0 };
    ops.forEach(function (o) { const k = sit(o); if (conta[k] != null) conta[k]++; });
    const atrasado = Prog.projetoAtrasado(p);
    const barras = area ? barra(T('area.' + area), s[area] || s) : barra(T('fab.geral'), s) + barra(T('area.caldeiraria'), s.caldeiraria) + barra(T('area.usinagem'), s.usinagem);
    return '<div class="card panel-pad av-card av-card-cq ord-cartao' + (atrasado ? ' op-proj-atrasado' : '') + '" data-acao="abrirOpsOrdens" data-arg="' + esc(pid) + '" role="button" tabindex="0">' +
      '<div class="av-head"><b class="mono">' + esc(o0.commessa) + '</b>' + (atrasado ? ' <span class="pill-prog prog-atrasado">' + esc(T('prog.projAtrasado')) + '</span>' : '') + '</div>' +
      '<div class="hint-txt av-desc">' + esc((p && p.descricao) || o0.descricaoProjeto || '') + '</div>' +
      '<div class="hint-txt">' + esc(T('ord.nOps', ops.length)) + (p && p.prodFim ? ' · ' + esc(T('prog.prazo', br(p.prodFim))) : '') + '</div>' +
      barras +
      '<div class="ord-contas">' + Object.keys(conta).map(function (k) {
        return '<span class="ord-conta ord-conta-' + k + (conta[k] ? '' : ' zero') + '"><b>' + conta[k] + '</b> ' + esc(T('prog.col.' + k)) + '</span>';
      }).join('') + '</div>' +
      '<div class="link-btn av-lista">' + esc(T('fab.cqVerOps')) + ' →</div></div>';
  }).join('') + '</div>';
}

document.addEventListener('input', function (e) {
  if (e.target && e.target.id === 'ord-busca') { filtro.busca = e.target.value; renderOrdens(); }
});

registrarAcoes({
  filtroOrdens: function (k) { if (FILTROS.indexOf(k) >= 0) { filtro.sit = k; renderOrdens(); } },
  areaOrdens: function (v) { filtro.area = v === 'caldeiraria' || v === 'usinagem' ? v : ''; renderOrdens(); },
  // o cartão abre as OPs do projeto já com a área, a situação e a busca daqui
  abrirOpsOrdens: function (pid) { abrirListaOps({ projetoId: pid, area: areaAtual(), sit: filtro.sit !== 'todas' ? filtro.sit : undefined, busca: filtro.busca.trim() }); }
});

