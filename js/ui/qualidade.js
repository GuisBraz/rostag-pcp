/* ---------------------------------------------------------------------------
   Controle de qualidade — "dar baixa" na OP (aprovar ou abrir RNC), a RNC
   em tela simples (abertura, disposição, seguimento), o PDF na folha SOFIR
   R02 e a aba RNC por situação.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto } from '../estado.js';
import { esc, hoje, br, dataHora } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Rnc from '../dominio/rnc.js';
import * as Papeis from '../dominio/papeis.js';
import { statusOp } from '../dominio/producao.js';
import * as Auth from '../dados/auth.js';
import * as Ops from '../dados/ops.js';
import * as Rncs from '../dados/rncs.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal, confirmar } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';
import { baixarPdf } from './rncPdf.js';

function opPorId(id) { return estado.ops.find(function (o) { return o.id === id; }) || null; }
function rncPorId(id) { return (estado.rncs || []).find(function (r) { return r.id === id; }) || null; }
function descricaoOp(o) { return T('cq.opDesc', o.numero, T('area.' + o.area), o.commessa, o.desenho, o.posicao || '—'); }
export function rncsDaOp(opId) {
  return (estado.rncs || []).filter(function (r) { return r.opId === opId; })
    .sort(function (a, b) { return String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')); });
}

/* ------------------------------------------------------------ dar baixa */
let baixaOp = null;
export function abrirBaixa(id) {
  const o = opPorId(id);
  if (!o || !Auth.souCQ()) return;
  baixaOp = o;
  const st = statusOp(o);
  const rncs = rncsDaOp(o.id);
  $('baixa-op').textContent = descricaoOp(o);
  $('baixa-info').innerHTML =
    '<div><b>' + esc(o.descricao || '—') + '</b></div>' +
    '<div class="hint-txt">' + esc(T('baixa.info', o.qtd == null ? '—' : o.qtd, o.rev || '—', o.cliente || '—')) + '</div>' +
    (st === 'retrabalho' ? '<div class="baixa-retrabalho">' + esc(T('baixa.emRetrabalho', o.rncNumero || '—')) + '</div>' : '') +
    (rncs.length ? '<div class="hint-txt">' + esc(T('baixa.historico', rncs.map(function (r) { return r.numero; }).join(', '))) + '</div>' : '');
  const atual = o.rncAtualId && rncPorId(o.rncAtualId);
  let botoes;
  if (st === 'retrabalho') {
    botoes = (atual ? '<button type="button" class="btn btn-primary" data-acao="cqReinspecionar">' + esc(T('baixa.reinspecionar')) + '</button>' : '') +
      (!atual || atual.situacao === 'encerrada' ? '<button type="button" class="btn btn-danger" data-acao="cqNovaRnc">' + esc(T('baixa.novaRnc')) + '</button>' : '');
  } else {
    botoes = '<button type="button" class="btn btn-success" data-acao="cqAprovar">' + esc(T('cq.aprovar')) + '</button>' +
      '<button type="button" class="btn btn-danger" data-acao="cqNovaRnc">' + esc(T('baixa.abrirRnc')) + '</button>';
  }
  $('baixa-botoes').innerHTML = botoes;
  abrirModal('modal-baixa', { aoFechar: function () { baixaOp = null; } });
}

// CQ deu baixa: o programador da área é avisado de que pode finalizar a OP.
function avisarProgramador(o) {
  Auth.uidsPorPapel(['prog_' + o.area]).then(function (uids) {
    Auth.notificarVarios(uids, 'opAprovada', T('notif.opAprovada', o.numero, o.commessa, o.descricao || o.desenho), o.projetoId);
  });
}

function cqAprovar() { if (baixaOp) aprovarOp(baixaOp); }
function aprovarOp(o) {
  confirmar(T('cq.aprovarConfirm', descricaoOp(o)), { titulo: T('cq.aprovar'), textoOk: T('baixa.simAprovar') }).then(function (ok) {
    if (!ok) return;
    fecharModal('modal-baixa');
    Ops.aprovar(o.id).then(function () { toast(T('cq.aprovada', o.numero)); avisarProgramador(o); })
      .catch(function (e) { avisoErro(e, 'cq.erro'); });
  });
}

