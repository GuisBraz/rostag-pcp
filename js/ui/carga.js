/* ---------------------------------------------------------------------------
   Carga — telas de carga máquina (usinagem) e carga fábrica (caldeiraria).
     programador de usinagem → carga máquina · programador de caldeiraria →
     carga fábrica · Gerente de PCP → as duas (abas)
   O cálculo fica em dominio/carga.js; a gravação em dados/carga.js.
--------------------------------------------------------------------------- */
import { estado } from '../estado.js';
import { esc, br, brCurto, hoje } from '../nucleo/fmt.js';
import { T, plural } from '../i18n/index.js';
import * as Carga from '../dominio/carga.js';
import * as Projeto from '../dominio/projeto.js';
import * as Auth from '../dados/auth.js';
import * as DadosCarga from '../dados/carga.js';
import { $, registrarAcoes } from './dom.js';
import { confirmar } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';
import { desenhar, cor, falhaGrafico } from './graficos.js';

let abaCarga = null;          // 'usinagem' | 'caldeiraria'
let filtroOps = 'pendentes';  // 'pendentes' | 'todas'

function areasPermitidas() {
  const p = Auth.papel();
  if (p === 'prog_usinagem') return ['usinagem'];
  if (p === 'prog_caldeiraria') return ['caldeiraria'];
  if (p === 'gerente_pcp') return ['usinagem', 'caldeiraria'];
  return [];
}
function podeEditar(area) { return areasPermitidas().indexOf(area) >= 0; }
function fmtNum(n, casas) {
  return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: casas == null ? 0 : casas, minimumFractionDigits: 0 });
}
function kpi(rot, valor) { return '<div class="ano-kpi"><div class="rot">' + esc(rot) + '</div><div class="val">' + valor + '</div></div>'; }
function rotSemana(s, i) { return i === 0 ? T('cg.estaSemana') : brCurto(s.inicio); }

export function renderCarga() {
  const areas = areasPermitidas();
  if (!areas.length) return;
  if (areas.indexOf(abaCarga) < 0) abaCarga = areas[0];
  $('carga-abas').innerHTML = areas.length > 1 ? areas.map(function (a) {
    return '<button type="button" class="carga-aba' + (a === abaCarga ? ' ativa' : '') + '" role="tab" aria-selected="' + (a === abaCarga) + '"' +
      ' data-acao="abaCarga" data-arg="' + a + '">' + esc(T('cg.aba.' + a)) + '</button>';
  }).join('') : '';
  $('carga-usinagem').hidden = abaCarga !== 'usinagem';
  $('carga-caldeiraria').hidden = abaCarga !== 'caldeiraria';
  if (abaCarga === 'usinagem') renderUsinagem(); else renderCaldeiraria();
}

/* ------------------------------------------------------- carga máquina */
export function resumoMaquinas(h) {
  const sems = Carga.semanas(Carga.SEMANAS_PADRAO, h);
  const maquinas = (estado.maquinas || []).filter(function (m) { return m.ativa !== false; });
  const r = Carga.cargaMaquinas(estado.ops, estado.projetos, maquinas, sems, h);
  const capTotal = r.linhas.reduce(function (s, l) { return s + l.capacidade; }, 0);
  const semana = r.linhas.map(function (l) { return l.porSemana; })
    .reduce(function (acc, v) { return acc.map(function (x, i) { return x + v[i]; }); }, sems.map(function () { return 0; }));
  return { sems: sems, r: r, capTotal: capTotal, semana: semana };
}

function opsUsinagemAbertas() {
  const porId = {};
  estado.projetos.forEach(function (p) { porId[p.id] = p; });
  return estado.ops.filter(function (o) {
    const p = porId[o.projetoId];
    return o.area === 'usinagem' && o.status === 'aberta' && (!p || Projeto.aberto(p));
  }).sort(function (a, b) { return String(a.commessa).localeCompare(String(b.commessa), 'pt-BR', { numeric: true }) || String(a.numero).localeCompare(String(b.numero)); });
}

