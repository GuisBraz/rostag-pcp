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
import { esc, br, hoje, addDias, fds, difDias, numeroBr, compararNatural, dataValida } from '../nucleo/fmt.js';
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
const SETA_CIMA = SVG('<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>');
const SETA_BAIXO = SVG('<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>');
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
        '<small>' + esc(T('cm.chipDet', itens.length, numeroBr(Math.round(horas)))) + '</small></button>';
    }).join('') + '</div></div>';
  }).join('') + '</div>';
}
function planilha(ag, h) {
  const maqs = ativas();
  if (!maqs.length) return semMaquinas();
  const m = maqs.find(function (x) { return x.id === ui.maq; });
  const editar = podeEditar();
  const itens = (ag[m.id] || []);
  const vivos = itens.filter(function (it) { return !it.ausente; });
  const pendentes = vivos.filter(function (it) { return !it.concluida; });
  const horas = pendentes.reduce(function (t, it) { return t + (it.horas || 0); }, 0);
  const livre = pendentes.map(function (it) { return it.fim; }).filter(Boolean).sort().pop();
  const linhas = vivos.map(function (it, i) {
    const o = it.op, p = buscarProjeto(o.projetoId);
    const folga = it.fim && it.prazo ? difDias(it.fim, it.prazo) : null;
    const sit = it.concluida ? 'feita' : (folga == null ? 'sem' : (folga < 0 ? 'atraso' : (folga <= 3 ? 'apertado' : 'ok')));
    const sitTxt = it.concluida ? T('prog.sit.baixaCq') : (folga == null ? '—' : (folga >= 0 ? T('cm.folga', folga) : T('cm.atrasa', -folga)));
    const ant = it.depoisDe ? '<div class="cm-dep">' + esc(T('cm.depoisDe', br(it.depoisDe))) + '</div>' : '';
    const arg = esc(m.id) + '" data-arg2="' + esc(Prog.chaveItem(it.opId, it.n));
    return '<tr class="cm-' + sit + '"><td class="c"><b>' + (i + 1) + '</b></td>' +
      '<td class="mono"><span class="cm-cor" style="background:' + corOp(o.id) + '"></span><button type="button" class="link-btn mono" data-acao="abrirOpDetalhe" data-arg="' + esc(o.id) + '">' + esc(o.numero) + '</button></td>' +
      '<td class="mono cf-com">' + esc(o.commessa) + '</td><td>' + esc(o.descricao || o.desenho) + '</td><td>' + esc(nomeOperacao(it)) + ant + '</td>' +
      '<td class="num">' + (editar && !it.concluida ? '<input type="number" class="cm-horas" min="0.5" max="10000" step="0.5" value="' + esc(it.horas) + '" data-change="horasCargaMaq" data-arg="' + arg + '" aria-label="' + esc(T('cm.horas')) + '">' : numeroBr(it.horas)) + '</td>' +
      '<td>' + (editar && !it.concluida ? '<input type="date" class="cm-data" value="' + esc(it.naoAntes || '') + '" data-change="naoAntesCargaMaq" data-arg="' + arg + '" aria-label="' + esc(T('cm.naoAntes')) + '">' : (it.naoAntes ? br(it.naoAntes) : '—')) + '</td>' +
      '<td class="num">' + (it.inicio ? br(it.inicio) : '—') + '</td><td class="num">' + (it.fim ? br(it.fim) : '—') + '</td><td class="num">' + (it.prazo ? br(it.prazo) : '—') + '</td>' +
      '<td><span class="pill-cm cm-p-' + sit + '">' + esc(sitTxt) + '</span></td>' +
      (editar ? '<td class="c cm-acoes"><span class="cm-ordem">' +
        '<button type="button" class="cm-ic" data-acao="moverCargaMaq" data-arg="' + arg + '|-1" title="' + esc(T('cm.subir')) + '" aria-label="' + esc(T('cm.subir')) + '"' + (i ? '' : ' disabled') + '>' + SETA_CIMA + '</button>' +
        '<button type="button" class="cm-ic" data-acao="moverCargaMaq" data-arg="' + arg + '|1" title="' + esc(T('cm.descer')) + '" aria-label="' + esc(T('cm.descer')) + '"' + (i < vivos.length - 1 ? '' : ' disabled') + '>' + SETA_BAIXO + '</button></span>' +
        '<button type="button" class="cm-ic cm-ic-tirar" data-acao="tirarCargaMaq" data-arg="' + arg + '" title="' + esc(T('cm.tirar')) + '" aria-label="' + esc(T('cm.tirar')) + '">' + LIXEIRA + '</button></td>' : '') + '</tr>';
  }).join('');
  const esp = editar ? Prog.aguardandoNaMaquina(m, estado.ops.filter(opVisivel), estado.maquinas, estado.setores).sort(function (a, b) {
    const pa = buscarProjeto(a.op.projetoId), pb = buscarProjeto(b.op.projetoId);
    return String((pa && pa.prodFim) || '9').localeCompare(String((pb && pb.prodFim) || '9')) || compararNatural(a.op.numero, b.op.numero);
  }) : [];
  const incluir = editar ? '<div class="cm-incluir"><b>' + esc(T('cm.incluir')) + '</b><select id="cm-incluir-sel" aria-label="' + esc(T('cm.incluir')) + '">' + (esp.length ? esp.map(function (x) {
    const p = buscarProjeto(x.op.projetoId), tot = (x.op.operacoes || []).length;
    return '<option value="' + esc(x.chave) + '">' + esc(x.op.numero + ' · ' + x.op.commessa + ' · ' + (x.op.descricao || x.op.desenho) + ' — ' +
      (x.operacao.n == null ? T('cm.opInteira') : (x.operacao.n + 1) + '/' + tot + ' ' + (x.operacao.texto || x.operacao.setor)) + ' · ' + numeroBr(x.operacao.horas) + ' h' + (p && p.prodFim ? ' · ' + T('prog.prazo', br(p.prodFim)) : '')) + '</option>';
  }).join('') : '<option value="">' + esc(T('cm.nadaAguardando', tipoDe(m))) + '</option>') + '</select>' +
    '<button type="button" class="btn btn-primary btn-mini" data-acao="incluirCargaMaq" data-arg="' + esc(m.id) + '"' + (esp.length ? '' : ' disabled') + '>' + esc(T('cm.incluirFim')) + '</button>' +
    '<span class="hint-txt">' + esc(T('cm.incluirNota', tipoDe(m))) + '</span></div>' : '';
  return seletor(ag) + '<div class="card cm-plan"><div class="cm-plan-topo"><div><div class="panel-title" style="margin:0">' + esc(m.nome) + '</div><div class="hint-txt">' +
    esc(T('cm.maqDet', tipoDe(m), numeroBr(m.horasDia), pendentes.length, numeroBr(Math.round(horas * 10) / 10), livre ? br(livre) : '—')) + '</div></div>' +
    (editar && vivos.length > 1 ? '<button type="button" class="btn btn-outline btn-mini" data-acao="ordenarCargaMaq" data-arg="' + esc(m.id) + '">' + esc(T('cm.ordenar')) + '</button>' : '') + '</div>' +
    '<div class="table-wrap"><table class="cm-tab"><thead><tr><th>#</th><th>OP</th><th>' + esc(T('fab.cCommessa')) + '</th><th>' + esc(T('fab.cDescricao')) + '</th><th>' + esc(T('cm.operacao')) +
    '</th><th class="num">' + esc(T('cm.horas')) + '</th><th>' + esc(T('cm.naoAntes')) + '</th><th class="num">' + esc(T('prog.inicio')) + '</th><th class="num">' + esc(T('prog.fim')) + '</th><th class="num">' +
    esc(T('cm.prazo')) + '</th><th>' + esc(T('prog.situacao')) + '</th>' + (editar ? '<th></th>' : '') + '</tr></thead><tbody>' +
    (linhas || '<tr><td colspan="12" class="hint-txt" style="padding:16px">' + esc(T('cm.filaVazia')) + '</td></tr>') + '</tbody></table></div>' + incluir + '</div>';
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
    const tit = br(dia) + ' — ' + m.nome + '\n' + l.map(function (it) { return it.op.numero + ' · ' + (it.op.descricao || it.op.desenho) + ' · ' + nomeOperacao(it) + ' · ' + numeroBr(Math.round(it.porDia[dia] * 10) / 10) + ' h'; }).join('\n');
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
      corpo += '<tr><td class="cm-mq"><b>' + esc(m.nome) + '</b><small>' + esc(T('cm.mapaMaq', numeroBr(m.horasDia), n)) + '</small></td>' + dias.map(function (d) { return cel(m, d); }).join('') + '</tr>';
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

registrarAcoes({
  abaCargaMaq: function (a) { if (ABAS.indexOf(a) >= 0) { ui.aba = a; redesenhar(); } },
  maqCargaMaq: function (id) { ui.maq = id; redesenhar(); },
  recolherCargaMaq: function () { ui.recolhido = !ui.recolhido; gravarRecolhido(ui.recolhido); redesenhar(); },
  incluirCargaMaq: function (mid) {
    const m = maquina(mid), v = $('cm-incluir-sel') && $('cm-incluir-sel').value;
    if (!m || !v || !podeEditar()) return;
    if ((m.fila || []).length >= Prog.MAX_FILA) { toast(T('prog.erro.filaCheia'), { tipo: 'erro' }); return; }
    const p = v.split('#'), n = p[1] === '*' ? null : Number(p[1]);
    salvar(m, (m.fila || []).concat([{ opId: p[0], n: n, horas: null, naoAntes: null }]), T('cm.incluida', m.nome));
  },
  moverCargaMaq: function (mid, arg2) {
    const m = maquina(mid); if (!m) return;
    const partes = String(arg2).split('|'), chave = partes[0], passo = Number(partes[1]);
    const fila = (m.fila || []).slice(), i = idx(fila, chave), j = i + passo;
    if (i < 0 || j < 0 || j >= fila.length) return;
    const t = fila[i]; fila[i] = fila[j]; fila[j] = t;
    salvar(m, fila);
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
    const hNum = Number(v);
    fila[i].horas = hNum > 0 ? Math.min(10000, hNum) : null;
    salvar(m, fila);
  },
  naoAntesCargaMaq: function (v, chave, el) {
    const m = maquina(el.dataset.arg); if (!m) return;
    const fila = (m.fila || []).map(function (f) { return Object.assign({}, f); }), i = idx(fila, chave);
    if (i < 0) return;
    fila[i].naoAntes = v && dataValida(v) ? v : null;
    salvar(m, fila);
  },
  ordenarCargaMaq: function (mid) {
    const m = maquina(mid); if (!m) return;
    const porId = opsPorId();
    const prazo = function (f) { const o = porId[f.opId], p = o && buscarProjeto(o.projetoId); return String((p && p.prodFim) || '9'); };
    salvar(m, (m.fila || []).slice().sort(function (a, b) { return prazo(a).localeCompare(prazo(b)); }), T('cm.ordenada'));
  }
});