/* ------------------------------------------------------ janela da RNC */
// Tela simples (o PDF continua na folha SOFIR R02):
//  'nova'       CQ abre: observação, qtd não conforme e procedência
//  'disposicao' GP, técnico ou Gerência (um deles) escreve a disposição
//  'cq'         CQ dá seguimento: conforme · desvio · não conforme · OP nova
//  'ver'        só leitura
let janela = null;   // { modo, op, rnc }

// Quem dá a disposição: Gerência, o GP e o técnico do projeto (um deles), com a RNC esperando.
function podeDispor(r) {
  if (Rnc.etapa(r) !== 'disposicao') return false;
  const papel = Auth.papel(), eu = Auth.uid();
  return Auth.souGerente() || (papel === 'gp' && r.gpUid === eu) || (papel === 'tecnico' && r.tecnicoUid === eu);
}
function modoPara(r) {
  if (podeDispor(r)) return 'disposicao';
  if (Auth.souCQ() && Rnc.etapa(r) === 'cq') return 'cq';
  return 'ver';
}

function linhaInfo(rotulo, valor) { return '<div><span>' + esc(rotulo) + '</span><b>' + esc(valor == null || valor === '' ? '—' : valor) + '</b></div>'; }
function resumoPeca(d) {
  const setor = Rnc.SETORES.filter(function (k) { return d.setor && d.setor[k]; }).map(function (k) { return T('rf.setor.' + k); }).join(', ');
  return '<div class="rnc-resumo">' +
    linhaInfo(T('rn.op'), d.op) + linhaInfo(T('rn.commessa'), d.commessa) + linhaInfo(T('rn.desenho'), d.desenho + (d.rev ? ' rev. ' + d.rev : '')) +
    linhaInfo(T('rn.posicao'), d.item) + linhaInfo(T('rn.qtd'), d.qtd) + linhaInfo(T('rn.setor'), setor) +
    '<div class="rnc-resumo-peca"><span>' + esc(T('rn.peca')) + '</span><b>' + esc(d.produto || '—') + '</b></div></div>';
}
function blocoCq(r) {
  return '<div class="rnc-bloco"><div class="sub-titulo">' + esc(T('rn.obsCq')) + '</div>' +
    '<div class="rnc-texto">' + esc(r.descricao || '—') + '</div>' +
    '<div class="hint-txt">' + esc(T('rn.obsCqInfo', r.inspetor || '—', br(r.data), r.qtdNc || '—', r.qtd || '—', r.procedencia ? T('rn.proc.' + r.procedencia) : '—')) + '</div></div>';
}
function blocoDisposicao(r) {
  if (!String(r.disposicao || '').trim()) return '<div class="rnc-bloco"><div class="sub-titulo">' + esc(T('rn.disposicao')) + '</div><div class="hint-txt">' + esc(T('rn.semDisposicao')) + '</div></div>';
  return '<div class="rnc-bloco"><div class="sub-titulo">' + esc(T('rn.disposicao')) + '</div><div class="rnc-texto">' + esc(r.disposicao) + '</div>' +
    '<div class="hint-txt">' + esc(T('rn.dispInfo', r.dispResponsavel || '—', br(r.dispData))) + '</div></div>';
}
function blocoSeguimento(r, op) {
  if (r.situacao !== 'encerrada') return '';
  const morta = op && statusOp(op) === 'morta';
  return '<div class="rnc-bloco"><div class="sub-titulo">' + esc(T('rn.seguimento')) + '</div>' +
    '<div><b>' + esc(r.reOp ? T('rn.esc.novaOp') + ' ' + r.reOp : T('rf.res.' + (r.reResultado || 'nao_conforme'))) + '</b></div>' +
    (morta ? '<div class="hint-txt">' + esc(T('rnc.morta', op.opNovaNumero || r.reOp || '—')) + '</div>' : '') +
    (r.observacoes ? '<div class="rnc-texto">' + esc(r.observacoes) + '</div>' : '') +
    '<div class="hint-txt">' + esc(T('rn.segInfo', r.reInspetor || '—', br(r.reData))) + '</div></div>';
}

