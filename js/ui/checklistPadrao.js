/* ---------------------------------------------------------------------------
   Editor do checklist padrão do PCP (tela cheia, Configurações → Geral).
   Gerência e GP renomeiam, reordenam (arrastando ou ↑ ↓), apagam, incluem
   tarefas e definem a duração padrão. Ao salvar, confirma com o resumo do
   que mudou. Vale só para os projetos novos.
--------------------------------------------------------------------------- */
import { estado } from '../estado.js';
import { esc } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Projeto from '../dominio/projeto.js';
import { DIAS_MAX_TAREFA } from '../dominio/constantes.js';
import * as Papeis from '../dominio/papeis.js';
import * as Auth from '../dados/auth.js';
import * as DadosChecklist from '../dados/checklist.js';
import { $, $$, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal, confirmar } from './modal.js';
import { toast } from './toast.js';

let antes = [];        // lista ao abrir ({t, dias})
let itens = [];        // em edição ({t, dias, orig})
let base = null;       // atualizadoEm carregado (detecta edição simultânea)
let arrastado = null;

function podeEditar() { return Papeis.gereProjetos(Auth.papel()); }

function render(focarUltima) {
  $('ckp-lista').innerHTML = itens.map(function (i, k) {
    return '<li class="ckp-item" draggable="true" data-i="' + k + '">' +
      '<span class="ckp-alca" title="' + esc(T('ckp.arrastar')) + '" aria-hidden="true">⋮⋮</span>' +
      '<span class="ckp-num">' + (k + 1) + '</span>' +
      '<input data-campo="t" data-i="' + k + '" value="' + esc(i.t) + '" maxlength="' + Projeto.MAX_TEXTO_TAREFA + '" aria-label="' + esc(T('ckp.tarefaN', k + 1)) + '">' +
      '<input data-campo="dias" data-i="' + k + '" type="number" min="0" max="' + DIAS_MAX_TAREFA + '" value="' + (i.dias || 0) + '" aria-label="' + esc(T('ckp.diasN', k + 1)) + '">' +
      '<span class="ckp-botoes">' +
        '<button type="button" data-acao="ckpMover" data-arg="' + k + '" data-arg2="-1"' + (k === 0 ? ' disabled' : '') + ' aria-label="' + esc(T('ckp.subir')) + '">↑</button>' +
        '<button type="button" data-acao="ckpMover" data-arg="' + k + '" data-arg2="1"' + (k === itens.length - 1 ? ' disabled' : '') + ' aria-label="' + esc(T('ckp.descer')) + '">↓</button>' +
        '<button type="button" class="ckp-apagar" data-acao="ckpApagar" data-arg="' + k + '" aria-label="' + esc(T('ckp.apagar')) + '">🗑</button>' +
      '</span></li>';
  }).join('');
  $('ckp-contagem').textContent = T('ckp.contagem', itens.length, Projeto.MAX_TAREFAS_PADRAO);
  $('ckp-erro').textContent = '';
  if (focarUltima) { const ins = $$('#ckp-lista input[data-campo="t"]'); if (ins.length) ins[ins.length - 1].focus(); }
}

function abrir() {
  if (!podeEditar()) return;
  const cp = estado.checklistPadrao;
  antes = Projeto.listaPadrao(cp && cp.itens);
  base = cp ? cp.atualizadoEm || null : null;
  itens = antes.map(function (i, k) { return { t: i.t, dias: i.dias, orig: k }; });
  render();
  abrirModal('modal-checklist', { aoFechar: function () { itens = []; antes = []; } });
}

function fechar() {
  const r = Projeto.resumoMudancasPadrao(antes, itens);
  if (!r.mudou) { fecharModal('modal-checklist'); return; }
  confirmar(T('ckp.descartar'), { titulo: T('ckp.titulo'), textoOk: T('ckp.descartarOk'), perigo: true })
    .then(function (ok) { if (ok) fecharModal('modal-checklist'); });
}

function mover(de, para) {
  if (para < 0 || para >= itens.length || de === para) return;
  const x = itens.splice(de, 1)[0];
  itens.splice(para, 0, x);
  render();
}

