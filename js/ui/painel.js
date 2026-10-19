/* ---------------------------------------------------------------------------
   Painel Geral — indicadores, "precisa de atenção" e gráficos.
--------------------------------------------------------------------------- */
import { estado } from '../estado.js';
import { prefs } from '../nucleo/prefs.js';
import { esc, br, hoje, difDias } from '../nucleo/fmt.js';
import { T, plural, STATUS_LABEL, SIT_LABEL } from '../i18n/index.js';
import { STATUS_KEYS, SIT_KEYS } from '../dominio/constantes.js';
import * as Projeto from '../dominio/projeto.js';
import * as Cronograma from '../dominio/cronograma.js';
import * as Serie from '../dominio/serie.js';
import { $, registrarAcoes } from './dom.js';
import { filtrarDash, contarFiltros } from './filtros.js';
import { renderNotificacoes } from './notificacoes.js';
import { desenhar, opcoesBase, legenda, cor, corStatus, corSituacao, falhaGrafico } from './graficos.js';
import { irPara } from './rota.js';
import { limparFiltroProjComStatus } from './projetos.js';
import { souGerencia, souGP, souTecnico, souProgramador, renderPainelGerencia, renderPainelTecnico, renderPainelProgramador } from './gerencia.js';

const COR_STATUS = { andamento: 'violet', concluido: 'green', atrasado: 'rust', paralisado: 'amber', cancelado: 'ink-faint' };
const FUNDO_STATUS = { andamento: 'violet-bg', concluido: 'green-bg', atrasado: 'rust-bg', paralisado: 'amber-bg', cancelado: 'bg-panel-alt' };

export function renderPainel() {
  const lista = filtrarDash();
  // Gerência, GP e técnico têm o painel novo (gerencia.js); o GP usa o da
  // Gerência com os projetos dele. O "Precisa de atenção" é comum.
  const gerencia = souGerencia(), gp = souGP(), tecnico = souTecnico(), prog = souProgramador();
  document.body.classList.toggle('visao-gerente', gerencia);
  document.body.classList.toggle('painel-novo', gerencia || gp || tecnico || prog);
  if (gerencia || gp || tecnico || prog) {
    escopo(lista.length);
    if (prog) { renderPainelProgramador(); renderNotificacoes(); return; }
    renderAtencao(lista);
    if (tecnico) renderPainelTecnico(lista); else renderPainelGerencia(lista);
    renderNotificacoes();
    return;
  }
  const contagem = { andamento: 0, concluido: 0, atrasado: 0, paralisado: 0, cancelado: 0 };
  lista.forEach(function (p) { contagem[Projeto.status(p)]++; });
  const total = lista.length;

  const kpis = '<div class="card kpi"><div class="label">' + esc(T('kpi.total')) + '</div>' +
    '<div class="value-row"><div class="value" style="color:var(--ink)">' + total + '</div></div></div>' +
    STATUS_KEYS.map(function (k) {
      const pct = total ? Math.round(contagem[k] / total * 100) : 0;
      return '<button type="button" class="card kpi" data-acao="verProjetosPorStatus" data-arg="' + k + '" title="' + esc(T('g.verProjetos')) + '">' +
        '<div class="label">' + esc(T('kpi.' + k)) + '</div>' +
        '<div class="value-row"><div class="value" style="color:var(--' + COR_STATUS[k] + ')">' + contagem[k] + '</div>' +
        '<span class="share" style="background:var(--' + FUNDO_STATUS[k] + '); color:var(--' + COR_STATUS[k] + ');">' + pct + '%</span></div></button>';
    }).join('');
  $('kpi-grid').innerHTML = kpis;
  escopo(total);

  renderAtencao(lista);
  renderGraficos(lista, contagem);
  renderNotificacoes();
}

function escopo(total) {
  const nf = contarFiltros(estado.filtroDash);
  $('dash-scope').textContent = nf
    ? T('painel.escopoFiltro', total, estado.projetos.length, plural(nf, 'painel.filtroAtivo', 'painel.filtrosAtivos'))
    : T('painel.escopoTudo', plural(estado.projetos.length, 'lista.projeto', 'lista.projetos'));
}

