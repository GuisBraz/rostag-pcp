/* ---------------------------------------------------------------------------
   DOM — atalhos e o despachante de ações.

   Nenhum elemento tem onclick/onchange inline (a política de segurança da
   página proíbe script inline). Em vez disso:
     data-acao="nome" [data-arg="x"] [data-arg2="y"]  → clique
     data-change="nome"                               → change (recebe o valor)
     data-submit="nome"                               → submit de formulário
     data-enter="nome"                                → Enter num campo
   Elementos com role="button" também respondem a Enter e Espaço.
--------------------------------------------------------------------------- */

export function $(id) { return document.getElementById(id); }
export function $$(sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); }
export function mostrar(el, visivel, display) {
  if (typeof el === 'string') el = $(el);
  if (el) el.style.display = visivel ? (display || '') : 'none';
}

const acoes = Object.create(null);

export function registrarAcoes(mapa) {
  Object.keys(mapa).forEach(function (nome) {
    if (acoes[nome]) console.warn('ação registrada duas vezes:', nome);
    acoes[nome] = mapa[nome];
  });
}

function executar(nome, el, ev, valor) {
  const fn = acoes[nome];
  if (!fn) { console.warn('ação desconhecida:', nome); return; }
  try {
    const r = fn(valor !== undefined ? valor : el.dataset.arg, el.dataset.arg2, el, ev);
    if (r && typeof r.catch === 'function') r.catch(function (e) { console.error(nome, e); });
  } catch (e) { console.error(nome, e); }
}

export function iniciarDespachante() {
  document.addEventListener('click', function (ev) {
    const el = ev.target.closest('[data-acao]');
    if (!el || el.disabled) return;
    if (el.tagName === 'A') ev.preventDefault();
    executar(el.dataset.acao, el, ev);
  });
  document.addEventListener('change', function (ev) {
    const el = ev.target.closest('[data-change]');
    if (el) executar(el.dataset.change, el, ev, el.type === 'file' ? ev : el.value);
  });
  document.addEventListener('submit', function (ev) {
    const el = ev.target.closest('[data-submit]');
    if (!el) return;
    ev.preventDefault();
    executar(el.dataset.submit, el, ev, null);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !ev.isComposing) {
      const campo = ev.target.closest('[data-enter]');
      if (campo) { ev.preventDefault(); executar(campo.dataset.enter, campo, ev, null); return; }
    }
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[role="button"][tabindex]')) {
      ev.preventDefault();
      ev.target.click();
    }
  });
}

// Liga/desliga um botão enquanto uma promessa corre (evita clique duplo).
export function comBotaoOcupado(btn, promessa) {
  if (btn) btn.disabled = true;
  return Promise.resolve(promessa).finally(function () { if (btn) btn.disabled = false; });
}
