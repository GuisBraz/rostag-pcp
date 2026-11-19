/* ---------------------------------------------------------------------------
   Carga Máquina (usinagem) — situações especiais:
     - ❄ congelar uma OP até uma hora (a fila de trás é reprogramada); na hora
       do retorno, aviso em tela cheia + notificação do Windows: retomar ou
       reprogramar a parada;
     - 🚨 urgência: interrompe a OP em máquina; ela volta para a fila só com as
       horas que faltam;
     - ⚙ programação especial: dividir uma operação entre máquinas (peças por
       máquina, horas proporcionais), furando a fila ou no fim.
   Toda vez que uma operação sai, é congelada ou interrompida, as operações
   seguintes da mesma OP vão para o fim da fila "aguardando reprogramação".
--------------------------------------------------------------------------- */
import { estado } from '../estado.js';
import { esc, compararNatural } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Prog from '../dominio/programacao.js';
import * as Auth from '../dados/auth.js';
import * as DadosProg from '../dados/programacao.js';
import { $, registrarAcoes } from './dom.js';
import { abrirModal, fecharModal, confirmar } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';
import { agendasAtuais } from './programacao.js';
import { ctxCarga, maquinaPorId, redesenharCarga, horasHM, lerHoras, daMascara, paraMascara, brDtCarga } from './cargaMaquina.js';

function podeEditar() { return Auth.souGerente() || Auth.areaProgramador() === 'usinagem'; }
function chaveDe(f) { return Prog.chaveItem(f.opId, f.n == null ? null : Number(f.n)); }
function copia(maquinas) { return (maquinas || []).map(function (m) { return Object.assign({}, m, { fila: (m.fila || []).map(function (f) { return Object.assign({}, f); }) }); }); }
function itemDe(ms, mid, chave) { const m = ms.find(function (x) { return x.id === mid; }); return m ? (m.fila || []).find(function (f) { return chaveDe(f) === chave; }) : null; }
// Grava as filas que mudaram (uma escrita só).
function gravar(ms, ids, msg) {
  const lista = ms.filter(function (m) { return ids.indexOf(m.id) >= 0; }).map(function (m) { return { id: m.id, fila: m.fila }; });
  if (!lista.length) { if (msg) toast(msg); return Promise.resolve(); }
  return DadosProg.salvarFilas(lista).then(function () { if (msg) toast(msg); }).catch(function (e) { avisoErro(e); });
}
function unir(a, b) { (b || []).forEach(function (x) { if (a.indexOf(x) < 0) a.push(x); }); return a; }
export function avisoReprogramar(numero, itens) {
  if (!itens || !itens.length) return;
  toast(T('cm.reprogAviso', itens.length, numero, itens.map(function (x) { return (x.n + 1) + ' ' + x.maquina; }).join(', ')), { ms: 9000 });
}
// Agora, no formato da agenda
function agora() { return ctxCarga().agora; }
function somarH(dt, h) { const d = new Date(dt + ':00'); d.setMinutes(d.getMinutes() + Math.round(h * 60)); return local(d); }
function local(d) { const p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }

