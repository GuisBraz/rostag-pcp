/* ---------------------------------------------------------------------------
   Controle de qualidade — "dar baixa" na OP (aprovar ou abrir RNC), o
   formulário da RNC em tela cheia (R02), a reinspeção, o PDF e a aba RNC.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto } from '../estado.js';
import { esc, br, hoje, dataDoInstante, horaDoInstante } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Rnc from '../dominio/rnc.js';
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
function quando(iso) { return iso ? br(dataDoInstante(iso)) + ' ' + horaDoInstante(iso) : '—'; }
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

function cqAprovar() {
  const o = baixaOp;
  if (!o) return;
  confirmar(T('cq.aprovarConfirm', descricaoOp(o)), { titulo: T('cq.aprovar'), textoOk: T('baixa.simAprovar') }).then(function (ok) {
    if (!ok) return;
    fecharModal('modal-baixa');
    Ops.aprovar(o.id).then(function () { toast(T('cq.aprovada', o.numero)); })
      .catch(function (e) { avisoErro(e, 'cq.erro'); });
  });
}

/* --------------------------------------------------- formulário da RNC */
// modo: 'nova' (CQ abrindo) · 'editar' (CQ: disposição, reinspeção...) · 'ver' (só leitura)
let form = null;   // { modo, op, rnc }

const CAMPOS_TEXTO = ['numero', 'produto', 'desenho', 'rev', 'commessa', 'op', 'qtd', 'tag', 'item', 'setorOutros',
  'inspetor', 'qtdNc', 'dispResponsavel', 'reOp', 'reInspetor', 'reResponsavel'];
const CAMPOS_AREA = ['descricao', 'disposicao', 'observacoes'];
const CAMPOS_DATA = ['data', 'dispData', 'reData'];

function preencher(r, somenteLeitura) {
  CAMPOS_TEXTO.concat(CAMPOS_AREA).concat(CAMPOS_DATA).forEach(function (k) {
    const el = $('rf-' + k);
    el.value = r[k] == null ? '' : r[k];
    el.disabled = somenteLeitura;
    el.classList.remove('invalid');
    if (Rnc.LIMITES[k]) el.maxLength = Rnc.LIMITES[k];
  });
  Rnc.SETORES.forEach(function (k) { const el = $('rf-setor-' + k); el.checked = !!(r.setor && r.setor[k]); el.disabled = somenteLeitura; });
  ['interno', 'externo'].forEach(function (k) { const el = $('rf-proc-' + k); el.checked = r.procedencia === k; el.disabled = somenteLeitura; });
  Rnc.RESULTADOS.forEach(function (k) { const el = $('rf-res-' + k); el.checked = r.reResultado === k; el.disabled = somenteLeitura; });
}

function coletar() {
  const r = {};
  CAMPOS_TEXTO.concat(CAMPOS_AREA).concat(CAMPOS_DATA).forEach(function (k) { r[k] = $('rf-' + k).value.trim(); });
  r.setor = {};
  Rnc.SETORES.forEach(function (k) { r.setor[k] = $('rf-setor-' + k).checked; });
  r.procedencia = $('rf-proc-interno').checked ? 'interno' : ($('rf-proc-externo').checked ? 'externo' : '');
  r.reResultado = '';
  Rnc.RESULTADOS.forEach(function (k) { if ($('rf-res-' + k).checked) r.reResultado = k; });
  return r;
}

export function abrirFormRnc(modo, op, rnc) {
  form = { modo: modo, op: op, rnc: rnc };
  const base = rnc || Rnc.rascunho(op, hoje(), Auth.nomeExibicao());
  if (modo === 'nova') base.numero = base.numero || Rnc.proximoNumero(estado.rncs);
  preencher(base, modo === 'ver');
  $('rnc-form-titulo').textContent = T(modo === 'nova' ? 'rf.tituloNova' : (modo === 'ver' ? 'rf.tituloVer' : 'rf.tituloEditar'), base.numero || '');
  $('rnc-form-sub').textContent = op ? descricaoOp(op) : (rnc ? T('cq.opDesc', rnc.op, T('area.' + rnc.area), rnc.commessa, rnc.desenho, rnc.item || '—') : '');
  $('rnc-form-erro').textContent = '';
  $('rnc-form-nota').textContent = modo === 'nova' ? T('rf.notaNova') : (modo === 'editar' ? T('rf.notaEditar') : '');
  $('rnc-form-salvar').style.display = modo === 'ver' ? 'none' : '';
  $('rnc-form-salvar').textContent = T(modo === 'nova' ? 'rf.salvarNova' : 'rf.salvar');
  // a reinspeção só faz sentido depois da RNC aberta
  document.getElementById('rnc-form').classList.toggle('rnc-sem-reinspecao', modo === 'nova');
  fecharModal('modal-baixa');
  abrirModal('modal-rnc-form', { foco: modo === 'editar' ? 'rf-disposicao' : 'rf-descricao', aoFechar: function () { form = null; } });
}

