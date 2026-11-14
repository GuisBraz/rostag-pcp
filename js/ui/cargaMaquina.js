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
import { confirmar, abrirModal, fecharModal } from './modal.js';
import { avisoErro } from './app.js';
import { agendasAtuais } from './programacao.js';

const ABAS = ['plan', 'mapa', 'baixa', 'config'];
const ui = { aba: 'plan', maq: null, recolhido: lerRecolhido(), listaRecolhida: lerLista(), busca: '' };
// cabeçalho (abas e números) recolhido ou não: lembrado neste navegador
function lerRecolhido() { try { return localStorage.getItem('rostag.cm.recolhido') === '1'; } catch (e) { return false; } }
function lerLista() { try { return localStorage.getItem('rostag.cm.listaRecolhida') === '1'; } catch (e) { return false; } }
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

/* Campo de hora e data com máscara: "hh:mm dd/mm/aa", só números, pulando
   sozinho de um pedaço para o outro; ano com 2 dígitos vira 20aa. */
export function paraMascara(dt) {
  const m = String(dt || '').match(/^\d{2}(\d{2})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? m[4] + ':' + m[5] + ' ' + m[3] + '/' + m[2] + '/' + m[1] : '';
}
// "14:30 13/11/26" → "2026-11-13T14:30" (null se incompleto ou inválido)
export function daMascara(txt) {
  const d = String(txt || '').replace(/\D/g, '');
  if (d.length !== 10) return null;
  const hh = +d.slice(0, 2), mi = +d.slice(2, 4), dd = +d.slice(4, 6), mm = +d.slice(6, 8), aa = 2000 + +d.slice(8, 10);
  if (hh > 23 || mi > 59 || mm < 1 || mm > 12 || dd < 1) return null;
  const ultimo = new Date(Date.UTC(aa, mm, 0)).getUTCDate();
  if (dd > ultimo) return null;
  const p = function (n) { return String(n).padStart(2, '0'); };
  return aa + '-' + p(mm) + '-' + p(dd) + 'T' + p(hh) + ':' + p(mi);
}
function campoDt(dt, acao, arg, rotulo, dica, classe) {
  return '<input type="text" class="cm-dt cm-dtm' + (classe || '') + '" inputmode="numeric" autocomplete="off" placeholder="hh:mm dd/mm/aa" value="' + esc(paraMascara(dt)) + '"' +
    ' data-change="' + acao + '" data-arg="' + arg + '" aria-label="' + esc(rotulo) + '"' + (dica ? ' title="' + esc(dica) + '"' : '') + '>';
}
/* Digitação por pedaços (hora, minuto, dia, mês, ano), como o campo de data
   do Windows: clicou num pedaço, ele fica selecionado; 2 números trocam só ele
   e pulam para o próximo; ⌫ apaga só o pedaço (vazio: volta e apaga o
   anterior); ← → andam; ↑ ↓ somam/tiram 1; Enter confirma; Esc desfaz. */
const MOLDE = ['hh', 'mm', 'dd', 'mm', 'aa'], SEPS = [':', ' ', '/', '/', ''];
const MAX1 = [2, 5, 3, 1, 9], MAXP = [23, 59, 31, 12, 99], MINP = [0, 0, 1, 1, 0];
const MOLDE_TXT = 'hh:mm dd/mm/aa';
export function pedacosDt(v) {
  const s = String(v || '');
  return MOLDE.map(function (_, i) { return s.slice(i * 3, i * 3 + 2).replace(/\D/g, ''); });
}
export function montarDt(p) {
  if (p.every(function (x) { return !x; })) return '';
  return p.map(function (x, i) { return (x.length === 2 ? x : x.length === 1 ? x + '_' : MOLDE[i]) + SEPS[i]; }).join('');
}
function ehDtm(el) { return !!(el && el.classList && el.classList.contains('cm-dtm')); }
function selPedaco(el, i) {
  el.dataset.seg = i; el.dataset.novo = '1';
  if (!el.value) el.value = MOLDE_TXT;
  el.setSelectionRange(i * 3, i * 3 + 2);
}
function gravarDt(el, p, i) {
  el.value = montarDt(p) || MOLDE_TXT;
  el.classList.remove('invalid');
  el.dataset.seg = i;
  el.setSelectionRange(i * 3, i * 3 + 2);
}
function digitoDt(el, d) {
  const p = pedacosDt(el.value), i = +el.dataset.seg || 0;
  if (el.dataset.novo !== '0') {
    if (+d > MAX1[i]) { p[i] = '0' + d; gravarDt(el, p, i); selPedaco(el, Math.min(4, i + 1)); return; }
    p[i] = d; gravarDt(el, p, i); el.dataset.novo = '0'; return;
  }
  p[i] = (p[i] || '') + d;
  gravarDt(el, p, i); selPedaco(el, Math.min(4, i + 1));
}
function apagarDt(el, frente) {
  const p = pedacosDt(el.value); let i = +el.dataset.seg || 0;
  if (!p[i] && !frente && i > 0) i--;
  p[i] = ''; gravarDt(el, p, i); el.dataset.novo = '1';
}
function somarDt(el, n) {
  const p = pedacosDt(el.value), i = +el.dataset.seg || 0;
  let v = p[i] ? +p[i] + n : MINP[i];
  if (v > MAXP[i]) v = MINP[i];
  if (v < MINP[i]) v = MAXP[i];
  p[i] = String(v).padStart(2, '0'); gravarDt(el, p, i); el.dataset.novo = '1';
}
function colarDt(el, txt) {
  const d = String(txt || '').replace(/\D/g, '').slice(0, 10), p = [];
  for (let i = 0; i < 5; i++) p.push(d.slice(i * 2, i * 2 + 2));
  gravarDt(el, p, Math.min(4, Math.floor(d.length / 2))); el.dataset.novo = '1';
}
document.addEventListener('focusin', function (e) {
  const el = e.target; if (!ehDtm(el)) return;
  el.dataset.antes = el.value;
  setTimeout(function () {
    if (document.activeElement !== el) return;
    // entrou pelo Tab: vai para o primeiro pedaço incompleto (ou a hora)
    if (el.dataset.clicou !== '1') { const v = pedacosDt(el.value).findIndex(function (x) { return x.length < 2; }); selPedaco(el, v < 0 ? 0 : v); }
    el.dataset.clicou = '0';
  });
});
document.addEventListener('mousedown', function (e) { if (ehDtm(e.target)) e.target.dataset.clicou = '1'; });
document.addEventListener('mouseup', function (e) {
  const el = e.target; if (!ehDtm(el)) return;
  setTimeout(function () { selPedaco(el, el.value ? Math.min(4, Math.floor((el.selectionStart || 0) / 3)) : 0); });
});
document.addEventListener('keydown', function (e) {
  const el = e.target; if (!ehDtm(el) || e.ctrlKey || e.metaKey || e.altKey) return;
  const i = +el.dataset.seg || 0, k = e.key;
  if (k === 'ArrowLeft') { e.preventDefault(); selPedaco(el, Math.max(0, i - 1)); }
  else if (k === 'ArrowRight') { e.preventDefault(); selPedaco(el, Math.min(4, i + 1)); }
  else if (k === 'Home') { e.preventDefault(); selPedaco(el, 0); }
  else if (k === 'End') { e.preventDefault(); selPedaco(el, 4); }
  else if (k === 'ArrowUp') { e.preventDefault(); somarDt(el, 1); }
  else if (k === 'ArrowDown') { e.preventDefault(); somarDt(el, -1); }
  else if (k === 'Enter') { e.preventDefault(); el.blur(); }
  else if (k === 'Escape') { e.preventDefault(); el.value = el.dataset.antes || ''; el.classList.remove('invalid'); el.blur(); }
});
// digitar / apagar / colar (o beforeinput também pega o teclado do celular)
document.addEventListener('beforeinput', function (e) {
  const el = e.target; if (!ehDtm(el)) return;
  e.preventDefault();
  const t = e.inputType;
  if (t === 'insertText' && /^\d+$/.test(e.data || '')) { for (const d of e.data) digitoDt(el, d); }
  else if (t === 'insertFromPaste' || t === 'insertFromDrop') colarDt(el, e.data || (e.dataTransfer && e.dataTransfer.getData('text')));
  else if (t === 'deleteContentBackward' || t === 'deleteWordBackward') apagarDt(el, false);
  else if (t === 'deleteContentForward' || t === 'deleteWordForward' || t === 'deleteByCut') apagarDt(el, true);
});
document.addEventListener('paste', function (e) {
  const el = e.target; if (!ehDtm(el)) return;
  e.preventDefault(); colarDt(el, (e.clipboardData || window.clipboardData).getData('text'));
});
// saiu do campo: tudo vazio = limpa; mudou = dispara o "change" (salva)
document.addEventListener('focusout', function (e) {
  const el = e.target; if (!ehDtm(el)) return;
  if (pedacosDt(el.value).every(function (x) { return !x; })) el.value = '';
  if (el.value !== (el.dataset.antes || '')) { el.dataset.antes = el.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
});
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
  // a primeira da fila (que não foi para o CQ) é a que está em máquina; as outras aguardam
  const primeira = pendentes[0] ? Prog.chaveItem(pendentes[0].opId, pendentes[0].n) : null;
  const linhas = vivos.map(function (it, i) {
    const o = it.op;
    const semHoras = !it.concluida && !(it.horas > 0);
    const naMaquina = !it.concluida && Prog.chaveItem(it.opId, it.n) === primeira;
    const sit = it.concluida ? 'feita' : (semHoras ? 'semhoras' : (naMaquina ? 'maquina' : 'aguardando'));
    const sitTxt = it.concluida ? T('prog.sit.baixaCq') : (semHoras ? T('cm.semHorasCurto') : T(naMaquina ? 'cm.emMaquina' : 'cm.aguardandoSit'));
    const atrasada = !it.concluida && it.atraso;
    // as informações de apoio ficam na dica (passar o mouse), sem texto embaixo dos campos
    const dicaIni = [it.inicioFixo ? '' : T('cm.inicioAuto'), it.empurrada ? T('cm.empurrada', brDt(it.inicioFixo)) : '', it.depoisDe ? T('cm.depoisDe', br(it.depoisDe)) : ''].filter(Boolean).join(' · ');
    const dicaFim = it.fimAjustado ? T('cm.ajustado', brDt(it.fimDt)) : T('cm.fimCalc');
    const arg = esc(m.id) + '" data-arg2="' + esc(Prog.chaveItem(it.opId, it.n));
    const vivo = editar && !it.concluida;
    const inicioCel = vivo ? campoDt(it.inicioDt, 'inicioCargaMaq', arg, T('prog.inicio'), dicaIni, it.empurrada ? ' cm-empurrada' : '') : esc(brDt(it.inicioDt));
    const fimCel = vivo
      ? '<span class="cm-fim-cel">' + campoDt(it.fimAjustado || it.fimDt, 'fimCargaMaq', arg, T('prog.fim'), dicaFim, it.fimAjustado ? ' cm-ajustado' : '') +
        (it.fimAjustado ? '<button type="button" class="cm-ic cm-ic-mini" data-acao="fimCalcCargaMaq" data-arg="' + arg + '" title="' + esc(T('cm.voltarCalc')) + '" aria-label="' + esc(T('cm.voltarCalc')) + '">↺</button>' : '') + '</span>'
      : esc(brDt(it.fimAjustado || it.fimDt));
    return '<tr class="cm-' + sit + (atrasada ? ' cm-atraso' : '') + '"' + (atrasada ? ' title="' + esc(T('cm.passaPrazo', br(it.prazo))) + '"' : '') + '><td class="c"><b>' + (i + 1) + '</b></td>' +
      '<td class="mono"><span class="cm-cor" style="background:' + corOp(o.id) + '"></span><button type="button" class="link-btn mono" data-acao="abrirOpDetalhe" data-arg="' + esc(o.id) + '">' + esc(o.numero) + '</button></td>' +
      '<td class="mono cf-com">' + esc(o.commessa) + '</td><td class="cm-txt">' + esc(o.descricao || o.desenho) + '</td><td class="cm-txt"' + (semHoras ? ' title="' + esc(T('cm.semHoras')) + '"' : '') + '>' + esc(nomeOperacao(it)) + '</td>' +
      '<td class="num">' + (vivo ? '<input type="text" inputmode="numeric" class="cm-horas' + (semHoras ? ' cm-horas-falta' : '') + '" value="' + esc(it.horas > 0 ? horasHM(it.horas) : '') + '" placeholder="hh:mm" data-change="horasCargaMaq" data-arg="' + arg + '" aria-label="' + esc(T('cm.horas')) + '"' + (semHoras ? ' title="' + esc(T('cm.semHoras')) + '"' : '') + '>' : horasHM(it.horas)) + '</td>' +
      '<td>' + inicioCel + '</td><td>' + fimCel + '</td><td class="num">' + (it.prazo ? br(it.prazo) : '—') + '</td>' +
      '<td><span class="pill-cm cm-p-' + sit + '">' + esc(sitTxt) + '</span></td>' +
      (editar ? '<td class="c cm-acoes"><button type="button" class="cm-ic cm-ic-tirar" data-acao="tirarCargaMaq" data-arg="' + arg + '" title="' + esc(T('cm.tirar')) + '" aria-label="' + esc(T('cm.tirar')) + '">' + LIXEIRA + '</button></td>' : '') + '</tr>';
  }).join('');
  const esp = editar ? Prog.aguardandoNaMaquina(m, estado.ops.filter(opVisivel), estado.maquinas, estado.setores).sort(function (a, b) {
    const pa = buscarProjeto(a.op.projetoId), pb = buscarProjeto(b.op.projetoId);
    return String((pa && pa.prodFim) || '9').localeCompare(String((pb && pb.prodFim) || '9')) || compararNatural(a.op.numero, b.op.numero);
  }) : [];
  const incluir = editar ? listaProgramar(m, esp) : '';
  return seletor(ag) + '<div class="card cm-plan"><div class="cm-plan-topo"><div><div class="panel-title" style="margin:0">' + esc(m.nome) + '</div><div class="hint-txt">' +
    esc(T('cm.maqDet', tipoDe(m), pendentes.length, horasHM(horas), livre ? brDt(livre) : '—')) + '</div></div>' +
    '<div class="hint-txt cm-cal">' + esc(T('cm.calendario')) + '</div></div>' +
    '<div class="table-wrap"><table class="cm-tab"><thead><tr><th>#</th><th>OP</th><th>' + esc(T('fab.cCommessa')) + '</th><th>' + esc(T('fab.cDescricao')) + '</th><th>' + esc(T('cm.operacao')) +
    '</th><th class="num">' + esc(T('cm.horas')) + '</th><th>' + esc(T('prog.inicio')) + '</th><th>' + esc(T('cm.fimPrev')) + '</th><th class="num">' +
    esc(T('cm.prazo')) + '</th><th>' + esc(T('prog.situacao')) + '</th>' + (editar ? '<th></th>' : '') + '</tr></thead><tbody>' +
    (linhas || '<tr><td colspan="11" class="hint-txt" style="padding:16px">' + esc(T('cm.filaVazia')) + '</td></tr>') + '</tbody></table></div>' + incluir + '</div>';
}

// Lista das operações que esperam esta máquina: incluir direto da linha.
function listaProgramar(m, esp) {
  const hj = hoje(), aberta = !ui.listaRecolhida;
  const topo = '<div class="cm-prog-topo"><button type="button" class="cm-prog-tit" data-acao="recolherListaCargaMaq" aria-expanded="' + aberta + '">' +
    '<span class="cm-prog-seta">' + (aberta ? '▾' : '▸') + '</span>' + esc(T('cm.paraProgramar')) + ' <span class="cm-prog-n">' + esp.length + '</span></button>' +
    (aberta && esp.length ? '<input type="search" id="cm-prog-busca" class="cm-prog-busca" placeholder="' + esc(T('cm.buscarProg')) + '" value="' + esc(ui.busca || '') + '" autocomplete="off">' : '') +
    '<span class="hint-txt">' + esc(T('cm.incluirNota', tipoDe(m))) + '</span></div>';
  if (!aberta) return '<div class="cm-prog cm-prog-fechada">' + topo + '</div>';
  if (!esp.length) return '<div class="cm-prog">' + topo + '<div class="hint-txt cm-prog-vazio">' + esc(T('cm.nadaAguardando', tipoDe(m))) + '</div></div>';
  const busca = String(ui.busca || '').trim().toLowerCase();
  const linhas = esp.map(function (x) {
    const o = x.op, p = buscarProjeto(o.projetoId), prazo = p && p.prodFim, tot = (o.operacoes || []).length;
    const oper = x.operacao.n == null ? T('cm.opInteira') : (x.operacao.n + 1) + '/' + tot + ' ' + (x.operacao.texto || x.operacao.setor);
    const chave = String(o.numero + ' ' + o.commessa + ' ' + (o.descricao || o.desenho || '')).toLowerCase();
    const vencido = prazo && prazo < hj;
    const arg = esc(m.id) + '" data-arg2="' + esc(x.chave);
    return '<tr data-busca="' + esc(chave) + '"' + (busca && chave.indexOf(busca) < 0 ? ' hidden' : '') + '>' +
      '<td class="mono"><span class="cm-cor" style="background:' + corOp(o.id) + '"></span><button type="button" class="link-btn mono" data-acao="abrirOpDetalhe" data-arg="' + esc(o.id) + '">' + esc(o.numero) + '</button></td>' +
      '<td class="mono cf-com">' + esc(o.commessa) + '</td><td class="cm-txt">' + esc(o.descricao || o.desenho) + '</td><td class="cm-txt">' + esc(oper) + '</td>' +
      '<td class="num">' + (x.operacao.horas > 0 ? horasHM(x.operacao.horas) : '<span class="cm-prog-sem">' + esc(T('cm.semHorasCurto')) + '</span>') + '</td>' +
      '<td class="num' + (vencido ? ' cm-prog-vencido' : '') + '"' + (vencido ? ' title="' + esc(T('cm.prazoVencido')) + '"' : '') + '>' + (prazo ? br(prazo) : '—') + '</td>' +
      '<td><input type="text" class="cm-dt cm-dtm" inputmode="numeric" autocomplete="off" placeholder="' + MOLDE_TXT + '" aria-label="' + esc(T('cm.inicioOpc')) + '" title="' + esc(T('cm.inicioDica')) + '"></td>' +
      '<td class="c"><button type="button" class="btn btn-primary btn-mini" data-acao="incluirCargaMaq" data-arg="' + arg + '">' + esc(T('cm.incluirBtn')) + '</button></td></tr>';
  }).join('');
  return '<div class="cm-prog">' + topo + '<div class="table-wrap"><table class="cm-tab cm-prog-tab"><thead><tr><th>OP</th><th>' + esc(T('fab.cCommessa')) + '</th><th>' +
    esc(T('fab.cDescricao')) + '</th><th>' + esc(T('cm.operacao')) + '</th><th class="num">' + esc(T('cm.horas')) + '</th><th class="num">' + esc(T('cm.prazo')) +
    '</th><th>' + esc(T('cm.inicioOpc')) + '</th><th></th></tr></thead><tbody>' + linhas + '</tbody></table></div></div>';
}
// busca da lista: filtra na hora, sem redesenhar
document.addEventListener('input', function (e) {
  const el = e.target; if (!el || el.id !== 'cm-prog-busca') return;
  ui.busca = el.value; const b = el.value.trim().toLowerCase();
  document.querySelectorAll('.cm-prog-tab tbody tr').forEach(function (tr) { tr.hidden = !!b && tr.dataset.busca.indexOf(b) < 0; });
});

// Ainda sem máquinas: o cadastro fica na aba "Máquinas e setores".
function semMaquinas() {
  return '<div class="card panel-pad empty-state">' + esc(T(podeEditar() ? 'cm.semMaquinasEdit' : 'cg.semMaquinas')) +
    (podeEditar() ? '<div style="margin-top:12px"><button type="button" class="btn btn-primary" data-acao="abaCargaMaq" data-arg="config">' + esc(T('cm.cadastrar')) + '</button></div>' : '') + '</div>';
}

/* --------------------------------------------------- 2. mapa de fabricação */
// dia sem turno no calendário (hoje: só domingo)
function semTurno(dia) { return !Prog.CALENDARIO[new Date(dia + 'T12:00:00').getDay()]; }
function mapa(ag, h) {
  const dias = [];
  for (let d = 0; dias.length < DIAS_MAPA; d++) dias.push(addDias(h, d - 3));
  const usados = {};
  const cel = function (m, dia) {
    const l = (ag[m.id] || []).filter(function (it) { return it.porDia && it.porDia[dia] > 0 && !it.concluida; }).sort(function (a, b) { return b.porDia[dia] - a.porDia[dia]; });
    if (!l.length) return '<td class="cm-cel' + (semTurno(dia) ? ' cm-fds' : '') + '"></td>';
    l.forEach(function (it) { usados[it.opId] = it.op; });
    const tit = br(dia) + ' — ' + m.nome + '\n' + l.map(function (it) { return it.op.numero + ' · ' + (it.op.descricao || it.op.desenho) + ' · ' + nomeOperacao(it) + ' · ' + horasHM(it.porDia[dia]); }).join('\n');
    return '<td class="cm-cel cm-marcado" style="background:' + corOp(l[0].opId) + '" title="' + esc(tit) + '" data-acao="mapaDiaCargaMaq" data-arg="' + esc(m.id) + '" data-arg2="' + dia + '" tabindex="0" role="button"><span>' + (l.length > 1 ? '✓✓' : '✓') + '</span></td>';
  };
  const SEM = T('cm.semana').split(',');
  const cab = '<tr><th class="cm-mq">' + esc(T('cm.maqDia')) + '</th>' + dias.map(function (d) {
    return '<th class="' + (semTurno(d) ? 'cm-fds-h' : '') + (d === h ? ' cm-hoje' : '') + '">' + d.slice(8) + '<small>' + esc(SEM[new Date(d + 'T12:00:00').getDay()]) + '</small></th>';
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

// Pop-up do quadrado do mapa: as operações daquela máquina naquele dia.
function popupDia(mid, dia) {
  const m = maquina(mid); if (!m) return;
  const fila = (agendasAtuais()[m.id] || []).filter(function (it) { return it.op && !it.ausente && !it.concluida; });
  const primeira = fila[0] ? Prog.chaveItem(fila[0].opId, fila[0].n) : null;
  const l = fila.filter(function (it) { return it.porDia && it.porDia[dia] > 0; }).sort(function (a, b) { return String(a.inicioDt).localeCompare(String(b.inicioDt)); });
  if (!l.length) return;
  $('cm-dia-titulo').textContent = T('cm.diaTit', br(dia), m.nome);
  $('cm-dia-sub').textContent = tipoDe(m) + ' · ' + T('cm.diaN', l.length);
  $('cm-dia-lista').innerHTML = l.map(function (it) {
    const o = it.op, naMaq = Prog.chaveItem(it.opId, it.n) === primeira, semH = !(it.horas > 0);
    const sit = semH ? 'semhoras' : (naMaq ? 'maquina' : 'aguardando');
    const fim = it.fimAjustado || it.fimDt;
    const dado = function (r, v, cls) { return '<div><dt>' + esc(r) + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</dd></div>'; };
    return '<div class="cm-dia-op' + (it.atraso ? ' cm-atraso' : '') + '" style="--cor:' + corOp(o.id) + '">' +
      '<div class="cm-dia-topo"><button type="button" class="link-btn mono" data-acao="abrirOpDetalhe" data-arg="' + esc(o.id) + '"><b>' + esc(o.numero) + '</b></button>' +
      '<span class="pill-cm cm-p-' + sit + '">' + esc(semH ? T('cm.semHorasCurto') : T(naMaq ? 'cm.emMaquina' : 'cm.aguardandoSit')) + '</span></div>' +
      '<div class="cm-dia-desc">' + esc(o.descricao || o.desenho) + '</div>' +
      '<dl class="cm-dia-dados">' +
        dado(T('fab.cCommessa'), esc(o.commessa), 'mono') +
        dado(T('cm.operacao'), esc(nomeOperacao(it))) +
        dado(T('cm.diaHoras'), esc(horasHM(it.porDia[dia])), 'mono') +
        dado(T('cm.horas'), it.horas > 0 ? esc(horasHM(it.horas)) : '—', 'mono') +
        dado(T('prog.inicio'), esc(brDt(it.inicioDt)), 'mono') +
        dado(T('cm.fimPrev'), esc(brDt(fim)) + (it.fimAjustado ? ' <small>(' + esc(T('cm.aMao')) + ')</small>' : ''), 'mono') +
        dado(T('cm.prazo'), it.prazo ? esc(br(it.prazo)) : '—', 'mono' + (it.atraso ? ' cm-dia-atraso' : '')) +
      '</dl>' + (it.atraso ? '<div class="cm-dia-aviso">⚠ ' + esc(T('cm.passaPrazo', br(it.prazo))) + '</div>' : '') + '</div>';
  }).join('');
  $('cm-dia-ver').dataset.arg = m.id;
  abrirModal('modal-cm-dia');
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
  mapaDiaCargaMaq: function (mid, dia) { popupDia(mid, dia); },
  verProgCargaMaq: function (mid) { fecharModal('modal-cm-dia'); ui.aba = 'plan'; ui.maq = mid; redesenhar(); window.scrollTo(0, 0); },
  recolherCargaMaq: function () { ui.recolhido = !ui.recolhido; gravarRecolhido(ui.recolhido); redesenhar(); },
  recolherListaCargaMaq: function () {
    ui.listaRecolhida = !ui.listaRecolhida;
    try { localStorage.setItem('rostag.cm.listaRecolhida', ui.listaRecolhida ? '1' : '0'); } catch (e) { /* sem armazenamento */ }
    redesenhar();
  },
  incluirCargaMaq: function (mid, v, el) {
    const m = maquina(mid);
    if (!m || !v || !podeEditar()) return;
    if ((m.fila || []).length >= Prog.MAX_FILA) { toast(T('prog.erro.filaCheia'), { tipo: 'erro' }); return; }
    const p = String(v).split('#'), n = p[1] === '*' ? null : Number(p[1]);
    const campo = el && el.closest('tr') ? el.closest('tr').querySelector('.cm-dtm') : null;
    const txt = campo ? campo.value.trim() : '', ini = txt ? daMascara(txt) : null;
    if (txt && !ini) { campo.classList.add('invalid'); toast(T('cm.dtInvalida'), { tipo: 'erro' }); return; }
    colocar(m, { opId: p[0], n: n, horas: null, inicio: ini, fimAjustado: null }, T('cm.incluida', m.nome));
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
    const ini = v ? daMascara(v) : null;
    if (v && !ini) { el.classList.add('invalid'); toast(T('cm.dtInvalida'), { tipo: 'erro' }); return; }
    colocar(m, Object.assign({}, atual, { inicio: ini }), null, chave);
  },
  // fim à mão: só registro (estimado × feito); igual ao calculado = volta ao cálculo
  fimCargaMaq: function (v, chave, el) {
    const m = maquina(el.dataset.arg); if (!m) return;
    const fila = (m.fila || []).map(function (f) { return Object.assign({}, f); }), i = idx(fila, chave);
    if (i < 0) return;
    const it = (agendasAtuais()[m.id] || []).find(function (x) { return Prog.chaveItem(x.opId, x.n) === chave; });
    const fim = v ? daMascara(v) : null;
    if (v && !fim) { el.classList.add('invalid'); toast(T('cm.dtInvalida'), { tipo: 'erro' }); return; }
    fila[i].fimAjustado = fim && (!it || fim !== it.fimDt) ? fim : null;
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