/* ================================================================ ❄ congelar */
let cong = null;   // { mid, chave }
export function abrirCongelar(mid, chave) {
  const m = maquinaPorId(mid), it = m && itemDe(estado.maquinas, mid, chave);
  if (!it || !podeEditar()) return;
  const o = ctxCarga().opsId[it.opId];
  cong = { mid: mid, chave: chave };
  $('cg-titulo').textContent = T('cg2.titulo', o ? o.numero : '', m.nome);
  const ate = it.congelada ? it.congelada.ate : somarH(agora(), 1);
  $('cg-ate').value = paraMascara(ate);
  $('cg-motivo').value = it.congelada ? (it.congelada.motivo || '') : '';
  $('cg-erro').textContent = '';
  abrirModal('modal-congelar', { foco: 'cg-ate', aoFechar: function () { cong = null; } });
  if (window.Notification && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) { /* sem permissão */ } }
}
function salvarCongelar() {
  if (!cong) return;
  const ate = daMascara($('cg-ate').value);
  if (!ate) { $('cg-erro').textContent = T('cm.dtInvalida'); return; }
  if (ate <= agora()) { $('cg-erro').textContent = T('cg2.erroPassado'); return; }
  const ms = copia(estado.maquinas), f = itemDe(ms, cong.mid, cong.chave);
  if (!f) return;
  const o = ctxCarga().opsId[f.opId];
  f.congelada = { desde: f.congelada ? f.congelada.desde : agora(), ate: ate, motivo: $('cg-motivo').value.trim().slice(0, 120) };
  f.reprogramar = null;
  const n = f.n == null ? null : Number(f.n);
  const rep = n == null ? { maquinas: ms, mudadas: [], itens: [] } : Prog.mandarReprogramar(ms, f.opId, n, 'congelada');
  const mid = cong.mid;
  fecharModal('modal-congelar');
  gravar(rep.maquinas, unir([mid], rep.mudadas), T('cg2.ok', o ? o.numero : '', paraMascara(ate))).then(function () { avisoReprogramar(o ? o.numero : '', rep.itens); });
}
export function retomar(mid, chave) {
  const ms = copia(estado.maquinas), f = itemDe(ms, mid, chave);
  if (!f || !f.congelada) return;
  const ag = agora(), c = f.congelada;
  const fim = c.ate < ag ? c.ate : ag;
  f.pausas = (f.pausas || []).concat(fim > c.desde ? [{ desde: c.desde, ate: fim, motivo: c.motivo || '' }] : []).slice(-20);
  f.congelada = null;
  const lib = Prog.liberarReprogramar(ms, f.opId);
  const o = ctxCarga().opsId[f.opId];
  return gravar(lib.maquinas, unir([mid], lib.mudadas), T('cg2.retomada', o ? o.numero : ''));
}

// Aviso em tela cheia (e do Windows) quando a hora do retorno chega.
let degelo = null;   // { mid, chave }
function vencidas() {
  if (!podeEditar()) return [];
  const ag = agora(), r = [];
  (estado.maquinas || []).forEach(function (m) {
    (m.fila || []).forEach(function (f) { if (f.congelada && f.congelada.ate <= ag) r.push({ m: m, f: f }); });
  });
  return r;
}
function notificarWindows(x, o) {
  if (!window.Notification || Notification.permission !== 'granted') return;
  const k = 'rostag.degelo.' + x.m.id + '.' + chaveDe(x.f) + '.' + x.f.congelada.ate;
  try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch (e) { /* sem armazenamento */ }
  try {
    const n = new Notification(T('cg2.notTit', o ? o.numero : ''), { body: T('cg2.notTxt', x.m.nome, paraMascara(x.f.congelada.ate)), tag: k, requireInteraction: true });
    n.onclick = function () { window.focus(); n.close(); };
  } catch (e) { /* navegador sem notificação */ }
}
export function conferirDegelo() {
  const l = vencidas();
  const aberto = $('modal-degelo') && $('modal-degelo').classList.contains('open');
  if (aberto && degelo && !l.some(function (x) { return x.m.id === degelo.mid && chaveDe(x.f) === degelo.chave; })) { fecharModal('modal-degelo'); degelo = null; }
  if (!l.length || $('modal-degelo').classList.contains('open')) return;
  const x = l[0], o = ctxCarga().opsId[x.f.opId];
  degelo = { mid: x.m.id, chave: chaveDe(x.f) };
  $('dg-titulo').textContent = T('cg2.notTit', o ? o.numero : '');
  $('dg-texto').textContent = T('cg2.dgTxt', x.m.nome, paraMascara(x.f.congelada.ate), x.f.congelada.motivo || '—', l.length > 1 ? T('cg2.dgMais', l.length - 1) : '');
  abrirModal('modal-degelo');
  notificarWindows(x, o);
}
setInterval(function () { try { if (estado.maquinas && estado.maquinas.length) conferirDegelo(); } catch (e) { /* tela ainda carregando */ } }, 20000);

