/* ---------------------------------------------------------------------------
   Tarefas avulsas: o que aparece no meio do projeto, fora do checklist.
   GP do projeto e Gerência criam para alguém da equipe (notificação); a
   pessoa marca como concluída (notificação de volta para quem pediu).
   Abre pelo cartão "Tarefas" do projeto ou por "Minhas tarefas" no menu.
   Não entra no cronograma nem no % do checklist.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto } from '../estado.js';
import { esc, br, hoje, dataHora, dataValida } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Tarefas from '../dominio/tarefas.js';
import * as Auth from '../dados/auth.js';
import * as Dados from '../dados/tarefas.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal, confirmar } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';

/* ------------------------------------------------------------- acesso */
export function podeCriar(p) {
  if (!p || !Auth.membro()) return false;
  return Auth.souGerente() || (Auth.papel() === 'gp' && p.gpUid === Auth.uid());
}
function podeGerir(t) { return Auth.souGerente() || (Auth.papel() === 'gp' && t.criadoPorUid === Auth.uid()); }

function tarefasDoProjeto(id) { return (estado.tarefas || []).filter(function (t) { return t.projetoId === id; }); }
function minhasAbertas() { return (estado.tarefas || []).filter(function (t) { return t.paraUid === Auth.uid() && t.status !== 'concluida'; }); }

// Resumo para o cartão do projeto.
export function resumoCartao(projetoId) {
  const l = tarefasDoProjeto(projetoId), h = hoje();
  const abertas = l.filter(function (t) { return t.status !== 'concluida'; });
  const atrasadas = abertas.filter(function (t) { return Tarefas.prazo(t, h) === 'atrasada'; }).length;
  return { valor: String(abertas.length), detalhe: !l.length ? T('tar.cartaoVazio') : (atrasadas ? T('tar.cartaoAtraso', atrasadas) : T('tar.cartaoDet', l.length - abertas.length)),
    cor: atrasadas ? '--rust' : (abertas.length ? '--ink' : '--ink-faint') };
}

export function atualizarContador() {
  const el = $('tarefas-contador');
  if (!el) return;
  const n = minhasAbertas().length;
  el.textContent = n > 99 ? '99+' : n;
  el.style.display = n ? '' : 'none';
}

/* ------------------------------------------------------------- janela */
let aberta = null;   // { projetoId | null (minhas), aba: 'abertas' | 'concluidas', quem: 'mim' | 'pedidas' }

function abrir(projetoId) {
  const id = projetoId || null;
  aberta = { projetoId: id, aba: 'abertas', quem: 'mim' };
  abrirModal('modal-tarefas', { aoFechar: function () { aberta = null; } });
  render();
}

function duracaoTxt(t) {
  const d = Tarefas.duracao(t.criadoEm, t.concluidaEm);
  if (!d) return '—';
  if (d.dias) return T('tar.durDH', d.dias, d.horas);
  if (d.horas) return T('tar.durHM', d.horas, d.minutos);
  return T('tar.durM', d.minutos);
}

function linha(t, h) {
  const p = buscarProjeto(t.projetoId);
  const minha = t.paraUid === Auth.uid() && t.status !== 'concluida';
  const situ = Tarefas.prazo(t, h);
  const prazo = t.prazo ? '<span class="tar-prazo tar-prazo-' + situ + '">' + esc(T('tar.prazo', br(t.prazo))) + (situ === 'atrasada' ? ' · ' + esc(T('tar.atrasada')) : (situ === 'hoje' ? ' · ' + esc(T('tar.hoje')) : '')) + '</span>' : '';
  const acoes = podeGerir(t) ? '<div class="tar-acoes">' +
      (t.status === 'concluida'
        ? '<button type="button" class="link-btn" data-acao="reabrirTarefa" data-arg="' + esc(t.id) + '">' + esc(T('tar.reabrir')) + '</button>'
        : '<button type="button" class="link-btn" data-acao="editarTarefa" data-arg="' + esc(t.id) + '">' + esc(T('tar.editar')) + '</button>') +
      '<button type="button" class="link-btn tar-apagar" data-acao="apagarTarefa" data-arg="' + esc(t.id) + '">' + esc(T('btn.excluir')) + '</button></div>' : '';
  return '<div class="tar-item' + (t.status === 'concluida' ? ' tar-feita' : '') + (situ === 'atrasada' ? ' tar-atrasada' : '') + '">' +
    (t.status === 'concluida' ? '<span class="tar-check tar-check-ok" aria-hidden="true">✓</span>'
      : (minha ? '<input type="checkbox" class="tar-check" data-acao="concluirTarefa" data-arg="' + esc(t.id) + '" aria-label="' + esc(T('tar.concluir') + ': ' + t.titulo) + '">'
        : '<span class="tar-check" aria-hidden="true"></span>')) +
    '<div class="tar-conteudo"><div class="tar-titulo">' + (aberta.projetoId ? '' : '<span class="mono tar-commessa">' + esc(t.commessa || (p && p.commessa) || '') + '</span> ') + esc(t.titulo) + '</div>' +
      (t.descricao ? '<div class="tar-desc">' + esc(t.descricao) + '</div>' : '') +
      '<div class="hint-txt">' + esc(T('tar.meta', t.paraNome || '—', t.criadoPorNome || '—', dataHora(t.criadoEm))) + ' ' + prazo + '</div>' +
      (t.status === 'concluida' ? '<div class="tar-feita-info">' + esc(T('tar.feita', t.concluidaPorNome || '—', dataHora(t.concluidaEm), duracaoTxt(t))) + '</div>' +
        (t.obsConclusao ? '<div class="tar-desc">' + esc(t.obsConclusao) + '</div>' : '') : '') +
    '</div>' + acoes + '</div>';
}

