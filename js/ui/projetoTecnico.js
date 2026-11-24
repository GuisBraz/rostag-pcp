/* ---------------------------------------------------------------------------
   Página do projeto do técnico de processo: tudo do projeto dentro dele.
     Checklist           → abre e fecha o cronograma do PCP (começa fechado)
     Planilha de avanço  → tela cheia: a lista do projeto (sem os comerciais)
     Ordens de Produção  → tela cheia: as OPs do projeto (roteiro do PDF)
     Itens comerciais    → tela cheia: pedidos de compra e chegadas (comerciais.js)
     Serviços            → tela cheia: envios e retornos dos serviços externos (servicos.js)
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, opsDoProjeto, nomeProjeto } from '../estado.js';
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
import { resumoCartao as resumoPgms } from './pgms.js';
import { resumoCartao as resumoServicos } from './servicos.js';
import { resumoCartao as resumoTarefas } from './tarefas.js';
import * as BomResumo from './bomResumo.js';
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

// BOM: o escopo (peças de fabricação); Avanço: % pela baixa do programador
function cartaoBom(p) {
  BomResumo.conferir(p);   // projeto antigo: grava o resumo da BOM na primeira visita
  const a = BomResumo.avancoDe(p, []);
  return cartao('abrirEspelho', p.id, T('tec.planilha'), p.bom ? numeroBr(a.pecasBom) : '—',
    p.bom ? T('tec.bomDet', numeroBr(a.pecasBom)) : T('tec.semBom'), p.bom ? '--ink' : '--ink-faint');
}
function cartaoAvanco(p, ops) {
  const a = BomResumo.avancoDe(p, ops);
  const tem = a.pecas > 0;
  return cartao('abrirAvanco', p.id, T('tec.avanco'), tem ? a.pct + '<small>%</small>' : '—',
    tem ? T('tec.avancoDet', numeroBr(a.feitas), numeroBr(a.pecas)) : T('tec.semAvanco'), tem ? '--violet' : '--ink-faint');
}

// Os cartões no topo da página do projeto (só para o técnico).
export function renderCartoesTecnico(p) {
  const c = Projeto.aguardandoCronograma(p) ? null : Cronograma.calcular(p);
  const atrasadas = c ? c.itens.filter(function (i) { return i.situacao === 'atrasada'; }).length : 0;
  const st = Producao.estatisticas(opsDoProjeto(p.id));
  const com = resumoComerciais(p.id), serv = resumoServicos(p.id), tar = resumoTarefas(p.id), pgm = resumoPgms(p.id);
  $('tec-areas').innerHTML =
    cartao('alternarChecklist', p.id, T('tec.checklist'), c ? Projeto.progresso(p) + '<small>%</small>' : '—',
      !c ? T('sit.aguardando') : (atrasadas ? T('ar.procAtrasadas', plural(atrasadas, 'ar.ativ', 'ar.ativs')) : T('ar.procOk')),
      !c ? '--ink-faint' : (atrasadas ? '--rust' : '--teal'), checklistAberto) +
    cartaoBom(p) + cartaoAvanco(p, opsDoProjeto(p.id)) +
    cartao('abrirListaOpsProjeto', p.id, T('tec.ops'), String(st.total),
      st.total ? T('tec.opsDet', st.abertas, st.retrabalho) : T('d.semOps'), st.retrabalho ? '--rust' : '--ink') +
    cartao('abrirComerciais', p.id, T('tec.comerciais'), com ? com.valor : '—', com ? com.detalhe : T('com.abrir'), com ? com.cor : '--ink-faint') +
    cartao('abrirServicos', p.id, T('tec.servicos'), serv ? serv.valor : '—', serv ? serv.detalhe : T('serv.abrir'), serv ? serv.cor : '--ink-faint') +
    cartao('abrirTarefas', p.id, T('tec.tarefas'), tar.valor, tar.detalhe, tar.cor) +
    cartao('abrirPgmsProjeto', p.id, T('tec.pgms'), pgm ? pgm.valor : '—', pgm ? pgm.detalhe : T('pgm.abrir'), pgm ? pgm.cor : '--ink-faint');
  $('tec-checklist-card').hidden = !checklistAberto;
}

// Programadores e CQ: só consultam. Programador: planilha, OPs (da área dele),
// itens comerciais e serviços. CQ: planilha e OPs (no detalhe da OP ele dá a
// baixa e abre RNC). Nada aqui grava.
export function renderCartoesConsulta(p) {
  const area = Auth.areaProgramador();
  const ops = opsDoProjeto(p.id).filter(function (o) { return !area || o.area === area; });
  const st = Producao.estatisticas(ops);
  let html = cartaoBom(p) + cartaoAvanco(p, opsDoProjeto(p.id)) +
    cartao('abrirListaOpsProjeto', p.id, area ? T('tec.opsArea', T('area.' + area)).toUpperCase() : T('tec.ops'), String(st.total),
      st.total ? T('tec.opsDet', st.abertas, st.retrabalho) : T('d.semOps'), st.retrabalho ? '--rust' : '--ink');
  if (area) {
    const com = resumoComerciais(p.id), serv = resumoServicos(p.id);
    html += cartao('abrirComerciais', p.id, T('tec.comerciais'), com ? com.valor : '—', com ? com.detalhe : T('com.abrir'), com ? com.cor : '--ink-faint') +
      cartao('abrirServicos', p.id, T('tec.servicos'), serv ? serv.valor : '—', serv ? serv.detalhe : T('serv.abrir'), serv ? serv.cor : '--ink-faint');
  }
  $('tec-areas').innerHTML = html;
  $('tec-checklist-card').hidden = true;
}

/* --------------------------------------------- planilha de avanço (espelho) */
function podeMexer(p) { return !!p && Projeto.aberto(p) && BomResumo.podeMexer(p); }

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
// Símbolo de cada processo (BOM e Avanço); o nome inteiro vai na dica
export const SIMBOLOS = { comercial: '🛒', cald: '🔨', usin: '⚙️', pintura: '🎨', oxidacao: '🧪', servicoExterno: '🚚', ttat: '🔥' };
const MARCA = function (k) {
  return function (i) {
    const v = k === 'comercial' ? i.comercial : k === 'cald' ? i.cald : k === 'usin' ? i.usin : i.marcas && i.marcas[k];
    return v ? '<span class="pl-simb" role="img" aria-label="' + esc(T('pl.marca.' + k)) + '" title="' + esc(T('pl.marca.' + k)) + '">' + SIMBOLOS[k] + '</span>' : '';
  };
};
// BOM: o escopo "virgem" — sem produto, OPs, solicitações ou pedidos.
// [rótulo, valor, classe, filtro, rótulo curto do cabeçalho (o nome inteiro vai na dica)]
const COLUNAS = [
  ['pl.rev', function (i) { return esc(i.rev); }, 'pl-c'],
  ['pl.desenho', function (i) { return esc(i.desenho); }, 'mono'],
  ['pl.posicao', function (i) { return esc(i.posicao); }, 'pl-c'],
  ['pl.descricao', function (i) {
    return '<span class="pl-desc">' + esc(i.descricao) + '</span>' +
      (i.obs ? ' <span class="pl-obs" title="' + esc(i.obs) + '" aria-label="' + esc(T('pl.obs') + ': ' + i.obs) + '" tabindex="0">💬</span>' : '');
  }, 'pl-descricao'],
  ['pl.qtd', function (i) { return i.qtd == null ? '' : numeroBr(i.qtd); }, 'num', null, 'pl.qtdC'],
  ['pl.pesoUnit', function (i) { return i.pesoUnit == null ? '' : numeroBr(i.pesoUnit); }, 'num', null, 'pl.pesoUnitC'],
  ['pl.pesoTotal', function (i) { return i.pesoTotal == null ? '' : numeroBr(i.pesoTotal); }, 'num', null, 'pl.pesoTotalC'],
  ['pl.comercial', MARCA('comercial'), 'pl-c', 'comercial', 'pl.comercialC'],
  ['pl.cald', MARCA('cald'), 'pl-c', 'cald', 'pl.caldC'],
  ['pl.usinagem', MARCA('usin'), 'pl-c', 'usin', 'pl.usinagemC'],
  ['pl.pintura', MARCA('pintura'), 'pl-c', 'pintura', 'pl.pinturaC'],
  ['pl.oxidacao', MARCA('oxidacao'), 'pl-c', 'oxidacao', 'pl.oxidacaoC'],
  ['pl.servicos', MARCA('servicoExterno'), 'pl-c', 'servicoExterno', 'pl.servicosC'],
  ['pl.ttat', MARCA('ttat'), 'pl-c', 'ttat', 'pl.ttatC']
];