function renderUsinagem() {
  const h = hoje(), x = resumoMaquinas(h), r = x.r;
  const pctSemana = Carga.ocupacao(x.semana[0], x.capTotal);
  const semProg = r.resumo.semMaquina + r.resumo.semHoras;
  $('cu-resumo').innerHTML =
    kpi(T('cg.maquinas'), String(r.linhas.length)) +
    kpi(T('cg.capSemana'), fmtNum(x.capTotal) + ' h') +
    kpi(T('cg.estaSemanaK'), '<span class="carga-' + Carga.faixa(pctSemana) + '-txt">' + fmtNum(x.semana[0], 1) + ' h · ' + pctSemana + '%</span>') +
    kpi(T('cg.semProgramacao'), '<span style="color:var(' + (semProg ? '--amber-ink' : '--green') + ')">' + semProg + '</span>');

  // grade máquinas × semanas
  if (!r.linhas.length) {
    $('cu-grade').innerHTML = '<div class="empty-state">' + esc(T(podeEditar('usinagem') ? 'cg.semMaquinasEdit' : 'cg.semMaquinas')) + '</div>';
  } else {
    const cab = '<tr><th>' + esc(T('cg.maquina')) + '</th>' + x.sems.map(function (s, i) { return '<th>' + esc(rotSemana(s, i)) + '</th>'; }).join('') + '</tr>';
    const linhas = r.linhas.map(function (l) {
      return '<tr><td class="carga-maq"><b>' + esc(l.maquina.nome) + '</b><span>' + esc(T('cg.capDia', fmtNum(l.maquina.horasDia, 1))) + '</span></td>' +
        l.porSemana.map(function (v) {
          const pct = Carga.ocupacao(v, l.capacidade);
          return '<td><div class="carga-cel carga-' + (v ? Carga.faixa(pct) : 'vazia') + '" title="' + esc(T('cg.celTit', fmtNum(v, 1), fmtNum(l.capacidade))) + '">' +
            (v ? '<b>' + pct + '%</b><span>' + fmtNum(v, 1) + ' h</span>' : '<span>—</span>') + '</div></td>';
        }).join('') + '</tr>';
    }).join('');
    const total = '<tr class="carga-total"><td><b>' + esc(T('cg.total')) + '</b></td>' + x.semana.map(function (v) {
      const pct = Carga.ocupacao(v, x.capTotal);
      return '<td><div class="carga-cel carga-' + (v ? Carga.faixa(pct) : 'vazia') + '">' + (v ? '<b>' + pct + '%</b><span>' + fmtNum(v, 1) + ' h</span>' : '<span>—</span>') + '</div></td>';
    }).join('') + '</tr>';
    $('cu-grade').innerHTML = '<div class="carga-grade-wrap"><table class="carga-grade">' + cab + linhas + total + '</table></div>' +
      (r.resumo.semJanela ? '<div class="hint-txt">' + esc(T('cg.semJanelaH', r.resumo.semJanela, fmtNum(r.resumo.horasSemJanela, 1))) + '</div>' : '');
  }

  // OPs para programar
  const editar = podeEditar('usinagem');
  const todas = opsUsinagemAbertas();
  const lista = filtroOps === 'pendentes' ? todas.filter(function (o) { return !o.maquinaId || !(Number(o.horasPrevistas) > 0); }) : todas;
  $('cu-filtro').value = filtroOps;
  const ativas = (estado.maquinas || []).filter(function (m) { return m.ativa !== false; });
  const opcoes = function (sel) {
    return '<option value="">' + esc(T('cg.escolher')) + '</option>' + ativas.map(function (m) {
      return '<option value="' + esc(m.id) + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(m.nome) + '</option>';
    }).join('');
  };
  $('cu-ops').innerHTML = lista.length ? '<div class="carga-ops">' + lista.slice(0, 300).map(function (o) {
    const nomeMaq = (ativas.find(function (m) { return m.id === o.maquinaId; }) || {}).nome;
    return '<div class="carga-op">' +
      '<div class="carga-op-info"><b class="mono">OP ' + esc(o.numero) + '</b> <span class="hint-inline">' + esc(o.commessa) + '</span>' +
        '<div class="hint-txt">' + esc(T('rnc.peca', o.desenho, o.posicao || '—')) + (o.descricao ? ' · ' + esc(o.descricao) : '') + ' · ' + esc(T('cg.qtd', fmtNum(o.qtd))) + '</div></div>' +
      (editar
        ? '<select class="carga-op-maq" data-change="programarMaquina" data-arg="' + esc(o.id) + '" aria-label="' + esc(T('cg.maquina')) + '">' + opcoes(o.maquinaId) + '</select>' +
          '<input class="carga-op-h" type="number" min="0" max="10000" step="0.5" value="' + (o.horasPrevistas != null ? esc(o.horasPrevistas) : '') + '"' +
          ' placeholder="h" data-change="programarHoras" data-arg="' + esc(o.id) + '" aria-label="' + esc(T('cg.horas')) + '">'
        : '<span class="hint-txt">' + esc(nomeMaq || '—') + ' · ' + (o.horasPrevistas != null ? fmtNum(o.horasPrevistas, 1) + ' h' : '—') + '</span>') +
      '</div>';
  }).join('') + '</div>' + (lista.length > 300 ? '<div class="hint-txt">' + esc(T('fab.maisLinhas', lista.length - 300)) + '</div>' : '')
    : '<div class="empty-state">' + esc(T(todas.length ? 'cg.tudoProgramado' : 'cg.semOpsUsinagem')) + '</div>';

  // máquinas
  $('cu-maq-form').style.display = editar ? '' : 'none';
  $('cu-maquinas').innerHTML = (estado.maquinas || []).length ? (estado.maquinas || []).map(function (m) {
    if (!editar) return '<div class="carga-maq-linha"><b>' + esc(m.nome) + '</b><span class="hint-txt">' + esc(T('cg.capDia', fmtNum(m.horasDia, 1))) + (m.ativa === false ? ' · ' + esc(T('cg.inativa')) : '') + '</span></div>';
    return '<div class="carga-maq-linha' + (m.ativa === false ? ' inativa' : '') + '">' +
      '<input value="' + esc(m.nome) + '" maxlength="60" data-change="editarMaquinaNome" data-arg="' + esc(m.id) + '" aria-label="' + esc(T('cg.nomeMaquina')) + '">' +
      '<input type="number" min="0.5" max="24" step="0.5" value="' + esc(m.horasDia) + '" data-change="editarMaquinaHoras" data-arg="' + esc(m.id) + '" aria-label="' + esc(T('cg.horasDia')) + '">' +
      '<label class="carga-ativa"><input type="checkbox" ' + (m.ativa === false ? '' : 'checked') + ' data-change="editarMaquinaAtiva" data-arg="' + esc(m.id) + '"> ' + esc(T('cg.ativa')) + '</label>' +
      '<button type="button" class="rm" data-acao="excluirMaquina" data-arg="' + esc(m.id) + '" title="' + esc(T('btn.excluir')) + '" aria-label="' + esc(T('btn.excluir') + ' — ' + m.nome) + '">✕</button></div>';
  }).join('') : '<div class="hint-txt">' + esc(T('cg.nenhumaMaquina')) + '</div>';
}