function render() {
  if (!aberta || !$('modal-tarefas').classList.contains('open')) return;
  const p = aberta.projetoId ? buscarProjeto(aberta.projetoId) : null;
  const h = hoje();
  $('tar-titulo').textContent = p ? T('tar.titulo', p.commessa) : T('tar.minhas');
  $('tar-sub').textContent = p ? (p.descricao || '') : '';
  $('tar-acoes').innerHTML = p && podeCriar(p) ? '<button type="button" class="btn btn-primary btn-mini" data-acao="novaTarefa">' + esc(T('tar.nova')) + '</button>' : '';
  let base;
  if (p) base = tarefasDoProjeto(p.id);
  else base = (estado.tarefas || []).filter(function (t) { return aberta.quem === 'pedidas' ? t.criadoPorUid === Auth.uid() : t.paraUid === Auth.uid(); });
  const abertas = base.filter(function (t) { return t.status !== 'concluida'; }), feitas = base.filter(function (t) { return t.status === 'concluida'; });
  const gestor = Auth.souGerente() || Auth.papel() === 'gp';
  $('tar-abas').innerHTML = [['abertas', abertas.length], ['concluidas', feitas.length]].map(function (x) {
    return '<button type="button" role="tab" aria-selected="' + (aberta.aba === x[0]) + '" class="' + (aberta.aba === x[0] ? 'ativa' : '') + '" data-acao="abaTarefas" data-arg="' + x[0] + '">' +
      esc(T('tar.aba.' + x[0])) + '<b>' + x[1] + '</b></button>';
  }).join('') + (!p && gestor ? '<select data-change="quemTarefas" aria-label="' + esc(T('tar.quem')) + '"><option value="mim"' + (aberta.quem === 'mim' ? ' selected' : '') + '>' + esc(T('tar.quem.mim')) + '</option>' +
    '<option value="pedidas"' + (aberta.quem === 'pedidas' ? ' selected' : '') + '>' + esc(T('tar.quem.pedidas')) + '</option></select>' : '');
  const lista = Tarefas.ordenar(aberta.aba === 'abertas' ? abertas : feitas, h);
  $('tar-lista').innerHTML = lista.length ? lista.map(function (t) { return linha(t, h); }).join('')
    : '<div class="empty-state">' + esc(T(aberta.aba === 'abertas' ? 'tar.vazioAbertas' : 'tar.vazioFeitas')) + '</div>';
}

/* ------------------------------------------------- nova / editar tarefa */
let edit = null;   // { id | null, projetoId }

function abrirEdicao(t) {
  const projetoId = t ? t.projetoId : aberta && aberta.projetoId;
  const p = buscarProjeto(projetoId);
  if (!p || (t ? !podeGerir(t) : !podeCriar(p))) return;
  edit = { id: t ? t.id : null, projetoId: p.id, paraAntes: t ? t.paraUid : null };
  $('tared-titulo-h').textContent = t ? T('tar.editarTit') : T('tar.novaTit', p.commessa);
  $('tared-titulo').value = t ? t.titulo : '';
  $('tared-descricao').value = t ? t.descricao : '';
  $('tared-prazo').value = t ? t.prazo || '' : '';
  $('tared-erro').textContent = '';
  const sel = $('tared-para');
  sel.innerHTML = '<option value="">' + esc(T('av.carregando')) + '</option>';
  Auth.listarEquipe().then(function (membros) {
    const vistos = {};
    sel.innerHTML = '<option value="">' + esc(T('tar.escolhaPessoa')) + '</option>' + membros.filter(function (m) { if (vistos[m.uid]) return false; vistos[m.uid] = 1; return true; })
      .map(function (m) { return '<option value="' + esc(m.uid) + '">' + esc((m.nome || m.uid) + ' — ' + T('papel.' + m.papel)) + '</option>'; }).join('');
    // sugestão: o técnico do projeto
    sel.value = t ? t.paraUid : (p.responsavelUid || '');
  }).catch(function (e) { console.warn(e); sel.innerHTML = '<option value="">—</option>'; });
  abrirModal('modal-tarefa', { foco: 'tared-titulo', aoFechar: function () { edit = null; } });
}

