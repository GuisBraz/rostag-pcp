/* ---------------------------------------------------------------------------
   Serviços externos do projeto (cartão na página do projeto, tela cheia):
   usinagem externa, corte laser, dobra, TTAT… A lista vem da planilha de
   avanço (aba SERVIÇOS + peças marcadas). O técnico marca o envio com o
   prazo do fornecedor (dias úteis por padrão, ou corridos) e o retorno —
   os dois podem ser parciais. Vencido o prazo, o técnico é avisado para
   cobrar o fornecedor (notificacoes.js, Servicos.avisos). O PDF do pedido
   de compra do serviço (mesma folha dos comerciais) liga pedido, fornecedor
   e valor; os valores ficam no documento restrito comerciaisValores (chaves S|…).
--------------------------------------------------------------------------- */
import { estado, buscarProjeto } from '../estado.js';
import { esc, numeroBr, hoje, br, agoraIso, dataValida } from '../nucleo/fmt.js';
import { T, plural } from '../i18n/index.js';
import * as Avanco from '../dominio/avanco.js';
import * as Servicos from '../dominio/servicos.js';
import * as Auth from '../dados/auth.js';
import * as DadosAvanco from '../dados/avanco.js';
import * as DadosCom from '../dados/comerciais.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal, confirmar } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';
import { renderCartoesTecnico } from './projetoTecnico.js';
import { cuidaDoProjeto, moeda } from './comerciais.js';
import * as Pedido from '../dominio/pedidoPdf.js';
import { mesmaCommessa } from '../dominio/planilha.js';
import { paginasDoPdf } from './pdfTexto.js';

/* ------------------------------------------- dados ao vivo do projeto */
let vivo = null;   // { projetoId, equipe, avanco, doc, parar }

function ligar(projetoId) {
  const eq = Auth.equipeAtualId() + '|' + Auth.uid();
  if (vivo && vivo.projetoId === projetoId && vivo.equipe === eq) return vivo;
  if (vivo && vivo.parar) vivo.parar();
  const p = buscarProjeto(projetoId);
  const v = vivo = { projetoId: projetoId, equipe: eq, avanco: undefined, doc: undefined, val: null, parar: null };
  lerAvanco(v);
  const pararDoc = DadosCom.escutarDoc('servicos', projetoId, function (d) { if (vivo === v) { v.doc = d; atualizar(); } });
  // valores: só quem cuida do projeto lê (regras)
  const pararVal = cuidaDoProjeto(p) ? DadosCom.escutarDoc('comerciaisValores', projetoId, function (d) { if (vivo === v) { v.val = d; atualizar(); } }) : null;
  v.parar = function () { pararDoc(); if (pararVal) pararVal(); };
  return v;
}
function lerAvanco(v) {
  DadosAvanco.lerGuardada(v.projetoId).then(function (d) { if (vivo === v) { v.avanco = d; atualizar(); } })
    .catch(function (e) { console.warn(e); if (vivo === v) { v.avanco = null; atualizar(); } });
}
function atualizar() {
  if (!vivo) return;
  const p = buscarProjeto(vivo.projetoId);
  if (p && estado.idDetalhe === vivo.projetoId && $('tec-areas')) renderCartoesTecnico(p);
  if (aberta) render();
  if (mov) renderMov();
}
function linhas(v) {
  const l = v.avanco ? Avanco.itens(v.avanco.matriz) : null;
  return Servicos.lista(l ? l.itens : [], (v.avanco && v.avanco.servicos) || [], v.doc);
}

// Resumo para o cartão da página do projeto (null enquanto carrega).
export function resumoCartao(projetoId) {
  const v = ligar(projetoId);
  if (v.avanco === undefined || v.doc === undefined) return null;
  const r = Servicos.resumo(linhas(v));
  if (!r.total) return { valor: '0', detalhe: T('serv.cartaoVazio'), cor: '--ink-faint' };
  return { valor: r.naRua + '<small>/' + r.total + '</small>', detalhe: r.atrasados ? T('serv.cartaoAtraso', r.atrasados) : T('serv.cartaoDet', r.aEnviar, r.voltou),
    cor: r.atrasados ? '--rust' : (r.voltou === r.total ? '--green' : '--ink') };
}