/* ------------------------------------------------------- carga fábrica */
export function resumoFabrica(h) {
  const sems = Carga.semanas(Carga.SEMANAS_PADRAO, h);
  const cap = (estado.cfgFabrica || {}).capacidadeKgSemana || 0;
  return { sems: sems, r: Carga.cargaFabrica(estado.ops, estado.projetos, cap, sems, h) };
}

function renderCaldeiraria() {
  const h = hoje(), x = resumoFabrica(h), r = x.r;
  const pct = Carga.ocupacao(r.porSemana[0], r.capacidade);
  const pico = Math.max.apply(null, r.porSemana.concat([0]));
  const editar = podeEditar('caldeiraria');
  $('cc-resumo').innerHTML =
    kpi(T('cg.kgAberto'), fmtNum(r.total) + ' kg') +
    kpi(T('cg.capKg'), r.capacidade ? fmtNum(r.capacidade) + ' kg' : '—') +
    kpi(T('cg.estaSemanaK'), '<span class="carga-' + Carga.faixa(pct) + '-txt">' + fmtNum(r.porSemana[0]) + ' kg' + (r.capacidade ? ' · ' + pct + '%' : '') + '</span>') +
    kpi(T('cg.pico'), fmtNum(pico) + ' kg' + (r.capacidade ? ' · ' + Carga.ocupacao(pico, r.capacidade) + '%' : ''));
  $('cc-cap-form').style.display = editar ? '' : 'none';
  if (document.activeElement !== $('cc-cap')) $('cc-cap').value = r.capacidade || '';
  $('cc-nota').textContent = r.capacidade ? T('cg.fabNota') : T(editar ? 'cg.semCapEdit' : 'cg.semCap');

  $('cc-projetos').innerHTML = r.projetos.length ? '<table class="carga-tab-proj"><tr><th>' + esc(T('cg.projeto')) + '</th><th>' + esc(T('cg.kgAbertoCurto')) +
    '</th><th>' + esc(T('cg.opsAbertas')) + '</th><th>' + esc(T('cg.janela')) + '</th></tr>' + r.projetos.map(function (pp) {
      const p = pp.projeto;
      return '<tr><td><b class="mono">' + esc(p.commessa) + '</b><div class="hint-txt">' + esc(p.descricao) + '</div></td>' +
        '<td class="num">' + fmtNum(pp.kg) + '</td><td class="num">' + pp.ops + '</td>' +
        '<td>' + (p.pcpFim && p.prodFim ? br(p.pcpFim) + ' → ' + br(p.prodFim) : '<span class="hint-txt">' + esc(T('cg.semDatas')) + '</span>') + '</td></tr>';
    }).join('') + '</table>' + (r.semJanela ? '<div class="hint-txt">' + esc(T('cg.semJanelaKg', fmtNum(r.semJanela))) + '</div>' : '')
    : '<div class="empty-state">' + esc(T('cg.semOpsCald')) + '</div>';

  if (!window.Chart) { falhaGrafico('chartCargaFabrica'); return; }
  desenharGraficoKg('chartCargaFabrica', x.sems, r.porSemana, r.capacidade, 'kg');
}

