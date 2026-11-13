/* ---------------------------------------------------------------------------
   Itens comerciais do projeto (cartão na página do projeto, tela cheia).
   A lista vem da planilha de avanço (linhas "Comercial"); o técnico importa
   o PDF do pedido de compra e o site liga cada linha do pedido ao item
   (produto → SC → descrição), marca as chegadas (parciais) e guarda os
   valores à parte — só Gerência, GP e técnico do projeto veem valores.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto } from '../estado.js';
import { esc, numeroBr, hoje, br, agoraIso, dataValida } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Avanco from '../dominio/avanco.js';
import * as Com from '../dominio/comerciais.js';
import * as Pedido from '../dominio/pedidoPdf.js';
import { mesmaCommessa } from '../dominio/planilha.js';
import * as Auth from '../dados/auth.js';
import * as DadosAvanco from '../dados/avanco.js';
import * as DadosCom from '../dados/comerciais.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal, confirmar } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';
import { paginasDoPdf } from './pdfTexto.js';
import { renderCartoesTecnico } from './projetoTecnico.js';

/* ------------------------------------------------------------- acesso */
// Gerência, o GP do projeto e o técnico do projeto: gravam e veem os valores.
export function cuidaDoProjeto(p) {
  if (!p || !Auth.membro()) return false;
  if (Auth.souGerente()) return true;
  const papel = Auth.papel();
  return (papel === 'gp' && p.gpUid === Auth.uid()) || ((papel === 'tecnico' || papel === 'planejador') && p.responsavelUid === Auth.uid());
}

