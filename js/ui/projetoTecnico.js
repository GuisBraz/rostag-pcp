/* ---------------------------------------------------------------------------
   Página do projeto do técnico de processo: tudo do projeto dentro dele.
     Checklist           → abre e fecha o cronograma do PCP (começa fechado)
     Planilha de avanço  → tela cheia: espelho da planilha com o avanço ao vivo
     Ordens de Produção  → tela cheia: as OPs do projeto (roteiro do PDF)
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
import { exportarPlanilha } from './avanco.js';

let checklistAberto = false;
let espelho = null;   // { projetoId, doc }

function cartao(acao, arg, titulo, valorHtml, detalhe, corVal, ativo) {
  return '<button type="button" class="card ger-area' + (ativo ? ' ativa' : '') + '" data-acao="' + acao + '" data-arg="' + esc(arg) + '"' +
    (acao === 'alternarChecklist' ? ' aria-expanded="' + !!ativo + '"' : '') + '>' +
    '<div class="ger-area-tit">' + esc(titulo) + '</div>' +
    '<div class="ger-area-val" style="color:var(' + (corVal || '--ink') + ')">' + valorHtml + '</div>' +
    '<div class="ger-area-det">' + esc(detalhe) + '</div></button>';
}

// Os três cartões no topo da página do projeto (só para o técnico).
export function renderCartoesTecnico(p) {
  const c = Projeto.aguardandoCronograma(p) ? null : Cronograma.calcular(p);
  const atrasadas = c ? c.itens.filter(function (i) { return i.situacao === 'atrasada'; }).length : 0;
  const st = Producao.estatisticas(opsDoProjeto(p.id));
  $('tec-areas').innerHTML =
    cartao('alternarChecklist', p.id, T('tec.checklist'), c ? Projeto.progresso(p) + '<small>%</small>' : '—',
      !c ? T('sit.aguardando') : (atrasadas ? T('ar.procAtrasadas', plural(atrasadas, 'ar.ativ', 'ar.ativs')) : T('ar.procOk')),
      !c ? '--ink-faint' : (atrasadas ? '--rust' : '--teal'), checklistAberto) +
    cartao('abrirEspelho', p.id, T('tec.planilha'), st.total ? st.pct + '<small>%</small>' : '—',
      st.total ? T('tec.planilhaDet', numeroBr(st.pecasFeitas), numeroBr(st.pecas)) : T('tec.semPlanilha'), st.total ? '--violet' : '--ink-faint') +
    cartao('abrirListaOpsProjeto', p.id, T('tec.ops'), String(st.total),
      st.total ? T('tec.opsDet', st.abertas, st.retrabalho) : T('d.semOps'), st.retrabalho ? '--rust' : '--ink');
  $('tec-checklist-card').hidden = !checklistAberto;
}

/* --------------------------------------------- planilha de avanço (espelho) */
function podeMexer(p) { return !!p && Projeto.aberto(p) && (Auth.souGerente() || p.responsavelUid === Auth.uid()); }

function abrirEspelho(projetoId) {
  espelho = { projetoId: projetoId, doc: undefined };
  abrirModal('modal-espelho', { aoFechar: function () { espelho = null; } });
  renderEspelho();
  DadosAvanco.ler(projetoId).then(function (doc) {
    if (!espelho || espelho.projetoId !== projetoId) return;
    espelho.doc = doc;
    renderEspelho();
  }).catch(function (e) { console.warn(e); if (espelho) { espelho.doc = null; $('esp-corpo').innerHTML = '<div class="empty-state">' + esc(T('av.erroLer')) + '</div>'; } });
}

function valorCelula(v, ehPct) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return ehPct ? Math.round(v * 100) + '%' : numeroBr(v);
  return esc(v);
}