// Barras da carga por semana + linha da capacidade (usado também no painel).
export function desenharGraficoKg(id, sems, valores, capacidade, unidade) {
  const corBarra = valores.map(function (v) {
    const f = Carga.faixa(Carga.ocupacao(v, capacidade));
    return capacidade ? cor(f === 'sobrecarga' ? '--rust' : (f === 'alta' ? '--amber' : '--teal')) : cor('--teal');
  });
  const ds = [{ type: 'bar', label: T('cg.programado'), data: valores.map(function (v) { return Math.round(v * 10) / 10; }),
    backgroundColor: corBarra, borderRadius: 6, borderSkipped: false, order: 2 }];
  if (capacidade) ds.push({ type: 'line', label: T('cg.capacidade'), data: sems.map(function () { return capacidade; }),
    borderColor: cor('--ink-dim'), borderDash: [6, 4], borderWidth: 2, pointRadius: 0, fill: false, order: 1 });
  const fonte = { family: 'Inter', size: 11 };
  desenhar(id, { type: 'bar',
    data: { labels: sems.map(rotSemana), datasets: ds },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      plugins: { legend: { display: true, position: 'bottom', labels: { color: cor('--ink-dim'), font: fonte, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
        tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + fmtNum(c.parsed.y, 1) + ' ' + unidade; } } } },
      scales: { x: { grid: { display: false }, ticks: { font: fonte, color: cor('--ink-dim') } },
        y: { beginAtZero: true, ticks: { font: fonte, color: cor('--ink-dim') }, grid: { color: cor('--line-soft') } } } } });
}