function abrirJanela(modo, op, rnc) {
  janela = { modo: modo, op: op, rnc: rnc };
  const base = rnc || Rnc.rascunho(op, hoje(), Auth.nomeExibicao());
  const etapaAtual = rnc ? Rnc.etapa(rnc) : null;
  $('rnc-titulo').textContent = modo === 'nova' ? T('rn.tituloNova') : T('rn.titulo', rnc.numero);
  $('rnc-sub').innerHTML = modo === 'nova' ? esc(descricaoOp(op))
    : '<span class="pill-rnc rnc-etapa-' + etapaAtual + '">' + esc(T('rn.etapa.' + etapaAtual)) + '</span>';
  $('rnc-pdf').hidden = modo === 'nova';
  $('rnc-erro').textContent = '';
  let corpo = resumoPeca(base), rodape = '';
  if (modo === 'nova') {
    corpo +=
      '<div class="campos-3">' +
        '<div class="field"><label for="rn-numero">' + esc(T('rn.numero')) + '</label><input id="rn-numero" class="mono" maxlength="30" value="' + esc(Rnc.proximoNumero(estado.rncs)) + '"></div>' +
        '<div class="field"><label for="rn-qtdNc">' + esc(T('rn.qtdNc', op.qtd == null ? '—' : op.qtd)) + '</label><input id="rn-qtdNc" type="number" min="1" step="1"' + (op.qtd ? ' max="' + esc(op.qtd) + '"' : '') + ' value="' + esc(op.qtd || '') + '"></div>' +
        '<div class="field"><span class="label-campo">' + esc(T('rn.procedencia')) + '</span><div class="rn-escolha">' +
          ['interno', 'externo'].map(function (k) { return '<label><input type="radio" name="rn-proc" value="' + k + '"' + (k === 'interno' ? ' checked' : '') + '> ' + esc(T('rn.proc.' + k)) + '</label>'; }).join('') +
        '</div></div>' +
      '</div>' +
      '<div class="field"><label for="rn-descricao">' + esc(T('rn.obsCq')) + '</label><textarea id="rn-descricao" rows="5" maxlength="3000" placeholder="' + esc(T('rn.obsPh')) + '"></textarea></div>' +
      '<div class="hint-txt">' + esc(T('rn.notaNova', Auth.nomeExibicao() || '—', br(hoje()))) + '</div>';
    rodape = '<button type="button" class="btn btn-danger" data-acao="salvarRnc">' + esc(T('rn.abrir')) + '</button>';
  } else if (modo === 'disposicao') {
    corpo += blocoCq(rnc) +
      '<div class="field"><label for="rn-disposicao">' + esc(T('rn.suaDisposicao')) + '</label><textarea id="rn-disposicao" rows="5" maxlength="3000" placeholder="' + esc(T('rn.dispPh')) + '"></textarea></div>' +
      '<div class="hint-txt">' + esc(T('rn.notaDisposicao', Auth.nomeExibicao() || '—')) + '</div>';
    rodape = '<button type="button" class="btn btn-primary" data-acao="salvarRnc">' + esc(T('rf.salvarDisposicao')) + '</button>';
  } else if (modo === 'cq') {
    corpo += blocoCq(rnc) + blocoDisposicao(rnc) +
      '<div class="rnc-bloco"><div class="sub-titulo">' + esc(T('rn.seguimento')) + '</div><div class="rn-opcoes">' +
        ['conforme', 'desvio', 'nao_conforme', 'novaOp'].map(function (k) {
          return '<label class="rn-opcao"><input type="radio" name="rn-seg" value="' + k + '" data-change="escolhaSeguimento"> <span><b>' + esc(T('rn.esc.' + k)) + '</b><small>' + esc(T('rn.escDet.' + k)) + '</small></span></label>';
        }).join('') + '</div>' +
        '<div class="field" id="rn-reop-campo" hidden><label for="rn-reOp">' + esc(T('rn.reOp')) + '</label><input id="rn-reOp" class="mono" maxlength="40"></div>' +
        '<div class="field"><label for="rn-observacoes">' + esc(T('rn.obsSeguimento')) + '</label><textarea id="rn-observacoes" rows="3" maxlength="6000"></textarea></div></div>';
    rodape = '<button type="button" class="btn btn-primary" data-acao="salvarRnc">' + esc(T('rn.concluir')) + '</button>';
  } else {
    corpo += blocoCq(rnc) + blocoDisposicao(rnc) + blocoSeguimento(rnc, op);
    if (etapaAtual === 'disposicao') corpo += '<div class="hint-txt">' + esc(T('rn.esperandoDisp')) + '</div>';
    else if (etapaAtual === 'cq' && !Auth.souCQ()) corpo += '<div class="hint-txt">' + esc(T('rn.esperandoCq')) + '</div>';
  }
  $('rnc-corpo').innerHTML = corpo;
  $('rnc-rodape').innerHTML = '<button type="button" class="btn btn-outline" data-acao="fecharModal" data-arg="modal-rnc">' + esc(T(modo === 'ver' ? 'btn.fechar' : 'btn.cancelar')) + '</button>' + rodape;
  fecharModal('modal-baixa');
  const foco = { nova: 'rn-descricao', disposicao: 'rn-disposicao' }[modo];
  abrirModal('modal-rnc', { foco: foco, aoFechar: function () { janela = null; } });
}

