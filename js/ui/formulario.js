/* ---------------------------------------------------------------------------
   Formulário de novo projeto / editar projeto.
   Gerente de PCP cria e designa GP e técnico; GP cria (e vira o GP do
   projeto) e designa o técnico. O cronograma macro (PCP + fim da produção)
   pode ficar em branco: o projeto fica "aguardando cronograma".
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, projetoAtual, opsDoProjeto } from '../estado.js';
import { hoje, esc, br } from '../nucleo/fmt.js';
import { T, STATUS_LABEL } from '../i18n/index.js';
import * as Projeto from '../dominio/projeto.js';
import { papelEfetivo } from '../dominio/papeis.js';
import * as Auth from '../dados/auth.js';
import * as Ops from '../dados/ops.js';
import { $, registrarAcoes } from './dom.js';
import { abrirModal, fecharModal } from './modal.js';
import { toast } from './toast.js';
import { persistir, redesenhar } from './app.js';

const CAMPOS_FORM = ['commessa', 'cliente', 'descricao', 'tipoServico', 'om', 'dataSolicitacao', 'pcpInicio', 'pcpFim', 'prodFim', 'entrega'];
let editandoId = null;

function limparForm() {
  CAMPOS_FORM.forEach(function (c) { const el = $('f-' + c); el.value = ''; el.classList.remove('invalid'); el.removeAttribute('aria-invalid'); });
  $('f-prodInicio').value = '';
  $('f-erro').textContent = '';
}

function opcaoMembro(m, vezes) {
  const nome = m.nome || m.email || m.uid;
  const repetido = m.nome && m.email && vezes[m.nome.trim().toLowerCase()] > 1;
  return '<option value="' + esc(m.uid) + '" data-nome="' + esc(nome) + '">' + esc(repetido ? nome + ' (' + m.email + ')' : nome) + '</option>';
}

// GP vem dos membros com cargo GP (ou Gerente de PCP); técnico, dos técnicos.
// Quem já saiu da equipe continua aparecendo no projeto antigo.
function preencherOpcoesMembros(gpSelecionado, gpNomeAtual, tecSelecionado, tecNomeAtual) {
  const selGp = $('f-gp'), selResp = $('f-responsavel');
  selGp.innerHTML = '<option value="">' + esc(T('fm.semGp')) + '</option>';
  selResp.innerHTML = '<option value="">' + esc(T('fm.semResponsavel')) + '</option>';
  // GP que cria/edita não escolhe outro GP; só o gerente designa
  selGp.disabled = !Auth.souGerente();
  return Auth.listarEquipe().then(function (membros) {
    const coord = Auth.coordenadorUidAtual();
    const vezes = {};
    membros.forEach(function (m) { const n = (m.nome || '').trim().toLowerCase(); vezes[n] = (vezes[n] || 0) + 1; });
    const papel = function (m) { return papelEfetivo(m.papel, m.uid === coord); };
    const gps = membros.filter(function (m) { return papel(m) === 'gp' || papel(m) === 'gerente_pcp'; });
    const tecs = membros.filter(function (m) { return papel(m) === 'tecnico'; });
    const antigo = function (uid, nome, lista) {
      return uid && !lista.some(function (m) { return m.uid === uid; }) ? '<option value="' + esc(uid) + '" data-nome="' + esc(nome || '—') + '">' + esc(nome || '—') + '</option>' : '';
    };
    selGp.innerHTML += gps.map(function (m) { return opcaoMembro(m, vezes); }).join('') + antigo(gpSelecionado, gpNomeAtual, gps);
    selGp.value = gpSelecionado || '';
    selResp.innerHTML += tecs.map(function (m) { return opcaoMembro(m, vezes); }).join('') + antigo(tecSelecionado, tecNomeAtual, tecs);
    selResp.value = tecSelecionado || '';
  }).catch(function (e) { console.warn(e); });
}

function atualizarPreviews() {
  const ent = $('f-entrega').value;
  $('f-status-preview').value = ent ? STATUS_LABEL(Projeto.status({ status: 'ativo', entrega: ent })) : '—';
  $('f-prodInicio').value = $('f-pcpFim').value || '';
}

// Lista padrão da equipe (Configurações → Geral), se houver.
function itensPadrao() { return estado.checklistPadrao ? estado.checklistPadrao.itens : null; }

export function abrirNovoProjeto() {
  if (!Auth.souGPouCoordenador()) return;
  editandoId = null;
  limparForm();
  $('f-dataSolicitacao').value = hoje();
  $('modal-projeto-title').textContent = T('fm.novo');
  $('f-submit').textContent = T('fm.incluir');
  $('fm-checklist-nota').textContent = T('fm.checklistZero', Projeto.listaPadrao(itensPadrao()).length);
  atualizarPreviews();
  // o gerente escolhe o GP; o GP que cria vira o GP do projeto
  const souGp = !Auth.souGerente();
  preencherOpcoesMembros(souGp ? Auth.uid() : null, souGp ? Auth.nomeExibicao() : null, null, null);
  abrirModal('modal-projeto', { foco: 'f-commessa', aoFechar: function () { editandoId = null; } });
}

export function abrirEditarProjeto(campoFoco) {
  if (!Auth.souGPouCoordenador()) return;
  const p = projetoAtual();
  if (!p) return;
  limparForm();
  editandoId = p.id;
  CAMPOS_FORM.forEach(function (c) { $('f-' + c).value = (p[c] === '—' ? '' : (p[c] || '')); });
  $('modal-projeto-title').textContent = T('fm.editar');
  $('f-submit').textContent = T('fm.salvarAlt');
  $('fm-checklist-nota').textContent = '';
  atualizarPreviews();
  preencherOpcoesMembros(p.gpUid, p.gp, p.responsavelUid, p.tecnico);
  abrirModal('modal-projeto', { foco: typeof campoFoco === 'string' && $(campoFoco) ? campoFoco : 'f-commessa', aoFechar: function () { editandoId = null; } });
}

function nomeSelecionado(sel) {
  const op = sel.selectedIndex > 0 ? sel.options[sel.selectedIndex] : null;
  return op ? (op.dataset.nome || op.textContent) : '';
}

function salvarProjeto() {
  const d = {};
  CAMPOS_FORM.forEach(function (c) {
    const el = $('f-' + c);
    el.classList.remove('invalid'); el.removeAttribute('aria-invalid');
    d[c] = el.value.trim();
  });
  ['dataSolicitacao', 'pcpInicio', 'pcpFim', 'prodFim'].forEach(function (c) { d[c] = d[c] || null; });
  d.responsavelUid = $('f-responsavel').value || null;
  d.tecnico = nomeSelecionado($('f-responsavel')) || '';
  d.gpUid = $('f-gp').value || null;
  d.gp = nomeSelecionado($('f-gp'));
  if (!Auth.souGerente()) { d.gpUid = Auth.uid(); d.gp = Auth.nomeExibicao(); }   // regra: o GP fica com o projeto

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
  d.cronogramaDefinido = !!(d.pcpInicio && d.pcpFim);

  const eraEdicao = !!editandoId;
  let p, antes = null;
  if (eraEdicao) {
    p = buscarProjeto(editandoId);
    if (!p) { fecharModal('modal-projeto'); toast(T('t.projetoSumiu'), { tipo: 'erro' }); return; }
    antes = { gpUid: p.gpUid || null, responsavelUid: p.responsavelUid || null, definido: !Projeto.aguardandoCronograma(p),
      datas: Projeto.CAMPOS_DATA.map(function (c) { return p[c] || null; }).join('|') };
    Projeto.registrarReprogramacao(p, d, Auth.nomeExibicao(), 'edição');
    Object.assign(p, d);
  } else {
    p = Object.assign({ id: Projeto.novoId(), status: 'ativo', concluidoEm: null, canceladoEm: null,
      reagendamentos: [], paralisacoes: [], checklist: Projeto.checklistNovo(itensPadrao()), criadoPor: Auth.nomeExibicao() }, d);
    estado.projetos.push(p);
  }
  const definiuAgora = d.cronogramaDefinido && (!antes || !antes.definido);
  if (definiuAgora) Projeto.distribuirTarefas(p);

  fecharModal('modal-projeto');
  redesenhar();
  toast(eraEdicao ? T('t.atualizado', p.commessa) : T('t.incluido', p.commessa, p.checklist.length));
  (v.avisos || []).forEach(function (a) { toast(a, { tipo: 'erro' }); });
  persistir().then(function () {
    avisarEnvolvidos(p, antes, definiuAgora);
    if (antes && (antes.gpUid !== (p.gpUid || null) || antes.responsavelUid !== (p.responsavelUid || null))) {
      Ops.sincronizarDesignacao(p, opsDoProjeto(p.id)).catch(function (e) { console.warn('OPs não acompanharam a designação:', e); });
    }
  }).catch(function () { /* persistir já avisou e desfez */ });
}