/* --------------------------------------------------- janela (tela cheia) */
let aberta = null;   // { filtro, busca }
const FILTROS = ['todos', 'aEnviar', 'naRua', 'atrasados', 'voltou'];
function noFiltro(l, f) {
  if (f === 'todos') return true;
  if (f === 'aEnviar') return l.situacao === 'aEnviar' || (l.situacao === 'parcial' && l.enviado < l.qtd && l.naRua === 0);
  if (f === 'naRua') return l.naRua > 0;
  if (f === 'atrasados') return l.naRua > 0 && l.atrasoDias > 0;
  return l.situacao === 'voltou';
}

function abrir(projetoId) {
  const id = projetoId || estado.idDetalhe;
  if (!id || !buscarProjeto(id)) return;
  ligar(id);
  aberta = { filtro: 'todos', busca: '' };
  $('serv-busca').value = '';
  abrirModal('modal-servicos', { aoFechar: function () { aberta = null; } });
  render();
}

function prazoTxt(l) {
  if (!l.previsto) return '—';
  if (l.atrasoDias > 0) return '<span class="serv-atraso">' + esc(br(l.previsto)) + '<small>' + esc(T('serv.atrasado', plural(l.atrasoDias, 'x.dia', 'x.dias'))) + '</small></span>';
  return esc(br(l.previsto)) + (l.previsto === hoje() ? '<small class="serv-hoje">' + esc(T('serv.hoje')) + '</small>' : '');
}