function cqNovaRnc() { if (baixaOp) abrirJanela('nova', baixaOp, null); }
function cqReinspecionar() {
  if (!baixaOp) return;
  const rnc = rncPorId(baixaOp.rncAtualId);
  if (rnc) abrirJanela(modoPara(rnc), baixaOp, rnc);
}

function erro(msg, campo) { $('rnc-erro').textContent = msg; if (campo && $(campo)) { $(campo).classList.add('invalid'); $(campo).focus(); } }

function salvarRnc(_a, _b, btn) {
  if (!janela) return;
  if (janela.modo === 'nova') return salvarNova(btn);
  if (janela.modo === 'disposicao') return salvarDisposicao(btn);
  if (janela.modo === 'cq') return salvarSeguimento(btn);
}

function salvarNova(btn) {
  const op = janela.op;
  const proc = document.querySelector('input[name="rn-proc"]:checked');
  const dados = Rnc.abertura(op, { descricao: $('rn-descricao').value, qtdNc: $('rn-qtdNc').value, procedencia: proc ? proc.value : '' },
    hoje(), Auth.nomeExibicao(), $('rn-numero').value);
  const v = Rnc.validar(dados, op.qtd);
  if (!v.ok) return erro(T('rf.faltou', v.faltando.map(function (k) { return T('rf.campo.' + k); }).join(', ')), 'rn-' + (v.faltando[0] || 'descricao'));
  const repetido = (estado.rncs || []).some(function (r) { return String(r.numero).trim().toLowerCase() === dados.numero.toLowerCase(); });
  if (repetido) return erro(T('rf.numeroRepetido', dados.numero), 'rn-numero');
  comBotaoOcupado(btn, Rncs.abrir(op, dados).then(function () {
    fecharModal('modal-rnc');
    toast(T('cq.rncGravada', op.numero), { tipo: 'erro' });
    // vai para a Gerência, o GP e o técnico do projeto darem a disposição
    return Auth.uidsGerentes().then(function (gerentes) {
      return Auth.notificarVarios(gerentes.concat([op.gpUid, op.tecnicoUid]), 'rnc',
        T('notif.rncNova', dados.numero, op.numero, op.commessa, op.desenho, dados.descricao.slice(0, 200)), op.projetoId);
    });
  }).catch(function (e) { avisoErro(e, 'cq.erro'); }));
}

// Gerência, GP ou técnico grava a disposição; a RNC sai da lista deles e volta para o CQ.
function salvarDisposicao(btn) {
  const r = janela.rnc;
  const texto = $('rn-disposicao').value.trim();
  if (!texto) return erro(T('rf.faltou', T('rf.campo.disposicao')), 'rn-disposicao');
  const dados = { disposicao: texto, dispResponsavel: Auth.nomeExibicao() || '', dispData: hoje() };
  comBotaoOcupado(btn, Rncs.salvarDisposicao(r, dados).then(function () {
    fecharModal('modal-rnc');
    toast(T('rf.disposicaoSalva', r.numero));
    return Auth.uidsPorPapel(['cq']).then(function (cq) {
      return Auth.notificarVarios(cq, 'rnc', T('notif.rncDisposicao', r.numero, r.op || '', r.commessa || '', Auth.nomeExibicao() || '', texto.slice(0, 200)), r.projetoId);
    }).catch(function (e) { console.warn('CQ não avisado:', e); });
  }).catch(function (e) {
    // outro já deu a disposição (as regras só aceitam a primeira)
    if (e && e.code === 'permission-denied' && Rnc.etapa(rncPorId(r.id)) !== 'disposicao') { fecharModal('modal-rnc'); toast(T('rn.jaTinha', r.numero)); return; }
    avisoErro(e, 'cq.erro');
  }));
}

