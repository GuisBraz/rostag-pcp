/* ---------------------------------------------------------------------------
   Painel da Gerência — saudação, cartões (total, carga de trabalho, OPs) e
   o andamento dos projetos. Os outros cargos continuam com o painel geral.
   A tela cheia de carga mostra quantos projetos abertos cada GP e cada
   técnico de processo têm, separados por andamento.
--------------------------------------------------------------------------- */
import { estado, opsDoProjeto } from '../estado.js';
import { prefs } from '../nucleo/prefs.js';
import { esc, br, brCurto, hoje, difDias } from '../nucleo/fmt.js';
import { T, plural, codigoIdioma, SIT_LABEL } from '../i18n/index.js';
import * as Cronograma from '../dominio/cronograma.js';
import * as Projeto from '../dominio/projeto.js';
import * as Producao from '../dominio/producao.js';
import * as Papeis from '../dominio/papeis.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes } from './dom.js';
import { abrirModal, fecharModal } from './modal.js';
import { desenhar, destruir, cor, falhaGrafico } from './graficos.js';
import { irPara } from './rota.js';
import { limparFiltroProjComStatus } from './projetos.js';

const GRUPOS = ['andamento', 'vencendo', 'atrasado'];
const COR_GRUPO = { andamento: '--teal', vencendo: '--amber', atrasado: '--rust', paralisado: '--ink-faint' };

let membros = null, membrosDaEquipe = null;   // cache da lista de membros (nomes e cargos)
let relogio = null;

export function souGerencia() { return Papeis.ehGerente(Auth.papel()); }

// Em andamento · vencendo (entrega dentro do aviso de prazo) · atrasado.
// Paralisado fica de fora do gráfico, mas aparece na carga.
export function grupo(p, h) {
  const s = Projeto.status(p);
  if (s === 'atrasado') return 'atrasado';
  if (s === 'paralisado') return 'paralisado';
  if (s !== 'andamento') return null;
  return difDias(h || hoje(), p.entrega) <= prefs.alerta ? 'vencendo' : 'andamento';
}

/* -------------------------------------------------------------- saudação */
function primeiroNome() { return (Auth.nomeExibicao() || '').trim().split(/\s+/)[0] || ''; }
function desenharOla() {
  const agora = new Date();
  const dia = agora.toLocaleDateString(codigoIdioma(), { weekday: 'long' });
  const hora = String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');
  $('ger-ola-nome').textContent = T('ger.ola', primeiroNome());
  $('ger-ola-quando').textContent = dia.charAt(0).toUpperCase() + dia.slice(1) + ', ' + br(hoje()) + ' · ' + hora;
}
function ligarRelogio() {
  if (relogio) return;
  relogio = setInterval(function () { if (souGerencia() && $('ger-ola-nome').offsetParent) desenharOla(); }, 20000);
}

/* --------------------------------------------------------------- cartões */
function cartao(acao, rotulo, valorHtml, detalhe) {
  return '<button type="button" class="card kpi ger-card" data-acao="' + acao + '">' +
    '<div class="label">' + esc(rotulo) + '</div>' +
    '<div class="value-row">' + valorHtml + '</div>' +
    '<div class="ger-card-detalhe">' + esc(detalhe) + ' <span aria-hidden="true">→</span></div></button>';
}

function desenharCartoes(lista) {
  const abertos = lista.filter(Projeto.aberto);
  const pessoas = new Set();
  abertos.forEach(function (p) { if (p.gpUid) pessoas.add(p.gpUid); if (p.responsavelUid) pessoas.add(p.responsavelUid); });
  const ops = Producao.estatisticas(estado.ops);
  $('ger-cards').innerHTML =
    cartao('gerVerProjetos', T('kpi.total'), '<div class="value">' + lista.length + '</div>',
      T('ger.totalDet', abertos.length)) +
    cartao('abrirCarga', T('ger.carga').toUpperCase(), '<div class="value">' + abertos.length + '</div>',
      T('ger.cargaDet', plural(pessoas.size, 'ger.pessoa', 'ger.pessoas'))) +
    cartao('gerVerOps', T('ger.ops'),
      '<div class="value" style="color:var(--green)">' + ops.aprovadas + '</div><span class="ger-sep">/</span>' +
      '<div class="value" style="color:var(--rust)">' + ops.rnc + '</div>',
      T('ger.opsDet', ops.aprovadas, ops.rnc, ops.abertas));
}

