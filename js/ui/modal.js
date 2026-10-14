/* ---------------------------------------------------------------------------
   Janelas (modais) e diálogos.
   Toda janela abre e fecha por aqui: Esc, clique no fundo e o botão ✕
   passam pelo mesmo caminho, então a limpeza (aoFechar) sempre roda e o
   foco volta para onde estava.
--------------------------------------------------------------------------- */
import { $, $$, registrarAcoes } from './dom.js';
import { T } from '../i18n/index.js';

const pilha = [];   // [{ id, aoFechar, focoAnterior }]

export function abrirModal(id, opcoes) {
  const o = opcoes || {};
  const el = $(id);
  if (!el || el.classList.contains('open')) return;
  pilha.push({ id: id, aoFechar: o.aoFechar || null, focoAnterior: document.activeElement });
  el.classList.add('open');
  const foco = o.foco ? $(o.foco) : el.querySelector('input:not([type=hidden]):not([disabled]), textarea, select, button.btn-primary');
  setTimeout(function () { if (foco && el.classList.contains('open')) foco.focus(); }, 30);
}

export function fecharModal(id) {
  const i = id ? pilha.map(function (x) { return x.id; }).lastIndexOf(id) : pilha.length - 1;
  if (i < 0) { if (id && $(id)) $(id).classList.remove('open'); return; }
  const item = pilha.splice(i, 1)[0];
  $(item.id).classList.remove('open');
  if (item.aoFechar) { try { item.aoFechar(); } catch (e) { console.error(e); } }
  if (item.focoAnterior && item.focoAnterior.focus && document.contains(item.focoAnterior)) item.focoAnterior.focus();
}

export function modalAberto() { return pilha.length ? pilha[pilha.length - 1].id : null; }
export function fecharTodos() { while (pilha.length) fecharModal(); }

export function iniciarModais() {
  // Fecha só em clique de verdade no fundo — arrastar para selecionar texto
  // num campo e soltar fora da caixa não conta.
  $$('.modal-overlay').forEach(function (ov) {
    let comecouNoFundo = false;
    ov.addEventListener('mousedown', function (e) { comecouNoFundo = (e.target === ov); });
    ov.addEventListener('click', function (e) {
      if (comecouNoFundo && e.target === ov) fecharModal(ov.id);
      comecouNoFundo = false;
    });
  });
}

// Mantém o Tab dentro da janela aberta.
export function prenderFoco(e) {
  const id = modalAberto();
  if (!id) return false;
  const foco = $$('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])', $(id))
    .filter(function (el) { return el.offsetParent !== null; });
  if (!foco.length) return true;
  const primeiro = foco[0], ultimo = foco[foco.length - 1];
  if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  return true;
}

/* ---------------------------------------------------------------- diálogo
   Substitui confirm() e prompt() do navegador. Devolve uma Promise:
   confirmar → true/false · pedirTexto → string (pode ser vazia) ou null.  */
let resolver = null;

function abrirDialogo(o) {
  if (resolver) resolver(o.campo ? null : false);
  $('dialogo-titulo').textContent = o.titulo || T('dlg.confirmar');
  $('dialogo-msg').textContent = o.mensagem || '';
  const wrap = $('dialogo-campo-wrap'), campo = $('dialogo-campo');
  wrap.hidden = !o.campo;
  campo.value = o.valor || '';
  campo.placeholder = o.placeholder || '';
  $('dialogo-campo-rot').textContent = o.rotuloCampo || '';
  const ok = $('dialogo-ok');
  ok.textContent = o.textoOk || T('dlg.ok');
  ok.className = 'btn ' + (o.perigo ? 'btn-danger' : 'btn-primary');
  $('dialogo-cancelar').textContent = o.textoCancelar || T('btn.cancelar');
  $('dialogo-cancelar').hidden = !!o.soAviso;
  return new Promise(function (resolve) {
    resolver = function (v) { resolver = null; resolve(v); };
    abrirModal('modal-dialogo', {
      foco: o.campo ? 'dialogo-campo' : 'dialogo-ok',
      aoFechar: function () { if (resolver) resolver(o.campo ? null : false); }
    });
  });
}

export function confirmar(mensagem, opcoes) {
  return abrirDialogo(Object.assign({ mensagem: mensagem }, opcoes));
}
export function pedirTexto(mensagem, opcoes) {
  return abrirDialogo(Object.assign({ mensagem: mensagem, campo: true }, opcoes));
}
export function avisar(mensagem, opcoes) {
  return abrirDialogo(Object.assign({ mensagem: mensagem, soAviso: true }, opcoes));
}

registrarAcoes({
  dialogoResponder: function (resposta) {
    if (!resolver) { fecharModal('modal-dialogo'); return; }
    const campo = !$('dialogo-campo-wrap').hidden;
    const valor = resposta === 'sim' ? (campo ? $('dialogo-campo').value.trim() : true) : (campo ? null : false);
    const r = resolver;
    resolver = null;
    fecharModal('modal-dialogo');
    r(valor);
  },
  fecharModal: function (id) { fecharModal(id); }
});

// Enter no campo do diálogo confirma.
document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && e.target && e.target.id === 'dialogo-campo') {
    e.preventDefault();
    $('dialogo-ok').click();
  }
});