function cqNovaRnc() { if (baixaOp) abrirFormRnc('nova', baixaOp, null); }
function cqReinspecionar() {
  if (!baixaOp) return;
  const rnc = rncPorId(baixaOp.rncAtualId);
  if (rnc) abrirFormRnc('editar', baixaOp, rnc);
}

function salvarFormRnc(_a, _b, btn) {
  if (!form || form.modo === 'ver') return;
  const dados = coletar();
  const v = Rnc.validar(dados);
  ['numero', 'descricao', 'inspetor', 'reInspetor', 'reData'].forEach(function (k) { $('rf-' + k).classList.toggle('invalid', v.faltando.indexOf(k) >= 0); });
  if (!v.ok) {
    $('rnc-form-erro').textContent = v.faltando.length ? T('rf.faltou', v.faltando.map(function (k) { return T('rf.campo.' + k); }).join(', ')) : T('fm.errLongo');
    const primeiro = v.faltando[0] && $('rf-' + v.faltando[0]);
    if (primeiro) primeiro.focus();
    return;
  }
  const op = form.op || (form.rnc && opPorId(form.rnc.opId));
  if (form.modo === 'nova') {
    if (!op) return;
    const repetido = (estado.rncs || []).some(function (r) { return String(r.numero).trim().toLowerCase() === dados.numero.trim().toLowerCase(); });
    if (repetido) { $('rnc-form-erro').textContent = T('rf.numeroRepetido', dados.numero); $('rf-numero').classList.add('invalid'); return; }
    comBotaoOcupado(btn, Rncs.abrir(op, dados).then(function () {
      fecharModal('modal-rnc-form');
      toast(T('cq.rncGravada', op.numero), { tipo: 'erro' });
      // notificação 8: Gerência, GP e técnico do projeto
      return Auth.uidsGerentes().then(function (gerentes) {
        return Auth.notificarVarios(gerentes.concat([op.gpUid, op.tecnicoUid]), 'rnc',
          T('notif.rncNova', dados.numero, op.numero, op.commessa, op.desenho, dados.descricao.slice(0, 200)), op.projetoId);
      });
    }).catch(function (e) { avisoErro(e, 'cq.erro'); }));
    return;
  }
  const efeitoPrev = Rnc.efeitoReinspecao(dados);
  const pergunta = op && op.rncAtualId === form.rnc.id && efeitoPrev.encerra
    ? T('rf.confirmar.' + (efeitoPrev.opStatus === 'morta' ? 'morta' : efeitoPrev.opStatus), op.numero, dados.reOp) : null;
  const seguir = pergunta ? confirmar(pergunta, { titulo: T('rf.reinspecao'), textoOk: T('rf.salvar') }) : Promise.resolve(true);
  seguir.then(function (ok) {
    if (!ok) return;
    comBotaoOcupado(btn, Rncs.salvar(form.rnc, dados, op).then(function (r) {
      fecharModal('modal-rnc-form');
      toast(r.efeito && r.efeito.encerra ? T('rf.resultado.' + r.efeito.opStatus, op.numero, dados.reOp) : T('rf.salva', dados.numero));
    }).catch(function (e) { avisoErro(e, 'cq.erro'); }));
  });
}

function baixarPdfRnc(_a, _b, btn) {
  if (!form) return;
  const dados = form.modo === 'ver' ? Object.assign({}, form.rnc) : coletar();
  comBotaoOcupado(btn, baixarPdf(dados).then(function (nome) { toast(T('rf.pdfBaixado', nome)); })
    .catch(function (e) { avisoErro(e, 'rf.pdfErro'); }));
}

// Só uma opção de resultado por vez (os quadradinhos do papel viram escolha única).
document.addEventListener('change', function (e) {
  const el = e.target;
  if (!el || !el.id || el.id.indexOf('rf-res-') !== 0 || !el.checked) return;
  Rnc.RESULTADOS.forEach(function (k) { if ('rf-res-' + k !== el.id) $('rf-res-' + k).checked = false; });
});
document.addEventListener('change', function (e) {
  const el = e.target;
  if (!el || !el.id || el.id.indexOf('rf-proc-') !== 0 || !el.checked) return;
  ['interno', 'externo'].forEach(function (k) { if ('rf-proc-' + k !== el.id) $('rf-proc-' + k).checked = false; });
});