/* ------------------------------------------------------------- andamento */
function desenharAndamento(lista) {
  const h = hoje();
  const n = { andamento: 0, vencendo: 0, atrasado: 0, paralisado: 0 };
  lista.forEach(function (p) { const g = grupo(p, h); if (g) n[g]++; });
  const total = n.andamento + n.vencendo + n.atrasado;
  $('ger-andamento-nota').textContent = T('ger.andamentoNota', prefs.alerta) +
    (n.paralisado ? ' ' + T('ger.andamentoParados', plural(n.paralisado, 'lista.projeto', 'lista.projetos')) : '');
  $('ger-rosca-centro').innerHTML = '<b>' + total + '</b><span>' + esc(T(total === 1 ? 'ger.aberto' : 'ger.abertos')) + '</span>';
  $('ger-andamento-legenda').innerHTML = GRUPOS.map(function (g) {
    const pct = total ? Math.round(n[g] / total * 100) : 0;
    return '<div class="ger-leg"><span class="ger-leg-cor" style="background:var(' + COR_GRUPO[g] + ')"></span>' +
      '<span class="ger-leg-rot">' + esc(T('ger.g.' + g)) + '</span>' +
      '<b>' + n[g] + '</b><span class="ger-leg-pct">' + pct + '%</span></div>';
  }).join('');
  if (!window.Chart) { falhaGrafico('chartAndamento'); return; }
  desenhar('chartAndamento', { type: 'doughnut',
    data: { labels: GRUPOS.map(function (g) { return T('ger.g.' + g); }),
      datasets: [{ data: total ? GRUPOS.map(function (g) { return n[g]; }) : [1],
        backgroundColor: total ? GRUPOS.map(function (g) { return cor(COR_GRUPO[g]); }) : [cor('--line')],
        borderWidth: 0, hoverOffset: total ? 6 : 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '72%', animation: { duration: 300 },
      plugins: { legend: { display: false }, tooltip: { enabled: total > 0 } } } });
}

export function renderPainelGerencia(lista) {
  ligarRelogio();
  desenharOla();
  desenharCartoes(lista);
  desenharAndamento(lista);
  if ($('modal-carga').classList.contains('open')) desenharCarga();
}

/* ---------------------------------------------------- carga de trabalho */
function carregarMembros() {
  const equipe = Auth.equipeAtualId();
  if (membros && membrosDaEquipe === equipe) return Promise.resolve(membros);
  return Auth.listarEquipe().then(function (m) { membros = m; membrosDaEquipe = equipe; return m; })
    .catch(function (e) { console.warn(e); return []; });
}

// Uma linha por pessoa: quem tem o cargo e quem aparece nos projetos.
function linhasCarga(campo, cargo, ms, abertos) {
  const coord = Auth.coordenadorUidAtual();
  const pessoas = {};
  ms.forEach(function (m) {
    if (Papeis.papelEfetivo(m.papel, m.uid === coord) === cargo) pessoas[m.uid] = { nome: m.nome || m.email || '—', email: m.email || '' };
  });
  abertos.forEach(function (p) {
    const uid = p[campo];
    if (!uid) return;
    if (!pessoas[uid]) {
      const m = ms.find(function (x) { return x.uid === uid; });
      pessoas[uid] = { nome: m ? (m.nome || m.email) : (campo === 'gpUid' && p.gp) || '—', email: m ? m.email || '' : '' };
    }
  });
  const h = hoje();
  const linhas = Object.keys(pessoas).map(function (uid) {
    const l = { uid: uid, nome: pessoas[uid].nome, andamento: 0, vencendo: 0, atrasado: 0, paralisado: 0, total: 0 };
    abertos.forEach(function (p) {
      if (p[campo] !== uid) return;
      const g = grupo(p, h);
      if (g) { l[g]++; l.total++; }
    });
    return l;
  });
  // dois com o mesmo nome: o e-mail desempata no gráfico
  const vezes = {};
  linhas.forEach(function (l) { vezes[l.nome] = (vezes[l.nome] || 0) + 1; });
  linhas.forEach(function (l) { if (vezes[l.nome] > 1 && pessoas[l.uid].email) l.nome += ' (' + pessoas[l.uid].email + ')'; });
  linhas.sort(function (a, b) { return (b.total - a.total) || a.nome.localeCompare(b.nome, 'pt-BR'); });
  return linhas;
}

function desenharGraficoCarga(id, caixa, linhas) {
  $(caixa).style.height = Math.max(120, linhas.length * 38 + 60) + 'px';
  if (!window.Chart) { falhaGrafico(id); return; }
  const series = GRUPOS.concat(['paralisado']);
  desenhar(id, { type: 'bar',
    data: { labels: linhas.map(function (l) { return l.nome; }),
      datasets: series.map(function (g) {
        return { label: T('ger.g.' + g), data: linhas.map(function (l) { return l[g]; }),
          backgroundColor: cor(COR_GRUPO[g]), borderRadius: 4, borderSkipped: false, barThickness: 18 };
      }) },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      plugins: { legend: { display: true, position: 'bottom',
        labels: { color: cor('--ink-dim'), font: { family: 'Inter', size: 11 }, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' } } },
      scales: {
        x: { stacked: true, beginAtZero: true, ticks: { precision: 0, color: cor('--ink-dim'), font: { family: 'Inter', size: 11 } }, grid: { color: cor('--line-soft') } },
        y: { stacked: true, ticks: { color: cor('--ink'), font: { family: 'Inter', size: 12, weight: '600' } }, grid: { display: false } }
      } } });
}

function kpi(rot, valor) { return '<div class="ano-kpi"><div class="rot">' + esc(rot) + '</div><div class="val">' + valor + '</div></div>'; }

function desenharCarga() {
  const abertos = estado.projetos.filter(Projeto.aberto);
  carregarMembros().then(function (ms) {
    if (!$('modal-carga').classList.contains('open')) return;
    const gps = linhasCarga('gpUid', 'gp', ms, abertos);
    const tecs = linhasCarga('responsavelUid', 'tecnico', ms, abertos);
    const semTec = abertos.filter(function (p) { return !p.responsavelUid; }).length;
    const maior = gps.concat(tecs).filter(function (l) { return l.total; }).sort(function (a, b) { return b.total - a.total; })[0];
    $('carga-resumo').innerHTML =
      kpi(T('ger.cResAbertos'), String(abertos.length)) +
      kpi(T('ger.cResGps'), String(gps.length)) +
      kpi(T('ger.cResTecs'), String(tecs.length)) +
      kpi(T('ger.cResSemTec'), '<span style="color:var(' + (semTec ? '--amber' : '--green') + ')">' + semTec + '</span>') +
      kpi(T('ger.cResMaior'), maior ? esc(maior.nome) + ' · ' + maior.total : '—');
    $('carga-gp-nota').textContent = gps.length ? T('ger.cargaGpNota') : T('ger.cargaVazio');
    $('carga-tec-nota').textContent = tecs.length ? T('ger.cargaTecNota') : T('ger.cargaVazio');
    desenharGraficoCarga('chartCargaGp', 'carga-gp-caixa', gps);
    desenharGraficoCarga('chartCargaTec', 'carga-tec-caixa', tecs);
  });
}

function abrirCarga() {
  membros = null;   // lista fresca a cada abertura: alguém pode ter entrado ou mudado de cargo
  abrirModal('modal-carga', { aoFechar: function () { destruir('chartCargaGp'); destruir('chartCargaTec'); } });
  desenharCarga();
}

/* ------------------------------------------ acompanhamento das atividades */
// No detalhe do projeto a Gerência não mexe no checklist do técnico: vê o
// progresso, as datas e o que está atrasado, numa linha do tempo só de leitura.
const COR_SIT = { planejada: '--ink-faint', andamento: '--teal', chegando: '--amber', atrasada: '--rust', parada: '--ink-faint', concluida: '--green' };

function situacaoGeral(p, c, h) {
  if (c.concluido) return { txt: T('ac.concluido', br(c.fimPrevisto)), cor: '--green' };
  if (Projeto.status(p) === 'paralisado') return { txt: T('ac.parado'), cor: '--amber-ink' };
  const atrasadas = c.itens.filter(function (i) { return i.situacao === 'atrasada'; });
  if (atrasadas.length) {
    const maior = Math.max.apply(null, atrasadas.map(function (i) { return i.atrasoDias; }));
    return { txt: T('ac.emAtraso', plural(atrasadas.length, 'ac.atividade', 'ac.atividades'), plural(maior, 'x.dia', 'x.dias')), cor: '--rust' };
  }
  if (p.pcpFim && p.pcpFim < h) return { txt: T('ac.passouFim', plural(difDias(p.pcpFim, h), 'x.dia', 'x.dias')), cor: '--rust' };
  if (c.estouro > 0) return { txt: T('ac.vaiPassar', plural(c.estouro, 'x.dia', 'x.dias')), cor: '--amber-ink' };
  return { txt: T('ac.noPrazo'), cor: '--green' };
}

function etiqueta(it) {
  if (it.situacao === 'concluida') return T('ac.feitaEm', it.doneAt ? brCurto(it.doneAt) : '—');
  if (it.situacao === 'atrasada') return T('ac.atrasadaDias', plural(it.atrasoDias, 'x.dia', 'x.dias'));
  return SIT_LABEL(it.situacao);
}

export function renderAcompanhamento(p) {
  const resumo = $('ac-resumo'), gantt = $('ac-gantt');
  if (Projeto.aguardandoCronograma(p)) {
    resumo.innerHTML = '<div class="empty-state">' + esc(T('ac.aguardando')) + '</div>';
    gantt.innerHTML = '';
    return;
  }
  const h = hoje(), c = Cronograma.calcular(p), pr = Projeto.progresso(p);
  const feitas = c.itens.filter(function (i) { return i.done; }).length;
  const sg = situacaoGeral(p, c, h);
  resumo.innerHTML =
    '<div class="ac-progresso"><div class="ac-pct">' + pr + '<small>%</small></div>' +
      '<div class="ac-barra-wrap"><div class="ac-barra"><div style="width:' + pr + '%"></div></div>' +
      '<div class="hint-txt">' + esc(T('ac.feitas', feitas, c.itens.length)) + '</div></div></div>' +
    '<div class="ano-resumo ac-kpis">' +
      kpi(T('ac.inicio'), br(p.pcpInicio)) +
      kpi(T('ac.fimPlanejado').toUpperCase(), br(p.pcpFim)) +
      kpi(T('ac.terminoPrevisto'), '<span style="color:var(' + (c.estouro > 0 && !c.concluido ? '--rust' : '--ink') + ')">' + br(c.fimPrevisto) + '</span>') +
      kpi(T('ac.situacao'), '<span class="ac-sit" style="color:var(' + sg.cor + ')">' + esc(sg.txt) + '</span>') +
    '</div>';

  if (!c.itens.length) { gantt.innerHTML = '<div class="empty-state">' + esc(T('ac.semAtividades')) + '</div>'; return; }
  // escala da linha do tempo: do início da 1ª atividade ao maior entre o fim previsto e o fim planejado
  let lo = c.itens[0].inicio, hi = c.fimPrevisto;
  c.itens.forEach(function (i) { if (i.inicio < lo) lo = i.inicio; if (i.fim > hi) hi = i.fim; });
  if (p.pcpFim && p.pcpFim > hi) hi = p.pcpFim;
  const total = difDias(lo, hi) + 1;
  const pos = function (d) { return Math.max(0, Math.min(100, difDias(lo, d) / total * 100)); };
  const marcaHoje = h >= lo && h <= hi ? '<div class="ac-hoje" style="left:' + (pos(h) + 50 / total) + '%" title="' + esc(T('ac.hoje') + ' ' + br(h)) + '"></div>' : '';
  const marcaFim = p.pcpFim ? '<div class="ac-limite" style="left:' + (pos(p.pcpFim) + 100 / total) + '%" title="' + esc(T('ac.fimPlanejado') + ' ' + br(p.pcpFim)) + '"></div>' : '';

  gantt.innerHTML =
    '<div class="ac-escala-leg"><span><i class="ac-ico-hoje"></i>' + esc(T('ac.hoje')) + '</span>' +
      '<span><i class="ac-ico-limite"></i>' + esc(T('ac.fimPlanejado')) + '</span></div>' +
    '<div class="ac-linha ac-escala"><span></span><div class="ac-escala-datas"><span>' + br(lo) + '</span><span>' + br(hi) + '</span></div><span></span><span></span></div>' +
    c.itens.map(function (it) {
      const obs = (p.checklist[it.idx].obs || '').trim();
      const largura = Math.max(100 / total, (difDias(it.inicio, it.fim) + 1) / total * 100);
      return '<div class="ac-linha">' +
        '<div class="ac-nome" title="' + esc(it.t) + '"><span class="dot dot-' + it.situacao + '"></span><span>' + esc(it.t) + '</span>' +
          (obs ? '<span class="ac-obs" title="' + esc(T('cr.obs') + ': ' + obs) + '">📝</span>' : '') + '</div>' +
        '<div class="ac-trilho">' + marcaHoje + marcaFim +
          '<div class="ac-bar" style="left:' + pos(it.inicio) + '%; width:' + largura + '%; background:var(' + COR_SIT[it.situacao] + ')"' +
          ' title="' + esc(it.t + ' · ' + T('cr.deAte', br(it.inicio), br(it.fim))) + '"></div></div>' +
        '<div class="ac-datas">' + brCurto(it.inicio) + ' → ' + brCurto(it.fim) + '</div>' +
        '<div class="ac-etq ac-etq-' + it.situacao + '">' + esc(etiqueta(it)) + '</div>' +
      '</div>';
    }).join('');
}

/* ------------------------------------------------------ áreas do projeto */
// Detalhe do projeto para a Gerência: três cartões com resumo (Processos,
// Planejamento, Qualidade); o escolhido abre a área logo abaixo.
const AREAS_PROJETO = ['processos', 'planejamento', 'qualidade'];
let areaAtual = 'processos';

function cartaoArea(area, titulo, valorHtml, detalhe, corVal) {
  const ativo = area === areaAtual;
  return '<button type="button" class="card ger-area' + (ativo ? ' ativa' : '') + '" role="tab" aria-selected="' + ativo + '"' +
    ' data-acao="abrirAreaProjeto" data-arg="' + area + '">' +
    '<div class="ger-area-tit">' + esc(titulo) + '</div>' +
    '<div class="ger-area-val" style="color:var(' + (corVal || '--ink') + ')">' + valorHtml + '</div>' +
    '<div class="ger-area-det">' + esc(detalhe) + '</div></button>';
}

export function renderAreasProjeto(p) {
  const c = Projeto.aguardandoCronograma(p) ? null : Cronograma.calcular(p);
  const atrasadas = c ? c.itens.filter(function (i) { return i.situacao === 'atrasada'; }).length : 0;
  const ops = opsDoProjeto(p.id), st = Producao.estatisticas(ops);
  $('ger-areas').innerHTML =
    cartaoArea('processos', T('ar.processos'),
      c ? Projeto.progresso(p) + '<small>%</small>' : '—',
      !c ? T('sit.aguardando') : (atrasadas ? T('ar.procAtrasadas', plural(atrasadas, 'ar.ativ', 'ar.ativs')) : T('ar.procOk')),
      !c ? '--ink-faint' : (atrasadas ? '--rust' : '--teal')) +
    cartaoArea('planejamento', T('ar.planejamento'),
      st.total ? st.pct + '<small>%</small>' : '—',
      st.total ? T('ar.planDet', st.aprovadas, st.total) : T('d.semOps'), st.total ? '--violet' : '--ink-faint') +
    cartaoArea('qualidade', T('ar.qualidade'),
      String(st.rnc), T('ar.cqDet', plural(st.rnc, 'ar.rnc', 'ar.rncs'), st.abertas), st.rnc ? '--rust' : '--green');
  AREAS_PROJETO.forEach(function (a) { $('area-' + a).hidden = a !== areaAtual; });
  if (areaAtual === 'processos') renderAcompanhamento(p);
  else if (areaAtual === 'planejamento') renderPlanejamento(p, st);
  else renderQualidade(ops, st);
}

function barraArea(rotulo, a) {
  return '<div class="plan-area"><div class="plan-area-topo"><b>' + esc(rotulo) + '</b><span>' + a.pct + '%</span></div>' +
    '<div class="ac-barra"><div style="width:' + a.pct + '%; background:var(--violet)"></div></div>' +
    '<div class="hint-txt">' + esc(T('ar.planArea', a.aprovadas, a.total, a.abertas, a.rnc)) + '</div></div>';
}

function renderPlanejamento(p, st) {
  const sit = Producao.situacao(p, st, hoje());
  const corSit = { atrasada: '--rust', concluida: '--green', andamento: '--violet', parada: '--amber-ink' }[sit] || '--ink-dim';
  $('plan-conteudo').innerHTML =
    '<div class="ano-resumo ac-kpis">' +
      kpi(T('ar.inicioProd'), br(p.pcpFim)) + kpi(T('ar.fimProd'), br(p.prodFim)) +
      kpi(T('ac.situacao'), '<span class="ac-sit" style="color:var(' + corSit + ')">' + esc(T('prod.' + sit)) + '</span>') +
      kpi(T('ar.totalOps'), String(st.total)) +
    '</div>' +
    (st.total ? barraArea(T('fab.geral'), st) + barraArea(T('area.caldeiraria'), st.caldeiraria) + barraArea(T('area.usinagem'), st.usinagem)
      : '<div class="empty-state">' + esc(T('d.semOps')) + '</div>') +
    '<div class="plan-embreve">' +
      '<div class="plan-embreve-item"><b>' + esc(T('ar.cargaMaquina')) + '</b><span>' + esc(T('ar.emBreve')) + '</span></div>' +
      '<div class="plan-embreve-item"><b>' + esc(T('ar.cargaFabrica')) + '</b><span>' + esc(T('ar.emBreve')) + '</span></div>' +
    '</div>';
}

function quandoFeito(o) { return o.finalizadoEm ? br(String(o.finalizadoEm).slice(0, 10)) : '—'; }

function renderQualidade(ops, st) {
  const rncs = ops.filter(function (o) { return o.status === 'rnc'; })
    .sort(function (a, b) { return String(b.finalizadoEm || '').localeCompare(String(a.finalizadoEm || '')); });
  const inspecionadas = st.aprovadas + st.rnc;
  const taxa = inspecionadas ? Math.round(st.aprovadas / inspecionadas * 100) : 0;
  const legenda = [['aprovadas', '--green', st.aprovadas], ['comRnc', '--rust', st.rnc], ['pendentes', '--amber', st.abertas]];
  $('cq-conteudo').innerHTML =
    '<div class="ano-resumo ac-kpis">' +
      kpi(T('ar.aprovadas'), '<span style="color:var(--green)">' + st.aprovadas + '</span>') +
      kpi(T('ar.comRnc'), '<span style="color:var(--rust)">' + st.rnc + '</span>') +
      kpi(T('ar.pendentes'), '<span style="color:var(--amber-ink)">' + st.abertas + '</span>') +
      kpi(T('ar.taxa'), inspecionadas ? taxa + '%' : '—') +
    '</div>' +
    (st.total
      ? '<div class="cq-grafico"><div class="ger-rosca cq-rosca"><canvas id="chartCq"></canvas>' +
          '<div class="ger-rosca-centro"><b>' + st.total + '</b><span>' + esc(T('ar.opsRot')) + '</span></div></div>' +
          '<div class="ger-legenda">' + legenda.map(function (x) {
            return '<div class="ger-leg"><span class="ger-leg-cor" style="background:var(' + x[1] + ')"></span><span class="ger-leg-rot">' + esc(T('ar.leg.' + x[0])) + '</span>' +
              '<b>' + x[2] + '</b><span class="ger-leg-pct">' + Math.round(x[2] / st.total * 100) + '%</span></div>';
          }).join('') + '</div></div>'
      : '<div class="empty-state">' + esc(T('d.semOps')) + '</div>') +
    '<div class="cq-rncs"><h4>' + esc(T('ar.rncsTitulo')) + '</h4>' +
      (rncs.length ? rncs.map(function (o) {
        return '<div class="cq-rnc"><div class="cq-rnc-topo"><span class="mono">OP ' + esc(o.numero) + '</span>' +
          '<span class="pill-area area-' + esc(o.area) + '">' + esc(T('area.' + o.area)) + '</span>' +
          '<span class="hint-txt">' + esc(T('rnc.peca', o.desenho, o.posicao || '—')) + '</span></div>' +
          '<div class="cq-rnc-obs">' + esc(o.rncObs || '—') + '</div>' +
          '<div class="hint-txt">' + esc((o.finalizadoPorNome || '—') + ' · ' + quandoFeito(o)) + '</div></div>';
      }).join('') : '<div class="hint-txt">' + esc(T('ar.semRnc')) + '</div>') +
    '</div>';
  if (!st.total) return;
  if (!window.Chart) { falhaGrafico('chartCq'); return; }
  desenhar('chartCq', { type: 'doughnut',
    data: { labels: legenda.map(function (x) { return T('ar.leg.' + x[0]); }),
      datasets: [{ data: legenda.map(function (x) { return x[2]; }), backgroundColor: legenda.map(function (x) { return cor(x[1]); }), borderWidth: 0, hoverOffset: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '72%', animation: { duration: 300 }, plugins: { legend: { display: false } } } });
}

registrarAcoes({
  abrirAreaProjeto: function (area) {
    if (AREAS_PROJETO.indexOf(area) < 0) return;
    areaAtual = area;
    const p = estado.idDetalhe && estado.projetos.find(function (x) { return x.id === estado.idDetalhe; });
    if (p) renderAreasProjeto(p);
  }
});

registrarAcoes({
  abrirCarga: abrirCarga,
  fecharCarga: function () { fecharModal('modal-carga'); },
  gerVerProjetos: function () { limparFiltroProjComStatus(''); irPara('projetos'); },
  gerVerOps: function () { irPara('fabrica'); }
});
