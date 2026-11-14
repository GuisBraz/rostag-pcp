/* ---------------------------------------------------------------------------
   Carga Máquina (programador de usinagem), por operação do roteiro:
     📋 Programação por máquina — escolhe a máquina (agrupadas por tipo) e
        vê a "planilha" da fila: inclui operações (só as do tipo da máquina),
        muda a ordem, as horas e o "não antes de"; início e fim são
        calculados (a próxima operação da OP espera a anterior terminar).
     🗓 Mapa de fabricação — máquinas × dias, cada OP com a sua cor.
     ✔ Baixa do CQ — finalizar · ⚙ Máquinas e setores.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, opVisivel } from '../estado.js';
import { esc, br, hoje, addDias, fds, difDias, numeroBr, compararNatural } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Prog from '../dominio/programacao.js';
import * as Auth from '../dados/auth.js';
import * as DadosProg from '../dados/programacao.js';
import { $, registrarAcoes } from './dom.js';
import { toast } from './toast.js';
import { confirmar } from './modal.js';
import { avisoErro } from './app.js';
import { agendasAtuais } from './programacao.js';

const ABAS = ['plan', 'mapa', 'baixa', 'config'];
const ui = { aba: 'plan', maq: null, recolhido: lerRecolhido() };
// cabeçalho (abas e números) recolhido ou não: lembrado neste navegador
function lerRecolhido() { try { return localStorage.getItem('rostag.cm.recolhido') === '1'; } catch (e) { return false; } }
function gravarRecolhido(v) { try { localStorage.setItem('rostag.cm.recolhido', v ? '1' : '0'); } catch (e) { /* sem armazenamento */ } }
const PALETA = ['#A7E3E6', '#9FC5F8', '#B5A6F2', '#F2A0C1', '#F6A99A', '#F9C9A5', '#EEE79A', '#B9E3BE', '#D7C3F0', '#FFD38A', '#A9D8F5', '#C8E6A0', '#F5B8D2'];
const DIAS_MAPA = 28;
// ícones dos botões da fila (SVG simples, herdam a cor do botão)
const SVG = function (d) { return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
const LIXEIRA = SVG('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>');

function podeEditar() { return Auth.souGerente() || Auth.areaProgramador() === 'usinagem'; }
function ativas() { return (estado.maquinas || []).filter(function (m) { return m.ativa !== false; }); }
function tipoDe(m) { return String(m.tipo || '').trim() || T('cm.semTipo'); }
function corOp(id) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return PALETA[h % PALETA.length]; }
function grupos() {
  const g = {};
  ativas().forEach(function (m) { (g[tipoDe(m)] = g[tipoDe(m)] || []).push(m); });
  return Object.keys(g).sort(compararNatural).map(function (k) { return { tipo: k, maquinas: g[k].sort(function (a, b) { return compararNatural(a.nome, b.nome); }) }; });
}
// Horas em hh:mm (0,1 h → 0:06) e o contrário (aceita 1:30, 1h30, 2, 1,5).
export function horasHM(h) {
  const min = Math.round((Number(h) || 0) * 60);
  return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0');
}
export function lerHoras(txt) {
  const t = String(txt || '').trim().toLowerCase().replace(/\s/g, '');
  if (!t) return null;
  let m = t.match(/^(\d{1,5})(?::|h)(\d{1,2})?$/);
  if (m) return Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
  m = t.match(/^(\d{1,5})(?:[.,](\d+))?h?$/);
  if (m) return Number(m[1] + (m[2] ? '.' + m[2] : ''));
  return null;
}
function brDt(dt) { return dt ? br(dt.slice(0, 10)) + ' ' + dt.slice(11, 16) : '—'; }
function opsPorId() { const r = {}; estado.ops.forEach(function (o) { r[o.id] = o; }); return r; }
function nomeOperacao(it) {
  const x = it.operacao;
  if (!x || x.n == null) return T('cm.opInteira');
  const tot = (it.op.operacoes || []).length;
  return (x.n + 1) + '/' + tot + ' ' + (x.texto || x.setor || '');
}

