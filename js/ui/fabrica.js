/* ---------------------------------------------------------------------------
   Fábrica — lista de OPs (por situação), avanço por projeto e a planilha
   de OPs (técnico). A baixa do CQ e a RNC ficam em qualidade.js.
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
import { abrirModal, fecharModal } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';
export { renderRnc } from './qualidade.js';

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
function pillOp(o) { const st = Producao.statusOp(o); return '<span class="pill-op op-' + esc(st) + '">' + esc(T('op.' + st)) + '</span>'; }
function pillArea(area) { return '<span class="pill-area area-' + esc(area) + '">' + esc(T('area.' + area)) + '</span>'; }

/* ------------------------------------------------------------- fábrica */
// Visões (abas) da lista: o CQ começa nas em aberto, os outros em todas.
const VISOES = {
  abertas: Producao.emAberto,
  retrabalho: function (o) { return Producao.statusOp(o) === 'retrabalho'; },
  aprovadas: Producao.finalizada,
  desvio: function (o) { return Producao.statusOp(o) === 'desvio'; },
  mortas: function (o) { return Producao.statusOp(o) === 'morta'; },
  todas: function () { return true; }
};
function visaoAtual() { return VISOES[estado.filtroFab.visao] ? estado.filtroFab.visao : (Auth.souCQ() ? 'abertas' : 'todas'); }

function opsSemVisao() {
  const f = estado.filtroFab;
  const area = Auth.areaProgramador() || f.area;
  const busca = f.busca.trim().toLowerCase();
  return estado.ops.filter(function (o) {
    if (area && o.area !== area) return false;
    if (f.projeto && o.projetoId !== f.projeto) return false;
    if (f.cliente && o.cliente !== f.cliente) return false;
    if (busca && [o.numero, o.desenho, o.descricao, o.commessa, o.cliente, o.rncNumero].join(' ').toLowerCase().indexOf(busca) < 0) return false;
    return true;
  });
}
function opsFiltradas(base) {
  return base.filter(VISOES[visaoAtual()]).sort(function (a, b) {
    return natural(a.commessa, b.commessa) || natural(a.desenho, b.desenho) || natural(a.posicao, b.posicao) || natural(a.area, b.area);
  });
}

function renderVisoes(base) {
  const atual = visaoAtual();
  $('fab-visoes').innerHTML = Object.keys(VISOES).map(function (k) {
    const n = base.filter(VISOES[k]).length;
    return '<button type="button" role="tab" aria-selected="' + (k === atual) + '" class="' + (k === atual ? 'ativa' : '') + '" data-acao="visaoFabrica" data-arg="' + k + '">' +
      esc(T('fab.visao.' + k)) + '<b>' + n + '</b></button>';
  }).join('');
}

