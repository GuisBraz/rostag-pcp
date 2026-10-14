/* ---------------------------------------------------------------------------
   Formulário de novo projeto / editar projeto.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, projetoAtual } from '../estado.js';
import { hoje, addDias, esc } from '../nucleo/fmt.js';
import { T, STATUS_LABEL } from '../i18n/index.js';
import { CHECKLIST_PADRAO } from '../dominio/constantes.js';
import * as Projeto from '../dominio/projeto.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes } from './dom.js';
import { abrirModal, fecharModal } from './modal.js';
import { toast } from './toast.js';
import { persistir, redesenhar } from './app.js';

const CAMPOS_FORM = ['commessa', 'cliente', 'descricao', 'tipoServico', 'om', 'dataSolicitacao', 'pcpInicio', 'pcpFim', 'entrega'];
let editandoId = null;

function limparForm() {
  CAMPOS_FORM.forEach(function (c) { const el = $('f-' + c); el.value = ''; el.classList.remove('invalid'); el.removeAttribute('aria-invalid'); });
  $('f-erro').textContent = '';
}

// GP e Responsável vêm da lista de membros da equipe (busca assíncrona).
function preencherOpcoesMembros(gpSelecionado, gpNomeAtual, responsavelSelecionado) {
  const selGp = $('f-gp'), selResp = $('f-responsavel');
  selGp.innerHTML = '<option value="">' + esc(T('fm.semGp')) + '</option>';
  selResp.innerHTML = '<option value="">' + esc(T('fm.semResponsavel')) + '</option>';
  return Auth.listarEquipe().then(function (membros) {
    const opcoes = membros.map(function (m) {
      return '<option value="' + esc(m.uid) + '">' + esc(m.nome || m.email || m.uid) + '</option>';
    }).join('');
    // GP que já saiu da equipe continua aparecendo no projeto antigo
    const gpAntigo = gpSelecionado && !membros.some(function (m) { return m.uid === gpSelecionado; })
      ? '<option value="' + esc(gpSelecionado) + '">' + esc(gpNomeAtual || '—') + '</option>' : '';
    selGp.innerHTML += opcoes + gpAntigo;
    selGp.value = gpSelecionado || '';
    selResp.innerHTML += opcoes;
    selResp.value = responsavelSelecionado || '';
  }).catch(function (e) { console.warn(e); });
}

function previewStatus() {
  const ini = $('f-pcpInicio').value, ent = $('f-entrega').value;
  $('f-status-preview').value = (ini && ent) ? STATUS_LABEL(Projeto.status({ status: 'ativo', pcpInicio: ini, entrega: ent })) : '—';
}

export function abrirNovoProjeto() {
  if (!Auth.souGPouCoordenador()) return;
  editandoId = null;
  limparForm();
  const h = hoje();
  $('f-dataSolicitacao').value = h;
  $('f-pcpInicio').value = h;
  // sugestão só para não abrir vazio; as tarefas nascem com 0 dias
  $('f-pcpFim').value = addDias(h, 30);
  $('f-entrega').value = addDias(h, 60);
  $('modal-projeto-title').textContent = T('fm.novo');
  $('f-submit').textContent = T('fm.incluir');
  $('fm-checklist-nota').textContent = T('fm.checklistZero', CHECKLIST_PADRAO.length);
  previewStatus();
  preencherOpcoesMembros(Auth.uid(), Auth.nomeExibicao(), null);
  abrirModal('modal-projeto', { foco: 'f-commessa', aoFechar: function () { editandoId = null; } });
}

export function abrirEditarProjeto() {
  if (!Auth.souGPouCoordenador()) return;
  const p = projetoAtual();
  if (!p) return;
  limparForm();
  editandoId = p.id;
  CAMPOS_FORM.forEach(function (c) { $('f-' + c).value = (p[c] === '—' ? '' : (p[c] || '')); });
  $('modal-projeto-title').textContent = T('fm.editar');
  $('f-submit').textContent = T('fm.salvarAlt');
  $('fm-checklist-nota').textContent = '';
  previewStatus();
  preencherOpcoesMembros(p.gpUid, p.gp, p.responsavelUid);
  abrirModal('modal-projeto', { foco: 'f-commessa', aoFechar: function () { editandoId = null; } });
}

function salvarProjeto() {
  const d = {};
  CAMPOS_FORM.forEach(function (c) {
    const el = $('f-' + c);
    el.classList.remove('invalid'); el.removeAttribute('aria-invalid');
    d[c] = el.value.trim();
  });
  d.dataSolicitacao = d.dataSolicitacao || null;
  d.responsavelUid = $('f-responsavel').value || null;
  const selGp = $('f-gp');
  d.gpUid = selGp.value || null;
  d.gp = selGp.selectedIndex > 0 ? selGp.options[selGp.selectedIndex].textContent : '';

  const v = Projeto.validar(d, estado.projetos, editandoId);
  if (!v.ok) {
    (v.campos || []).forEach(function (c) {
      const el = $('f-' + c);
      if (el) { el.classList.add('invalid'); el.setAttribute('aria-invalid', 'true'); }
    });
    $('f-erro').textContent = v.msg;
    const primeiro = v.campos && $('f-' + v.campos[0]);
    if (primeiro) primeiro.focus();
    return;
  }
  d.cliente = d.cliente || '—';
  d.gp = d.gp || '—';

  let p, responsavelAnterior = null;
  const eraEdicao = !!editandoId;
  if (eraEdicao) {
    p = buscarProjeto(editandoId);
    if (!p) { fecharModal('modal-projeto'); toast(T('t.projetoSumiu'), { tipo: 'erro' }); return; }
    responsavelAnterior = p.responsavelUid || null;
    ['pcpFim', 'entrega'].forEach(function (campo) {
      if (p[campo] !== d[campo]) p.reagendamentos.push({ campo: campo, de: p[campo], para: d[campo], em: hoje(), motivo: 'edição' });
    });
    Object.assign(p, d);
  } else {
    p = Object.assign({ id: Projeto.novoId(), status: 'ativo', concluidoEm: null, canceladoEm: null,
      reagendamentos: [], paralisacoes: [], checklist: Projeto.checklistNovo() }, d);
    estado.projetos.push(p);
  }
  fecharModal('modal-projeto');
  redesenhar();
  toast(eraEdicao ? T('t.atualizado', p.commessa) : T('t.incluido', p.commessa, CHECKLIST_PADRAO.length));
  persistir().then(function () {
    // designação nova (ou trocada) avisa quem recebeu o projeto — só depois de gravado
    if (d.responsavelUid && d.responsavelUid !== responsavelAnterior) {
      Auth.criarNotificacao(d.responsavelUid, 'designacao', T('notif.designado', p.commessa), p.id);
    }
  }).catch(function () { /* persistir já avisou e desfez */ });
}

['input', 'change'].forEach(function (evt) {
  document.addEventListener(evt, function (e) {
    if (e.target && (e.target.id === 'f-pcpInicio' || e.target.id === 'f-entrega')) previewStatus();
  });
});

registrarAcoes({
  abrirNovoProjeto: abrirNovoProjeto,
  abrirEditarProjeto: abrirEditarProjeto,
  salvarProjeto: salvarProjeto
});
