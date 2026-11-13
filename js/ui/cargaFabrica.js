/* ---------------------------------------------------------------------------
   Carga Fábrica (programadora de caldeiraria): quem está com cada OP e quando
   deve terminar. O técnico cria a OP → ela aparece em "Aguardando
   programação" (por commessa) → a programadora escolhe a empresa (SOFIR,
   fabricação interna, ou uma terceirizada), o início e a previsão de término
   → acompanha na Lista (ordenada pelo término) e na Linha do tempo (como a
   das entregas). Reagendar muda a previsão, marca a OP como "Reagendada" e
   avisa o técnico e o GP. Depois da baixa do CQ, ela finaliza a OP.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, opVisivel } from '../estado.js';
import { esc, br, hoje, addDias, numeroBr, compararNatural, dataValida } from '../nucleo/fmt.js';
import { T, meses } from '../i18n/index.js';
import * as Prog from '../dominio/programacao.js';
import * as Auth from '../dados/auth.js';
import * as DadosProg from '../dados/programacao.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal, confirmar } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';
import { opPorId } from './opDetalhe.js';

const ABAS = ['aguardando', 'lista', 'tempo', 'baixa', 'empresas'];
const COR = { atraso: 'var(--rust)', vence: 'var(--amber)', prazo: 'var(--violet)' };
const ui = { aba: 'lista', emp: '', com: '', mes: '', sel: {} };

function podeEditar() { return Auth.souGerente() || Auth.areaProgramador() === 'caldeiraria'; }
function opsCald() { return estado.ops.filter(function (o) { return o.area === 'caldeiraria' && opVisivel(o); }); }
function kg(n) { return numeroBr(Math.round(Number(n) || 0)) + ' kg'; }
function brAno(s) { return s ? br(s) : '—'; }
function nomeMes(m) { return meses()[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4); }
function corEmpresa(id) {
  if (id === Prog.SOFIR.id) return 'var(--teal)';
  const paleta = ['var(--terracotta)', 'var(--violet)', 'var(--green)', 'var(--amber)', 'var(--rust)'];
  const i = (estado.terceirizadas || []).findIndex(function (t) { return t.id === id; });
  return paleta[(i < 0 ? 0 : i) % paleta.length];
}
function situ(o, h) {
  const p = Prog.prazoCald(o, h);
  if (!p) return null;
  const txt = p.k === 'atraso' ? T('cf.atrasada', -p.dias) : (p.k === 'vence' ? (p.dias === 0 ? T('cf.venceHoje') : T('cf.venceEm', p.dias)) : T('cf.noPrazo'));
  return { k: p.k, txt: txt, cor: COR[p.k] };
}
function passa(o) {
  const pr = o.programacao || {};
  return (!ui.emp || pr.terceirizadaId === ui.emp) && (!ui.com || o.projetoId === ui.com) && (!ui.mes || String(pr.previsaoFim || '').slice(0, 7) === ui.mes);
}

export function renderCargaFabrica(alvoId) {
  const alvo = $(alvoId);
  if (!alvo) return;
  const h = hoje(), todas = opsCald();
  const por = { emAberto: [], programada: [], baixaCq: [] };
  todas.forEach(function (o) { const s = Prog.situacao(o); if (por[s]) por[s].push(o); });
  const soma = function (l) { return l.reduce(function (t, o) { return t + (Number(o.pesoTotal) || 0); }, 0); };
  const atr = por.programada.filter(function (o) { return Prog.prazoCald(o, h).k === 'atraso'; });
  const reag = por.programada.filter(Prog.reagendada);
  const kpi = function (aba, rot, val, det, cor) {
    return '<button type="button" class="cf-kpi" data-acao="abaCargaFab" data-arg="' + aba + '"><span class="cf-kpi-val" style="color:' + cor + '">' + val + '</span>' +
      '<span><span class="cf-kpi-rot">' + esc(rot) + '</span><span class="cf-kpi-det">' + esc(det) + '</span></span></button>';
  };
  const abas = { aguardando: por.emAberto.length, lista: por.programada.length, tempo: por.programada.length, baixa: por.baixaCq.length, empresas: Prog.empresasCald(estado.terceirizadas).length };
  // filtros (lista e linha do tempo): empresa, commessa, mês de entrega
  const coms = {}, mesesDe = {};
  por.programada.forEach(function (o) { coms[o.projetoId] = o.commessa; mesesDe[String(o.programacao.previsaoFim).slice(0, 7)] = 1; });
  const opt = function (v, t, atual) { return '<option value="' + esc(v) + '"' + (v === atual ? ' selected' : '') + '>' + esc(t) + '</option>'; };
  const filtros = ui.aba === 'lista' || ui.aba === 'tempo'
    ? '<div class="cf-filtros"><select data-change="filtroCargaFab" data-arg2="emp" aria-label="' + esc(T('cf.fEmpresa')) + '">' + opt('', T('cf.todasEmpresas'), ui.emp) +
        Prog.empresasCald(estado.terceirizadas).map(function (e) { return opt(e.id, e.nome, ui.emp); }).join('') + '</select>' +
      '<select data-change="filtroCargaFab" data-arg2="com" aria-label="' + esc(T('cf.fCommessa')) + '">' + opt('', T('cf.todasCommessas'), ui.com) +
        Object.keys(coms).sort(function (a, b) { return compararNatural(coms[a], coms[b]); }).map(function (id) { return opt(id, coms[id], ui.com); }).join('') + '</select>' +
      '<select data-change="filtroCargaFab" data-arg2="mes" aria-label="' + esc(T('cf.fMes')) + '">' + opt('', T('cf.todosMeses'), ui.mes) +
        Object.keys(mesesDe).sort().map(function (m) { return opt(m, T('cf.entregasDe', nomeMes(m)), ui.mes); }).join('') + '</select>' +
      (ui.emp || ui.com || ui.mes ? '<button type="button" class="link-btn" data-acao="limparFiltroCargaFab">' + esc(T('pl.limpar')) + '</button>' : '') + '</div>' : '';
  alvo.innerHTML =
    '<div class="cf-kpis">' +
      kpi('aguardando', T('cf.kAguardando'), por.emAberto.length, kg(soma(por.emAberto)), 'var(--ink)') +
      kpi('lista', T('cf.kFabricacao'), por.programada.length, kg(soma(por.programada)), 'var(--ink)') +
      kpi('lista', T('cf.kAtrasadas'), atr.length, T(atr.length ? 'cf.kAtrasadasDet' : 'cf.kEmDia'), atr.length ? 'var(--rust)' : 'var(--green)') +
      kpi('lista', T('cf.kReagendadas'), reag.length, T('cf.kReagendadasDet'), reag.length ? 'var(--terracotta)' : 'var(--ink)') + '</div>' +
    '<div class="cf-topo"><div class="fab-visoes cf-abas" role="tablist">' + ABAS.map(function (a) {
      return '<button type="button" role="tab" aria-selected="' + (ui.aba === a) + '" class="' + (ui.aba === a ? 'ativa' : '') + '" data-acao="abaCargaFab" data-arg="' + a + '">' + esc(T('cf.aba.' + a)) + '<b>' + abas[a] + '</b></button>';
    }).join('') + '</div>' + filtros + '</div>' +
    '<div id="cf-conteudo">' + ({ aguardando: aguardando, lista: listaHtml, tempo: tempoHtml, baixa: baixaHtml, empresas: empresasHtml }[ui.aba])(por, h) + '</div>';
}

/* --------------------------------------------------- aguardando programação */
function aguardando(por) {
  const pc = {};
  por.emAberto.forEach(function (o) { (pc[o.projetoId] = pc[o.projetoId] || []).push(o); });
  const ids = Object.keys(pc).sort(function (a, b) { return compararNatural(pc[a][0].commessa, pc[b][0].commessa); });
  if (!ids.length) return '<div class="card panel-pad empty-state">' + esc(T('cf.semAguardando')) + '</div>';
  const editar = podeEditar();
  return ids.map(function (pid) {
    const l = pc[pid].sort(function (a, b) { return compararNatural(a.numero, b.numero); }), p = buscarProjeto(pid);
    const n = l.filter(function (o) { return ui.sel[o.id]; }).length, todas = n === l.length;
    return '<div class="card cf-grupo"><div class="cf-grupo-topo">' +
      (editar ? '<input type="checkbox" data-change="selTodasCargaFab" data-arg2="' + esc(pid) + '"' + (todas ? ' checked' : '') + ' aria-label="' + esc(T('cf.selTodas')) + '">' : '') +
      '<b class="mono cf-com">' + esc(l[0].commessa) + '</b><span class="hint-txt">' + esc((p && p.descricao) || l[0].descricaoProjeto || '') + '</span>' +
      '<span class="cf-grupo-dir">' + esc(T('cf.nOpsKg', l.length, kg(l.reduce(function (t, o) { return t + (Number(o.pesoTotal) || 0); }, 0)))) +
      (editar ? '<button type="button" class="btn btn-primary btn-mini" data-acao="programarCargaFab" data-arg="' + esc(pid) + '"' + (n ? '' : ' disabled') + '>' + esc(n ? T('cf.programarN', n) : T('cf.programar')) + '</button>' : '') + '</span></div>' +
      '<div class="table-wrap"><table class="ord-tab"><thead><tr>' + (editar ? '<th style="width:34px"></th>' : '') + '<th>OP</th><th>' + esc(T('fab.cDesenho')) + '</th><th>' + esc(T('fab.cDescricao')) +
      '</th><th class="num">' + esc(T('fab.cQtd')) + '</th><th class="num">' + esc(T('fab.cPeso')) + '</th><th>' + esc(T('cf.esperando')) + '</th></tr></thead><tbody>' +
      l.map(function (o) {
        const d = String(o.desprogramadaEm || o.criadoEm || '').slice(0, 10);
        return '<tr>' + (editar ? '<td><input type="checkbox" data-change="selCargaFab" data-arg2="' + esc(o.id) + '"' + (ui.sel[o.id] ? ' checked' : '') + ' aria-label="' + esc(o.numero) + '"></td>' : '') +
          '<td class="mono">' + esc(o.numero) + '</td><td class="mono">' + esc(o.desenho) + (o.posicao ? ' · ' + esc(o.posicao) : '') + '</td><td>' + esc(o.descricao || '—') + '</td>' +
          '<td class="num">' + numeroBr(o.qtd) + '</td><td class="num">' + kg(o.pesoTotal) + '</td><td class="hint-txt">' + esc(d ? T('cf.desde', br(d)) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }).join('');
}

/* ------------------------------------------------------------------ lista */
function listaHtml(por, h) {
  const l = por.programada.filter(passa).sort(function (a, b) { return String(a.programacao.previsaoFim).localeCompare(String(b.programacao.previsaoFim)) || compararNatural(a.numero, b.numero); });
  if (!l.length) return '<div class="card panel-pad empty-state">' + esc(T(por.programada.length ? 'fab.vazioFiltro' : 'cf.semProgramadas')) + '</div>';
  const editar = podeEditar();
  return '<div class="card"><div class="table-wrap"><table class="ord-tab cf-tab"><thead><tr><th>OP</th><th>' + esc(T('fab.cCommessa')) + '</th><th>' + esc(T('fab.cDescricao')) +
    '</th><th class="num">' + esc(T('fab.cQtd')) + '</th><th class="num">' + esc(T('fab.cPeso')) + '</th><th>' + esc(T('cf.comQuem')) + '</th><th>' + esc(T('cf.inicio')) + '</th><th>' + esc(T('cf.termino')) +
    '</th><th>' + esc(T('fab.cSituacao')) + '</th><th></th></tr></thead><tbody>' +
    l.map(function (o) {
      const pr = o.programacao, s = situ(o, h), reag = Prog.reagendada(o);
      return '<tr class="ord-linha' + (s.k === 'atraso' ? ' cf-atrasada' : '') + '" data-acao="verOpCargaFab" data-arg="' + esc(o.id) + '" tabindex="0" role="button">' +
        '<td class="mono">' + esc(o.numero) + '</td><td class="mono cf-com">' + esc(o.commessa) + '</td><td>' + esc(o.descricao || '—') + '<div class="hint-txt mono">' + esc(o.desenho) + '</div></td>' +
        '<td class="num">' + numeroBr(o.qtd) + '</td><td class="num">' + kg(o.pesoTotal) + '</td>' +
        '<td><span class="cf-empresa"><span class="cf-bola" style="background:' + corEmpresa(pr.terceirizadaId) + '"></span>' + esc(pr.terceirizada || '—') + '</span></td>' +
        '<td>' + brAno(pr.inicio) + '</td><td><b>' + brAno(pr.previsaoFim) + '</b>' + (reag ? '<div class="hint-txt">' + esc(T('cf.antes', pr.historico.map(br).join(' → '))) + '</div>' : '') + '</td>' +
        '<td><span class="pill-cf cf-' + s.k + '">' + esc(s.txt) + '</span>' + (reag ? ' <span class="pill-cf cf-reag">' + esc(T('cf.reagendada')) + '</span>' : '') + '</td>' +
        '<td>' + (editar ? '<button type="button" class="btn btn-outline btn-mini" data-acao="reagendarCargaFab" data-arg="' + esc(o.id) + '">' + esc(T('cf.reagendar')) + '</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
}

/* --------------------------------------------------------- linha do tempo */
// Como a "Linha do Tempo" das entregas: vertical, pela data de término, com a
// faixa de HOJE no meio, os meses marcados e os cartões alternando os lados.
function tempoHtml(por, h) {
  const l = por.programada.filter(passa).sort(function (a, b) { return String(a.programacao.previsaoFim).localeCompare(String(b.programacao.previsaoFim)) || compararNatural(a.numero, b.numero); });
  const emp = Prog.empresasCald(estado.terceirizadas);
  const lado = '<div class="card panel-pad cf-tl-lado"><div class="panel-title">' + esc(T('cf.empresas')) + '</div>' +
    '<button type="button" class="tl-sidebar-item' + (!ui.emp ? ' cf-ativa' : '') + '" data-acao="empresaCargaFab" data-arg="">' + esc(T('cf.todasEmpresas')) + ' <b>' + por.programada.length + '</b></button>' +
    emp.map(function (e) {
      const n = por.programada.filter(function (o) { return o.programacao.terceirizadaId === e.id; }).length;
      return '<button type="button" class="tl-sidebar-item' + (ui.emp === e.id ? ' cf-ativa' : '') + '" data-acao="empresaCargaFab" data-arg="' + esc(e.id) + '"><span class="cf-bola" style="background:' + corEmpresa(e.id) + '"></span> ' +
        esc(e.nome) + ' <b>' + n + '</b><span class="cm">' + esc(T(e.interna ? 'cf.interna' : 'cf.terceirizada')) + '</span></button>';
    }).join('') + '</div>';
  let linhas = '', hojeOk = false, mes = '', esquerda = true;
  const faixaHoje = function () { return '<div class="tl-row" style="grid-template-columns:1fr;"><div class="tl-today-row"><span class="tl-today-label">' + esc(T('x.hojeLinha', br(h))) + '</span></div></div>'; };
  l.forEach(function (o) {
    const pr = o.programacao;
    if (!hojeOk && pr.previsaoFim >= h) { linhas += faixaHoje(); hojeOk = true; }
    const m = String(pr.previsaoFim).slice(0, 7);
    if (m !== mes) { mes = m; linhas += '<div class="cf-tl-mes"><span>' + esc(nomeMes(m).toUpperCase()) + '</span></div>'; }
    const s = situ(o, h), reag = Prog.reagendada(o);
    const card = '<button type="button" class="tl-card' + (s.k === 'atraso' ? ' urgent' : '') + '" data-acao="verOpCargaFab" data-arg="' + esc(o.id) + '">' +
      '<div class="tl-date" style="color:' + s.cor + '">' + esc(br(pr.previsaoFim)) + ' · ' + esc(s.txt) + (reag ? ' · <span style="color:var(--terracotta)">' + esc(T('cf.reagendada')) + '</span>' : '') + '</div>' +
      '<div class="tl-commessa">' + esc(o.commessa) + ' · OP ' + esc(o.numero) + '</div>' +
      '<div class="tl-desc">' + esc(o.descricao || o.desenho) + '</div>' +
      '<div class="tl-meta"><span class="cf-bola" style="background:' + corEmpresa(pr.terceirizadaId) + '"></span>' + esc(pr.terceirizada || '—') + ' · ' + esc(T('cg.qtd', numeroBr(o.qtd))) + ' · ' + kg(o.pesoTotal) + '</div></button>';
    linhas += '<div class="tl-row"><div class="tl-side' + (esquerda ? '' : ' empty') + '">' + (esquerda ? card : '') + '</div>' +
      '<div class="tl-center"><div class="tl-dot" style="background:' + s.cor + '"></div></div><div class="tl-side' + (esquerda ? ' empty' : '') + '">' + (esquerda ? '' : card) + '</div></div>';
    esquerda = !esquerda;
  });
  if (!hojeOk) linhas += faixaHoje();
  return '<div class="cf-tl">' + lado + '<div class="card panel-pad"><div class="cf-tl-cab"><span class="panel-title" style="margin-bottom:0">' + esc(T('cf.tlTitulo')) + '</span><div class="legend">' +
    '<span><span class="dot-lg" style="background:var(--rust)"></span>' + esc(T('cf.legAtrasada')) + '</span><span><span class="dot-lg" style="background:var(--amber)"></span>' + esc(T('cf.legVence')) + '</span>' +
    '<span><span class="dot-lg" style="background:var(--violet)"></span>' + esc(T('cf.noPrazo')) + '</span><span><span class="dot-lg" style="background:var(--terracotta)"></span>' + esc(T('cf.reagendada')) + '</span></div></div>' +
    (l.length ? '<div class="cf-trilho">' + linhas + '</div>' : '<div class="empty-state">' + esc(T(por.programada.length ? 'fab.vazioFiltro' : 'cf.semProgramadas')) + '</div>') + '</div></div>';
}

/* --------------------------------------------------- baixa do CQ e empresas */
function baixaHtml(por) {
  if (!por.baixaCq.length) return '<div class="card panel-pad empty-state">' + esc(T('cf.semBaixa')) + '</div>';
  const editar = podeEditar();
  return '<div class="card"><div class="table-wrap"><table class="ord-tab"><thead><tr><th>OP</th><th>' + esc(T('fab.cCommessa')) + '</th><th>' + esc(T('fab.cDescricao')) + '</th><th class="num">' + esc(T('fab.cQtd')) +
    '</th><th>' + esc(T('cf.comQuem')) + '</th><th>' + esc(T('passo.pergunta')) + '</th><th></th></tr></thead><tbody>' +
    por.baixaCq.sort(function (a, b) { return compararNatural(a.commessa, b.commessa) || compararNatural(a.numero, b.numero); }).map(function (o) {
      return '<tr><td class="mono">' + esc(o.numero) + '</td><td class="mono cf-com">' + esc(o.commessa) + '</td><td>' + esc(o.descricao || '—') + '</td><td class="num">' + numeroBr(o.qtd) + '</td>' +
        '<td>' + esc((o.programacao && o.programacao.terceirizada) || '—') + '</td><td>' + esc(o.proximoPasso ? T('passo.' + o.proximoPasso) : '—') + '</td>' +
        '<td>' + (editar ? '<button type="button" class="btn btn-success btn-mini" data-acao="finalizarOp" data-arg="' + esc(o.id) + '">' + esc(T('prog.finalizar')) + '</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
}
function empresasHtml(por) {
  const editar = podeEditar();
  return '<div class="card panel-pad cf-empresas"><div class="panel-note">' + esc(T('cf.empresasNota')) + '</div>' +
    Prog.empresasCald(estado.terceirizadas).map(function (e) {
      const l = por.programada.filter(function (o) { return o.programacao.terceirizadaId === e.id; });
      return '<div class="carga-maq-linha prog-terc"><span class="cf-bola" style="background:' + corEmpresa(e.id) + '"></span><b>' + esc(e.nome) + '</b>' +
        '<span class="hint-txt">' + esc(T(e.interna ? 'cf.interna' : 'cf.terceirizada')) + ' · ' + esc(T('cf.nOpsKg', l.length, kg(l.reduce(function (t, o) { return t + (Number(o.pesoTotal) || 0); }, 0)))) + '</span>' +
        (editar && !e.interna ? '<button type="button" class="rm" data-acao="excluirTerceirizada" data-arg="' + esc(e.id) + '" aria-label="' + esc(T('btn.excluir') + ' — ' + e.nome) + '">✕</button>' : '') + '</div>';
    }).join('') +
    (editar ? '<div class="carga-maq-form prog-terc-form"><input id="cf-quadro-terc" maxlength="60" placeholder="' + esc(T('prog.tercPh')) + '" data-enter="adicionarTerceirizada" data-arg="cf-quadro">' +
      '<button type="button" class="btn btn-outline" data-acao="adicionarTerceirizada" data-arg="cf-quadro">' + esc(T('cg.adicionar')) + '</button></div>' : '') + '</div>';
}

/* ---------------------------------------------------------------- janelas */
let progPid = null;
function abrirProgramar(pid) {
  if (!podeEditar()) return;
  const l = opsCald().filter(function (o) { return o.projetoId === pid && Prog.situacao(o) === 'emAberto' && ui.sel[o.id]; });
  if (!l.length) return;
  progPid = pid;
  const h = hoje();
  $('cfp-sub').textContent = T('cf.programarSub', l[0].commessa, l.length, l.map(function (o) { return o.numero; }).join(', '));
  $('cfp-empresa').innerHTML = Prog.empresasCald(estado.terceirizadas).map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.nome + ' — ' + T(e.interna ? 'cf.interna' : 'cf.terceirizada')) + '</option>'; }).join('');
  $('cfp-inicio').value = h;
  $('cfp-fim').value = addDias(h, 14);
  $('cfp-erro').textContent = '';
  abrirModal('modal-cf-prog', { foco: 'cfp-empresa', aoFechar: function () { progPid = null; } });
}
function salvarProgramar(_a, _b, btn) {
  if (!progPid) return;
  const l = opsCald().filter(function (o) { return o.projetoId === progPid && Prog.situacao(o) === 'emAberto' && ui.sel[o.id]; });
  const e = Prog.empresasCald(estado.terceirizadas).find(function (x) { return x.id === $('cfp-empresa').value; });
  const ini = $('cfp-inicio').value, fim = $('cfp-fim').value;
  if (!e) { $('cfp-erro').textContent = T('prog.erro.semTerc'); return; }
  if (!dataValida(ini) || !dataValida(fim)) { $('cfp-erro').textContent = T('com.erroData'); return; }
  if (fim < ini) { $('cfp-erro').textContent = T('cf.erroFimAntes'); return; }
  comBotaoOcupado(btn, DadosProg.programarVariasCald(l.map(function (o) { return o.id; }), e, ini, fim).then(function () {
    l.forEach(function (o) { delete ui.sel[o.id]; });
    fecharModal('modal-cf-prog');
    toast(T('cf.programadas', l.length, e.nome, br(fim)));
  }).catch(function (x) { avisoErro(x); }));
}

let opAberta = null;
function verOp(id) {
  const o = opPorId(id);
  if (!o || !o.programacao) return;
  opAberta = id;
  renderOp();
  abrirModal('modal-cf-op', { aoFechar: function () { opAberta = null; } });
}
function renderOp() {
  const o = opAberta && opPorId(opAberta);
  if (!o || !o.programacao) return;
  const pr = o.programacao, s = situ(o, hoje()), reag = Prog.reagendada(o);
  $('cfo-titulo').textContent = 'OP ' + o.numero;
  $('cfo-sub').innerHTML = esc(o.descricao || o.desenho) + ' · <span class="pill-cf cf-' + s.k + '">' + esc(s.txt) + '</span>' + (reag ? ' <span class="pill-cf cf-reag">' + esc(T('cf.reagendada')) + '</span>' : '');
  const item = function (rot, val, cls) { return '<div' + (cls ? ' class="' + cls + '"' : '') + '><span>' + esc(rot) + '</span><b>' + val + '</b></div>'; };
  const p = buscarProjeto(o.projetoId);
  $('cfo-corpo').innerHTML = '<div class="rnc-resumo cf-info">' +
    item('OP', esc(o.numero), 'mono') + item(T('fab.cCommessa'), '<span class="cf-com">' + esc(o.commessa) + '</span>', 'mono') + item(T('fab.cQtd'), esc(T('cg.qtd', numeroBr(o.qtd)))) +
    item(T('fab.cPeso'), kg(o.pesoTotal)) + item(T('cf.prazo'), brAno(pr.previsaoFim)) + item(T('cf.inicio'), brAno(pr.inicio)) +
    '<div class="rnc-resumo-peca"><span>' + esc(T('cf.comQuem')) + '</span><b class="cf-empresa"><span class="cf-bola" style="background:' + corEmpresa(pr.terceirizadaId) + '"></span>' + esc(pr.terceirizada || '—') + '</b></div></div>' +
    '<div class="hint-txt">' + esc((p && p.descricao) || o.descricaoProjeto || '') + (o.desenho ? ' · ' + esc(T('rnc.peca', o.desenho, o.posicao || '—')) : '') +
    (reag ? ' · ' + esc(T('cf.antes', pr.historico.map(br).join(' → '))) : '') + '</div>';
  $('cfo-reagendar').hidden = !podeEditar();
}

let reagId = null;
function abrirReagendar(id) {
  const o = opPorId(id || opAberta);
  if (!o || !o.programacao || !podeEditar()) return;
  reagId = o.id;
  const pr = o.programacao;
  $('cfr-sub').textContent = o.numero + ' · ' + (o.descricao || o.desenho) + ' · ' + (pr.terceirizada || '');
  $('cfr-atual').value = br(pr.previsaoFim);
  $('cfr-nova').value = addDias(pr.previsaoFim, 7);
  $('cfr-hist').textContent = Prog.reagendada(o) ? T('cf.jaReagendada', pr.historico.map(br).join(' → '), br(pr.previsaoFim)) : T('cf.primeira', br(pr.previsaoFim), brAno(pr.inicio));
  $('cfr-erro').textContent = '';
  abrirModal('modal-cf-reag', { foco: 'cfr-nova', aoFechar: function () { reagId = null; } });
}
function salvarReagendar(_a, _b, btn) {
  const o = reagId && opPorId(reagId);
  if (!o) return;
  const nova = $('cfr-nova').value, antiga = o.programacao.previsaoFim;
  if (!dataValida(nova)) { $('cfr-erro').textContent = T('com.erroData'); return; }
  if (nova === antiga) { fecharModal('modal-cf-reag'); return; }
  comBotaoOcupado(btn, DadosProg.reagendarCald(o, nova).then(function () {
    fecharModal('modal-cf-reag');
    toast(T('cf.reagendadaOk', o.numero, br(nova)));
    // técnico e GP do projeto são avisados
    Auth.notificarVarios([o.tecnicoUid, o.gpUid], 'opReagendada', T('notif.opReagendada', o.numero, o.commessa, o.descricao || o.desenho, br(antiga), br(nova), o.programacao.terceirizada || ''), o.projetoId);
  }).catch(function (x) { avisoErro(x); }));
}

export function renderJanelaCargaFab() { if (opAberta && $('modal-cf-op').classList.contains('open')) renderOp(); }

function redesenhar() { renderCargaFabrica('fab-quadro'); }
registrarAcoes({
  abaCargaFab: function (a) { if (ABAS.indexOf(a) >= 0) { ui.aba = a; redesenhar(); } },
  filtroCargaFab: function (v, campo) { if (campo === 'emp' || campo === 'com' || campo === 'mes') { ui[campo] = v; redesenhar(); } },
  limparFiltroCargaFab: function () { ui.emp = ui.com = ui.mes = ''; redesenhar(); },
  empresaCargaFab: function (id) { ui.emp = id || ''; redesenhar(); },
  selCargaFab: function (_v, id, el) { ui.sel[id] = !!el.checked; redesenhar(); },
  selTodasCargaFab: function (_v, pid, el) { opsCald().forEach(function (o) { if (o.projetoId === pid && Prog.situacao(o) === 'emAberto') ui.sel[o.id] = !!el.checked; }); redesenhar(); },
  programarCargaFab: abrirProgramar,
  salvarProgramarCargaFab: salvarProgramar,
  verOpCargaFab: verOp,
  reagendarCargaFab: function (id) { abrirReagendar(id); },
  reagendarOpAberta: function () { abrirReagendar(opAberta); },
  salvarReagendarCargaFab: salvarReagendar
});