export function renderCargaMaquina(alvoId) {
  const alvo = $(alvoId);
  if (!alvo) return;
  const h = hoje();
  const ag = agendasAtuais(h);
  const maqs = ativas();
  if (!ui.maq || !maqs.some(function (m) { return m.id === ui.maq; })) ui.maq = maqs.length ? grupos()[0].maquinas[0].id : null;
  // números do topo
  let aguard = 0;
  const vistos = {};
  maqs.forEach(function (m) { Prog.aguardandoNaMaquina(m, estado.ops.filter(opVisivel), estado.maquinas, estado.setores).forEach(function (x) { if (!vistos[x.chave]) { vistos[x.chave] = 1; aguard++; } }); });
  let prog = 0, atraso = 0;
  Object.keys(ag).forEach(function (k) { ag[k].forEach(function (it) { if (it.op && !it.concluida && !it.ausente) { prog++; if (it.atraso) atraso++; } }); });
  const baixa = estado.ops.filter(function (o) { return o.area === 'usinagem' && opVisivel(o) && Prog.situacao(o, true) === 'baixaCq'; });
  const nAba = { plan: prog, mapa: maqs.length, baixa: baixa.length, config: (estado.maquinas || []).length };
  const kpis = '<span class="cm-kpi"><b>' + aguard + '</b> ' + esc(T('cm.kAguardando')) + '</span><span class="cm-kpi"><b>' + prog + '</b> ' + esc(T('cm.kProgramadas')) + '</span>' +
    '<span class="cm-kpi"><b style="color:var(' + (atraso ? '--rust' : '--green') + ')">' + atraso + '</b> ' + esc(T('cm.kAtraso')) + '</span>';
  const botao = '<button type="button" class="cm-recolher" data-acao="recolherCargaMaq" aria-expanded="' + !ui.recolhido + '" title="' + esc(T(ui.recolhido ? 'cm.mostrar' : 'cm.recolher')) + '">' + (ui.recolhido ? '▾' : '▴') + '</button>';
  if (ui.recolhido) {
    // recolhido: uma linha só com a aba atual e os números
    alvo.innerHTML = '<div class="card cm-topo-mini">' + botao + '<b>' + esc(T('cm.aba.' + ui.aba)) + '</b><span class="cm-mini-kpis">' + kpis + '</span></div>' +
      '<div id="cm-conteudo">' + (ui.aba === 'plan' ? planilha(ag, h) : ui.aba === 'mapa' ? mapa(ag, h) : ui.aba === 'baixa' ? baixaHtml(baixa) : '') + '</div>';
    const cfg0 = $('cu-config');
    if (cfg0) cfg0.hidden = ui.aba !== 'config';
    return;
  }
  alvo.innerHTML =
    '<div class="cm-topo">' + botao + '<div class="fab-visoes cm-abas" role="tablist">' + ABAS.map(function (a) {
      return '<button type="button" role="tab" aria-selected="' + (ui.aba === a) + '" class="' + (ui.aba === a ? 'ativa' : '') + '" data-acao="abaCargaMaq" data-arg="' + a + '">' + esc(T('cm.aba.' + a)) + '<b>' + nAba[a] + '</b></button>';
    }).join('') + '</div>' +
    '<div class="cm-kpis">' + kpis + '</div></div>' +
    '<div id="cm-conteudo">' + (ui.aba === 'plan' ? planilha(ag, h) : ui.aba === 'mapa' ? mapa(ag, h) : ui.aba === 'baixa' ? baixaHtml(baixa) : '') + '</div>';
  // a aba "Máquinas e setores" mostra o bloco que já existe na página
  const cfg = $('cu-config');
  if (cfg) cfg.hidden = ui.aba !== 'config';
}

