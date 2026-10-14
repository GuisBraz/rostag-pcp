/* ---------------------------------------------------------------------------
   Toast — aviso curto no canto, com ação opcional (ex.: Desfazer).
--------------------------------------------------------------------------- */
import { $ } from './dom.js';

export function toast(msg, opcoes) {
  const o = opcoes || {};
  const el = document.createElement('div');
  el.className = 'toast' + (o.tipo === 'erro' ? ' erro' : '');
  el.setAttribute('role', o.tipo === 'erro' ? 'alert' : 'status');
  const span = document.createElement('span');
  span.textContent = msg;
  el.appendChild(span);
  let timer = null;
  function sair() { clearTimeout(timer); el.remove(); }
  if (o.acao) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = o.acao.label;
    b.addEventListener('click', function () { sair(); o.acao.fn(); });
    el.appendChild(b);
  }
  const area = $('toasts');
  // no máximo 4 na tela: o mais antigo sai
  while (area.children.length >= 4) area.firstChild.remove();
  area.appendChild(el);
  timer = setTimeout(sair, o.ms || (o.acao ? 8000 : (o.tipo === 'erro' ? 6000 : 3000)));
}