// CQ dá seguimento na peça: o mesmo efeito da reinspeção de antes.
function salvarSeguimento(btn) {
  const r = janela.rnc, op = janela.op || opPorId(r.opId);
  const marcado = document.querySelector('input[name="rn-seg"]:checked');
  if (!marcado) return erro(T('rn.escolha'));
  const reOp = marcado.value === 'novaOp' ? $('rn-reOp').value.trim() : '';
  if (marcado.value === 'novaOp' && !reOp) return erro(T('rn.faltaReOp'), 'rn-reOp');
  const dados = Rnc.seguimento(r, marcado.value, reOp, Auth.nomeExibicao(), hoje(), $('rn-observacoes').value.trim());
  const efeito = Rnc.efeitoReinspecao(dados);
  const ativa = op && op.rncAtualId === r.id;
  const seguir = ativa ? confirmar(T('rf.confirmar.' + (efeito.opStatus === 'morta' ? 'morta' : efeito.opStatus), op.numero, reOp), { titulo: T('rn.seguimento'), textoOk: T('rn.concluir') }) : Promise.resolve(true);
  seguir.then(function (ok) {
    if (!ok) return;
    comBotaoOcupado(btn, Rncs.salvar(r, dados, op).then(function (res) {
      fecharModal('modal-rnc');
      toast(res.efeito ? T('rf.resultado.' + res.efeito.opStatus, op.numero, reOp) : T('rf.salva', r.numero));
      if (res.efeito && (res.efeito.opStatus === 'aprovada' || res.efeito.opStatus === 'desvio')) avisarProgramador(op);
    }).catch(function (e) { avisoErro(e, 'cq.erro'); }));
  });
}

function baixarPdfRnc(_a, _b, btn) {
  if (!janela || !janela.rnc) return;
  const r = rncPorId(janela.rnc.id) || janela.rnc;
  comBotaoOcupado(btn, baixarPdf(r).then(function (nome) { toast(T('rf.pdfBaixado', nome)); })
    .catch(function (e) { avisoErro(e, 'rf.pdfErro'); }));
}

/* ----------------------------------------------------------- aba RNC */
const COR_RES = { conforme: 'green', desvio: 'amber', nao_conforme: 'rust', retrabalho: 'rust' };
const FILTROS_RNC = ['disposicao', 'cq', 'encerrada', 'todas'];
let filtroRnc = null;   // null = o padrão do cargo
function filtroPadrao() { return Auth.souCQ() ? 'cq' : (Papeis.veRnc(Auth.papel()) ? 'disposicao' : 'todas'); }

// RNC que espera por mim: a disposição (Gerência, GP, técnico) ou o seguimento (CQ).
export function rncsEsperandoMim() {
  return (estado.rncs || []).filter(function (r) { return podeDispor(r) || (Auth.souCQ() && Rnc.etapa(r) === 'cq'); }).length;
}