// A aba como no Excel: cabeçalho em dois níveis, células mescladas, marcas e o avanço por peças.
function tabelaEspelho(doc, ops) {
  const m = doc.matriz;
  const lidos = Avanco.itens(m);
  if (!lidos) return '<div class="empty-state">' + esc(T('av.erroLer')) + '</div>';
  const h = lidos.cabecalho.linha, c = lidos.cabecalho.cols;
  const r = Avanco.preencher(m.map(function (l) { return l.slice(); }), doc.merges, ops);
  const vivo = {};
  (r ? r.celulas : []).forEach(function (x) { vivo[x.r + '|' + x.c] = x; });
  const ncols = Math.min(Avanco.MAX_COLUNAS, m.reduce(function (n, l) { return Math.max(n, l.length); }, 0));
  const span = {}, coberto = {};
  (doc.merges || []).forEach(function (g) {
    span[g.s.r + '|' + g.s.c] = { r: g.e.r - g.s.r + 1, c: g.e.c - g.s.c + 1 };
    for (let i = g.s.r; i <= g.e.r; i++) for (let j = g.s.c; j <= g.e.c; j++) if (i !== g.s.r || j !== g.s.c) coberto[i + '|' + j] = true;
  });
  const comerciais = {};
  lidos.itens.forEach(function (it) { if (it.comercial) comerciais[it.linha] = true; });
  const flags = [c.fCald, c.fUsin, c.fPintura, c.fOxidacao, c.fServico, c.fTtat, c.comercial].filter(function (x) { return x != null; });
  // largura de cada coluna: a da planilha; sem ela, uma padrão pelo tipo da coluna
  const padrao = {};
  padrao[c.descricao] = 240; padrao[c.obs] = 240; padrao[c.desenho] = 90; padrao[c.produto] = 96;
  padrao[c.opCald] = 104; padrao[c.opUsin] = 104; padrao[c.item] = 44; padrao[c.posicao] = 64;
  flags.forEach(function (j) { padrao[j] = 54; });
  const larg = [];
  for (let j = 0; j < ncols; j++) {
    const w = (doc.larguras || [])[j];
    larg.push(w ? Math.max(40, Math.min(360, Math.round(w * 7.5))) : (padrao[j] || 74));
  }
  let html = '<table class="esp-tab" style="width:' + larg.reduce(function (t, w) { return t + w; }, 0) + 'px"><colgroup>';
  for (let j = 0; j < ncols; j++) html += '<col style="width:' + larg[j] + 'px">';
  html += '</colgroup><tbody>';
  m.forEach(function (linha, i) {
    const classe = i < h - 1 ? 'esp-topo' : (i === h - 1 ? 'esp-grupo' : (i === h ? 'esp-cab' : 'esp-item' + (comerciais[i] ? ' esp-comercial' : '')));
    html += '<tr class="' + classe + '">';
    for (let j = 0; j < ncols; j++) {
      const k = i + '|' + j;
      if (coberto[k]) continue;
      const sp = span[k];
      const x = vivo[k];
      const v = x ? x.v : linha[j];
      const ehPct = (x && x.z === '0%') || (j === c.avUsi && i > h);
      const cls = [];
      if (x) cls.push('esp-vivo' + (Number(x.v) > 0 ? ' esp-ok' : ''));
      if (i > h && flags.indexOf(j) >= 0) cls.push('esp-flag');
      if (typeof v === 'number') cls.push('esp-num');
      if (j === c.obs && i > h && v) cls.push('esp-obs');
      html += '<td' + (sp ? (sp.c > 1 ? ' colspan="' + sp.c + '"' : '') + (sp.r > 1 ? ' rowspan="' + sp.r + '"' : '') : '') + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>' + valorCelula(v, ehPct) + '</td>';
    }
    html += '</tr>';
  });
  return html + '</tbody></table>';
}

export function renderEspelho() {
  if (!espelho || !$('modal-espelho').classList.contains('open')) return;
  const p = buscarProjeto(espelho.projetoId);
  const ops = opsDoProjeto(espelho.projetoId);
  const st = Producao.estatisticas(ops);
  $('esp-titulo').textContent = T('esp.titulo', (p && p.commessa) || '');
  $('esp-sub').textContent = (p && p.descricao) || '';
  const mexe = podeMexer(p), doc = espelho.doc;
  $('esp-acoes').innerHTML =
    (mexe ? '<button type="button" class="btn btn-outline" data-acao="abrirPlanilha" data-arg="' + esc(espelho.projetoId) + '">' + esc(T('esp.subir')) + '</button>' : '') +
    (doc ? '<button type="button" class="btn btn-outline" data-acao="baixarEspelho">' + esc(T('av.baixar')) + '</button>' : '') +
    (mexe && (doc || ops.length) ? '<button type="button" class="btn btn-danger" data-acao="apagarListaOps">' + esc(T('esp.apagar')) + '</button>' : '');
  $('esp-resumo').textContent = st.total ? T('esp.resumo', st.pct, numeroBr(st.pecasFeitas), numeroBr(st.pecas), numeroBr(st.caldeiraria.pecasFeitas), numeroBr(st.caldeiraria.pecas),
    numeroBr(st.usinagem.pecasFeitas), numeroBr(st.usinagem.pecas), numeroBr(st.pecasRnc)) : '';
  if (doc === undefined) { $('esp-corpo').innerHTML = '<div class="hint-txt">' + esc(T('av.carregando')) + '</div>'; return; }
  if (!doc) { $('esp-corpo').innerHTML = '<div class="empty-state">' + esc(T(mexe ? 'esp.semListaSubir' : 'av.semLista')) + '</div>'; $('esp-rodape').textContent = ''; return; }
  $('esp-corpo').innerHTML = '<div class="esp-wrap">' + tabelaEspelho(doc, ops) + '</div>';
  $('esp-rodape').textContent = T('av.enviada', doc.enviadoPorNome || '—', dataHora(doc.enviadoEm), doc.arquivo || '') + ' · ' + T('esp.legenda');
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
  baixarEspelho: function (_a, _b, btn) { if (espelho && espelho.doc) comBotaoOcupado(btn, exportarPlanilha(espelho.doc, espelho.projetoId)); },
  apagarListaOps: apagarListaOps
});