// Notificações 1 a 4 — só depois de gravado.
function avisarEnvolvidos(p, antes, definiuAgora) {
  const com = p.commessa;
  const gpNovo = p.gpUid || null, tecNovo = p.responsavelUid || null;
  if (!antes) {
    if (gpNovo) Auth.criarNotificacao(gpNovo, 'projetoCriado', T('notif.projetoCriado', com, p.descricao), p.id);
  } else if (antes.gpUid !== gpNovo) {
    if (gpNovo) Auth.criarNotificacao(gpNovo, 'designacao', T('notif.virouGp', com), p.id);
    if (antes.gpUid) Auth.criarNotificacao(antes.gpUid, 'designacaoTrocada', T('notif.saiuGp', com), p.id);
  }
  const tecTrocado = antes && antes.responsavelUid !== tecNovo;
  if (antes && tecTrocado && antes.responsavelUid) {
    Auth.criarNotificacao(antes.responsavelUid, 'designacaoTrocada', T('notif.saiuTecnico', com), p.id);
  }
  if (!tecNovo || Projeto.aguardandoCronograma(p)) return;   // técnico só fica sabendo com o cronograma pronto
  if (definiuAgora || !antes || tecTrocado) {
    Auth.criarNotificacao(tecNovo, 'cronograma', T('notif.cronograma', com, br(p.pcpInicio), br(p.pcpFim)), p.id);
  } else if (antes.datas !== Projeto.CAMPOS_DATA.map(function (c) { return p[c] || null; }).join('|')) {
    Auth.criarNotificacao(tecNovo, 'datas', T('notif.datas', com), p.id);
  }
}

['input', 'change'].forEach(function (evt) {
  document.addEventListener(evt, function (e) {
    if (e.target && (e.target.id === 'f-pcpFim' || e.target.id === 'f-entrega')) atualizarPreviews();
  });
});

registrarAcoes({
  abrirNovoProjeto: abrirNovoProjeto,
  abrirEditarProjeto: function (campo) { abrirEditarProjeto(campo); },
  salvarProjeto: salvarProjeto
});