export function renderRnc() {
  const f = filtroRnc || filtroPadrao();
  const todas = (estado.rncs || []).slice().sort(function (a, b) { return String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')); });
  const conta = { todas: todas.length, disposicao: 0, cq: 0, encerrada: 0 };
  todas.forEach(function (r) { conta[Rnc.etapa(r)]++; });
  $('rnc-filtros').innerHTML = FILTROS_RNC.map(function (k) {
    return '<button type="button" role="tab" aria-selected="' + (f === k) + '" class="' + (f === k ? 'ativa' : '') + '" data-acao="filtroRnc" data-arg="' + k + '">' +
      esc(T('rn.f.' + k)) + '<b>' + conta[k] + '</b></button>';
  }).join('');
  $('rnc-count').textContent = T('rnc.contagemNova', todas.length, conta.disposicao + conta.cq);
  const lista = f === 'todas' ? todas : todas.filter(function (r) { return Rnc.etapa(r) === f; });
  $('rnc-lista').innerHTML = lista.length ? lista.map(function (r) {
    const et = Rnc.etapa(r), minha = podeDispor(r) || (Auth.souCQ() && et === 'cq');
    const res = r.situacao === 'encerrada' ? '<span class="pill-op op-res-' + (COR_RES[r.reOp ? 'retrabalho' : r.reResultado] || 'rust') + '">' +
      esc(r.reOp ? T('rn.esc.novaOp') : T('rf.res.' + (r.reResultado || 'nao_conforme'))) + '</span>' : '';
    return '<div class="card rnc-card rnc-clicavel' + (et === 'encerrada' ? ' rnc-encerrada' : '') + (minha ? ' rnc-minha' : '') + '" data-acao="verRnc" data-arg="' + esc(r.id) + '" role="button" tabindex="0">' +
      '<div class="rnc-topo"><span class="mono rnc-op">RNC ' + esc(r.numero) + '</span>' +
        '<span class="pill-area area-' + esc(r.area) + '">' + esc(T('area.' + r.area)) + '</span>' +
        '<span class="pill-rnc rnc-etapa-' + et + '">' + esc(T('rn.etapa.' + et)) + '</span>' + res + '</div>' +
      '<div class="rnc-peca"><b class="mono">' + esc(r.commessa) + '</b> · OP ' + esc(r.op) + ' · ' + esc(T('rnc.peca', r.desenho, r.item || '—')) +
        (r.produto ? ' · ' + esc(r.produto) : '') + ' · ' + esc(T('rn.qtdCurta', r.qtdNc || '—', r.qtd || '—')) + '</div>' +
      '<div class="rnc-obs">' + esc(r.descricao || '—') + '</div>' +
      (r.disposicao ? '<div class="hint-txt"><b>' + esc(T('rf.disposicaoCurta')) + '</b> ' + esc(r.disposicao) + (r.dispResponsavel ? ' — ' + esc(r.dispResponsavel) : '') + '</div>' : '') +
      '<div class="hint-txt">' + esc(T('rnc.registradaPor', r.inspetor || r.criadoPorNome || '—', dataHora(r.criadoEm))) + '</div>' +
      (minha ? '<div class="rnc-chamada">' + esc(T(et === 'cq' ? 'rn.chamadaCq' : 'rn.chamadaDisp')) + ' →</div>' : '') +
      '</div>';
  }).join('') : '<div class="card panel-pad empty-state">' + esc(T(todas.length ? 'rn.vazioFiltro' : 'rnc.vazio')) + '</div>';
}

function verRnc(id) {
  const r = rncPorId(id);
  if (!r) return;
  abrirJanela(modoPara(r), opPorId(r.opId), r);
}

registrarAcoes({
  abrirBaixa: abrirBaixa,
  cqAprovar: cqAprovar,
  // pelo detalhe da OP em tela cheia (Fábrica do CQ)
  cqAprovarOp: function (id) { const o = opPorId(id); if (o && Auth.souCQ() && statusOp(o) === 'aberta') aprovarOp(o); },
  cqNovaRncOp: function (id) { const o = opPorId(id); if (o && Auth.souCQ() && statusOp(o) === 'aberta') abrirJanela('nova', o, null); },
  cqNovaRnc: cqNovaRnc,
  cqReinspecionar: cqReinspecionar,
  salvarRnc: salvarRnc,
  baixarPdfRnc: baixarPdfRnc,
  verRnc: verRnc,
  filtroRnc: function (k) { if (FILTROS_RNC.indexOf(k) >= 0) { filtroRnc = k; renderRnc(); } },
  escolhaSeguimento: function () {
    const m = document.querySelector('input[name="rn-seg"]:checked');
    $('rn-reop-campo').hidden = !m || m.value !== 'novaOp';
    if (m && m.value === 'novaOp') $('rn-reOp').focus();
  },
  verRncDaOp: function (opId) {
    const o = opPorId(opId);
    const r = o && (rncPorId(o.rncAtualId) || rncsDaOp(o.id).pop());
    if (r) abrirJanela(modoPara(r), o, r);
  }
});