/* ---------------------------------------------- 1. programação por máquina */
function seletor(ag) {
  return '<div class="card cm-maqs">' + grupos().map(function (g) {
    return '<div class="cm-grupo"><div class="cm-grupo-rot">' + esc(g.tipo.toUpperCase()) + '</div><div class="cm-chips">' + g.maquinas.map(function (m) {
      const itens = (ag[m.id] || []).filter(function (it) { return it.op && !it.concluida && !it.ausente; });
      const horas = itens.reduce(function (t, it) { return t + (it.horas || 0); }, 0);
      return '<button type="button" class="cm-chip' + (m.id === ui.maq ? ' ativo' : '') + '" data-acao="maqCargaMaq" data-arg="' + esc(m.id) + '">' + esc(m.nome) +
        '<small>' + esc(T('cm.chipDet', itens.length, horasHM(horas))) + '</small></button>';
    }).join('') + '</div></div>';
  }).join('') + '</div>';
}
function planilha(ag, h) {
  const maqs = ativas();
  if (!maqs.length) return semMaquinas();
  const m = maqs.find(function (x) { return x.id === ui.maq; });
  const editar = podeEditar();
  const vivos = (ag[m.id] || []).filter(function (it) { return !it.ausente; });
  const pendentes = vivos.filter(function (it) { return !it.concluida; });
  const horas = pendentes.reduce(function (t, it) { return t + (it.horas || 0); }, 0);
  const livre = pendentes.map(function (it) { return it.fimDt; }).filter(Boolean).sort().pop();
  const linhas = vivos.map(function (it, i) {
    const o = it.op;
    const folga = it.fim && it.prazo ? difDias(it.fim, it.prazo) : null;
    const semHoras = !it.concluida && !(it.horas > 0);
    const sit = it.concluida ? 'feita' : (semHoras ? 'semhoras' : (folga == null ? 'sem' : (folga < 0 ? 'atraso' : (folga <= 3 ? 'apertado' : 'ok'))));
    const sitTxt = it.concluida ? T('prog.sit.baixaCq') : (semHoras ? T('cm.semHorasCurto') : (folga == null ? '—' : (folga >= 0 ? T('cm.folga', folga) : T('cm.atrasa', -folga))));
    const ant = it.depoisDe ? '<div class="cm-dep">' + esc(T('cm.depoisDe', br(it.depoisDe))) + '</div>' : '';
    const aviso = semHoras ? '<div class="cm-aviso-horas">⚠ ' + esc(T('cm.semHoras')) + '</div>' : '';
    const arg = esc(m.id) + '" data-arg2="' + esc(Prog.chaveItem(it.opId, it.n));
    const vivo = editar && !it.concluida;
    const inicioCel = vivo
      ? '<input type="datetime-local" class="cm-dt" value="' + esc(it.inicioDt || '') + '" data-change="inicioCargaMaq" data-arg="' + arg + '" aria-label="' + esc(T('prog.inicio')) + '">' +
        (it.empurrada ? '<div class="cm-dep">' + esc(T('cm.empurrada', brDt(it.inicioFixo))) + '</div>' : (it.inicioFixo ? '' : '<div class="hint-txt">' + esc(T('cm.inicioAuto')) + '</div>'))
      : esc(brDt(it.inicioDt));
    const fimCel = vivo
      ? '<input type="datetime-local" class="cm-dt' + (it.fimAjustado ? ' cm-ajustado' : '') + '" value="' + esc(it.fimAjustado || it.fimDt || '') + '" data-change="fimCargaMaq" data-arg="' + arg + '" aria-label="' + esc(T('prog.fim')) + '">' +
        (it.fimAjustado ? '<div class="cm-dep">' + esc(T('cm.ajustado', brDt(it.fimDt))) + ' <button type="button" class="link-btn" data-acao="fimCalcCargaMaq" data-arg="' + arg + '">' + esc(T('cm.voltarCalc')) + '</button></div>' : '')
      : esc(brDt(it.fimAjustado || it.fimDt));
    return '<tr class="cm-' + sit + '"><td class="c"><b>' + (i + 1) + '</b></td>' +
      '<td class="mono"><span class="cm-cor" style="background:' + corOp(o.id) + '"></span><button type="button" class="link-btn mono" data-acao="abrirOpDetalhe" data-arg="' + esc(o.id) + '">' + esc(o.numero) + '</button></td>' +
      '<td class="mono cf-com">' + esc(o.commessa) + '</td><td>' + esc(o.descricao || o.desenho) + '</td><td>' + esc(nomeOperacao(it)) + ant + aviso + '</td>' +
      '<td class="num">' + (vivo ? '<input type="text" inputmode="numeric" class="cm-horas' + (semHoras ? ' cm-horas-falta' : '') + '" value="' + esc(it.horas > 0 ? horasHM(it.horas) : '') + '" placeholder="hh:mm" data-change="horasCargaMaq" data-arg="' + arg + '" aria-label="' + esc(T('cm.horas')) + '">' : horasHM(it.horas)) + '</td>' +
      '<td>' + inicioCel + '</td><td>' + fimCel + '</td><td class="num">' + (it.prazo ? br(it.prazo) : '—') + '</td>' +
      '<td><span class="pill-cm cm-p-' + sit + '">' + esc(sitTxt) + '</span></td>' +
      (editar ? '<td class="c cm-acoes"><button type="button" class="cm-ic cm-ic-tirar" data-acao="tirarCargaMaq" data-arg="' + arg + '" title="' + esc(T('cm.tirar')) + '" aria-label="' + esc(T('cm.tirar')) + '">' + LIXEIRA + '</button></td>' : '') + '</tr>';
  }).join('');
  const esp = editar ? Prog.aguardandoNaMaquina(m, estado.ops.filter(opVisivel), estado.maquinas, estado.setores).sort(function (a, b) {
    const pa = buscarProjeto(a.op.projetoId), pb = buscarProjeto(b.op.projetoId);
    return String((pa && pa.prodFim) || '9').localeCompare(String((pb && pb.prodFim) || '9')) || compararNatural(a.op.numero, b.op.numero);
  }) : [];
  const incluir = editar ? '<div class="cm-incluir"><b>' + esc(T('cm.incluir')) + '</b><select id="cm-incluir-sel" aria-label="' + esc(T('cm.incluir')) + '">' + (esp.length ? esp.map(function (x) {
    const p = buscarProjeto(x.op.projetoId), tot = (x.op.operacoes || []).length;
    return '<option value="' + esc(x.chave) + '">' + esc(x.op.numero + ' · ' + x.op.commessa + ' · ' + (x.op.descricao || x.op.desenho) + ' — ' +
      (x.operacao.n == null ? T('cm.opInteira') : (x.operacao.n + 1) + '/' + tot + ' ' + (x.operacao.texto || x.operacao.setor)) + ' · ' + (x.operacao.horas > 0 ? horasHM(x.operacao.horas) : T('cm.semHorasCurto')) + (p && p.prodFim ? ' · ' + T('prog.prazo', br(p.prodFim)) : '')) + '</option>';
  }).join('') : '<option value="">' + esc(T('cm.nadaAguardando', tipoDe(m))) + '</option>') + '</select>' +
    '<label class="cm-incluir-ini">' + esc(T('cm.inicioOpc')) + ' <input type="datetime-local" id="cm-incluir-ini" class="cm-dt"></label>' +
    '<button type="button" class="btn btn-primary btn-mini" data-acao="incluirCargaMaq" data-arg="' + esc(m.id) + '"' + (esp.length ? '' : ' disabled') + '>' + esc(T('cm.incluirBtn')) + '</button>' +
    '<span class="hint-txt">' + esc(T('cm.incluirNota', tipoDe(m))) + '</span></div>' : '';
  return seletor(ag) + '<div class="card cm-plan"><div class="cm-plan-topo"><div><div class="panel-title" style="margin:0">' + esc(m.nome) + '</div><div class="hint-txt">' +
    esc(T('cm.maqDet', tipoDe(m), pendentes.length, horasHM(horas), livre ? brDt(livre) : '—')) + '</div></div>' +
    '<div class="hint-txt cm-cal">' + esc(T('cm.calendario')) + '</div></div>' +
    '<div class="table-wrap"><table class="cm-tab"><thead><tr><th>#</th><th>OP</th><th>' + esc(T('fab.cCommessa')) + '</th><th>' + esc(T('fab.cDescricao')) + '</th><th>' + esc(T('cm.operacao')) +
    '</th><th class="num">' + esc(T('cm.horas')) + '</th><th>' + esc(T('prog.inicio')) + '</th><th>' + esc(T('cm.fimPrev')) + '</th><th class="num">' +
    esc(T('cm.prazo')) + '</th><th>' + esc(T('prog.situacao')) + '</th>' + (editar ? '<th></th>' : '') + '</tr></thead><tbody>' +
    (linhas || '<tr><td colspan="11" class="hint-txt" style="padding:16px">' + esc(T('cm.filaVazia')) + '</td></tr>') + '</tbody></table></div>' + incluir + '</div>';
}

