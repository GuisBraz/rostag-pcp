/* ---------------------------------------------------------------------------
   Fábrica — lista de OPs, avanço por projeto, planilha de OPs (técnico),
   finalização pelo CQ e a aba RNC.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, opsDoProjeto } from '../estado.js';
import { esc, br, dataDoInstante, horaDoInstante } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Papeis from '../dominio/papeis.js';
import * as Planilha from '../dominio/planilha.js';
import * as Producao from '../dominio/producao.js';
import * as Projeto from '../dominio/projeto.js';
import * as Auth from '../dados/auth.js';
import * as Ops from '../dados/ops.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal, confirmar } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';

const MAX_LINHAS = 600;   // a tabela fica pesada acima disso; os filtros resolvem

function natural(a, b) { return String(a || '').localeCompare(String(b || ''), 'pt-BR', { numeric: true }); }
function quando(iso) { return iso ? br(dataDoInstante(iso)) + ' ' + horaDoInstante(iso) : '—'; }
function fmtNum(n) { return n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 }); }
// OP de projeto paralisado: a produção dele está parada inteira. Só aparece
// para quem enxerga o projeto (Gerência, GP e técnico).
function parado(o) {
  const p = buscarProjeto(o.projetoId);
  return p && Projeto.status(p) === 'paralisado' ? ' <span class="pill-prod prod-parada">' + esc(T('prod.parada')) + '</span>' : '';
}
function pillOp(status) { return '<span class="pill-op op-' + esc(status) + '">' + esc(T('op.' + status)) + '</span>'; }
function pillArea(area) { return '<span class="pill-area area-' + esc(area) + '">' + esc(T('area.' + area)) + '</span>'; }

/* ------------------------------------------------------------- fábrica */
function opsFiltradas() {
  const f = estado.filtroFab;
  const area = Auth.areaProgramador() || f.area;
  const busca = f.busca.trim().toLowerCase();
  return estado.ops.filter(function (o) {
    if (area && o.area !== area) return false;
    if (f.projeto && o.projetoId !== f.projeto) return false;
    if (f.status && o.status !== f.status) return false;
    if (busca && [o.numero, o.desenho, o.descricao, o.commessa].join(' ').toLowerCase().indexOf(busca) < 0) return false;
    return true;
  }).sort(function (a, b) {
    return natural(a.commessa, b.commessa) || natural(a.desenho, b.desenho) || natural(a.posicao, b.posicao) || natural(a.area, b.area);
  });
}

function preencherFiltroProjetos() {
  const sel = $('fab-projeto');
  const atual = estado.filtroFab.projeto;
  const vistos = {};
  estado.ops.forEach(function (o) { if (!vistos[o.projetoId]) vistos[o.projetoId] = o.commessa || o.projetoId; });
  const ids = Object.keys(vistos).sort(function (a, b) { return natural(vistos[a], vistos[b]); });
  sel.innerHTML = '<option value="">' + esc(T('btn.todos')) + '</option>' +
    ids.map(function (id) { return '<option value="' + esc(id) + '">' + esc(vistos[id]) + '</option>'; }).join('');
  sel.value = vistos[atual] ? atual : '';
  if (!vistos[atual]) estado.filtroFab.projeto = '';
}

function barra(rot, s) {
  return '<div class="av-linha"><span class="av-rot">' + esc(rot) + '</span>' +
    '<div class="bar"><div style="width:' + s.pct + '%"></div></div>' +
    '<span class="av-pct">' + s.pct + '%</span><span class="av-n">' + esc(T('fab.deN', s.aprovadas, s.total)) + '</span></div>';
}