/* --------------------------------------------------------------- ações */
function opPorId(id) { return estado.ops.find(function (o) { return o.id === id; }); }
function programar(id, maquinaId, horas) {
  DadosCarga.programarOp(id, maquinaId, horas).catch(function (e) { avisoErro(e); renderCarga(); });
}
function maquinaPorId(id) { return (estado.maquinas || []).find(function (m) { return m.id === id; }); }
function salvarMaq(m, mudanca) {
  const nova = Object.assign({}, m, mudanca);
  if (!String(nova.nome || '').trim() || !(Number(nova.horasDia) > 0 && Number(nova.horasDia) <= 24)) {
    toast(T('cg.maquinaInvalida'), { tipo: 'erro' }); renderCarga(); return;
  }
  DadosCarga.salvarMaquina(nova).catch(function (e) { avisoErro(e); renderCarga(); });
}

registrarAcoes({
  abaCarga: function (a) { abaCarga = a; renderCarga(); },
  filtrarOpsCarga: function (v) { filtroOps = v === 'todas' ? 'todas' : 'pendentes'; renderCarga(); },
  programarMaquina: function (v, _b, el) {
    const o = opPorId(el.dataset.arg); if (!o) return;
    programar(o.id, v || null, o.horasPrevistas);
  },
  programarHoras: function (v, _b, el) {
    const o = opPorId(el.dataset.arg); if (!o) return;
    const h = v === '' ? null : Math.max(0, Math.min(10000, Number(v)));
    programar(o.id, o.maquinaId || null, h);
  },
  adicionarMaquina: function () {
    const nome = $('cu-maq-nome').value.trim(), horas = Number($('cu-maq-horas').value);
    if (!nome || !(horas > 0 && horas <= 24)) { toast(T('cg.maquinaInvalida'), { tipo: 'erro' }); return; }
    DadosCarga.salvarMaquina({ nome: nome, horasDia: horas, ativa: true }).then(function () {
      $('cu-maq-nome').value = ''; toast(T('cg.maquinaSalva', nome));
    }).catch(function (e) { avisoErro(e); });
  },
  editarMaquinaNome: function (v, _b, el) { const m = maquinaPorId(el.dataset.arg); if (m) salvarMaq(m, { nome: v }); },
  editarMaquinaHoras: function (v, _b, el) { const m = maquinaPorId(el.dataset.arg); if (m) salvarMaq(m, { horasDia: Number(v) }); },
  editarMaquinaAtiva: function (_v, _b, el) { const m = maquinaPorId(el.dataset.arg); if (m) salvarMaq(m, { ativa: el.checked }); },
  excluirMaquina: function (id) {
    const m = maquinaPorId(id); if (!m) return;
    const usadas = estado.ops.filter(function (o) { return o.maquinaId === id && o.status === 'aberta'; }).length;
    confirmar(T('cg.excluirMaquinaQ', m.nome, plural(usadas, 'cg.opU', 'cg.opsU')), { titulo: T('btn.excluir'), textoOk: T('btn.excluir'), perigo: true })
      .then(function (ok) { if (ok) DadosCarga.excluirMaquina(id).catch(function (e) { avisoErro(e); }); });
  },
  salvarCapacidadeFabrica: function () {
    const kg = Number($('cc-cap').value);
    if (!(kg > 0 && kg <= 10000000)) { toast(T('cg.capInvalida'), { tipo: 'erro' }); return; }
    DadosCarga.salvarCapacidade(kg).then(function () { toast(T('cg.capSalva', fmtNum(kg))); }).catch(function (e) { avisoErro(e); });
  }
});