// Ainda sem máquinas: o cadastro fica na aba "Máquinas e setores".
function semMaquinas() {
  return '<div class="card panel-pad empty-state">' + esc(T(podeEditar() ? 'cm.semMaquinasEdit' : 'cg.semMaquinas')) +
    (podeEditar() ? '<div style="margin-top:12px"><button type="button" class="btn btn-primary" data-acao="abaCargaMaq" data-arg="config">' + esc(T('cm.cadastrar')) + '</button></div>' : '') + '</div>';
}

/* --------------------------------------------------- 2. mapa de fabricação */
function mapa(ag, h) {
  const dias = [];
  for (let d = 0; dias.length < DIAS_MAPA; d++) dias.push(addDias(h, d - 3));
  const usados = {};
  const cel = function (m, dia) {
    if (fds(dia)) return '<td class="cm-cel cm-fds"></td>';
    const l = (ag[m.id] || []).filter(function (it) { return it.porDia && it.porDia[dia] > 0 && !it.concluida; }).sort(function (a, b) { return b.porDia[dia] - a.porDia[dia]; });
    if (!l.length) return '<td class="cm-cel"></td>';
    l.forEach(function (it) { usados[it.opId] = it.op; });
    const tit = br(dia) + ' — ' + m.nome + '\n' + l.map(function (it) { return it.op.numero + ' · ' + (it.op.descricao || it.op.desenho) + ' · ' + nomeOperacao(it) + ' · ' + horasHM(it.porDia[dia]); }).join('\n');
    return '<td class="cm-cel cm-marcado" style="background:' + corOp(l[0].opId) + '" title="' + esc(tit) + '"><span>' + (l.length > 1 ? '✓✓' : '✓') + '</span></td>';
  };
  const SEM = T('cm.semana').split(',');
  const cab = '<tr><th class="cm-mq">' + esc(T('cm.maqDia')) + '</th>' + dias.map(function (d) {
    return '<th class="' + (fds(d) ? 'cm-fds-h' : '') + (d === h ? ' cm-hoje' : '') + '">' + d.slice(8) + '<small>' + esc(SEM[new Date(d + 'T12:00:00').getDay()]) + '</small></th>';
  }).join('') + '</tr>';
  let corpo = '';
  grupos().forEach(function (g) {
    corpo += '<tr class="cm-grupo-l"><td class="cm-mq">' + esc(g.tipo.toUpperCase()) + '</td><td colspan="' + dias.length + '"></td></tr>';
    g.maquinas.forEach(function (m) {
      const n = (ag[m.id] || []).filter(function (it) { return it.op && !it.concluida && !it.ausente; }).length;
      corpo += '<tr><td class="cm-mq"><b>' + esc(m.nome) + '</b><small>' + esc(T('cm.mapaMaq', n)) + '</small></td>' + dias.map(function (d) { return cel(m, d); }).join('') + '</tr>';
    });
  });
  if (!corpo) return semMaquinas();
  const leg = Object.keys(usados).sort(function (a, b) { return compararNatural(usados[a].numero, usados[b].numero); }).map(function (id) {
    const o = usados[id];
    return '<span><i style="background:' + corOp(id) + '"></i><b class="mono">' + esc(o.numero) + '</b> ' + esc(o.descricao || o.desenho) + ' · ' + esc(o.commessa) + '</span>';
  }).join('');
  return '<div class="card"><div class="cm-mapa-topo"><div class="panel-title" style="margin:0">' + esc(T('cm.mapaTit')) + '</div><div class="hint-txt">' + esc(T('cm.mapaNota')) + '</div></div>' +
    '<div class="table-wrap cm-mapa-wrap"><table class="cm-mapa"><thead>' + cab + '</thead><tbody>' + corpo + '</tbody></table></div>' +
    (leg ? '<div class="cm-leg">' + leg + '</div>' : '') + '</div>';
}