function renderAvanco(lista) {
  const porProjeto = {};
  lista.forEach(function (o) { (porProjeto[o.projetoId] = porProjeto[o.projetoId] || []).push(o); });
  const ids = Object.keys(porProjeto).sort(function (a, b) { return natural(porProjeto[a][0].commessa, porProjeto[b][0].commessa); });
  const area = Auth.areaProgramador();
  $('fab-avanco').innerHTML = ids.slice(0, 24).map(function (id) {
    const s = Producao.estatisticas(porProjeto[id]);
    const o = porProjeto[id][0];
    const p = buscarProjeto(id);
    const sit = p ? Producao.situacao(p, Producao.estatisticas(opsDoProjeto(id))) : null;
    return '<div class="card panel-pad av-card">' +
      '<div class="av-head"><b>' + esc(o.commessa) + '</b>' + (sit ? ' <span class="pill-prod prod-' + sit + '">' + esc(T('prod.' + sit)) + '</span>' : '') + '</div>' +
      '<div class="hint-txt av-desc">' + esc(o.descricaoProjeto || o.cliente || '') + '</div>' +
      (area ? barra(T('area.' + area), s[area]) :
        barra(T('fab.geral'), s) + barra(T('area.caldeiraria'), s.caldeiraria) + barra(T('area.usinagem'), s.usinagem)) +
      (s.rnc ? '<div class="av-rnc">' + esc(T('fab.comRnc', s.rnc)) + '</div>' : '') +
      '</div>';
  }).join('');
}

export function renderFabrica() {
  const papel = Auth.papel();
  const prog = Auth.areaProgramador();
  const cq = Auth.souCQ();
  $('btn-subir-planilha').style.display = Papeis.sobePlanilha(papel) ? '' : 'none';
  const selArea = $('fab-area');
  selArea.disabled = !!prog;
  selArea.value = prog || estado.filtroFab.area;
  $('fab-status').value = estado.filtroFab.status;
  if (document.activeElement !== $('fab-busca')) $('fab-busca').value = estado.filtroFab.busca;
  preencherFiltroProjetos();

  const lista = opsFiltradas();
  const s = Producao.estatisticas(lista);
  $('fab-count').textContent = !estado.opsCarregadas ? T('fab.carregando')
    : T('fab.contagem', s.total, s.abertas, s.aprovadas, s.rnc);
  renderAvanco(lista);

  const colunas = ['fab.cOp', 'fab.cArea', 'fab.cCommessa', 'fab.cDesenho', 'fab.cPos', 'fab.cRev', 'fab.cDescricao', 'fab.cQtd', 'fab.cPeso', 'fab.cSituacao', cq ? 'fab.cAcao' : 'fab.cFinalizado'];
  $('fab-thead').innerHTML = colunas.map(function (c) { return '<th>' + esc(T(c)) + '</th>'; }).join('');
  if (!lista.length) {
    $('fab-tbody').innerHTML = '<tr><td colspan="' + colunas.length + '"><div class="empty-state">' +
      esc(estado.ops.length ? T('fab.vazioFiltro') : T(Papeis.sobePlanilha(papel) ? 'fab.vazioTecnico' : 'fab.vazio')) + '</div></td></tr>';
    return;
  }
  $('fab-tbody').innerHTML = lista.slice(0, MAX_LINHAS).map(function (o) {
    let fim;
    if (o.status === 'aberta') {
      fim = cq ? '<button type="button" class="btn btn-success btn-mini" data-acao="aprovarOp" data-arg="' + esc(o.id) + '">' + esc(T('cq.aprovar')) + '</button> ' +
        '<button type="button" class="btn btn-danger btn-mini" data-acao="abrirRnc" data-arg="' + esc(o.id) + '">' + esc(T('cq.rnc')) + '</button>' : '—';
    } else {
      fim = '<span class="hint-txt">' + esc(o.finalizadoPorNome || '—') + ' · ' + esc(quando(o.finalizadoEm)) + '</span>';
    }
    return '<tr class="' + (o.status === 'rnc' ? 'linha-rnc' : '') + '"' + (o.status === 'rnc' && o.rncObs ? ' title="' + esc(o.rncObs) + '"' : '') + '>' +
      '<td class="mono">' + esc(o.numero) + '</td><td>' + pillArea(o.area) + '</td><td class="mono">' + esc(o.commessa) + parado(o) + '</td>' +
      '<td class="mono">' + esc(o.desenho) + '</td><td>' + esc(o.posicao || '—') + '</td><td>' + esc(o.rev || '—') + '</td>' +
      '<td>' + esc(o.descricao || '—') + '</td><td class="num">' + fmtNum(o.qtd) + '</td><td class="num">' + fmtNum(o.pesoTotal) + '</td>' +
      '<td>' + pillOp(o.status) + '</td><td>' + fim + '</td></tr>';
  }).join('') + (lista.length > MAX_LINHAS
    ? '<tr><td colspan="' + colunas.length + '" class="hint-txt">' + esc(T('fab.maisLinhas', lista.length - MAX_LINHAS)) + '</td></tr>' : '');
}

