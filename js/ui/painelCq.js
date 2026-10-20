/* ---------------------------------------------------------------------------
   Painel do controle de qualidade — indicadores do mês (aprovadas × RNC e
   OPs em aberto × finalizadas), retrabalho, peças mortas e desvio. Os dois
   gráficos abrem em tela cheia com a visão semestral e anual.
--------------------------------------------------------------------------- */
import { estado } from '../estado.js';
import { esc, hoje } from '../nucleo/fmt.js';
import { T, codigoIdioma } from '../i18n/index.js';
import * as Rnc from '../dominio/rnc.js';
import * as Producao from '../dominio/producao.js';
import { $, registrarAcoes } from './dom.js';
import { abrirModal } from './modal.js';
import { desenhar, opcoesBase, legenda, cor, falhaGrafico } from './graficos.js';
import { irPara } from './rota.js';
import { cartao, desenharOla, ligarRelogio } from './gerencia.js';

function mesAtual() { return hoje().slice(0, 7); }
function nomeMes(mes, curto) {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString(codigoIdioma(), curto ? { month: 'short' } : { month: 'long', year: 'numeric' });
}
function agora() { return new Date().toISOString(); }

function rosca(id, rotulos, valores, cores) {
  const total = valores.reduce(function (a, b) { return a + b; }, 0);
  desenhar(id, { type: 'doughnut',
    data: { labels: rotulos, datasets: [{ data: total ? valores : [1], backgroundColor: total ? cores.map(cor) : [cor('--line')], borderWidth: 0, hoverOffset: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '70%', animation: { duration: 300 },
      plugins: { legend: { display: false }, tooltip: { enabled: !!total } } } });
}

function legendaHtml(itens) {
  const total = itens.reduce(function (a, x) { return a + x[2]; }, 0);
  return itens.map(function (x) {
    return '<div class="ger-leg"><span class="ger-leg-cor" style="background:var(' + x[1] + ')"></span><span class="ger-leg-rot">' + esc(x[0]) + '</span>' +
      '<b>' + x[2] + '</b><span class="ger-leg-pct">' + (total ? Math.round(x[2] / total * 100) : 0) + '%</span></div>';
  }).join('');
}

export function renderPainelCq() {
  ligarRelogio();
  desenharOla();
  const mes = mesAtual();
  const ind = Rnc.indicadoresMes(estado.ops, estado.rncs, mes, agora());
  const st = Producao.estatisticas(estado.ops);
  const taxa = Rnc.taxaAprovacao(ind);

  $('ger-cards').innerHTML =
    cartao('cqVerRetrabalho', T('cqp.retrabalho'), '<div class="value" style="color:var(--rust)">' + st.retrabalho + '</div>', T('cqp.retrabalhoDet')) +
    cartao('cqVerMortas', T('cqp.mortas'), '<div class="value">' + ind.mortas + '</div>', T('cqp.mortasDet', st.mortas)) +
    cartao('cqVerDesvio', T('cqp.desvio').toUpperCase(), '<div class="value" style="color:var(--terracotta)">' + ind.desvio + '</div>', T('cqp.desvioDet', st.desvio)) +
    cartao('cqVerAbertas', T('cqp.paraInspecionar'), '<div class="value">' + st.abertas + '</div>', T('cqp.paraInspecionarDet'));

  $('cq-mes-1').textContent = T('cqp.noMes', nomeMes(mes));
  $('cq-mes-2').textContent = T('cqp.agora');
  $('cq-aprov-centro').innerHTML = '<b>' + (taxa == null ? '—' : taxa + '%') + '</b><span>' + esc(T('cqp.taxa')) + '</span>';
  $('cq-aprov-legenda').innerHTML = legendaHtml([[T('cqp.aprovadas'), '--green', ind.aprovadas], [T('cqp.desvio'), '--terracotta', ind.desvio], [T('cqp.rncs'), '--rust', ind.rncs]]);
  const abertasAgora = st.abertas + st.retrabalho;
  $('cq-abertas-centro').innerHTML = '<b>' + abertasAgora + '</b><span>' + esc(T('cqp.emAberto')) + '</span>';
  $('cq-abertas-legenda').innerHTML = legendaHtml([[T('cqp.emAbertoSemRt'), '--amber', st.abertas], [T('cqp.emRetrabalho'), '--rust', st.retrabalho], [T('cqp.finalizadasMes'), '--green', ind.finalizadas]]);
  if (!window.Chart) { falhaGrafico('chartCqAprov'); falhaGrafico('chartCqAbertas'); return; }
  rosca('chartCqAprov', [T('cqp.aprovadas'), T('cqp.desvio'), T('cqp.rncs')], [ind.aprovadas, ind.desvio, ind.rncs], ['--green', '--terracotta', '--rust']);
  rosca('chartCqAbertas', [T('cqp.emAbertoSemRt'), T('cqp.emRetrabalho'), T('cqp.finalizadasMes')], [st.abertas, st.retrabalho, ind.finalizadas], ['--amber', '--rust', '--green']);
}

/* --------------------------------------------- tela cheia: semestre e ano */
let periodo = 6;
let foco = 'aprovacao';

function renderIndicadores() {
  const s = Rnc.serie(estado.ops, estado.rncs, mesAtual(), periodo, agora());
  const rot = s.map(function (x) { return nomeMes(x.mes, true) + '/' + x.mes.slice(2, 4); });
  const soma = function (k) { return s.reduce(function (a, x) { return a + x[k]; }, 0); };
  const tot = { aprovadas: soma('aprovadas'), desvio: soma('desvio'), rncs: soma('rncs'), finalizadas: soma('finalizadas'), mortas: soma('mortas') };
  const taxa = Rnc.taxaAprovacao(tot);
  $$periodo();
  $('cqi-titulo').textContent = T(periodo === 6 ? 'cqi.semestral' : 'cqi.anual');
  $('cqi-resumo').innerHTML = [
    [T('cqp.aprovadas'), tot.aprovadas, '--green'], [T('cqp.desvio'), tot.desvio, '--terracotta'], [T('cqp.rncs'), tot.rncs, '--rust'],
    [T('cqp.mortas'), tot.mortas, '--ink'], [T('cqp.taxa'), taxa == null ? '—' : taxa + '%', '--teal']
  ].map(function (k) { return '<div class="card kpi"><div class="label">' + esc(String(k[0]).toUpperCase()) + '</div><div class="value" style="color:var(' + k[2] + ')">' + k[1] + '</div></div>'; }).join('');
  $('cqi-card-aprov').classList.toggle('cqi-foco', foco === 'aprovacao');
  $('cqi-card-abertas').classList.toggle('cqi-foco', foco === 'abertas');
  if (!window.Chart) { ['chartCqiAprov', 'chartCqiAbertas', 'chartCqiPerdas'].forEach(falhaGrafico); return; }
  const base = legenda(opcoesBase(), true);
  desenhar('chartCqiAprov', { type: 'bar', data: { labels: rot, datasets: [
    { label: T('cqp.aprovadas'), data: s.map(function (x) { return x.aprovadas; }), backgroundColor: cor('--green'), stack: 'ok', borderRadius: 4 },
    { label: T('cqp.desvio'), data: s.map(function (x) { return x.desvio; }), backgroundColor: cor('--terracotta'), stack: 'ok', borderRadius: 4 },
    { label: T('cqp.rncs'), data: s.map(function (x) { return x.rncs; }), backgroundColor: cor('--rust'), stack: 'rnc', borderRadius: 4 }
  ] }, options: base });
  desenhar('chartCqiAbertas', { type: 'bar', data: { labels: rot, datasets: [
    { label: T('cqp.emAbertoFim'), data: s.map(function (x) { return x.emAberto; }), backgroundColor: cor('--amber'), stack: 'a', borderRadius: 4 },
    { label: T('cqp.finalizadasMes'), data: s.map(function (x) { return x.finalizadas; }), backgroundColor: cor('--green'), stack: 'f', borderRadius: 4 }
  ] }, options: base });
  desenhar('chartCqiPerdas', { type: 'bar', data: { labels: rot, datasets: [
    { label: T('cqp.emRetrabalhoFim'), data: s.map(function (x) { return x.retrabalho; }), backgroundColor: cor('--rust'), stack: 'r', borderRadius: 4 },
    { label: T('cqp.mortas'), data: s.map(function (x) { return x.mortas; }), backgroundColor: cor('--ink-dim'), stack: 'm', borderRadius: 4 },
    { label: T('cqp.desvio'), data: s.map(function (x) { return x.desvio; }), backgroundColor: cor('--terracotta'), stack: 'd', borderRadius: 4 }
  ] }, options: base });
}
function $$periodo() {
  [6, 12].forEach(function (n) {
    const b = $('cqi-p' + n);
    b.classList.toggle('ativa', n === periodo);
    b.setAttribute('aria-pressed', String(n === periodo));
  });
}

function abrirIndicadores(qual) {
  foco = qual === 'abertas' ? 'abertas' : 'aprovacao';
  abrirModal('modal-cq-ind', { foco: 'cqi-p' + periodo });
  // o modal precisa estar visível para o Chart.js medir o canvas
  requestAnimationFrame(renderIndicadores);
}

function verFabrica(visao) { estado.filtroFab.visao = visao; irPara('fabrica'); }

registrarAcoes({
  cqIndicadores: abrirIndicadores,
  cqPeriodo: function (n) { periodo = Number(n) === 12 ? 12 : 6; renderIndicadores(); },
  cqVerRetrabalho: function () { verFabrica('retrabalho'); },
  cqVerMortas: function () { verFabrica('mortas'); },
  cqVerDesvio: function () { verFabrica('desvio'); },
  cqVerAbertas: function () { verFabrica('abertas'); }
});
