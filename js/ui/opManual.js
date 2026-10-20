/* ---------------------------------------------------------------------------
   Fábrica → Adicionar OPs → Manual: cadastra (ou corrige) uma OP por vez.
   Técnico de processo (nos projetos dele) e Gerência, como a planilha.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto } from '../estado.js';
import { esc } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as OpManual from '../dominio/opManual.js';
import { statusOp } from '../dominio/producao.js';
import * as Auth from '../dados/auth.js';
import * as Ops from '../dados/ops.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';

const CAMPOS = ['numero', 'desenho', 'posicao', 'rev', 'descricao', 'qtd', 'pesoUnit', 'pesoTotal'];
let editandoId = null;
let projetosPermitidos = function () { return []; };

// A Fábrica informa quais projetos aceitam OP (mesma lista da planilha).
export function configurar(fnProjetos) { projetosPermitidos = fnProjetos; }

function limparErros() {
  ['projeto', 'area'].concat(CAMPOS).forEach(function (k) { const el = $('opm-' + k); if (el) el.classList.remove('invalid'); });
  $('opm-erro').textContent = '';
  $('opm-aviso').textContent = '';
}

export function abrirOpManual(opId) {
  const lista = projetosPermitidos();
  const op = opId ? estado.ops.find(function (o) { return o.id === opId; }) : null;
  if (opId && (!op || statusOp(op) !== 'aberta')) return;
  if (!op && !lista.length) { toast(T('fab.semProjetos'), { tipo: 'erro' }); return; }
  editandoId = op ? op.id : null;
  const sel = $('opm-projeto');
  sel.innerHTML = lista.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.commessa + ' — ' + p.descricao) + '</option>'; }).join('');
  if (op && !lista.some(function (p) { return p.id === op.projetoId; })) {
    sel.innerHTML += '<option value="' + esc(op.projetoId) + '">' + esc(op.commessa) + '</option>';
  }
  sel.value = op ? op.projetoId : (estado.filtroFab.projeto && lista.some(function (p) { return p.id === estado.filtroFab.projeto; }) ? estado.filtroFab.projeto : (lista[0] ? lista[0].id : ''));
  $('opm-area').value = op ? op.area : ($('opm-area').value || 'caldeiraria');
  CAMPOS.forEach(function (k) { $('opm-' + k).value = op && op[k] != null ? op[k] : ''; });
  // na edição a peça (projeto, área, desenho e posição) não muda
  ['projeto', 'area', 'desenho', 'posicao'].forEach(function (k) { $('opm-' + k).disabled = !!op; });
  $('opm-titulo').textContent = T(op ? 'opm.tituloEditar' : 'opm.tituloNova');
  $('opm-outra').style.display = op ? 'none' : '';
  limparErros();
  abrirModal('modal-op', { foco: op ? 'opm-numero' : 'opm-numero', aoFechar: function () { editandoId = null; } });
}

function salvar(continuar, btn) {
  limparErros();
  const d = { projetoId: $('opm-projeto').value, area: $('opm-area').value };
  CAMPOS.forEach(function (k) { d[k] = $('opm-' + k).value; });
  const v = OpManual.validar(d, estado.ops, editandoId);
  if (!v.ok) {
    Object.keys(v.erros).forEach(function (k) { const el = $('opm-' + k); if (el) el.classList.add('invalid'); });
    $('opm-erro').textContent = Object.keys(v.erros).map(function (k) { return T(v.erros[k]); }).join(' ');
    const primeiro = $('opm-' + Object.keys(v.erros)[0]);
    if (primeiro && !primeiro.disabled) primeiro.focus();
    return;
  }
  const p = buscarProjeto(d.projetoId);
  if (!p) { $('opm-erro').textContent = T('opm.eProjeto'); return; }
  const o = v.op;
  const comparacao = editandoId
    ? { novas: [], atualizadas: [{ id: o.id, campos: { numero: o.numero, rev: o.rev, descricao: o.descricao, qtd: o.qtd, pesoUnit: o.pesoUnit, pesoTotal: o.pesoTotal } }] }
    : { novas: [o], atualizadas: [] };
  const eraEdicao = !!editandoId;
  comBotaoOcupado(btn, Ops.gravarPlanilha(p, comparacao).then(function () {
    toast(T(eraEdicao ? 'opm.atualizada' : 'opm.gravada', o.numero));
    if (v.avisos.length) toast(T(v.avisos[0], o.numero), { tipo: 'erro' });
    if (!eraEdicao && p.gpUid) Auth.criarNotificacao(p.gpUid, 'planilhaOps', T('notif.opManual', p.commessa, o.numero, o.desenho), p.id);
    if (continuar && !eraEdicao) {
      // mantém projeto e área; limpa a peça
      CAMPOS.forEach(function (k) { $('opm-' + k).value = ''; });
      $('opm-numero').focus();
    } else {
      fecharModal('modal-op');
    }
  }).catch(function (e) { avisoErro(e, 'fab.erroGravar'); }));
}

// Peso total sugerido enquanto digita (quantidade × peso unitário).
document.addEventListener('input', function (e) {
  if (!e.target || (e.target.id !== 'opm-qtd' && e.target.id !== 'opm-pesoUnit')) return;
  const q = Number(String($('opm-qtd').value).replace(',', '.')), u = Number(String($('opm-pesoUnit').value).replace(',', '.'));
  $('opm-pesoTotal').placeholder = q > 0 && u > 0 ? String(Math.round(q * u * 1000) / 1000).replace('.', ',') : '';
});

registrarAcoes({
  abrirOpManual: function (id) { abrirOpManual(id || null); },
  salvarOpManual: function (_a, _b, btn) { salvar(false, btn); },
  salvarOpManualOutra: function (_a, _b, btn) { salvar(true, btn); }
});