/* ================================================================ 🚨 urgência */
let urg = null;   // { mid, chave (urgente), emMaq: chave da OP em máquina }
export function abrirUrgencia(mid, chave) {
  const m = maquinaPorId(mid);
  if (!m || !podeEditar()) return;
  const ag = (agendasAtuais()[mid] || []).filter(function (it) { return !it.ausente && !it.concluida; });
  const em = ag[0] && Prog.chaveItem(ag[0].opId, ag[0].n) !== chave ? ag[0] : null;
  const o = ctxCarga().opsId[String(chave).split('#')[0]];
  urg = { mid: mid, chave: chave, emMaq: em ? Prog.chaveItem(em.opId, em.n) : null };
  $('ur-titulo').textContent = T('ur.titulo', o ? o.numero : '', m.nome);
  if (em) {
    const feito = Math.min(em.horas, Prog.horasTrabalhadas(m, em.inicioDt, agora(), Prog.paradasDoItem(em)));
    urg.horas = em.horas;
    $('ur-em').innerHTML = esc(T('ur.emMaq', em.op.numero, horasHM(em.horas))) + '<div class="hint-txt">' + esc(T('ur.desde', brDtCarga(em.inicioDt))) + '</div>';
    $('ur-feito').value = horasHM(feito);
    $('ur-bloco').hidden = false;
    atualizarFalta();
  } else {
    $('ur-em').textContent = T('ur.vazia');
    $('ur-bloco').hidden = true;
  }
  $('ur-erro').textContent = '';
  abrirModal('modal-urgencia', { aoFechar: function () { urg = null; } });
}
function atualizarFalta() {
  if (!urg || !urg.emMaq) return;
  const f = lerHoras($('ur-feito').value);
  $('ur-falta').textContent = f == null ? '—' : horasHM(Math.max(0, urg.horas - f));
}
document.addEventListener('input', function (e) { if (e.target && e.target.id === 'ur-feito') atualizarFalta(); });
function salvarUrgencia() {
  if (!urg) return;
  const c = ctxCarga(), ms = copia(estado.maquinas), m = ms.find(function (x) { return x.id === urg.mid; });
  if (!m) return;
  const p = String(urg.chave).split('#'), opId = p[0], n = p[1] === '*' ? null : Number(p[1]);
  let urgente = m.fila.find(function (f) { return chaveDe(f) === urg.chave; });
  const nova = !urgente;
  urgente = Object.assign({}, urgente || { opId: opId, n: n, horas: null, fimAjustado: null }, { inicio: agora(), reprogramar: null });
  let fila = m.fila.filter(function (f) { return chaveDe(f) !== urg.chave; });
  let interrompida = null, rep = { itens: [], mudadas: [] };
  if (urg.emMaq) {
    const feito = lerHoras($('ur-feito').value);
    if (feito == null || feito < 0 || feito >= urg.horas) { $('ur-erro').textContent = T('ur.erroFeito', horasHM(urg.horas)); return; }
    const e = fila.find(function (f) { return chaveDe(f) === urg.emMaq; });
    fila = fila.filter(function (f) { return chaveDe(f) !== urg.emMaq; });
    interrompida = Object.assign({}, e, { horas: Math.round((urg.horas - feito) * 100) / 100, feitas: Math.round(((Number(e.feitas) || 0) + feito) * 100) / 100, inicio: null, congelada: null });
    if ($('ur-fim').checked) fila = [urgente].concat(fila, [interrompida]);
    else fila = [urgente, interrompida].concat(fila);
  } else {
    fila = [urgente].concat(fila);
  }
  m.fila = fila;
  let resultado = ms, ids = [m.id];
  if (interrompida && interrompida.n != null) {
    rep = Prog.mandarReprogramar(resultado, interrompida.opId, Number(interrompida.n), 'interrompida');
    resultado = rep.maquinas; unir(ids, rep.mudadas);
  }
  // a urgente veio de "para programar": as operações seguintes dela entram também
  let enc = { avisos: [], mudadas: [] };
  if (nova && n != null) {
    enc = Prog.encadear(resultado, c.opsId, c.proj, estado.setores, c.agora, opId, n);
    resultado = enc.maquinas; unir(ids, enc.mudadas);
  }
  const oU = c.opsId[opId], oI = interrompida ? c.opsId[interrompida.opId] : null;
  fecharModal('modal-urgencia');
  gravar(resultado, ids, T('ur.ok', oU ? oU.numero : '', m.nome)).then(function () {
    if (oI) avisoReprogramar(oI.numero, rep.itens);
    avisarOcupadas(oU ? oU.numero : '', enc.avisos);
  });
}
export function avisarOcupadas(numero, avisos) {
  (avisos || []).forEach(function (a) {
    const m = maquinaPorId(a.maquinaId);
    toast(T('cm.ocupadaAviso', m ? m.nome : '', a.n + 1, numero, a.ocupadas.join(', ')), { ms: 9000 });
  });
}