/* ------------------------------------------------------------------ RNC */
export function renderRnc() {
  const lista = estado.ops.filter(function (o) { return o.status === 'rnc'; })
    .sort(function (a, b) { return String(b.finalizadoEm || '').localeCompare(String(a.finalizadoEm || '')); });
  $('rnc-count').textContent = T(lista.length === 1 ? 'rnc.contagem1' : 'rnc.contagem', lista.length);
  $('rnc-lista').innerHTML = lista.length ? lista.map(function (o) {
    return '<div class="card rnc-card">' +
      '<div class="rnc-topo"><span class="mono rnc-op">OP ' + esc(o.numero) + '</span>' + pillArea(o.area) +
        '<span class="rnc-aguarda">' + esc(T('rnc.aguardando')) + '</span></div>' +
      '<div class="rnc-peca"><b class="mono">' + esc(o.commessa) + '</b> · ' + esc(T('rnc.peca', o.desenho, o.posicao || '—')) +
        (o.descricao ? ' · ' + esc(o.descricao) : '') + '</div>' +
      '<div class="rnc-obs">' + esc(o.rncObs || '—') + '</div>' +
      '<div class="hint-txt">' + esc(T('rnc.registradaPor', o.finalizadoPorNome || '—', quando(o.finalizadoEm))) + '</div>' +
      '<button type="button" class="link-btn" data-acao="irPara" data-arg="projetos" data-arg2="' + esc(o.projetoId) + '">' + esc(T('rnc.verProjeto')) + '</button>' +
      '</div>';
  }).join('') : '<div class="card panel-pad empty-state">' + esc(T('rnc.vazio')) + '</div>';
}

export function atualizarContadorRnc() {
  const el = $('rnc-contador');
  if (!el) return;
  const n = Papeis.veRnc(Auth.papel()) ? estado.ops.filter(function (o) { return o.status === 'rnc'; }).length : 0;
  el.textContent = n > 99 ? '99+' : n;
  el.style.display = n ? '' : 'none';
}

/* ------------------------------------------------------------ planilha */
let lida = null;   // { ops, ignoradas, erros, avisos, arquivo }

function projetosParaPlanilha() {
  return estado.projetos.filter(function (p) {
    return Projeto.aberto(p) && !Projeto.aguardandoCronograma(p) && (Auth.souGerente() || p.responsavelUid === Auth.uid());
  }).sort(function (a, b) { return natural(a.commessa, b.commessa); });
}

function abrirPlanilha() {
  const lista = projetosParaPlanilha();
  if (!lista.length) { toast(T('fab.semProjetos'), { tipo: 'erro' }); return; }
  lida = null;
  const sel = $('planilha-projeto');
  sel.innerHTML = lista.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.commessa + ' — ' + p.descricao) + '</option>'; }).join('');
  if (estado.filtroFab.projeto && lista.some(function (p) { return p.id === estado.filtroFab.projeto; })) sel.value = estado.filtroFab.projeto;
  $('planilha-arquivo').value = '';
  $('planilha-resumo').innerHTML = '';
  $('planilha-erro').textContent = '';
  $('planilha-enviar').disabled = true;
  abrirModal('modal-planilha', { foco: 'planilha-projeto', aoFechar: function () { lida = null; } });
}

