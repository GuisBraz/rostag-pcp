/* ---------------------------------------------------------------------------
   Formulário de novo projeto / editar projeto.
   Gerente de PCP cria e designa GP e técnico; GP cria (e vira o GP do
   projeto) e designa o técnico. O cronograma macro (PCP + fim da produção)
   pode ficar em branco: o projeto fica "aguardando cronograma".
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, projetoAtual, opsDoProjeto, nomeProjeto } from '../estado.js';
import { hoje, esc, br } from '../nucleo/fmt.js';
import { T, STATUS_LABEL } from '../i18n/index.js';
import * as Projeto from '../dominio/projeto.js';
import * as Contratos from '../dominio/contratos.js';
import { papelEfetivo } from '../dominio/papeis.js';
import * as Auth from '../dados/auth.js';
import * as Ops from '../dados/ops.js';
import { $, registrarAcoes } from './dom.js';
import { abrirModal, fecharModal } from './modal.js';
import { toast } from './toast.js';
import { persistir, redesenhar } from './app.js';

const CAMPOS_FORM = ['commessa', 'cliente', 'descricao', 'om', 'dataSolicitacao', 'pcpInicio', 'pcpFim', 'entrega'];
const CAMPOS_PROC = [];
Projeto.PROCESSOS.forEach(function (k) { CAMPOS_PROC.push('proc-' + k + '-ini', 'proc-' + k + '-fim'); });

// Tela cheia em duas etapas: 1) dados e processos · 2) cronograma
let passo = 1;
function irPasso(n) {
  passo = n;
  $('fm-passo1').hidden = n !== 1; $('fm-passo2').hidden = n !== 2;
  $('fm-voltar').hidden = n !== 2; $('fm-proximo').hidden = n !== 1; $('f-submit').hidden = n !== 2;
  $('fm-etapa').textContent = T(n === 1 ? 'fm.etapa1' : 'fm.etapa2');
  mostrarLinhasProcesso();
  const foco = n === 1 ? $('f-commessa') : $('f-pcpInicio');
  if (foco) setTimeout(function () { foco.focus(); }, 30);
}
function mostrarLinhasProcesso() {
  let algum = false;
  Projeto.PROCESSOS.forEach(function (k) { const on = $('f-proc-' + k).checked; $('fm-linha-' + k).hidden = !on; if (on) algum = true; });
  $('fm-sem-processos').hidden = algum;
}
function preencherProcessos(proc) {
  Projeto.PROCESSOS.forEach(function (k) {
    const x = proc[k] || {};
    $('f-proc-' + k).checked = !!x.on;
    $('f-proc-' + k + '-ini').value = x.ini || '';
    $('f-proc-' + k + '-fim').value = x.fim || '';
  });
}
function lerProcessos() {
  const r = {};
  Projeto.PROCESSOS.forEach(function (k) {
    r[k] = { on: $('f-proc-' + k).checked, ini: $('f-proc-' + k + '-ini').value || null, fim: $('f-proc-' + k + '-fim').value || null };
    if (!r[k].on) { r[k].ini = null; r[k].fim = null; }
  });
  return r;
}
// Etapa 1 → 2: confere o que é obrigatório antes de seguir
function proximoPasso() {
  const faltam = [];
  if (!$('f-commessa').value.trim()) faltam.push('commessa');
  if (!$('f-descricao').value.trim()) faltam.push('descricao');
  ['commessa', 'descricao', 'om'].forEach(function (c) { const el = $('f-' + c); el.classList.remove('invalid'); el.removeAttribute('aria-invalid'); });
  if (!faltam.length && !editandoId && Contratos.ehContrato($('f-commessa').value) && !$('f-om').value.trim()) faltam.push('om');
  if (faltam.length) {
    faltam.forEach(function (c) { $('f-' + c).classList.add('invalid'); $('f-' + c).setAttribute('aria-invalid', 'true'); });
    $('f-erro').textContent = faltam[0] === 'om' ? T('fm.errOmFalta', Contratos.base($('f-commessa').value)) : T('fm.faltou', faltam.map(function (c) { return T('fm.' + c + 'N'); }).join(', '));
    $('f-' + faltam[0]).focus();
    return;
  }
  $('f-erro').textContent = '';
  irPasso(2);
}
let editandoId = null;

function limparForm() {
  CAMPOS_FORM.concat(CAMPOS_PROC).forEach(function (c) { const el = $('f-' + c); el.value = ''; el.classList.remove('invalid'); el.removeAttribute('aria-invalid'); });
  Projeto.PROCESSOS.forEach(function (k) { $('f-proc-' + k).checked = false; });
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
}

// Lista padrão da equipe (Configurações → Geral), se houver.
function itensPadrao() { return estado.checklistPadrao ? estado.checklistPadrao.itens : null; }

// "+ Nova OM" no contrato: já vem com commessa, cliente e o GP do contrato
function abrirNovaOm(base) {
  if (!Auth.souGPouCoordenador() || !base) return;
  const irmaos = Contratos.doContrato(base, estado.projetos);
  const ref = irmaos.find(function (p) { return p.gpUid; }) || irmaos[0] || {};
  const refTec = irmaos.find(function (p) { return p.responsavelUid; }) || {};
  abrirNovoProjeto({ commessa: base, cliente: ref.cliente && ref.cliente !== '—' ? ref.cliente : '', gpUid: ref.gpUid || null, gp: ref.gp || null,
    tecUid: refTec.responsavelUid || null, tec: refTec.tecnico || null });
}

export function abrirNovoProjeto(pre) {
  if (!Auth.souGPouCoordenador()) return;
  pre = pre && typeof pre === 'object' && pre.commessa ? pre : null;
  editandoId = null;
  limparForm();
  $('f-dataSolicitacao').value = hoje();
  $('modal-projeto-title').textContent = T('fm.novo');
  $('f-submit').textContent = T('fm.incluir');
  $('fm-checklist-nota').textContent = T('fm.checklistZero', Projeto.listaPadrao(itensPadrao()).length);
  atualizarPreviews();
  // o gerente escolhe o GP; o GP que cria vira o GP do projeto
  const souGp = !Auth.souGerente();
  if (pre) {
    $('f-commessa').value = pre.commessa; $('f-cliente').value = pre.cliente || '';
    $('modal-projeto-title').textContent = T('om.novaTitulo', pre.commessa);
  }
  const gpPre = pre && pre.gpUid && !souGp ? pre.gpUid : null;
  preencherOpcoesMembros(souGp ? Auth.uid() : gpPre, souGp ? Auth.nomeExibicao() : (pre && pre.gp), pre ? pre.tecUid : null, pre ? pre.tec : null);
  irPasso(1);
  abrirModal('modal-projeto', { foco: pre ? 'f-om' : 'f-commessa', aoFechar: function () { editandoId = null; } });
}

export function abrirEditarProjeto(campoFoco) {
  if (!Auth.souGPouCoordenador()) return;
  const p = projetoAtual();
  if (!p) return;
  limparForm();
  editandoId = p.id;
  CAMPOS_FORM.forEach(function (c) { $('f-' + c).value = (p[c] === '—' ? '' : (p[c] || '')); });
  preencherProcessos(Projeto.processosDe(p));
  $('modal-projeto-title').textContent = T('fm.editar');
  $('f-submit').textContent = T('fm.salvarAlt');
  $('fm-checklist-nota').textContent = '';
  atualizarPreviews();
  preencherOpcoesMembros(p.gpUid, p.gp, p.responsavelUid, p.tecnico);
  // abrir direto no cronograma quando pedem uma data (ex.: "Definir cronograma")
  irPasso(typeof campoFoco === 'string' && /pcp|entrega|proc/.test(campoFoco) ? 2 : 1);
  abrirModal('modal-projeto', { foco: typeof campoFoco === 'string' && $(campoFoco) ? campoFoco : (passo === 2 ? 'f-pcpInicio' : 'f-commessa'), aoFechar: function () { editandoId = null; } });
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
  ['dataSolicitacao', 'pcpInicio', 'pcpFim'].forEach(function (c) { d[c] = d[c] || null; });
  CAMPOS_PROC.forEach(function (c) { const el = $('f-' + c); el.classList.remove('invalid'); el.removeAttribute('aria-invalid'); });
  // processos: a janela de produção sai deles (do 1º início ao último fim)
  d.processos = lerProcessos();
  const vp = Projeto.validarProcessos(d.processos, d.entrega);
  if (!vp.ok) {
    (vp.campos || []).forEach(function (c) { const el = $('f-' + c); if (el) { el.classList.add('invalid'); el.setAttribute('aria-invalid', 'true'); } });
    $('f-erro').textContent = vp.msg;
    irPasso(2);
    return;
  }
  d.prodInicio = vp.prodInicio; d.prodFim = vp.prodFim;
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
    // o erro pode estar na etapa 1 (commessa, descrição, OM)
    if ((v.campos || []).some(function (c) { return ['commessa', 'descricao', 'om', 'cliente', 'dataSolicitacao'].indexOf(c) >= 0; })) irPasso(1);
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
    const pcpMudou = (p.pcpInicio || null) !== (d.pcpInicio || null) || (p.pcpFim || null) !== (d.pcpFim || null);
    Projeto.registrarReprogramacao(p, d, Auth.nomeExibicao(), 'edição');
    Object.assign(p, d);
    // janela do PCP mudou: as tarefas não feitas se reajustam para caber nela
    if (pcpMudou && antes.definido && d.pcpInicio && d.pcpFim) Projeto.redistribuir(p);
  } else {
    p = Object.assign({ id: Projeto.novoId(), status: 'ativo', concluidoEm: null, canceladoEm: null,
      reagendamentos: [], paralisacoes: [], checklist: Projeto.checklistNovo(itensPadrao()), criadoPor: Auth.nomeExibicao() }, d);
    estado.projetos.push(p);
  }
  // contrato com OM: o mesmo GP e o mesmo técnico em todas as OMs abertas (edita uma, vale
  // para todas). A Gerência muda todas; o GP, as que já são dele.
  const irmaosGp = [];
  if (Contratos.ehContrato(p.commessa)) {
    const souGer = Auth.souGerente();
    Contratos.doContrato(Contratos.base(p.commessa), estado.projetos).forEach(function (o) {
      if (o.id === p.id || !Projeto.aberto(o) || (!souGer && o.gpUid !== Auth.uid())) return;
      const gpDif = (o.gpUid || null) !== (p.gpUid || null), tecDif = (o.responsavelUid || null) !== (p.responsavelUid || null);
      if (!gpDif && !tecDif) return;
      o.gpUid = p.gpUid || null; o.gp = p.gp;
      o.responsavelUid = p.responsavelUid || null; o.tecnico = p.tecnico || '';
      irmaosGp.push(o);
    });
  }
  const definiuAgora = d.cronogramaDefinido && (!antes || !antes.definido);
  if (definiuAgora) Projeto.distribuirTarefas(p);

  fecharModal('modal-projeto');
  redesenhar();
  toast(eraEdicao ? T('t.atualizado', nomeProjeto(p)) : T('t.incluido', nomeProjeto(p), p.checklist.length));
  (v.avisos || []).concat(vp.avisos || []).forEach(function (a) { toast(a, { tipo: 'erro' }); });
  if (irmaosGp.length) toast(T('om.gpTodas', p.gp || '—', p.tecnico || '—', irmaosGp.length));
  persistir().then(function () {
    avisarEnvolvidos(p, antes, definiuAgora);
    irmaosGp.forEach(function (o) {
      Ops.sincronizarDesignacao(o, opsDoProjeto(o.id)).catch(function (e) { console.warn('OPs não acompanharam a designação:', e); });
    });
    if (antes && (antes.gpUid !== (p.gpUid || null) || antes.responsavelUid !== (p.responsavelUid || null))) {
      Ops.sincronizarDesignacao(p, opsDoProjeto(p.id)).catch(function (e) { console.warn('OPs não acompanharam a designação:', e); });
    }
  }).catch(function () { /* persistir já avisou e desfez */ });
}

// Notificações 1 a 4 — só depois de gravado.
function avisarEnvolvidos(p, antes, definiuAgora) {
  const com = nomeProjeto(p);
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
  abrirNovoProjeto: function () { abrirNovoProjeto(); },
  passoProjeto: function (n) { if (String(n) === '2') proximoPasso(); else irPasso(1); },
  alternarProcesso: function () { mostrarLinhasProcesso(); },
  novaOm: abrirNovaOm,
  abrirEditarProjeto: function (campo) { abrirEditarProjeto(campo); },
  salvarProjeto: salvarProjeto
});