/* ======================================================= ⚙ programação especial */
let esp = null;   // { opId, n (dividindo), linhas: [{ mid, pecas, modo: 'furar'|'fim', nova }] }
export function abrirProgEspecial(opId) {
  const o = ctxCarga().opsId[opId];
  if (!o || !podeEditar()) return;
  esp = { opId: opId, n: null, linhas: [] };
  renderEsp();
  abrirModal('modal-prog-esp', { aoFechar: function () { esp = null; } });
}
function partesDe(opId, n) {
  const r = [];
  (estado.maquinas || []).forEach(function (m) { (m.fila || []).forEach(function (f) { if (f.opId === opId && (f.n == null ? null : Number(f.n)) === n) r.push({ m: m, f: f }); }); });
  return r;
}
function renderEsp() {
  if (!esp) return;
  const c = ctxCarga(), o = c.opsId[esp.opId], total = Math.max(1, Number(o.qtd) || 1);
  const ops = Prog.opsDeMaquina(o, estado.maquinas, estado.setores);
  $('pe-titulo').textContent = T('pe.titulo', o.numero);
  $('pe-sub').textContent = T('pe.sub', o.commessa || '', o.descricao || o.desenho || '', total);
  $('pe-corpo').innerHTML = '<table class="ord-tab pe-tab"><thead><tr><th>Nº</th><th>' + esc(T('cm.operacao')) + '</th><th class="num">' + esc(T('cm.horas')) + '</th><th>' + esc(T('pe.maquinas')) + '</th><th></th></tr></thead><tbody>' +
    (ops.length ? ops.map(function (x) {
      const partes = partesDe(esp.opId, x.n);
      const onde = partes.length ? partes.map(function (p) { return esc(p.m.nome) + (p.f.parte ? ' <small>(' + esc(T('pe.pc', p.f.parte.pecas)) + ')</small>' : ''); }).join(' / ')
        : '<span class="hint-txt">' + esc(T('pe.foraFila', (maquinaPorId(x.maquinaId) || {}).nome || '—')) + '</span>';
      return '<tr' + (esp.n === x.n ? ' class="pe-ativa"' : '') + '><td class="mono">' + esc(x.operacao.num || (x.n + 1)) + '</td><td>' + esc(x.operacao.texto || x.operacao.setor) + '</td>' +
        '<td class="num">' + esc(horasHM(x.operacao.horas)) + '</td><td>' + onde + '</td><td class="c">' +
        '<button type="button" class="btn btn-outline btn-mini" data-acao="dividirEsp" data-arg="' + x.n + '">⇄ ' + esc(T('pe.dividir')) + '</button>' +
        (partes.length > 1 ? ' <button type="button" class="link-btn" data-acao="desfazerEsp" data-arg="' + x.n + '">' + esc(T('pe.desfazer')) + '</button>' : '') + '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="hint-txt">' + esc(T('pe.semRoteiro')) + '</td></tr>') + '</tbody></table>' + painelDividir(o, total);
}
function painelDividir(o, total) {
  if (esp.n == null) return '';
  const usadas = esp.linhas.map(function (l) { return l.mid; });
  const maqs = (estado.maquinas || []).filter(function (m) { return m.ativa !== false && m.area !== 'caldeiraria' && usadas.indexOf(m.id) < 0; });
  const tipo0 = (maquinaPorId(esp.linhas[0] && esp.linhas[0].mid) || {}).tipo || '';
  maqs.sort(function (a, b) { return ((a.tipo === tipo0) ? 0 : 1) - ((b.tipo === tipo0) ? 0 : 1) || compararNatural(a.nome, b.nome); });
  const soma = esp.linhas.reduce(function (t, l) { return t + (Number(l.pecas) || 0); }, 0);
  const H = horasOperacao(o, esp.n);
  return '<div class="card pe-dividir"><div class="panel-title">' + esc(T('pe.dividirTit', esp.n + 1)) + '</div>' +
    esp.linhas.map(function (l, i) {
      const m = maquinaPorId(l.mid);
      return '<div class="pe-linha"><b>' + esc(m ? m.nome : '—') + '</b><input type="number" min="1" max="' + total + '" value="' + (l.pecas || '') + '" data-change="pecasEsp" data-arg="' + i + '" aria-label="' + esc(T('pe.pecas')) + '"> ' + esc(T('pe.pcDe', total)) +
        '<span class="hint-txt">≈ ' + esc(horasHM(H * (Number(l.pecas) || 0) / total)) + '</span>' +
        (l.nova ? '<span class="pill-cm ' + (l.modo === 'furar' ? 'cm-p-maquina' : 'cm-p-aguardando') + '">' + esc(T(l.modo === 'furar' ? 'pe.furar' : 'pe.fim')) + '</span><button type="button" class="rm" data-acao="tirarLinhaEsp" data-arg="' + i + '" aria-label="' + esc(T('btn.excluir')) + '">✕</button>' : '') + '</div>';
    }).join('') +
    '<div class="pe-linha"><select data-change="addMaqEsp" aria-label="' + esc(T('pe.addMaq')) + '"><option value="">' + esc(T('pe.addMaq')) + '</option>' +
      maqs.map(function (m) { return '<option value="' + esc(m.id) + '">' + esc(m.nome + (m.tipo ? ' · ' + m.tipo : '')) + '</option>'; }).join('') + '</select></div>' +
    '<div class="hint-txt">' + esc(T('pe.soma', soma, total)) + '</div><div class="form-error" id="pe-erro"></div>' +
    '<div class="pe-acoes"><button type="button" class="btn btn-outline" data-acao="cancelarEsp">' + esc(T('btn.cancelar')) + '</button><button type="button" class="btn btn-primary" data-acao="aplicarEsp">' + esc(T('pe.aplicar')) + '</button></div></div>';
}
function horasOperacao(o, n) {
  const partes = partesDe(o.id, n);
  const comHoras = partes.filter(function (p) { return Number(p.f.horas) > 0; });
  if (partes.length && comHoras.length === partes.length) return comHoras.reduce(function (t, p) { return t + Number(p.f.horas); }, 0);
  const op = Prog.operacoesDaOp(o)[n];
  return op ? op.horas : 0;
}
function dividir(n) {
  const c = ctxCarga(), o = c.opsId[esp.opId], total = Math.max(1, Number(o.qtd) || 1);
  esp.n = Number(n);
  const partes = partesDe(esp.opId, esp.n);
  const x = Prog.opsDeMaquina(o, estado.maquinas, estado.setores).find(function (y) { return y.n === esp.n; });
  esp.linhas = partes.length ? partes.map(function (p) { return { mid: p.m.id, pecas: p.f.parte ? p.f.parte.pecas : total, modo: 'fim', nova: false }; })
    : [{ mid: x ? x.maquinaId : '', pecas: total, modo: 'fim', nova: true }];
  renderEsp();
}
function aplicarEsp() {
  const c = ctxCarga(), o = c.opsId[esp.opId], total = Math.max(1, Number(o.qtd) || 1), n = esp.n;
  const soma = esp.linhas.reduce(function (t, l) { return t + (Number(l.pecas) || 0); }, 0);
  if (esp.linhas.some(function (l) { return !(Number(l.pecas) >= 1) || !l.mid; }) || soma !== total) { $('pe-erro').textContent = T('pe.erroSoma', soma, total); return; }
  const H = horasOperacao(o, n), ms = copia(estado.maquinas), ids = [];
  const ag = agendasAtuais();
  esp.linhas.forEach(function (l) {
    const m = ms.find(function (x) { return x.id === l.mid; });
    if (!m) return;
    const horas = Math.round(H * l.pecas / total * 100) / 100;
    const parte = esp.linhas.length > 1 ? { pecas: Number(l.pecas), total: total } : null;
    const i = m.fila.findIndex(function (f) { return f.opId === esp.opId && (f.n == null ? null : Number(f.n)) === n; });
    if (i >= 0) { m.fila[i] = Object.assign({}, m.fila[i], { horas: horas, parte: parte }); if (!parte) delete m.fila[i].parte; }
    else {
      const item = { opId: esp.opId, n: n, horas: horas, inicio: null, fimAjustado: null, parte: parte };
      if (l.modo === 'furar') {
        // entra logo depois da OP que está em máquina (não interrompe)
        const vivos = (ag[m.id] || []).filter(function (it) { return !it.ausente && !it.concluida; });
        const pos = vivos[0] ? m.fila.findIndex(function (f) { return chaveDe(f) === Prog.chaveItem(vivos[0].opId, vivos[0].n); }) + 1 : 0;
        m.fila.splice(Math.max(0, pos), 0, item);
      } else m.fila.push(item);
    }
    ids.push(m.id);
  });
  // máquinas que tinham parte e saíram da divisão
  ms.forEach(function (m) {
    if (esp.linhas.some(function (l) { return l.mid === m.id; })) return;
    const antes = m.fila.length;
    m.fila = m.fila.filter(function (f) { return !(f.opId === esp.opId && (f.n == null ? null : Number(f.n)) === n); });
    if (m.fila.length !== antes) ids.push(m.id);
  });
  const empurradas = esp.linhas.filter(function (l) { return l.nova && l.modo === 'furar'; }).length;
  gravar(ms, ids, T('pe.ok', o.numero, esp.linhas.length) + (empurradas ? ' ' + T('pe.furouOk') : '')).then(function () { esp.n = null; esp.linhas = []; renderEsp(); });
}
function desfazer(n) {
  const c = ctxCarga(), o = c.opsId[esp.opId], partes = partesDe(esp.opId, Number(n));
  if (partes.length < 2) return;
  const H = horasOperacao(o, Number(n)), fica = partes[0].m.id, ms = copia(estado.maquinas), ids = [];
  ms.forEach(function (m) {
    const antes = JSON.stringify(m.fila);
    m.fila = m.fila.filter(function (f) { return !(f.opId === esp.opId && (f.n == null ? null : Number(f.n)) === Number(n)) || m.id === fica; })
      .map(function (f) { if (m.id === fica && f.opId === esp.opId && Number(f.n) === Number(n)) { const g = Object.assign({}, f, { horas: H }); delete g.parte; return g; } return f; });
    if (JSON.stringify(m.fila) !== antes) ids.push(m.id);
  });
  gravar(ms, ids, T('pe.desfeito')).then(renderEsp);
}

registrarAcoes({
  congelarCargaMaq: function (mid, chave) { abrirCongelar(mid, chave); },
  salvarCongelar: salvarCongelar,
  atalhoCongelar: function (k) {
    const base = daMascara($('cg-ate').value) || agora();
    let v = k === 'amanha' ? (function () { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(7, 0, 0, 0); return local(d); })() : somarH(agora() > base ? agora() : agora(), Number(k));
    if (k !== 'amanha' && base > agora()) v = somarH(base, Number(k));
    $('cg-ate').value = paraMascara(v);
  },
  retomarCargaMaq: function (mid, chave) { retomar(mid, chave); },
  retomarDegelo: function () { if (!degelo) return; const d = degelo; fecharModal('modal-degelo'); degelo = null; retomar(d.mid, d.chave); },
  reprogramarDegelo: function () { if (!degelo) return; const d = degelo; fecharModal('modal-degelo'); degelo = null; abrirCongelar(d.mid, d.chave); },
  urgenciaCargaMaq: function (mid, chave) { abrirUrgencia(mid, chave); },
  salvarUrgencia: salvarUrgencia,
  abrirProgEspecial: function (opId) { fecharModal('modal-op-detalhe'); abrirProgEspecial(opId); },
  dividirEsp: function (n) { dividir(n); },
  cancelarEsp: function () { esp.n = null; esp.linhas = []; renderEsp(); },
  pecasEsp: function (v, _b, el) { const i = Number(el.dataset.arg); if (esp && esp.linhas[i]) { esp.linhas[i].pecas = Math.max(0, Math.floor(Number(v) || 0)); renderEsp(); } },
  tirarLinhaEsp: function (i) { if (esp) { esp.linhas.splice(Number(i), 1); renderEsp(); } },
  addMaqEsp: function (v) {
    if (!esp || !v) return;
    const m = maquinaPorId(v);
    confirmar(T('pe.ondeQ', m ? m.nome : ''), { titulo: T('pe.ondeTit'), textoOk: '⚡ ' + T('pe.furar'), textoCancelar: '⤓ ' + T('pe.fim') }).then(function (furar) {
      if (!esp) return;
      esp.linhas.push({ mid: v, pecas: 1, modo: furar ? 'furar' : 'fim', nova: true });
      renderEsp();
    });
  },
  aplicarEsp: aplicarEsp,
  desfazerEsp: function (n) { desfazer(n); }
});

export function renderJanelaEspecial() { if (esp && $('modal-prog-esp').classList.contains('open')) renderEsp(); conferirDegelo(); }