/* ----------------------------------------------------------- aba RNC */
const COR_RES = { conforme: 'green', desvio: 'amber', nao_conforme: 'rust', retrabalho: 'rust' };
export function renderRnc() {
  const lista = (estado.rncs || []).slice().sort(function (a, b) { return String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')); });
  const abertas = lista.filter(function (r) { return r.situacao !== 'encerrada'; }).length;
  $('rnc-count').textContent = T('rnc.contagemNova', lista.length, abertas);
  $('rnc-lista').innerHTML = lista.length ? lista.map(function (r) {
    const op = opPorId(r.opId);
    const st = op ? statusOp(op) : null;
    const res = r.reResultado ? '<span class="pill-op op-res-' + (COR_RES[r.reResultado] || 'rust') + '">' + esc(T('rf.res.' + r.reResultado)) + '</span>' : '';
    return '<div class="card rnc-card' + (r.situacao === 'encerrada' ? ' rnc-encerrada' : '') + '">' +
      '<div class="rnc-topo"><span class="mono rnc-op">RNC ' + esc(r.numero) + '</span>' +
        '<span class="pill-area area-' + esc(r.area) + '">' + esc(T('area.' + r.area)) + '</span>' + res +
        '<span class="rnc-aguarda">' + esc(T(r.situacao === 'encerrada' ? 'rnc.encerrada' : 'rnc.aguardando')) + '</span></div>' +
      '<div class="rnc-peca"><b class="mono">' + esc(r.commessa) + '</b> · OP ' + esc(r.op) + ' · ' + esc(T('rnc.peca', r.desenho, r.item || '—')) +
        (r.produto ? ' · ' + esc(r.produto) : '') + '</div>' +
      '<div class="rnc-obs">' + esc(r.descricao || '—') + '</div>' +
      (r.disposicao ? '<div class="hint-txt"><b>' + esc(T('rf.disposicaoCurta')) + '</b> ' + esc(r.disposicao) + '</div>' : '') +
      (op && st === 'morta' ? '<div class="hint-txt">' + esc(T('rnc.morta', op.opNovaNumero || '—')) + '</div>' : '') +
      '<div class="hint-txt">' + esc(T('rnc.registradaPor', r.inspetor || r.criadoPorNome || '—', quando(r.criadoEm))) + '</div>' +
      '<div class="rnc-acoes"><button type="button" class="btn btn-outline btn-mini" data-acao="verRnc" data-arg="' + esc(r.id) + '">' + esc(T('rnc.verFormulario')) + '</button>' +
        '<button type="button" class="btn btn-outline btn-mini" data-acao="pdfRncDireto" data-arg="' + esc(r.id) + '">' + esc(T('rf.pdf')) + '</button>' +
        (buscarProjeto(r.projetoId) ? '<button type="button" class="link-btn" data-acao="irPara" data-arg="projetos" data-arg2="' + esc(r.projetoId) + '">' + esc(T('rnc.verProjeto')) + '</button>' : '') +
      '</div></div>';
  }).join('') : '<div class="card panel-pad empty-state">' + esc(T('rnc.vazio')) + '</div>';
}

function verRnc(id) {
  const r = rncPorId(id);
  if (!r) return;
  const op = opPorId(r.opId);
  abrirFormRnc(Auth.souCQ() ? 'editar' : 'ver', op, r);
}
function pdfRncDireto(id, _b, btn) {
  const r = rncPorId(id);
  if (!r) return;
  comBotaoOcupado(btn, baixarPdf(r).then(function (nome) { toast(T('rf.pdfBaixado', nome)); }).catch(function (e) { avisoErro(e, 'rf.pdfErro'); }));
}

registrarAcoes({
  abrirBaixa: abrirBaixa,
  cqAprovar: cqAprovar,
  cqNovaRnc: cqNovaRnc,
  cqReinspecionar: cqReinspecionar,
  salvarFormRnc: salvarFormRnc,
  baixarPdfRnc: baixarPdfRnc,
  verRnc: verRnc,
  pdfRncDireto: pdfRncDireto,
  verRncDaOp: function (opId) {
    const o = opPorId(opId);
    const r = o && (rncPorId(o.rncAtualId) || rncsDaOp(o.id).pop());
    if (r) abrirFormRnc(Auth.souCQ() ? 'editar' : 'ver', o, r);
  }
});
