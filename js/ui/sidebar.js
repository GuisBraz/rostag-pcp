/* ---------------------------------------------------------------------------
   Menu lateral recolhido: etiqueta com o nome do item ao passar o mouse (ou
   focar pelo teclado). A etiqueta fica fora do menu (position: fixed), que
   corta o que passa da largura dele.
--------------------------------------------------------------------------- */
import { T } from '../i18n/index.js';
import { $ } from './dom.js';

const ESTREITA = window.matchMedia('(max-width: 720px)');   // no CSS o menu fica sempre recolhido
let dica = null;

function recolhido() { return $('sidebar').classList.contains('collapsed') || ESTREITA.matches; }

function textoDe(el) {
  if (el.id === 'sidebar-collapse-btn') return { nome: el.getAttribute('aria-label') || '', extra: '' };
  const rot = el.querySelector('.label');
  const badge = el.querySelector('.side-badge');
  const n = badge && badge.style.display !== 'none' ? badge.textContent.trim() : '';
  return { nome: (rot ? rot.textContent : el.getAttribute('aria-label') || '').trim() + (n && n !== '0' ? ' · ' + n : ''), extra: el.dataset.atalho || '' };
}

function mostrar(el) {
  if (!recolhido()) { esconder(); return; }
  const t = textoDe(el);
  if (!t.nome) return;
  if (!dica) { dica = document.createElement('div'); dica.className = 'dica-menu'; dica.setAttribute('role', 'tooltip'); document.body.appendChild(dica); }
  dica.textContent = t.nome;
  if (t.extra) { const s = document.createElement('small'); s.textContent = t.extra; dica.appendChild(s); }
  const r = el.getBoundingClientRect();
  dica.style.left = (r.right + 10) + 'px';
  dica.style.top = (r.top + r.height / 2) + 'px';
  dica.hidden = false;
}
function esconder() { if (dica) dica.hidden = true; }

function alvo(e) { return e.target.closest && e.target.closest('#sidebar .side-item, #gear-btn, #sidebar-collapse-btn'); }

export function iniciarSidebar() {
  // o atalho (Alt+1...) sai do title nativo — senão aparecem duas etiquetas
  document.querySelectorAll('#sidebar .side-item[title]').forEach(function (b) { b.dataset.atalho = b.title; b.removeAttribute('title'); });
  const sb = $('sidebar');
  sb.addEventListener('mouseover', function (e) { const el = alvo(e); if (el) mostrar(el); else esconder(); });
  sb.addEventListener('mouseleave', esconder);
  sb.addEventListener('focusin', function (e) { const el = alvo(e); if (el) mostrar(el); });
  sb.addEventListener('focusout', esconder);
  sb.addEventListener('click', esconder);
  sb.querySelector('.sidebar-nav').addEventListener('scroll', esconder, { passive: true });
}

// Rótulo do botão de recolher acompanha o estado.
export function atualizarBotaoRecolher(recolhida) {
  const b = $('sidebar-collapse-btn');
  const rot = T(recolhida ? 'tt.expandir' : 'tt.recolher');
  b.setAttribute('aria-expanded', recolhida ? 'false' : 'true');
  b.setAttribute('aria-label', rot);
  b.title = rot;
  esconder();
}
