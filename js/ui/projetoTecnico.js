/* ---------------------------------------------------------------------------
   Página do projeto do técnico de processo: tudo do projeto dentro dele.
     Checklist           → abre e fecha o cronograma do PCP (começa fechado)
     Planilha de avanço  → tela cheia: a lista do projeto (sem os comerciais)
     Ordens de Produção  → tela cheia: as OPs do projeto (roteiro do PDF)
     Itens comerciais    → tela cheia: pedidos de compra e chegadas (comerciais.js)
     Serviços            → tela cheia: envios e retornos dos serviços externos (servicos.js)
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, opsDoProjeto } from '../estado.js';
import { esc, numeroBr, dataHora } from '../nucleo/fmt.js';
import { T, plural } from '../i18n/index.js';
import * as Projeto from '../dominio/projeto.js';
import * as Cronograma from '../dominio/cronograma.js';
import * as Producao from '../dominio/producao.js';
import * as Avanco from '../dominio/avanco.js';
import * as Auth from '../dados/auth.js';
import * as DadosAvanco from '../dados/avanco.js';
import * as Ops from '../dados/ops.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal, confirmar } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';
import './listaOps.js';
import { abrirPlanilha } from './fabrica.js';
import { resumoCartao as resumoComerciais } from './comerciais.js';
import { resumoCartao as resumoServicos } from './servicos.js';
import { resumoCartao as resumoTarefas } from './tarefas.js';
import { exportarPlanilha } from './avanco.js';

let checklistAberto = false;   // começa fechado toda vez que se entra num projeto (rota.js)
export function fecharChecklist() { checklistAberto = false; }
let espelho = null;   // { projetoId, doc }

function cartao(acao, arg, titulo, valorHtml, detalhe, corVal, ativo) {
  return '<button type="button" class="card ger-area' + (ativo ? ' ativa' : '') + '" data-acao="' + acao + '" data-arg="' + esc(arg) + '"' +
    (acao === 'alternarChecklist' ? ' aria-expanded="' + !!ativo + '"' : '') + '>' +
    '<div class="ger-area-tit">' + esc(titulo) + '</div>' +
    '<div class="ger-area-val" style="color:var(' + (corVal || '--ink') + ')">' + valorHtml + '</div>' +
    '<div class="ger-area-det">' + esc(detalhe) + '</div></button>';
}

// Os cartões no topo da página do projeto (só para o técnico).
export function renderCartoesTecnico(p) {
  const c = Projeto.aguardandoCronograma(p) ? null : Cronograma.calcular(p);
  const atrasadas = c ? c.itens.filter(function (i) { return i.situacao === 'atrasada'; }).length : 0;
  const st = Producao.estatisticas(opsDoProjeto(p.id));
  const com = resumoComerciais(p.id), serv = resumoServicos(p.id), tar = resumoTarefas(p.id);
  $('tec-areas').innerHTML =
    cartao('alternarChecklist', p.id, T('tec.checklist'), c ? Projeto.progresso(p) + '<small>%</small>' : '—',
      !c ? T('sit.aguardando') : (atrasadas ? T('ar.procAtrasadas', plural(atrasadas, 'ar.ativ', 'ar.ativs')) : T('ar.procOk')),
      !c ? '--ink-faint' : (atrasadas ? '--rust' : '--teal'), checklistAberto) +
    cartao('abrirEspelho', p.id, T('tec.planilha'), st.total ? st.pct + '<small>%</small>' : '—',
      st.total ? T('tec.planilhaDet', numeroBr(st.pecasFeitas), numeroBr(st.pecas)) : T('tec.semPlanilha'), st.total ? '--violet' : '--ink-faint') +
    cartao('abrirListaOpsProjeto', p.id, T('tec.ops'), String(st.total),
      st.total ? T('tec.opsDet', st.abertas, st.retrabalho) : T('d.semOps'), st.retrabalho ? '--rust' : '--ink') +
    cartao('abrirComerciais', p.id, T('tec.comerciais'), com ? com.valor : '—', com ? com.detalhe : T('com.abrir'), com ? com.cor : '--ink-faint') +
    cartao('abrirServicos', p.id, T('tec.servicos'), serv ? serv.valor : '—', serv ? serv.detalhe : T('serv.abrir'), serv ? serv.cor : '--ink-faint') +
    cartao('abrirTarefas', p.id, T('tec.tarefas'), tar.valor, tar.detalhe, tar.cor);
  $('tec-checklist-card').hidden = !checklistAberto;
}

/* --------------------------------------------- planilha de avanço (espelho) */
function podeMexer(p) { return !!p && Projeto.aberto(p) && (Auth.souGerente() || p.responsavelUid === Auth.uid()); }

function abrirEspelho(projetoId) {
  projetoId = projetoId || estado.idDetalhe;
  if (!projetoId) return;
  espelho = { projetoId: projetoId, doc: undefined, filtros: {} };
  abrirModal('modal-espelho', { aoFechar: function () { espelho = null; } });
  renderEspelho();
  DadosAvanco.lerGuardada(projetoId).then(function (doc) {
    if (!espelho || espelho.projetoId !== projetoId) return;
    espelho.doc = doc;
    renderEspelho();
  }).catch(function (e) { console.warn(e); if (espelho) { espelho.doc = null; $('esp-corpo').innerHTML = '<div class="empty-state">' + esc(T('av.erroLer')) + '</div>'; } });
}