let carregandoXlsx = null;
function garantirXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!carregandoXlsx) {
    carregandoXlsx = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'vendor/xlsx.full.min.js';
      s.onload = function () { resolve(window.XLSX); };
      s.onerror = function () { carregandoXlsx = null; reject(new Error('xlsx-indisponivel')); };
      document.head.appendChild(s);
    });
  }
  return carregandoXlsx;
}

// Primeira aba em que o cabeçalho das OPs aparece.
function linhasDaPlanilha(XLSX, wb) {
  for (const nome of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: false, defval: '', blankrows: true });
    if (Planilha.acharCabecalho(linhas)) return linhas;
  }
  return null;
}

function lerPlanilha(ev) {
  const arquivo = ev && ev.target && ev.target.files && ev.target.files[0];
  $('planilha-erro').textContent = '';
  $('planilha-resumo').innerHTML = '';
  $('planilha-enviar').disabled = true;
  lida = null;
  if (!arquivo) return;
  if (arquivo.size > 15 * 1024 * 1024) { $('planilha-erro').textContent = T('fab.erroGrande'); return; }
  $('planilha-resumo').innerHTML = '<div class="hint-txt">' + esc(T('fab.lendo')) + '</div>';
  Promise.all([garantirXlsx(), arquivo.arrayBuffer()]).then(function (r) {
    const XLSX = r[0];
    const wb = XLSX.read(new Uint8Array(r[1]), { type: 'array' });
    const linhas = linhasDaPlanilha(XLSX, wb);
    const res = linhas ? Planilha.lerOps(linhas) : { ok: false };
    if (!res.ok) { $('planilha-resumo').innerHTML = ''; $('planilha-erro').textContent = T('fab.erroCabecalho'); return; }
    lida = Object.assign({ arquivo: arquivo.name }, res);
    mostrarResumo();
  }).catch(function (e) {
    console.warn(e);
    $('planilha-resumo').innerHTML = '';
    $('planilha-erro').textContent = T('fab.erroLer');
  });
}

function comparacaoAtual() {
  const projetoId = $('planilha-projeto').value;
  const existentes = {};
  opsDoProjeto(projetoId).forEach(function (o) { existentes[o.id] = o; });
  return Planilha.comparar(lida.ops, existentes, projetoId);
}

function mostrarResumo() {
  if (!lida) return;
  const c = comparacaoAtual();
  const finalizadas = c.atualizadas.filter(function (a) { return a.status && a.status !== 'aberta'; }).length;
  const porArea = { caldeiraria: 0, usinagem: 0 };
  lida.ops.forEach(function (o) { porArea[o.area]++; });
  const itens = [
    T('fab.rLidas', lida.ops.length, porArea.caldeiraria, porArea.usinagem),
    T('fab.rNovas', c.novas.length),
    T('fab.rAtualizadas', c.atualizadas.length) + (finalizadas ? ' ' + T('fab.rFinalizadas', finalizadas) : ''),
    T('fab.rIguais', c.iguais.length)
  ];
  if (lida.ignoradas) itens.push(T('fab.rIgnoradas', lida.ignoradas));
  let html = '<ul>' + itens.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
  if (lida.erros.length) {
    html += '<div class="planilha-erros"><b>' + esc(T('fab.rErros', lida.erros.length)) + '</b><ul>' +
      lida.erros.slice(0, 10).map(function (e) { return '<li>' + esc(T('fab.erro.' + e.motivo, e.linha, e.outra || '', e.area ? T('area.' + e.area) : '')) + '</li>'; }).join('') +
      '</ul></div>';
  }
  if (lida.avisos.length) {
    html += '<div class="planilha-avisos"><b>' + esc(T('fab.rAvisos', lida.avisos.length)) + '</b><ul>' +
      lida.avisos.slice(0, 10).map(function (a) { return '<li>' + esc(T('fab.aviso.numeroRepetido', a.linha, a.numero, a.outra)) + '</li>'; }).join('') +
      '</ul></div>';
  }
  $('planilha-resumo').innerHTML = html;
  $('planilha-enviar').disabled = !(c.novas.length || c.atualizadas.length);
}