// A lista do projeto do jeito do site: as peças (os comerciais só com o filtro
// "Comercial"). Clicar no título de uma coluna de marca filtra por ela.
function tabelaPlanilha(itens, pecas, filtros) {
  const cab = COLUNAS.map(function (c) {
    const rot = esc(T(c[4] || c[0]));
    if (!c[3]) return '<th class="' + c[2] + '"' + (c[4] ? ' title="' + esc(T(c[0])) + '"' : '') + '>' + rot + '</th>';
    const ativo = !!filtros[c[3]];
    return '<th class="' + c[2] + ' pl-filtro' + (ativo ? ' ativo' : '') + '" data-acao="filtroPlanilha" data-arg="' + c[3] + '" role="button" tabindex="0"' +
      ' aria-pressed="' + ativo + '" title="' + esc(T(ativo ? 'pl.filtroTirar' : 'pl.filtroPor', T(c[0]))) + '" aria-label="' + esc(T(c[0])) + '">' + rot + (ativo ? ' ✕' : '') + '</th>';
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
  $('esp-titulo').textContent = T('esp.titulo', (p && nomeProjeto(p)) || '');
  $('esp-sub').textContent = (p && p.descricao) || '';
  const mexe = podeMexer(p), doc = espelho.doc;
  $('esp-acoes').innerHTML =
    (mexe ? '<button type="button" class="btn btn-outline" data-acao="abrirPlanilha" data-arg="' + esc(espelho.projetoId) + '">' + esc(T('esp.subir')) + '</button>' : '') +
    (doc && BomResumo.podeMexer(p) ? '<button type="button" class="btn btn-outline" data-acao="baixarEspelho">' + esc(T('bom.baixar')) + '</button>' : '') +
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
  confirmar(T('esp.apagarQ', nomeProjeto(p), apagaveis.length) + (ficam ? ' ' + T('esp.apagarFicam', ficam) : ''),
    { titulo: T('esp.apagar'), textoOk: T('btn.excluir'), perigo: true }).then(function (ok) {
    if (!ok) return;
    comBotaoOcupado(btn, Ops.apagarVarias(apagaveis.map(function (o) { return o.id; }))
      .then(function () { return DadosAvanco.apagar(p.id); })
      .then(function () { return BomResumo.limpar(p); })
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
    const p = buscarProjeto(id);
    if (p && Projeto.aguardandoCronograma(p) && !Auth.souGPouCoordenador()) { toast(T('lista.esperaChecklist')); return; }
    checklistAberto = !checklistAberto;
    if (p) renderCartoesTecnico(p);
  },
  abrirEspelho: abrirEspelho,
  filtroPlanilha: function (k) {
    if (!espelho || !COLUNAS.some(function (c) { return c[3] === k; })) return;
    if (espelho.filtros[k]) delete espelho.filtros[k]; else espelho.filtros[k] = true;
    renderEspelho();
  },
  limparFiltroPlanilha: function () { if (espelho) { espelho.filtros = {}; renderEspelho(); } },
  baixarEspelho: function (_a, _b, btn) { if (espelho && espelho.doc && BomResumo.podeMexer(buscarProjeto(espelho.projetoId))) comBotaoOcupado(btn, exportarPlanilha(espelho.doc, espelho.projetoId, { bom: true })); },
  apagarListaOps: apagarListaOps
});