// Colunas da planilha personalizada: [rótulo, campo do item ou função]
const MARCA = function (v) { return v ? '<span class="pl-marca" aria-label="✓">●</span>' : ''; };
const COLUNAS = [
  ['pl.rev', function (i) { return esc(i.rev); }, 'pl-c'],
  ['pl.desenho', function (i) { return esc(i.desenho); }, 'mono'],
  ['pl.posicao', function (i) { return esc(i.posicao); }, 'pl-c'],
  ['pl.descricao', function (i) {
    return '<span class="pl-desc">' + esc(i.descricao) + '</span>' +
      (i.obs ? ' <span class="pl-obs" title="' + esc(i.obs) + '" aria-label="' + esc(T('pl.obs') + ': ' + i.obs) + '" tabindex="0">💬</span>' : '');
  }, 'pl-descricao'],
  ['pl.qtd', function (i) { return i.qtd == null ? '' : numeroBr(i.qtd); }, 'num'],
  ['pl.pesoUnit', function (i) { return i.pesoUnit == null ? '' : numeroBr(i.pesoUnit); }, 'num'],
  ['pl.pesoTotal', function (i) { return i.pesoTotal == null ? '' : numeroBr(i.pesoTotal); }, 'num'],
  ['pl.comercial', function (i) { return MARCA(i.comercial); }, 'pl-c', 'comercial'],
  ['pl.cald', function (i) { return MARCA(i.cald); }, 'pl-c', 'cald'],
  ['pl.usinagem', function (i) { return MARCA(i.usin); }, 'pl-c', 'usin'],
  ['pl.pintura', function (i) { return MARCA(i.marcas && i.marcas.pintura); }, 'pl-c', 'pintura'],
  ['pl.oxidacao', function (i) { return MARCA(i.marcas && i.marcas.oxidacao); }, 'pl-c', 'oxidacao'],
  ['pl.servicos', function (i) { return MARCA(i.marcas && i.marcas.servicoExterno); }, 'pl-c', 'servicoExterno'],
  ['pl.ttat', function (i) { return MARCA(i.marcas && i.marcas.ttat); }, 'pl-c', 'ttat'],
  ['pl.produto', function (i) { return esc(i.produto); }, 'mono'],
  ['pl.opCald', function (i) { return esc(i.opCald); }, 'mono'],
  ['pl.opUsin', function (i) { return esc(i.opUsin); }, 'mono']
];