function enviarPlanilha(_a, _b, btn) {
  if (!lida) return;
  const p = buscarProjeto($('planilha-projeto').value);
  if (!p) return;
  const c = comparacaoAtual();
  if (!c.novas.length && !c.atualizadas.length) return;
  comBotaoOcupado(btn, Ops.gravarPlanilha(p, c).then(function () {
    fecharModal('modal-planilha');
    toast(T('fab.gravadas', c.novas.length, c.atualizadas.length));
    estado.filtroFab.projeto = p.id;
    if (p.gpUid) Auth.criarNotificacao(p.gpUid, 'planilhaOps', T('notif.planilha', p.commessa, c.novas.length, c.atualizadas.length), p.id);
    renderFabrica();
  }).catch(function (e) { avisoErro(e, 'fab.erroGravar'); }));
}

/* ------------------------------------------------------------------ CQ */
function descricaoOp(o) { return T('cq.opDesc', o.numero, T('area.' + o.area), o.commessa, o.desenho, o.posicao || '—'); }

function aprovarOp(id) {
  const o = estado.ops.find(function (x) { return x.id === id; });
  if (!o) return;
  confirmar(T('cq.aprovarConfirm', descricaoOp(o)), { titulo: T('cq.aprovar'), textoOk: T('cq.aprovar') }).then(function (ok) {
    if (!ok) return;
    Ops.finalizar(id, 'aprovada').then(function () { toast(T('cq.aprovada', o.numero)); })
      .catch(function (e) { avisoErro(e, 'cq.erro'); });
  });
}

let rncAberta = null;
function abrirRnc(id) {
  const o = estado.ops.find(function (x) { return x.id === id; });
  if (!o) return;
  rncAberta = o;
  $('rnc-op').textContent = descricaoOp(o);
  $('rnc-texto').value = '';
  $('rnc-erro').textContent = '';
  abrirModal('modal-rnc', { foco: 'rnc-texto', aoFechar: function () { rncAberta = null; } });
}
function confirmarRnc(_a, _b, btn) {
  const o = rncAberta;
  if (!o) return;
  const obs = $('rnc-texto').value.trim().slice(0, 1000);
  if (!obs) { $('rnc-erro').textContent = T('cq.rncVazia'); $('rnc-texto').focus(); return; }
  comBotaoOcupado(btn, Ops.finalizar(o.id, 'rnc', obs).then(function () {
    fecharModal('modal-rnc');
    toast(T('cq.rncGravada', o.numero), { tipo: 'erro' });
    // avisa Gerente de PCP, GP e técnico do projeto (notificação 8)
    return Auth.uidsGerentes().then(function (gerentes) {
      return Auth.notificarVarios(gerentes.concat([o.gpUid, o.tecnicoUid]), 'rnc', T('notif.rnc', o.numero, o.commessa, o.desenho, obs), o.projetoId);
    });
  }).catch(function (e) { avisoErro(e, 'cq.erro'); }));
}

/* -------------------------------------------------------------- filtros */
function filtrarFabrica() {
  estado.filtroFab.area = $('fab-area').value;
  estado.filtroFab.projeto = $('fab-projeto').value;
  estado.filtroFab.status = $('fab-status').value;
  renderFabrica();
}
document.addEventListener('input', function (e) {
  if (e.target && e.target.id === 'fab-busca') { estado.filtroFab.busca = e.target.value; renderFabrica(); }
});
document.addEventListener('change', function (e) {
  if (e.target && e.target.id === 'planilha-projeto' && lida) mostrarResumo();
});

registrarAcoes({
  filtrarFabrica: filtrarFabrica,
  abrirPlanilha: abrirPlanilha,
  lerPlanilha: lerPlanilha,
  enviarPlanilha: enviarPlanilha,
  aprovarOp: aprovarOp,
  abrirRnc: abrirRnc,
  confirmarRnc: confirmarRnc
});