// Junta num só painel o que precisa de ação: tarefa atrasada, tarefa vencendo, entrega chegando.
function renderAtencao(lista) {
  const h = hoje();
  $('prazos-note').textContent = T('g.atencaoNota', prefs.alertaTarefa, prefs.alerta);
  const itens = [];
  // paralisado para inteiro: não entra nos alertas de prazo
  lista.filter(function (p) { return Projeto.aberto(p) && Projeto.status(p) !== 'paralisado'; }).forEach(function (p) {
    const r = Cronograma.resumo(p);
    if (r.situacao === 'atrasada' || r.situacao === 'chegando') {
      const alvo = r.crono.itens.find(function (i) { return i.situacao === r.situacao; });
      itens.push({ p: p, grave: r.situacao === 'atrasada', data: alvo.fim,
        rot: r.situacao === 'atrasada'
          ? T('x.tarefaAtraso', plural(alvo.atrasoDias, 'x.diaAtraso', 'x.diasAtraso'), alvo.t)
          : T('x.tarefaVence', alvo.t, br(alvo.fim)) });
    } else if (difDias(h, p.entrega) <= prefs.alerta) {
      const d = difDias(h, p.entrega);
      itens.push({ p: p, grave: d < 0, data: p.entrega,
        rot: d < 0 ? T('x.entregaAtrasada', plural(-d, 'x.dia', 'x.dias'))
          : (d === 0 ? T('x.entregaHoje') : T('x.entregaEm', plural(d, 'x.dia', 'x.dias'))) });
    }
  });
  itens.sort(function (a, b) { return (b.grave - a.grave) || a.data.localeCompare(b.data); });

  $('prazos-proximos').innerHTML = itens.length ? itens.map(function (it) {
    return '<button type="button" class="tl-sidebar-item atencao-item ' + (it.grave ? 'grave' : 'aviso') + '" data-acao="abrirProjeto" data-arg="' + esc(it.p.id) + '">' +
      '<div class="atencao-topo"><span>' + esc(it.p.commessa) + '</span><span>' + br(it.data) + '</span></div>' +
      '<div class="atencao-desc">' + esc(it.p.descricao) + '</div>' +
      '<div class="atencao-rot">' + esc(it.rot) + '</div></button>';
  }).join('') : '<div class="empty-state">' + esc(T('g.atencaoVazio')) + '</div>';
}

function renderGraficos(lista, contagem) {
  if (!window.Chart) { ['chartStatus', 'chartPrazo', 'chartTarefas', 'chartPontualidade'].forEach(falhaGrafico); return; }
  const base = opcoesBase();

  desenhar('chartStatus', { type: 'bar',
    data: { labels: STATUS_KEYS.map(STATUS_LABEL),
      datasets: [{ data: STATUS_KEYS.map(function (k) { return contagem[k]; }),
        backgroundColor: STATUS_KEYS.map(corStatus), borderRadius: 6, borderSkipped: false }] },
    options: base });

  // No prazo x atrasados nas últimas 8 semanas
  const s = Serie.prazoSemanal(lista, 8);
  const ultAtras = s.atrasados[7], ultTotal = ultAtras + s.noPrazo[7];
  const variacao = ultAtras - s.atrasados[0];
  $('prazo-note').textContent = ultTotal
    ? T('g.prazoNota', ultAtras, ultTotal) +
      (variacao === 0 ? T('g.prazoIgual') : (variacao > 0 ? T('g.prazoMais', variacao) : T('g.prazoMenos', -variacao)))
    : T('g.prazoVazio');
  desenhar('chartPrazo', { type: 'line',
    data: { labels: s.rotulos, datasets: [
      { label: T('g.prazoNoPrazo'), data: s.noPrazo, borderColor: cor('--green'), backgroundColor: 'rgba(22,163,74,0.12)',
        fill: true, tension: 0.35, pointRadius: 3, pointBackgroundColor: cor('--green') },
      { label: T('g.prazoAtrasados'), data: s.atrasados, borderColor: cor('--rust'), backgroundColor: 'rgba(220,38,38,0.12)',
        fill: true, tension: 0.35, pointRadius: 3, pointBackgroundColor: cor('--rust') }
    ] },
    options: legenda(base) });

  // Tarefas por situação, somando os projetos abertos do recorte
  const porSit = {};
  SIT_KEYS.forEach(function (k) { porSit[k] = 0; });
  let totalTarefas = 0;
  const abertos = lista.filter(Projeto.aberto);
  abertos.forEach(function (p) {
    Cronograma.calcular(p).itens.forEach(function (i) { porSit[i.situacao]++; totalTarefas++; });
  });
  $('tarefas-note').textContent = totalTarefas
    ? T('g.tarefasNota', totalTarefas, plural(abertos.length, 'x.projetoAberto', 'x.projetosAbertos'), porSit.atrasada, porSit.chegando)
    : T('g.tarefasVazio');
  desenhar('chartTarefas', { type: 'bar',
    data: { labels: SIT_KEYS.map(SIT_LABEL),
      datasets: [{ data: SIT_KEYS.map(function (k) { return porSit[k]; }),
        backgroundColor: SIT_KEYS.map(corSituacao), borderRadius: 6, borderSkipped: false }] },
    options: base });

  // Pontualidade das entregas no semestre corrente
  const sem = Serie.semestreAtual();
  const dados = Serie.pontualidade(lista, sem.ano, sem.meses);
  $('pontual-titulo').textContent = T('g.pontualSem', sem.rotulo, sem.ano);
  const okSem = dados.noPrazo.reduce(function (a, b) { return a + b; }, 0);
  const totalSem = okSem + dados.atrasado.reduce(function (a, b) { return a + b; }, 0);
  $('pontual-note').textContent = totalSem
    ? T('g.pontualNota', okSem, totalSem, Math.round(okSem / totalSem * 100))
    : T('g.pontualVazio');
  desenhar('chartPontualidade', { type: 'bar',
    data: { labels: dados.rotulos, datasets: [
      { label: T('g.noPrazo'), data: dados.noPrazo, backgroundColor: cor('--green'), borderRadius: 6, borderSkipped: false },
      { label: T('g.atrasadas'), data: dados.atrasado, backgroundColor: cor('--rust'), borderRadius: 6, borderSkipped: false }
    ] },
    options: legenda(base, true) });
}

registrarAcoes({
  verProjetosPorStatus: function (k) { limparFiltroProjComStatus(k); irPara('projetos'); }
});