function render() {
  if (!aberta || !vivo || !$('modal-servicos').classList.contains('open')) return;
  const v = vivo, p = buscarProjeto(v.projetoId);
  const mexe = cuidaDoProjeto(p);
  $('serv-titulo').textContent = T('serv.titulo', (p && p.commessa) || '');
  $('serv-acoes').innerHTML = mexe ? '<button type="button" class="btn btn-outline" data-acao="abrirPedidoServico">' + esc(T('com.importar')) + '</button>' : '';
  $('serv-sub').textContent = (p && p.descricao) || '';
  if (v.avanco === undefined || v.doc === undefined) { $('serv-filtros').innerHTML = ''; $('serv-resumo').textContent = ''; $('serv-corpo').innerHTML = '<div class="hint-txt">' + esc(T('av.carregando')) + '</div>'; return; }
  const todas = linhas(v);
  $('serv-filtros').innerHTML = FILTROS.map(function (f) {
    const n = todas.filter(function (l) { return noFiltro(l, f); }).length;
    return '<button type="button" role="tab" aria-selected="' + (aberta.filtro === f) + '" class="' + (aberta.filtro === f ? 'ativa' : '') + (f === 'atrasados' ? ' lops-alerta serv-f-atraso' : '') + '" data-acao="filtroServicos" data-arg="' + f + '">' +
      esc(T('serv.f.' + f)) + '<b>' + n + '</b></button>';
  }).join('');
  let lista = todas.filter(function (l) { return noFiltro(l, aberta.filtro); });
  const busca = aberta.busca.trim().toLowerCase();
  if (busca) lista = lista.filter(function (l) { return [l.tipo, l.servico, l.peca, l.desenho, l.posicao, l.fornecedor, l.pc].join(' ').toLowerCase().indexOf(busca) >= 0; });
  const r = Servicos.resumo(todas);
  $('serv-resumo').textContent = T('serv.resumo', r.total, r.aEnviar, r.naRua, r.atrasados, r.voltou);
  if (!todas.length) { $('serv-corpo').innerHTML = '<div class="empty-state">' + esc(T(v.avanco ? 'serv.semItens' : 'tec.semPlanilha')) + '</div>'; return; }
  if (!lista.length) { $('serv-corpo').innerHTML = '<div class="empty-state">' + esc(T('fab.vazioFiltro')) + '</div>'; return; }
  const cab = ['serv.c.tipo', 'serv.c.peca', 'serv.c.qtd', 'serv.c.fornecedor', 'serv.c.pc'].concat(mexe ? ['com.c.valorTotal'] : [])
    .concat(['serv.c.enviado', 'serv.c.voltou', 'serv.c.previsto', 'serv.c.situacao']);
  const num = { 'serv.c.qtd': 1, 'serv.c.enviado': 1, 'serv.c.voltou': 1, 'com.c.valorTotal': 1 };
  $('serv-corpo').innerHTML = '<div class="table-wrap pl-wrap"><table class="ord-tab serv-tab"><thead><tr>' +
    cab.map(function (c) { return '<th' + (num[c] ? ' class="num"' : '') + '>' + esc(T(c)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    lista.map(function (l) {
      return '<tr class="ord-linha' + (l.naRua > 0 && l.atrasoDias > 0 ? ' serv-linha-atraso' : '') + '"' + (mexe ? ' data-acao="abrirServico" data-arg="' + esc(l.chave) + '" tabindex="0" role="button"' : '') + '>' +
        '<td><b>' + esc(l.tipo) + '</b>' + (l.servico ? '<div class="hint-txt">' + esc(l.servico) + '</div>' : '') + '</td>' +
        '<td>' + esc(l.peca || '—') + '<div class="hint-txt mono">' + esc([l.desenho, l.posicao ? T('com.c.pos') + ' ' + l.posicao : ''].filter(Boolean).join(' · ')) + '</div>' +
          (l.obs ? '<div class="hint-txt op-obs">' + esc(l.obs) + '</div>' : '') + '</td>' +
        '<td class="num">' + numeroBr(l.qtd) + '</td><td>' + esc(l.fornecedor || '—') + '</td><td class="mono">' + esc(l.pc || '—') + '</td>' +
        (mexe ? '<td class="num">' + (v.val && v.val.itens && v.val.itens[l.chave] ? moeda(v.val.itens[l.chave].valorTotal) : '—') + '</td>' : '') +
        '<td class="num">' + numeroBr(l.enviado) + '</td><td class="num">' + numeroBr(l.voltou) + '</td>' +
        '<td>' + prazoTxt(l) + '</td>' +
        '<td><span class="pill-com serv-' + l.situacao + '">' + esc(T('serv.s.' + l.situacao)) + '</span></td></tr>';
    }).join('') + '</tbody></table></div>';
}

/* ------------------------------------------- envio e retorno de um serviço */
let mov = null;   // { chave }

function linhaAtual() { return mov && vivo ? linhas(vivo).find(function (x) { return x.chave === mov.chave; }) : null; }

function abrirServico(k) {
  if (!vivo || !cuidaDoProjeto(buscarProjeto(vivo.projetoId))) return;
  mov = { chave: k };
  const l = linhaAtual();
  if (!l) { mov = null; return; }
  $('smov-titulo').textContent = l.tipo + ' — ' + (l.peca || l.desenho);
  $('smov-sub').textContent = [l.servico, l.desenho, l.posicao ? T('com.c.pos') + ' ' + l.posicao : '', T('com.qtdPlanilha', numeroBr(l.qtd))].filter(Boolean).join(' · ');
  $('smov-env-data').value = hoje();
  $('smov-env-qtd').value = String(Math.max(0, l.qtd - l.enviado) || '');
  $('smov-env-prazo').value = '';
  $('smov-env-tipo').value = 'uteis';
  $('smov-env-fornecedor').value = l.fornecedor || '';
  $('smov-ret-data').value = hoje();
  $('smov-ret-qtd').value = String(l.naRua || '');
  $('smov-erro').textContent = '';
  renderMov();
  abrirModal('modal-serv-mov', { foco: 'smov-env-prazo', aoFechar: function () { mov = null; } });
}

function renderMov() {
  const l = linhaAtual();
  if (!l) return;
  $('smov-ret').hidden = l.naRua <= 0;
  previaPrazo();
  const evs = l.envios.map(function (e, i) { return { t: 'e', i: i, em: e.em, x: e }; })
    .concat(l.retornos.map(function (r, i) { return { t: 'r', i: i, em: r.em, x: r }; }))
    .sort(function (a, b) { return String(a.em).localeCompare(String(b.em)); });
  $('smov-hist').innerHTML = evs.length ? '<ul class="mov-lista">' + evs.map(function (ev) {
    const e = ev.x;
    const txt = ev.t === 'e'
      ? T('serv.h.envio', numeroBr(e.qtd), e.fornecedor || '—', plural(e.prazo, e.tipoPrazo === 'corridos' ? 'serv.diaCorrido' : 'serv.diaUtil', e.tipoPrazo === 'corridos' ? 'serv.diasCorridos' : 'serv.diasUteis'),
        br(e.previsto || Servicos.previsto(e.em, e.prazo, e.tipoPrazo)))
      : T('serv.h.retorno', numeroBr(e.qtd));
    return '<li class="mov-' + ev.t + '"><span>' + esc(br(ev.em)) + '</span><span>' + esc(txt) + '</span><span class="hint-txt">' + esc(e.porNome || '') + '</span>' +
      '<button type="button" class="btn-x" data-acao="tirarMovServico" data-arg="' + ev.t + '" data-arg2="' + ev.i + '" title="' + esc(T('btn.excluir')) + '" aria-label="' + esc(T('btn.excluir')) + '">✕</button></li>';
  }).join('') + '</ul>' : '<div class="hint-txt">' + esc(T('serv.semMov')) + '</div>';
}

function previaPrazo() {
  const d = $('smov-env-data').value, n = Number($('smov-env-prazo').value);
  $('smov-env-previsto').textContent = dataValida(d) && n > 0 ? T('serv.previsto', br(Servicos.previsto(d, n, $('smov-env-tipo').value))) : '';
}

// Registro gravado do serviço: os dados da peça vão junto (o aviso de cobrança usa sem a planilha).
function registroBase(l) {
  const atual = (vivo.doc && vivo.doc.itens && vivo.doc.itens[l.chave]) || {};
  return Object.assign({}, atual, {
    qtd: Number(l.qtd) || 1, tipo: String(l.tipo || '').slice(0, 80), peca: String(l.peca || '').slice(0, 120),
    desenho: String(l.desenho || '').slice(0, 60), posicao: String(l.posicao || '').slice(0, 20),
    envios: (atual.envios || []).slice(), retornos: (atual.retornos || []).slice()
  });
}
function registroDe(l) {
  const atual = (vivo.doc && vivo.doc.itens && vivo.doc.itens[l.chave]) || {};
  return Object.assign({}, atual, {
    qtd: Number(l.qtd) || 1, tipo: String(l.tipo || '').slice(0, 80), peca: String(l.peca || '').slice(0, 120),
    desenho: String(l.desenho || '').slice(0, 60), posicao: String(l.posicao || '').slice(0, 20),
    envios: (atual.envios || []).slice(), retornos: (atual.retornos || []).slice()
  });
}
function gravar(reg, btn, msg) {
  const p = buscarProjeto(vivo.projetoId), mud = {};
  mud[mov.chave] = reg;
  return comBotaoOcupado(btn, DadosCom.gravarItens('servicos', p, mud).then(function () { if (msg) toast(msg); }).catch(function (e) { avisoErro(e); }));
}

function registrarEnvio(_a, _b, btn) {
  const l = linhaAtual();
  if (!l) return;
  const d = $('smov-env-data').value, qtd = Number(String($('smov-env-qtd').value).replace(',', '.')), prazo = Math.round(Number($('smov-env-prazo').value));
  const tipo = $('smov-env-tipo').value === 'corridos' ? 'corridos' : 'uteis';
  if (!dataValida(d)) { $('smov-erro').textContent = T('com.erroData'); return; }
  if (!(qtd > 0)) { $('smov-erro').textContent = T('serv.erroQtd'); return; }
  if (!(prazo > 0) || prazo > 365) { $('smov-erro').textContent = T('serv.erroPrazo'); return; }
  $('smov-erro').textContent = '';
  const reg = registroBase(l);
  const fornecedor = $('smov-env-fornecedor').value.trim().slice(0, 80);
  if (fornecedor) reg.fornecedor = fornecedor;
  reg.envios.push({ qtd: qtd, em: d, prazo: prazo, tipoPrazo: tipo, previsto: Servicos.previsto(d, prazo, tipo), fornecedor: fornecedor,
    porNome: String(Auth.nomeExibicao() || '').slice(0, 60), registradoEm: agoraIso() });
  gravar(reg, btn, T('serv.enviadoOk')).then(function () { $('smov-env-prazo').value = ''; });
}

function registrarRetorno(_a, _b, btn) {
  const l = linhaAtual();
  if (!l) return;
  const d = $('smov-ret-data').value, qtd = Number(String($('smov-ret-qtd').value).replace(',', '.'));
  if (!dataValida(d)) { $('smov-erro').textContent = T('com.erroData'); return; }
  if (!(qtd > 0) || qtd > l.naRua) { $('smov-erro').textContent = T('serv.erroRetorno', numeroBr(l.naRua)); return; }
  $('smov-erro').textContent = '';
  const reg = registroBase(l);
  reg.retornos.push({ qtd: qtd, em: d, porNome: String(Auth.nomeExibicao() || '').slice(0, 60), registradoEm: agoraIso() });
  gravar(reg, btn, T('serv.voltouOk'));
}

function tirarMov(t, i, btn) {
  const l = linhaAtual();
  if (!l) return;
  confirmar(T('serv.tirarQ'), { titulo: T('btn.excluir'), textoOk: T('btn.excluir'), perigo: true }).then(function (ok) {
    if (!ok || !linhaAtual()) return;
    const reg = registroBase(linhaAtual());
    (t === 'e' ? reg.envios : reg.retornos).splice(Number(i), 1);
    gravar(reg, btn);
  });
}

/* ------------------------------------------- PDF do pedido de compra */
let ped = null;   // { pedido, linhas: [{ linha, daCommessa, alvo, por }], todas }

function abrirPedido() {
  if (!vivo || !cuidaDoProjeto(buscarProjeto(vivo.projetoId))) return;
  ped = null;
  $('sped-arquivo').value = '';
  $('sped-corpo').innerHTML = '';
  $('sped-erro').textContent = '';
  $('sped-gravar').disabled = true;
  abrirModal('modal-serv-pedido', { foco: 'sped-arquivo', aoFechar: function () { ped = null; } });
}

function lerPedidoPdf(ev) {
  const arq = ev && ev.target && ev.target.files && ev.target.files[0];
  ped = null;
  $('sped-erro').textContent = '';
  $('sped-corpo').innerHTML = '';
  $('sped-gravar').disabled = true;
  if (!arq || !vivo) return;
  if (arq.size > 15 * 1024 * 1024) { $('sped-erro').textContent = T('fab.erroGrande'); return; }
  $('sped-corpo').innerHTML = '<div class="hint-txt">' + esc(T('fab.lendo')) + '</div>';
  arq.arrayBuffer().then(function (buf) { return paginasDoPdf(new Uint8Array(buf)); }).then(function (r) {
    const pd = Pedido.lerPedido(r.paginas);
    if (!pd.ok || !pd.itens.length) { $('sped-corpo').innerHTML = ''; $('sped-erro').textContent = T(pd.motivo === 'semTexto' ? 'com.pdfSemTexto' : 'com.pdfNaoPedido'); return; }
    const p = buscarProjeto(vivo.projetoId);
    const daCommessa = pd.itens.filter(function (it) { return mesmaCommessa(it.commessa, p.commessa); });
    const ligacoes = Servicos.ligarPedido(daCommessa, linhas(vivo));
    const porLinha = new Map(ligacoes.map(function (x) { return [x.linha, x]; }));
    ped = { pedido: pd, todas: false, linhas: pd.itens.map(function (it) {
      const lg = porLinha.get(it);
      return { linha: it, daCommessa: !!lg, alvo: lg ? (lg.chave || '') : '', por: lg ? lg.por : null };
    }) };
    renderPedido();
  }).catch(function (e) { console.warn(e); $('sped-corpo').innerHTML = ''; $('sped-erro').textContent = T('com.pdfErro'); });
}

function renderPedido() {
  if (!ped || !vivo) return;
  const pd = ped.pedido, p = buscarProjeto(vivo.projetoId), servs = linhas(vivo);
  const visiveis = ped.linhas.filter(function (x) { return ped.todas || x.daCommessa; });
  const outras = ped.linhas.length - ped.linhas.filter(function (x) { return x.daCommessa; }).length;
  const opcoes = function (alvo) {
    return '<option value="">' + esc(T('com.ped.ignorar')) + '</option>' + servs.map(function (s) {
      return '<option value="' + esc(s.chave) + '"' + (s.chave === alvo ? ' selected' : '') + '>' + esc(s.tipo + ' — ' + (s.peca || '') + ' (' + s.desenho + (s.posicao ? ' pos. ' + s.posicao : '') + ')') + '</option>';
    }).join('');
  };
  $('sped-corpo').innerHTML =
    '<div class="ped-cab"><div><b>' + esc(T('com.ped.numero', pd.numero)) + '</b> · ' + esc(pd.fornecedor || '—') + '</div>' +
      '<div class="hint-txt">' + esc(T('com.ped.info', pd.emissao || '—', pd.comprador || '—', moeda(pd.total))) + '</div></div>' +
    (outras ? '<label class="ped-todas"><input type="checkbox" data-change="pedidoServTodas"' + (ped.todas ? ' checked' : '') + '> ' + esc(T('com.ped.outras', outras, p.commessa)) + '</label>' : '') +
    (!visiveis.length ? '<div class="empty-state">' + esc(T('com.ped.nenhum', p.commessa)) + '</div>' :
    '<div class="table-wrap"><table class="ord-tab ped-tab"><thead><tr><th>' + esc(T('com.c.descricao')) + '</th><th class="num">' + esc(T('com.c.qtd')) + '</th><th class="num">' +
      esc(T('com.c.valorTotal')) + '</th><th>' + esc(T('com.c.sc')) + '</th><th>' + esc(T('serv.ped.item')) + '</th></tr></thead><tbody>' +
      visiveis.map(function (x) {
        const i = ped.linhas.indexOf(x), it = x.linha;
        return '<tr><td>' + esc(it.descricao) + '<div class="hint-txt mono">' + esc(it.produto) + (it.commessa && !x.daCommessa ? ' · ' + esc(it.commessa) : '') + '</div></td>' +
          '<td class="num">' + numeroBr(it.qtd) + ' <small>' + esc(it.unidade) + '</small></td><td class="num">' + moeda(it.valorTotal) + '</td><td class="mono">' + esc(it.sc || '—') + '</td>' +
          '<td><select data-change="pedidoServAlvo" data-arg2="' + i + '" aria-label="' + esc(T('serv.ped.item')) + '">' + opcoes(x.alvo) + '</select>' +
          (x.por ? '<div class="hint-txt ped-por ped-por-' + (x.por === 'desenho' ? 'sc' : x.por) + '">' + esc(T('serv.ped.por.' + x.por)) + '</div>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>');
  $('sped-gravar').disabled = !ped.linhas.some(function (x) { return x.alvo; });
}

function gravarPedido(_a, _b, btn) {
  if (!ped || !vivo) return;
  const p = buscarProjeto(vivo.projetoId), pd = ped.pedido, servs = linhas(vivo);
  const mudServ = {}, mudVal = {};
  let n = 0;
  ped.linhas.forEach(function (x) {
    if (!x.alvo) return;
    const s = servs.find(function (y) { return y.chave === x.alvo; });
    if (!s) return;
    const atual = mudServ[s.chave] || registroDe(s);
    mudServ[s.chave] = Object.assign(atual, { pc: pd.numero, fornecedor: String(pd.fornecedor || '').slice(0, 80) });
    const antes = mudVal[s.chave];
    mudVal[s.chave] = { pc: pd.numero, valorUnit: Number(x.linha.valorUnit) || 0, valorTotal: (antes ? antes.valorTotal : 0) + (Number(x.linha.valorTotal) || 0) };
    n++;
  });
  const pedVal = {}; pedVal[pd.numero] = { total: Number(pd.total) || 0 };
  comBotaoOcupado(btn, DadosCom.gravarItens('servicos', p, mudServ).then(function () {
    return DadosCom.gravarItens('comerciaisValores', p, mudVal, pedVal);
  }).then(function () {
    fecharModal('modal-serv-pedido');
    toast(T('com.ped.gravado', pd.numero, n));
  }).catch(function (e) { avisoErro(e); }));
}

/* ------------------------------------------------------------ eventos */
document.addEventListener('input', function (e) {
  if (!e.target) return;
  if (e.target.id === 'serv-busca' && aberta) { aberta.busca = e.target.value; render(); }
  if (e.target.id === 'smov-env-prazo' || e.target.id === 'smov-env-data') previaPrazo();
});
document.addEventListener('change', function (e) { if (e.target && e.target.id === 'smov-env-tipo') previaPrazo(); });
document.addEventListener('rostag:planilhaGravada', function (e) {
  if (vivo && vivo.projetoId === e.detail) { vivo.avanco = undefined; lerAvanco(vivo); }
});

registrarAcoes({
  abrirServicos: abrir,
  abrirPedidoServico: abrirPedido,
  lerPedidoServPdf: lerPedidoPdf,
  pedidoServTodas: function (_v, _b, el) { if (ped) { ped.todas = !!el.checked; renderPedido(); } },
  pedidoServAlvo: function (v, i) { const x = ped && ped.linhas[Number(i)]; if (x) { x.alvo = v; x.por = null; renderPedido(); } },
  gravarPedidoServico: gravarPedido,
  filtroServicos: function (f) { if (aberta && FILTROS.indexOf(f) >= 0) { aberta.filtro = f; render(); } },
  abrirServico: abrirServico,
  registrarEnvio: registrarEnvio,
  registrarRetorno: registrarRetorno,
  tirarMovServico: tirarMov
});