function preencherFiltroClientes() {
  const sel = $('fab-cliente');
  const atual = estado.filtroFab.cliente;
  const nomes = Array.from(new Set(estado.ops.map(function (o) { return o.cliente; }).filter(Boolean))).sort(natural);
  sel.innerHTML = '<option value="">' + esc(T('btn.todos')) + '</option>' +
    nomes.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');
  sel.value = nomes.indexOf(atual) >= 0 ? atual : '';
  if (nomes.indexOf(atual) < 0) estado.filtroFab.cliente = '';
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
      (s.retrabalho ? '<div class="av-rnc">' + esc(T('fab.emRetrabalho', s.retrabalho)) + '</div>' : '') +
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
  if (document.activeElement !== $('fab-busca')) $('fab-busca').value = estado.filtroFab.busca;
  preencherFiltroProjetos();
  preencherFiltroClientes();

  const base = opsSemVisao();
  renderVisoes(base);
  const lista = opsFiltradas(base);
  const s = Producao.estatisticas(base);
  $('fab-count').textContent = !estado.opsCarregadas ? T('fab.carregando')
    : T('fab.contagemNova', s.total, s.abertas, s.retrabalho, s.aprovadas, s.desvio, s.mortas);
  renderAvanco(base);

  // o CQ trabalha pela coluna da ação: ela vem primeiro (a tabela é larga)
  const dados = ['fab.cOp', 'fab.cArea', 'fab.cCommessa', 'fab.cDesenho', 'fab.cPos', 'fab.cRev', 'fab.cDescricao', 'fab.cQtd', 'fab.cPeso', 'fab.cSituacao'];
  const colunas = cq ? ['fab.cAcao'].concat(dados) : dados.concat(['fab.cFinalizado']);
  $('fab-thead').innerHTML = colunas.map(function (c) { return '<th>' + esc(T(c)) + '</th>'; }).join('');
  if (!lista.length) {
    $('fab-tbody').innerHTML = '<tr><td colspan="' + colunas.length + '"><div class="empty-state">' +
      esc(estado.ops.length ? T('fab.vazioFiltro') : T(Papeis.sobePlanilha(papel) ? 'fab.vazioTecnico' : 'fab.vazio')) + '</div></td></tr>';
    return;
  }
  const veRnc = cq || Papeis.veRnc(papel);
  $('fab-tbody').innerHTML = lista.slice(0, MAX_LINHAS).map(function (o) {
    const st = Producao.statusOp(o);
    const linkRnc = o.rncNumero && veRnc
      ? '<button type="button" class="link-btn" data-acao="verRncDaOp" data-arg="' + esc(o.id) + '">' + esc(T('fab.verRnc', o.rncNumero)) + '</button>' : '';
    let fim;
    if (st === 'aberta' || st === 'retrabalho') {
      fim = cq ? '<button type="button" class="btn ' + (st === 'retrabalho' ? 'btn-danger' : 'btn-primary') + ' btn-mini" data-acao="abrirBaixa" data-arg="' + esc(o.id) + '">' +
        esc(T(st === 'retrabalho' ? 'baixa.reinspecao' : 'baixa.botao')) + '</button> ' + linkRnc : (linkRnc || '—');
    } else if (st === 'morta') {
      fim = '<span class="hint-txt">' + esc(T('fab.mortaPara', o.opNovaNumero || '—', quando(o.mortaEm))) + '</span> ' + linkRnc;
    } else {
      // na coluna do CQ (a primeira) fica só a data; o nome aparece no título
      fim = cq ? '<span class="hint-txt" title="' + esc(o.finalizadoPorNome || '') + '">' + esc(o.finalizadoEm ? br(dataDoInstante(o.finalizadoEm)) : '—') + '</span> ' + linkRnc
        : '<span class="hint-txt">' + esc(o.finalizadoPorNome || '—') + ' · ' + esc(quando(o.finalizadoEm)) + '</span> ' + linkRnc;
    }
    const origem = o.origemOpId ? estado.ops.find(function (x) { return x.id === o.origemOpId; }) : null;
    const celFim = '<td class="fab-acao">' + fim + '</td>';
    return '<tr class="' + (st === 'retrabalho' ? 'linha-rnc' : (st === 'morta' ? 'linha-morta' : '')) + '">' + (cq ? celFim : '') +
      '<td class="mono">' + esc(o.numero) + (o.origemOpId ? '<span class="op-origem">' + esc(T('fab.origem', origem ? origem.numero : '—')) + '</span>' : '') + '</td>' +
      '<td>' + pillArea(o.area) + '</td><td class="mono">' + esc(o.commessa) + parado(o) + '</td>' +
      '<td class="mono">' + esc(o.desenho) + '</td><td>' + esc(o.posicao || '—') + '</td><td>' + esc(o.rev || '—') + '</td>' +
      '<td>' + esc(o.descricao || '—') + '</td><td class="num">' + fmtNum(o.qtd) + '</td><td class="num">' + fmtNum(o.pesoTotal) + '</td>' +
      '<td>' + pillOp(o) + '</td>' + (cq ? '' : celFim) + '</tr>';
  }).join('') + (lista.length > MAX_LINHAS
    ? '<tr><td colspan="' + colunas.length + '" class="hint-txt">' + esc(T('fab.maisLinhas', lista.length - MAX_LINHAS)) + '</td></tr>' : '');
}

// Badge da aba RNC: RNCs ainda abertas.
export function atualizarContadorRnc() {
  const el = $('rnc-contador');
  if (!el) return;
  const n = Papeis.veRnc(Auth.papel()) || Auth.souCQ() ? (estado.rncs || []).filter(function (r) { return r.situacao !== 'encerrada'; }).length : 0;
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

/* -------------------------------------------------------------- filtros */
function filtrarFabrica() {
  estado.filtroFab.area = $('fab-area').value;
  estado.filtroFab.projeto = $('fab-projeto').value;
  estado.filtroFab.cliente = $('fab-cliente').value;
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
  visaoFabrica: function (v) { estado.filtroFab.visao = v; renderFabrica(); }
});