export function moeda(n) { return n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

/* ------------------------------------------- dados ao vivo do projeto */
let vivo = null;   // { projetoId, equipe, avanco, com, val, parar }

function ligar(projetoId) {
  const eq = Auth.equipeAtualId() + '|' + Auth.uid();
  if (vivo && vivo.projetoId === projetoId && vivo.equipe === eq) return vivo;
  desligar();
  const p = buscarProjeto(projetoId);
  const v = vivo = { projetoId: projetoId, equipe: eq, avanco: undefined, com: undefined, val: cuidaDoProjeto(p) ? undefined : null, parar: [] };
  lerAvanco(v);
  v.parar.push(DadosCom.escutarDoc('comerciais', projetoId, function (d) { if (vivo === v) { v.com = d; atualizar(); } }));
  if (v.val === undefined) v.parar.push(DadosCom.escutarDoc('comerciaisValores', projetoId, function (d) { if (vivo === v) { v.val = d; atualizar(); } }));
  return v;
}
function lerAvanco(v) {
  DadosAvanco.lerGuardada(v.projetoId).then(function (d) { if (vivo === v) { v.avanco = d; atualizar(); } })
    .catch(function (e) { console.warn(e); if (vivo === v) { v.avanco = null; atualizar(); } });
}
function desligar() { if (vivo) vivo.parar.forEach(function (f) { f(); }); vivo = null; }

function atualizar() {
  if (!vivo) return;
  const p = buscarProjeto(vivo.projetoId);
  if (p && estado.idDetalhe === vivo.projetoId && $('tec-areas')) renderCartoesTecnico(p);
  if (aberta) render();
}

function itensPlanilha(v) {
  const l = v.avanco ? Avanco.itens(v.avanco.matriz) : null;
  return l ? l.itens : [];
}
function linhas(v) { return Com.lista(itensPlanilha(v), v.com); }

// Resumo para o cartão da página do projeto (null enquanto carrega).
export function resumoCartao(projetoId) {
  const v = ligar(projetoId);
  if (v.avanco === undefined || v.com === undefined) return null;
  const r = Com.resumo(linhas(v));
  if (!r.total) return { valor: '0', detalhe: T('com.cartaoVazio'), cor: '--ink-faint' };
  return { valor: r.completo + '<small>/' + r.total + '</small>', detalhe: T('com.cartaoDet', r.semPedido, r.pendente + r.parcial),
    cor: r.completo === r.total ? '--green' : (r.semPedido ? '--amber-ink' : '--ink') };
}

/* --------------------------------------------------- janela (tela cheia) */
let aberta = null;   // { filtro, busca }
const FILTROS = ['todos', 'semPedido', 'pendente', 'parcial', 'completo'];

function abrir(projetoId) {
  const id = projetoId || estado.idDetalhe;
  if (!id || !buscarProjeto(id)) return;
  ligar(id);
  aberta = { filtro: 'todos', busca: '' };
  $('com-busca').value = '';
  abrirModal('modal-comerciais', { aoFechar: function () { aberta = null; } });
  render();
}

function valorDe(v, k) { return v.val && v.val.itens ? v.val.itens[k] || null : null; }

function render() {
  if (!aberta || !vivo || !$('modal-comerciais').classList.contains('open')) return;
  const v = vivo, p = buscarProjeto(v.projetoId);
  const mexe = cuidaDoProjeto(p), veValor = mexe;   // quem grava é quem vê os valores (regras)
  $('com-titulo').textContent = T('com.titulo', (p && p.commessa) || '');
  $('com-sub').textContent = (p && p.descricao) || '';
  $('com-acoes').innerHTML = mexe ? '<button type="button" class="btn btn-outline" data-acao="abrirPedidoPdf">' + esc(T('com.importar')) + '</button>' : '';
  if (v.avanco === undefined || v.com === undefined) { $('com-filtros').innerHTML = ''; $('com-resumo').textContent = ''; $('com-corpo').innerHTML = '<div class="hint-txt">' + esc(T('av.carregando')) + '</div>'; return; }
  const todas = linhas(v);
  const r = Com.resumo(todas);
  $('com-filtros').innerHTML = FILTROS.map(function (f) {
    const n = f === 'todos' ? r.total : r[f];
    return '<button type="button" role="tab" aria-selected="' + (aberta.filtro === f) + '" class="' + (aberta.filtro === f ? 'ativa' : '') + '" data-acao="filtroComerciais" data-arg="' + f + '">' +
      esc(T('com.f.' + f)) + '<b>' + n + '</b></button>';
  }).join('');
  let lista = aberta.filtro === 'todos' ? todas : todas.filter(function (l) { return l.situacao === aberta.filtro; });
  const busca = aberta.busca.trim().toLowerCase();
  if (busca) lista = lista.filter(function (l) { return [l.posicao, l.descricao, l.produto, l.sc, l.pc, l.fornecedor].join(' ').toLowerCase().indexOf(busca) >= 0; });
  let total = 0, comValor = 0;
  if (veValor) todas.forEach(function (l) { const x = valorDe(v, l.chave); if (x && isFinite(x.valorTotal)) { total += x.valorTotal; comValor++; } });
  $('com-resumo').textContent = T('com.resumo', r.total, r.completo, r.parcial, r.pendente, r.semPedido) + (veValor && comValor ? ' · ' + T('com.totalPedidos', moeda(total)) : '');
  if (!todas.length) {
    $('com-corpo').innerHTML = '<div class="empty-state">' + esc(T(v.avanco ? 'com.semItens' : 'tec.semPlanilha')) + '</div>';
    return;
  }
  if (!lista.length) { $('com-corpo').innerHTML = '<div class="empty-state">' + esc(T('fab.vazioFiltro')) + '</div>'; return; }
  const cab = ['com.c.pos', 'com.c.descricao', 'com.c.qtd', 'com.c.sc', 'com.c.pc', 'com.c.fornecedor'].concat(veValor ? ['com.c.valorUnit', 'com.c.valorTotal'] : []).concat(['com.c.chegou', 'com.c.situacao']);
  const num = { 'com.c.qtd': 1, 'com.c.valorUnit': 1, 'com.c.valorTotal': 1, 'com.c.chegou': 1 };
  $('com-corpo').innerHTML = '<div class="table-wrap pl-wrap"><table class="ord-tab com-tab"><thead><tr>' +
    cab.map(function (c) { return '<th' + (num[c] ? ' class="num"' : '') + '>' + esc(T(c)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    lista.map(function (l) {
      const x = valorDe(v, l.chave);
      const ultima = l.chegadas.length ? l.chegadas[l.chegadas.length - 1].em : '';
      return '<tr class="ord-linha"' + (mexe ? ' data-acao="abrirItemComercial" data-arg="' + esc(l.chave) + '" tabindex="0" role="button"' : '') + '>' +
        '<td>' + esc(l.posicao || '—') + '</td>' +
        '<td>' + esc(l.descricao || '—') + (l.extra ? ' <span class="pill-mini">' + esc(T('com.extra')) + '</span>' : '') +
          (l.produto ? '<div class="hint-txt mono">' + esc(l.produto) + '</div>' : '') + '</td>' +
        '<td class="num">' + numeroBr(l.qtd) + (l.unidade ? ' <small>' + esc(l.unidade) + '</small>' : '') + '</td>' +
        '<td class="mono">' + esc(l.sc || '—') + '</td><td class="mono">' + esc(l.pc || '—') + '</td><td>' + esc(l.fornecedor || '—') + '</td>' +
        (veValor ? '<td class="num">' + (x ? moeda(x.valorUnit) : '—') + '</td><td class="num">' + (x ? moeda(x.valorTotal) : '—') + '</td>' : '') +
        '<td class="num">' + numeroBr(l.chegou) + (ultima ? '<div class="hint-txt">' + esc(br(ultima)) + '</div>' : '') + '</td>' +
        '<td><span class="pill-com com-' + l.situacao + '">' + esc(T('com.s.' + l.situacao)) + '</span></td></tr>';
    }).join('') + '</tbody></table></div>';
}

/* ---------------------------------------------- item: SC, PC e chegadas */
let edit = null;   // { chave, reg, linha }

function abrirItem(k) {
  if (!vivo) return;
  const p = buscarProjeto(vivo.projetoId);
  if (!cuidaDoProjeto(p)) return;
  const l = linhas(vivo).find(function (x) { return x.chave === k; });
  if (!l) return;
  const reg = JSON.parse(JSON.stringify((vivo.com && vivo.com.itens && vivo.com.itens[k]) || {}));
  reg.chegadas = reg.chegadas || [];
  edit = { chave: k, reg: reg, linha: l };
  $('comi-titulo').textContent = l.descricao || '—';
  $('comi-sub').textContent = [l.posicao ? T('com.c.pos') + ' ' + l.posicao : '', T('com.qtdPlanilha', numeroBr(l.qtd))].filter(Boolean).join(' · ');
  $('comi-sc').value = l.sc || '';
  $('comi-pc').value = l.pc || '';
  $('comi-fornecedor').value = l.fornecedor || '';
  $('comi-qtd').value = String(Math.max(0, l.qtd - l.chegou) || '');
  $('comi-data').value = hoje();
  $('comi-erro').textContent = '';
  $('comi-remover').hidden = !l.extra;
  renderChegadas();
  abrirModal('modal-com-item', { foco: 'comi-qtd', aoFechar: function () { edit = null; } });
}

function renderChegadas() {
  if (!edit) return;
  const total = edit.reg.chegadas.reduce(function (t, c) { return t + (Number(c.qtd) || 0); }, 0);
  $('comi-chegadas').innerHTML = edit.reg.chegadas.length
    ? '<ul class="mov-lista">' + edit.reg.chegadas.map(function (c, i) {
      return '<li><span>' + esc(br(c.em)) + '</span><b>' + numeroBr(c.qtd) + '</b><span class="hint-txt">' + esc(c.porNome || '') + '</span>' +
        '<button type="button" class="btn-x" data-acao="tirarChegada" data-arg="' + i + '" title="' + esc(T('btn.excluir')) + '" aria-label="' + esc(T('btn.excluir')) + '">✕</button></li>';
    }).join('') + '</ul><div class="hint-txt">' + esc(T('com.chegouTotal', numeroBr(total), numeroBr(edit.linha.qtd))) + '</div>'
    : '<div class="hint-txt">' + esc(T('com.semChegada')) + '</div>';
}

function seisDigitos(s) { const d = String(s || '').replace(/\D/g, ''); return d ? d.padStart(6, '0').slice(-6) : ''; }

function salvarItem(_a, _b, btn) {
  if (!edit || !vivo) return;
  const p = buscarProjeto(vivo.projetoId);
  const reg = edit.reg;
  reg.sc = seisDigitos($('comi-sc').value);
  reg.pc = seisDigitos($('comi-pc').value);
  reg.fornecedor = $('comi-fornecedor').value.trim().slice(0, 80);
  const qtd = Number(String($('comi-qtd').value).replace(',', '.'));
  const data = $('comi-data').value;
  const restante = edit.linha.qtd - edit.reg.chegadas.reduce(function (t, c) { return t + (Number(c.qtd) || 0); }, 0);
  if (qtd > 0 && restante > 0) {
    if (!dataValida(data)) { $('comi-erro').textContent = T('com.erroData'); return; }
    reg.chegadas.push({ qtd: qtd, em: data, porNome: String(Auth.nomeExibicao() || '').slice(0, 60), registradoEm: agoraIso() });
  }
  const mud = {}; mud[edit.chave] = reg;
  comBotaoOcupado(btn, DadosCom.gravarItens('comerciais', p, mud).then(function () {
    fecharModal('modal-com-item');
    toast(T('com.salvo'));
  }).catch(function (e) { avisoErro(e); }));
}

function removerExtra(_a, _b, btn) {
  if (!edit || !vivo) return;
  const p = buscarProjeto(vivo.projetoId), k = edit.chave;
  confirmar(T('com.removerQ'), { titulo: T('btn.excluir'), textoOk: T('btn.excluir'), perigo: true }).then(function (ok) {
    if (!ok) return;
    const mud = {}; mud[k] = null;
    comBotaoOcupado(btn, DadosCom.gravarItens('comerciais', p, mud).then(function () {
      return DadosCom.gravarItens('comerciaisValores', p, mud);
    }).then(function () { fecharModal('modal-com-item'); }).catch(function (e) { avisoErro(e); }));
  });
}

/* ------------------------------------------- PDF do pedido de compra */
let ped = null;   // { pedido, linhas: [{ linha, alvo, por }], todas }

function abrirPedido() {
  if (!vivo || !cuidaDoProjeto(buscarProjeto(vivo.projetoId))) return;
  ped = null;
  $('ped-arquivo').value = '';
  $('ped-corpo').innerHTML = '';
  $('ped-erro').textContent = '';
  $('ped-gravar').disabled = true;
  abrirModal('modal-com-pedido', { foco: 'ped-arquivo', aoFechar: function () { ped = null; } });
}

function lerPedidoPdf(ev) {
  const arq = ev && ev.target && ev.target.files && ev.target.files[0];
  ped = null;
  $('ped-erro').textContent = '';
  $('ped-corpo').innerHTML = '';
  $('ped-gravar').disabled = true;
  if (!arq || !vivo) return;
  if (arq.size > 15 * 1024 * 1024) { $('ped-erro').textContent = T('fab.erroGrande'); return; }
  $('ped-corpo').innerHTML = '<div class="hint-txt">' + esc(T('fab.lendo')) + '</div>';
  arq.arrayBuffer().then(function (buf) { return paginasDoPdf(new Uint8Array(buf)); }).then(function (r) {
    const pd = Pedido.lerPedido(r.paginas);
    if (!pd.ok || !pd.itens.length) { $('ped-corpo').innerHTML = ''; $('ped-erro').textContent = T(pd.motivo === 'semTexto' ? 'com.pdfSemTexto' : 'com.pdfNaoPedido'); return; }
    const p = buscarProjeto(vivo.projetoId);
    const daCommessa = pd.itens.filter(function (it) { return mesmaCommessa(it.commessa, p.commessa); });
    const ligacoes = Com.ligarPedido(daCommessa, linhas(vivo).filter(function (l) { return !l.extra; }));
    const porLinha = new Map(ligacoes.map(function (x) { return [x.linha, x]; }));
    ped = {
      pedido: pd, todas: false,
      linhas: pd.itens.map(function (it) {
        const lg = porLinha.get(it);
        return { linha: it, daCommessa: !!lg, alvo: lg ? (lg.chave || '+') : '', por: lg ? lg.por : null };
      })
    };
    renderPedido();
  }).catch(function (e) {
    console.warn(e);
    $('ped-corpo').innerHTML = '';
    $('ped-erro').textContent = T('com.pdfErro');
  });
}

function renderPedido() {
  if (!ped || !vivo) return;
  const pd = ped.pedido, p = buscarProjeto(vivo.projetoId);
  const itens = linhas(vivo);
  const visiveis = ped.linhas.filter(function (x) { return ped.todas || x.daCommessa; });
  const outras = ped.linhas.length - ped.linhas.filter(function (x) { return x.daCommessa; }).length;
  const opcoes = function (alvo) {
    return '<option value="">' + esc(T('com.ped.ignorar')) + '</option><option value="+"' + (alvo === '+' ? ' selected' : '') + '>' + esc(T('com.ped.novo')) + '</option>' +
      itens.map(function (l) {
        return '<option value="' + esc(l.chave) + '"' + (l.chave === alvo ? ' selected' : '') + '>' + esc((l.posicao ? l.posicao + ' — ' : '') + l.descricao + ' (' + numeroBr(l.qtd) + ')') + '</option>';
      }).join('');
  };
  $('ped-corpo').innerHTML =
    '<div class="ped-cab"><div><b>' + esc(T('com.ped.numero', pd.numero)) + '</b> · ' + esc(pd.fornecedor || '—') + '</div>' +
      '<div class="hint-txt">' + esc(T('com.ped.info', pd.emissao || '—', pd.comprador || '—', moeda(pd.total))) + '</div></div>' +
    (outras ? '<label class="ped-todas"><input type="checkbox" data-change="pedidoTodas"' + (ped.todas ? ' checked' : '') + '> ' + esc(T('com.ped.outras', outras, p.commessa)) + '</label>' : '') +
    (!visiveis.length ? '<div class="empty-state">' + esc(T('com.ped.nenhum', p.commessa)) + '</div>' :
    '<div class="table-wrap"><table class="ord-tab ped-tab"><thead><tr><th>' + esc(T('com.c.descricao')) + '</th><th class="num">' + esc(T('com.c.qtd')) + '</th><th class="num">' +
      esc(T('com.c.valorTotal')) + '</th><th>' + esc(T('com.c.sc')) + '</th><th>' + esc(T('com.ped.item')) + '</th></tr></thead><tbody>' +
      visiveis.map(function (x) {
        const i = ped.linhas.indexOf(x), it = x.linha;
        return '<tr><td>' + esc(it.descricao) + '<div class="hint-txt mono">' + esc(it.produto) + (it.commessa && !x.daCommessa ? ' · ' + esc(it.commessa) : '') + '</div></td>' +
          '<td class="num">' + numeroBr(it.qtd) + ' <small>' + esc(it.unidade) + '</small></td><td class="num">' + moeda(it.valorTotal) + '</td><td class="mono">' + esc(it.sc || '—') + '</td>' +
          '<td><select data-change="pedidoAlvo" data-arg2="' + i + '" aria-label="' + esc(T('com.ped.item')) + '">' + opcoes(x.alvo) + '</select>' +
          (x.por ? '<div class="hint-txt ped-por ped-por-' + x.por + '">' + esc(T('com.ped.por.' + x.por)) + '</div>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>');
  $('ped-gravar').disabled = !ped.linhas.some(function (x) { return x.alvo; });
}

function gravarPedido(_a, _b, btn) {
  if (!ped || !vivo) return;
  const p = buscarProjeto(vivo.projetoId), pd = ped.pedido;
  const atuais = (vivo.com && vivo.com.itens) || {};
  const mudCom = {}, mudVal = {};
  const usados = {};
  let n = 0;
  ped.linhas.forEach(function (x) {
    if (!x.alvo) return;
    const it = x.linha;
    let k = x.alvo === '+' ? Com.chaveExtra(it) : x.alvo;
    if (x.alvo === '+') { let s = 2; const base = k; while (usados[k] || (atuais[k] && atuais[k].pc && atuais[k].pc !== pd.numero)) k = base + '-' + (s++); }
    usados[k] = true;
    const atual = mudCom[k] || atuais[k] || {};
    mudCom[k] = Object.assign({}, atual, {
      pc: pd.numero, fornecedor: String(pd.fornecedor || '').slice(0, 80), produtoPc: String(it.produto || '').slice(0, 20),
      descricaoPc: String(it.descricao || '').slice(0, 200), unidade: String(it.unidade || '').slice(0, 6), qtdPedido: Number(it.qtd) || 0,
      sc: it.sc || atual.sc || '', chegadas: atual.chegadas || []
    });
    mudVal[k] = { pc: pd.numero, valorUnit: Number(it.valorUnit) || 0, valorTotal: Number(it.valorTotal) || 0 };
    n++;
  });
  const pedCom = {}, pedVal = {};
  pedCom[pd.numero] = { fornecedor: String(pd.fornecedor || '').slice(0, 80), emissao: pd.emissao || '', comprador: String(pd.comprador || '').slice(0, 60),
    importadoEm: agoraIso(), porNome: String(Auth.nomeExibicao() || '').slice(0, 60), itens: n };
  pedVal[pd.numero] = { total: Number(pd.total) || 0 };
  comBotaoOcupado(btn, DadosCom.gravarItens('comerciais', p, mudCom, pedCom).then(function () {
    return DadosCom.gravarItens('comerciaisValores', p, mudVal, pedVal);
  }).then(function () {
    fecharModal('modal-com-pedido');
    toast(T('com.ped.gravado', pd.numero, n));
  }).catch(function (e) { avisoErro(e); }));
}

/* ------------------------------------------------------------ eventos */
document.addEventListener('input', function (e) {
  if (e.target && e.target.id === 'com-busca' && aberta) { aberta.busca = e.target.value; render(); }
});
document.addEventListener('rostag:planilhaGravada', function (e) {
  if (vivo && vivo.projetoId === e.detail) { vivo.avanco = undefined; lerAvanco(vivo); }
});

registrarAcoes({
  abrirComerciais: abrir,
  filtroComerciais: function (f) { if (aberta && FILTROS.indexOf(f) >= 0) { aberta.filtro = f; render(); } },
  abrirItemComercial: abrirItem,
  tirarChegada: function (i) { if (edit) { edit.reg.chegadas.splice(Number(i), 1); renderChegadas(); } },
  salvarItemComercial: salvarItem,
  removerItemComercial: removerExtra,
  abrirPedidoPdf: abrirPedido,
  lerPedidoPdf: lerPedidoPdf,
  pedidoTodas: function (_v, _b, el) { if (ped) { ped.todas = !!el.checked; renderPedido(); } },
  pedidoAlvo: function (v, i) { if (ped && ped.linhas[Number(i)]) { ped.linhas[Number(i)].alvo = v; ped.linhas[Number(i)].por = null; renderPedido(); } },
  gravarPedido: gravarPedido
});