function salvar(_a, _b, btn) {
  const vazias = itens.filter(function (i) { return !String(i.t).trim(); }).length;
  const limpas = Projeto.normalizarPadrao(itens);
  if (!limpas.length) { $('ckp-erro').textContent = T('ckp.vazia'); return; }
  // mantém "orig" para o resumo, só com as linhas que sobraram
  const editadas = itens.filter(function (i) { return String(i.t).trim(); }).map(function (i, k) { return Object.assign({}, limpas[k], { orig: i.orig }); });
  const r = Projeto.resumoMudancasPadrao(antes, editadas);
  if (!r.mudou) { fecharModal('modal-checklist'); toast(T('ckp.semMudanca')); return; }
  const partes = [];
  if (r.novas) partes.push(T('ckp.rNovas', r.novas));
  if (r.removidas) partes.push(T('ckp.rRemovidas', r.removidas));
  if (r.renomeadas) partes.push(T('ckp.rRenomeadas', r.renomeadas));
  if (r.duracoes) partes.push(T('ckp.rDuracoes', r.duracoes));
  if (r.ordem) partes.push(T('ckp.rOrdem'));
  const msg = T('ckp.confirmar', r.total, partes.join(', ')) + (vazias ? '\n' + T('ckp.vaziasIgnoradas', vazias) : '');
  confirmar(msg, { titulo: T('ckp.titulo'), textoOk: T('ckp.salvar') }).then(function (ok) {
    if (!ok) return;
    comBotaoOcupado(btn, DadosChecklist.salvar(limpas, base).then(function () {
      fecharModal('modal-checklist');
      toast(T('ckp.salvo', r.total));
    }).catch(function (e) {
      console.warn(e);
      $('ckp-erro').textContent = e && e.message === 'checklist-conflito'
        ? T('ckp.conflito', e.por || '—')
        : T('ckp.erro') + (e && e.code ? ' (' + e.code + ')' : '');
    }));
  });
}

// Edição direta nos campos (sem redesenhar, para não perder o foco).
document.addEventListener('input', function (e) {
  const el = e.target;
  if (!el.dataset || !el.dataset.campo || !el.closest('#ckp-lista')) return;
  const i = itens[Number(el.dataset.i)];
  if (!i) return;
  if (el.dataset.campo === 't') i.t = el.value;
  else i.dias = Math.min(DIAS_MAX_TAREFA, Math.max(0, Math.round(Number(el.value) || 0)));
});
// Arrastar pela linha (o input não inicia o arraste).
document.addEventListener('dragstart', function (e) {
  const li = e.target.closest && e.target.closest('.ckp-item');
  if (!li) return;
  arrastado = Number(li.dataset.i);
  li.classList.add('arrastando');
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', String(arrastado)); } catch (x) { /* alguns navegadores */ }
});
document.addEventListener('dragover', function (e) {
  const li = e.target.closest && e.target.closest('.ckp-item');
  if (!li || arrastado == null) return;
  e.preventDefault();
  $$('.ckp-item.alvo').forEach(function (x) { x.classList.remove('alvo'); });
  li.classList.add('alvo');
});
document.addEventListener('drop', function (e) {
  const li = e.target.closest && e.target.closest('.ckp-item');
  if (!li || arrastado == null) return;
  e.preventDefault();
  const para = Number(li.dataset.i), de = arrastado;
  arrastado = null;
  mover(de, para);
});
document.addEventListener('dragend', function () {
  arrastado = null;
  $$('.ckp-item.arrastando, .ckp-item.alvo').forEach(function (x) { x.classList.remove('arrastando', 'alvo'); });
});

registrarAcoes({
  abrirChecklistPadrao: abrir,
  fecharChecklistPadrao: fechar,
  ckpMover: function (k, d) { mover(Number(k), Number(k) + Number(d)); },
  ckpApagar: function (k) { itens.splice(Number(k), 1); render(); },
  ckpAdicionar: function () {
    if (itens.length >= Projeto.MAX_TAREFAS_PADRAO) { $('ckp-erro').textContent = T('ckp.limite', Projeto.MAX_TAREFAS_PADRAO); return; }
    itens.push({ t: '', dias: 0, orig: null });
    render(true);
  },
  ckpRestaurar: function () {
    confirmar(T('ckp.qRestaurar'), { titulo: T('ckp.restaurar'), textoOk: T('ckp.restaurar') }).then(function (ok) {
      if (!ok) return;
      itens = Projeto.listaPadrao(null).map(function (i) {
        const k = antes.findIndex(function (a) { return a.t === i.t; });
        return { t: i.t, dias: 0, orig: k >= 0 ? k : null };
      });
      render();
    });
  },
  ckpSalvar: salvar
});