/* ----------------------------------------------------- 3. baixa do CQ */
function baixaHtml(baixa) {
  if (!baixa.length) return '<div class="card panel-pad empty-state">' + esc(T('cf.semBaixa')) + '</div>';
  const editar = podeEditar();
  return '<div class="card"><div class="table-wrap"><table class="ord-tab"><thead><tr><th>OP</th><th>' + esc(T('fab.cCommessa')) + '</th><th>' + esc(T('fab.cDescricao')) + '</th><th class="num">' +
    esc(T('fab.cQtd')) + '</th><th>' + esc(T('passo.pergunta')) + '</th><th></th></tr></thead><tbody>' +
    baixa.sort(function (a, b) { return compararNatural(a.commessa, b.commessa) || compararNatural(a.numero, b.numero); }).map(function (o) {
      return '<tr><td class="mono">' + esc(o.numero) + '</td><td class="mono cf-com">' + esc(o.commessa) + '</td><td>' + esc(o.descricao || '—') + '</td><td class="num">' + numeroBr(o.qtd) + '</td>' +
        '<td>' + esc(o.proximoPasso ? T('passo.' + o.proximoPasso) : '—') + '</td><td>' + (editar ? '<button type="button" class="btn btn-success btn-mini" data-acao="finalizarOp" data-arg="' + esc(o.id) + '">' + esc(T('prog.finalizar')) + '</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
}

/* --------------------------------------------------------------- ações */
function maquina(id) { return (estado.maquinas || []).find(function (m) { return m.id === id; }); }
function semChave(fila, chave) { return fila.filter(function (f) { return Prog.chaveItem(f.opId, f.n == null ? null : Number(f.n)) !== chave; }); }
function salvar(m, fila, msg) { return DadosProg.salvarFila(m.id, fila).then(function () { if (msg) toast(msg); }).catch(function (e) { avisoErro(e); }); }
function idx(fila, chave) { return fila.findIndex(function (f) { return Prog.chaveItem(f.opId, f.n == null ? null : Number(f.n)) === chave; }); }
function redesenhar() { renderCargaMaquina('cu-programacao'); }

// Põe o item na fila: com início, na posição pelo horário (se cair em cima de
// outra, pergunta; as outras são empurradas para frente); sem início, no fim.
function colocar(m, item, msg, chaveAntiga) {
  const resto = chaveAntiga ? semChave(m.fila || [], chaveAntiga) : (m.fila || []).slice();
  const opsId = opsPorId(), proj = {};
  estado.projetos.forEach(function (p) { proj[p.id] = p; });
  const so = Object.assign({}, m, { fila: resto });
  const ag = Prog.agendarTudo((estado.maquinas || []).map(function (x) { return x.id === m.id ? so : x; }), opsId, proj, estado.setores, agoraLocal())[m.id] || [];
  const o = opsId[item.opId], op = o ? Prog.operacoesDaOp(o)[item.n == null ? 0 : item.n] : null;
  const horasCalc = Number(item.horas) > 0 ? Number(item.horas) : (op ? op.horas : 0);
  const r = Prog.encaixar(resto, ag, Object.assign({}, item, { horasCalc: horasCalc }));
  const seguir = r.conflitos.length
    ? confirmar(T('cm.conflitoQ', r.conflitos.map(function (c) { return c.op.numero + ' (' + brDt(c.inicioDt) + ' → ' + brDt(c.fimDt) + ')'; }).join(', ')), { titulo: T('cm.conflitoTit'), textoOk: T('cm.conflitoOk') })
    : Promise.resolve(true);
  seguir.then(function (ok) {
    if (!ok) { redesenhar(); return; }
    // as empurradas guardam o início novo (a ordem fica valendo)
    const nova = r.fila.map(function (f) { return Object.assign({}, f); });
    const ag2 = Prog.agendarTudo((estado.maquinas || []).map(function (x) { return x.id === m.id ? Object.assign({}, m, { fila: nova }) : x; }), opsId, proj, estado.setores, agoraLocal())[m.id] || [];
    nova.forEach(function (f, i) { const a = ag2[i]; if (f.inicio && a && a.inicioDt && a.inicioDt !== f.inicio) f.inicio = a.inicioDt; });
    salvar(m, nova, r.conflitos.length ? T('cm.empurradasOk', r.conflitos.length) : msg);
  });
}
function agoraLocal() {
  const d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

registrarAcoes({
  abaCargaMaq: function (a) { if (ABAS.indexOf(a) >= 0) { ui.aba = a; redesenhar(); } },
  maqCargaMaq: function (id) { ui.maq = id; redesenhar(); },
  recolherCargaMaq: function () { ui.recolhido = !ui.recolhido; gravarRecolhido(ui.recolhido); redesenhar(); },
  incluirCargaMaq: function (mid) {
    const m = maquina(mid), v = $('cm-incluir-sel') && $('cm-incluir-sel').value;
    if (!m || !v || !podeEditar()) return;
    if ((m.fila || []).length >= Prog.MAX_FILA) { toast(T('prog.erro.filaCheia'), { tipo: 'erro' }); return; }
    const p = v.split('#'), n = p[1] === '*' ? null : Number(p[1]);
    const ini = $('cm-incluir-ini') && $('cm-incluir-ini').value;
    colocar(m, { opId: p[0], n: n, horas: null, inicio: ini || null, fimAjustado: null }, T('cm.incluida', m.nome));
  },
  tirarCargaMaq: function (mid, chave) {
    const m = maquina(mid); if (!m) return;
    const o = opsPorId()[String(chave).split('#')[0]];
    confirmar(T('cm.tirarQ', o ? o.numero : '', m.nome), { titulo: T('cm.tirar'), textoOk: T('cm.tirarOk'), perigo: true }).then(function (ok) {
      if (ok) salvar(m, semChave(m.fila || [], chave), T('cm.tirada'));
    });
  },
  horasCargaMaq: function (v, chave, el) {
    const m = maquina(el.dataset.arg); if (!m) return;
    const fila = (m.fila || []).map(function (f) { return Object.assign({}, f); }), i = idx(fila, chave);
    if (i < 0) return;
    const hNum = lerHoras(v);
    if (v && hNum == null) { toast(T('cm.horasInvalidas'), { tipo: 'erro' }); redesenhar(); return; }
    fila[i].horas = hNum > 0 ? Math.min(10000, hNum) : null;
    salvar(m, fila);
  },
  // mudar o início: a operação vai para a posição pelo início (pergunta se cair em cima de outra)
  inicioCargaMaq: function (v, chave, el) {
    const m = maquina(el.dataset.arg); if (!m) return;
    const atual = (m.fila || []).find(function (f) { return Prog.chaveItem(f.opId, f.n == null ? null : Number(f.n)) === chave; });
    if (!atual) return;
    colocar(m, Object.assign({}, atual, { inicio: v || null }), null, chave);
  },
  // fim à mão: só registro (estimado × feito); igual ao calculado = volta ao cálculo
  fimCargaMaq: function (v, chave, el) {
    const m = maquina(el.dataset.arg); if (!m) return;
    const fila = (m.fila || []).map(function (f) { return Object.assign({}, f); }), i = idx(fila, chave);
    if (i < 0) return;
    const it = (agendasAtuais()[m.id] || []).find(function (x) { return Prog.chaveItem(x.opId, x.n) === chave; });
    fila[i].fimAjustado = v && (!it || v !== it.fimDt) ? v : null;
    salvar(m, fila, fila[i].fimAjustado ? T('cm.fimAjustadoOk') : null);
  },
  fimCalcCargaMaq: function (mid, chave) {
    const m = maquina(mid); if (!m) return;
    const fila = (m.fila || []).map(function (f) { return Object.assign({}, f); }), i = idx(fila, chave);
    if (i < 0) return;
    fila[i].fimAjustado = null;
    salvar(m, fila);
  }
});