function salvarEdicao(_a, _b, btn) {
  if (!edit) return;
  const p = buscarProjeto(edit.projetoId);
  const sel = $('tared-para');
  const d = { titulo: $('tared-titulo').value.trim(), descricao: $('tared-descricao').value.trim(), paraUid: sel.value,
    paraNome: sel.value ? sel.options[sel.selectedIndex].text.split(' — ')[0] : '', prazo: $('tared-prazo').value };
  if (!d.titulo) { $('tared-erro').textContent = T('tar.erroTitulo'); $('tared-titulo').focus(); return; }
  if (!d.paraUid) { $('tared-erro').textContent = T('tar.erroPara'); sel.focus(); return; }
  if (d.prazo && !dataValida(d.prazo)) { $('tared-erro').textContent = T('com.erroData'); return; }
  const novo = !edit.id, avisar = novo || d.paraUid !== edit.paraAntes;
  const acao = novo ? Dados.criar(p, d) : Dados.editar(edit.id, d);
  comBotaoOcupado(btn, acao.then(function () {
    fecharModal('modal-tarefa');
    toast(T(novo ? 'tar.criada' : 'tar.salva'));
    if (avisar && d.paraUid !== Auth.uid()) {
      Auth.criarNotificacao(d.paraUid, 'tarefa', T('notif.tarefa', p.commessa, d.titulo, Auth.nomeExibicao() || '', d.prazo ? T('tar.prazo', br(d.prazo)) : T('tar.semPrazo')), p.id);
    }
  }).catch(function (e) { avisoErro(e); }));
}

/* ------------------------------------------------------------ concluir */
let concluindo = null;
function abrirConclusao(id, _b, el) {
  if (el && el.type === 'checkbox') el.checked = false;   // só marca de verdade depois de confirmar
  const t = (estado.tarefas || []).find(function (x) { return x.id === id; });
  if (!t || t.paraUid !== Auth.uid() || t.status === 'concluida') return;
  concluindo = t;
  $('tarc-nome').textContent = t.titulo;
  $('tarc-obs').value = '';
  abrirModal('modal-tarefa-concluir', { foco: 'tarc-obs', aoFechar: function () { concluindo = null; } });
}
function confirmarConclusao(_a, _b, btn) {
  const t = concluindo;
  if (!t) return;
  const obs = $('tarc-obs').value;
  comBotaoOcupado(btn, Dados.concluir(t.id, obs).then(function () {
    fecharModal('modal-tarefa-concluir');
    toast(T('tar.concluida', t.titulo));
    if (t.criadoPorUid && t.criadoPorUid !== Auth.uid()) {
      Auth.criarNotificacao(t.criadoPorUid, 'tarefaConcluida', T('notif.tarefaConcluida', t.commessa || '', t.titulo, Auth.nomeExibicao() || '', obs.trim() ? ' — ' + obs.trim().slice(0, 200) : ''), t.projetoId);
    }
  }).catch(function (e) { avisoErro(e); }));
}

/* ------------------------------------------------------------ eventos */
function porId(id) { return (estado.tarefas || []).find(function (x) { return x.id === id; }); }

registrarAcoes({
  abrirTarefas: function (id) { abrir(id || estado.idDetalhe); },
  abrirMinhasTarefas: function () { abrir(null); },
  abaTarefas: function (k) { if (aberta && (k === 'abertas' || k === 'concluidas')) { aberta.aba = k; render(); } },
  quemTarefas: function (v) { if (aberta) { aberta.quem = v === 'pedidas' ? 'pedidas' : 'mim'; render(); } },
  novaTarefa: function () { abrirEdicao(null); },
  editarTarefa: function (id) { const t = porId(id); if (t) abrirEdicao(t); },
  salvarTarefa: salvarEdicao,
  concluirTarefa: abrirConclusao,
  confirmarConclusao: confirmarConclusao,
  reabrirTarefa: function (id, _b, btn) { const t = porId(id); if (t && podeGerir(t)) comBotaoOcupado(btn, Dados.reabrir(id).then(function () { toast(T('tar.reaberta')); }).catch(function (e) { avisoErro(e); })); },
  apagarTarefa: function (id) {
    const t = porId(id);
    if (!t || !podeGerir(t)) return;
    confirmar(T('tar.apagarQ', t.titulo), { titulo: T('btn.excluir'), textoOk: T('btn.excluir'), perigo: true }).then(function (ok) {
      if (ok) Dados.apagar(id).then(function () { toast(T('tar.apagada')); }).catch(function (e) { avisoErro(e); });
    });
  }
});

export { render as renderTarefas };
export function abrirMinhas() { abrir(null); }