// A lista do projeto do jeito do site: as peças (os comerciais só com o filtro
// "Comercial"). Clicar no título de uma coluna de marca filtra por ela.
function tabelaPlanilha(itens, pecas, filtros) {
  const cab = COLUNAS.map(function (c) {
    if (!c[3]) return '<th class="' + c[2] + '">' + esc(T(c[0])) + '</th>';
    const ativo = !!filtros[c[3]];
    return '<th class="' + c[2] + ' pl-filtro' + (ativo ? ' ativo' : '') + '" data-acao="filtroPlanilha" data-arg="' + c[3] + '" role="button" tabindex="0"' +
      ' aria-pressed="' + ativo + '" title="' + esc(T(ativo ? 'pl.filtroTirar' : 'pl.filtroPor', T(c[0]))) + '">' + esc(T(c[0])) + (ativo ? ' ✕' : '') + '</th>';
  }).join('');
  if (!pecas.length) {
    return '<div class="table-wrap pl-wrap"><table class="ord-tab pl-tab"><thead><tr>' + cab + '</tr></thead></table>' +
      '<div class="empty-state">' + esc(T(Object.keys(filtros).length ? 'pl.vaziaFiltro' : 'pl.vazia')) + '</div></div>';
  }
  const pos = pecas.map(function (i) { return String(i.posicao || '').trim(); });
  return '<div class="table-wrap pl-wrap"><table class="ord-tab pl-tab"><thead><tr>' + cab + '</tr></thead><tbody>' +
    pecas.map(function (i, n) {
      const conjunto = !pos[n] || pos.some(function (o) { return pos[n] && o.indexOf(pos[n] + '.') === 0; });
      return '<tr class="' + (conjunto ? 'pl-conjunto' : '') + (i.nivel ? ' pl-nivel' + Math.min(i.nivel, 3) : '') + '">' +
        COLUNAS.map(function (c) { return '<td class="' + c[2] + '">' + c[1](i) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
}

function kpi(rotulo, valor) { return '<div class="card kpi pl-kpi"><div class="label">' + esc(rotulo) + '</div><div class="value-row"><span class="value">' + valor + '</span></div></div>'; }

export function renderEspelho() {
  if (!espelho || !$('modal-espelho').classList.contains('open')) return;
  const p = buscarProjeto(espelho.projetoId);
  const ops = opsDoProjeto(espelho.projetoId);
  $('esp-titulo').textContent = T('esp.titulo', (p && p.commessa) || '');
  $('esp-sub').textContent = (p && p.descricao) || '';
  const mexe = podeMexer(p), doc = espelho.doc;
  $('esp-acoes').innerHTML =
    (mexe ? '<button type="button" class="btn btn-outline" data-acao="abrirPlanilha" data-arg="' + esc(espelho.projetoId) + '">' + esc(T('esp.subir')) + '</button>' : '') +
    (doc ? '<button type="button" class="btn btn-outline" data-acao="baixarEspelho">' + esc(T('av.baixar')) + '</button>' : '') +
    (mexe && (doc || ops.length) ? '<button type="button" class="btn btn-danger" data-acao="apagarListaOps">' + esc(T('esp.apagar')) + '</button>' : '');
  $('esp-resumo').innerHTML = '';
  if (doc === undefined) { $('esp-corpo').innerHTML = '<div class="hint-txt">' + esc(T('av.carregando')) + '</div>'; return; }
  if (!doc) { $('esp-corpo').innerHTML = '<div class="empty-state">' + esc(T(mexe ? 'esp.semListaSubir' : 'av.semLista')) + '</div>'; $('esp-rodape').textContent = ''; return; }
  const lidos = Avanco.itens(doc.matriz);
  if (!lidos) { $('esp-corpo').innerHTML = '<div class="empty-state">' + esc(T('av.erroLer')) + '</div>'; return; }
  const filtros = espelho.filtros;
  const linhas = Avanco.filtrar(lidos.itens, filtros);
  const r = Avanco.resumoPecas(linhas);   // os números do topo acompanham o filtro
  const ativos = COLUNAS.filter(function (c) { return c[3] && filtros[c[3]]; }).map(function (c) { return T(c[0]); });
  $('esp-resumo').innerHTML = '<div class="pl-kpis">' + kpi(T('pl.kPecas'), numeroBr(r.pecas)) + kpi(T('pl.kPeso'), numeroBr(r.peso) + '<small> kg</small>') +
    kpi(T('pl.kUsinagem'), numeroBr(r.usinagem)) + kpi(T('pl.kCaldeiraria'), numeroBr(r.caldeiraria)) + '</div>' +
    '<div class="pl-filtros-info">' + (ativos.length
      ? esc(T('pl.filtrando', ativos.join(' + '), linhas.length)) + ' <button type="button" class="link-btn" data-acao="limparFiltroPlanilha">' + esc(T('pl.limpar')) + '</button>'
      : esc(T('pl.dicaFiltro'))) + '</div>';
  $('esp-corpo').innerHTML = tabelaPlanilha(lidos.itens, linhas, filtros);
  $('esp-rodape').textContent = T('av.enviada', doc.enviadoPorNome || '—', dataHora(doc.enviadoEm), doc.arquivo || '');
}

// Apagar a lista e as OPs do projeto (para subir de novo). O técnico apaga as
// OPs ainda abertas; as que o CQ já mexeu só a Gerência apaga.
function apagarListaOps(_a, _b, btn) {
  if (!espelho) return;
  const p = buscarProjeto(espelho.projetoId);
  if (!podeMexer(p)) return;
  const ops = opsDoProjeto(p.id);
  const apagaveis = Auth.souGerente() ? ops : ops.filter(function (o) { return Producao.statusOp(o) === 'aberta'; });
  const ficam = ops.length - apagaveis.length;
  confirmar(T('esp.apagarQ', p.commessa, apagaveis.length) + (ficam ? ' ' + T('esp.apagarFicam', ficam) : ''),
    { titulo: T('esp.apagar'), textoOk: T('btn.excluir'), perigo: true }).then(function (ok) {
    if (!ok) return;
    comBotaoOcupado(btn, Ops.apagarVarias(apagaveis.map(function (o) { return o.id; }))
      .then(function () { return DadosAvanco.apagar(p.id); })
      .then(function () {
        if (espelho) espelho.doc = null;
        toast(T('esp.apagado', apagaveis.length));
        renderEspelho();
      }).catch(function (e) { avisoErro(e); }));
  });
}

// A planilha subida de dentro do espelho: relê o documento quando a janela da planilha fecha.
document.addEventListener('rostag:planilhaGravada', function (e) {
  if (espelho && e.detail === espelho.projetoId) abrirEspelho(espelho.projetoId);
});

registrarAcoes({
  alternarChecklist: function (id) {
    checklistAberto = !checklistAberto;
    const p = buscarProjeto(id);
    if (p) renderCartoesTecnico(p);
  },
  abrirEspelho: abrirEspelho,
  filtroPlanilha: function (k) {
    if (!espelho || !COLUNAS.some(function (c) { return c[3] === k; })) return;
    if (espelho.filtros[k]) delete espelho.filtros[k]; else espelho.filtros[k] = true;
    renderEspelho();
  },
  limparFiltroPlanilha: function () { if (espelho) { espelho.filtros = {}; renderEspelho(); } },
  baixarEspelho: function (_a, _b, btn) { if (espelho && espelho.doc) comBotaoOcupado(btn, exportarPlanilha(espelho.doc, espelho.projetoId)); },
  apagarListaOps: apagarListaOps
});

