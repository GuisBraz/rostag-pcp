/* ---------------------------------------------------------------------------
   Vigia de largura (só no site local de testes, localhost): avisa no console
   quando alguma tela ganha barra de rolagem horizontal. A única exceção
   combinada é o Carga Máquina e o Carga Fábrica (mapas com muitos dias).
   No site publicado não faz nada.
--------------------------------------------------------------------------- */
const LOCAL = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const PERMITIDO = '#tab-carga, #tab-fabrica, .cm-tl, .cm-maqs, .carga-grade-wrap, #modal-cm-dia, .settings-tabs';
const avisados = new Set();

function nome(el) {
  return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
}

export function conferir() {
  const achados = [];
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) achados.push('página (' + de.scrollWidth + ' > ' + de.clientWidth + ')');
  document.querySelectorAll('body *').forEach(function (el) {
    if (!el.offsetParent || el.closest(PERMITIDO)) return;
    if (!/(auto|scroll)/.test(getComputedStyle(el).overflowX)) return;
    if (el.scrollWidth > el.clientWidth + 1) {
      const onde = el.closest('[id^="tab-"], [id^="modal-"]');
      achados.push(nome(el) + (onde ? ' em #' + onde.id : '') + ' (' + el.scrollWidth + ' > ' + el.clientWidth + ')');
    }
  });
  achados.forEach(function (a) {
    const k = location.hash + '|' + a.replace(/\(\d+ > \d+\)/, '');
    if (avisados.has(k)) return;
    avisados.add(k);
    console.warn('[largura] barra horizontal em ' + location.hash + ': ' + a);
  });
  return achados;
}

if (LOCAL) {
  window.__conferirLargura = conferir;
  setInterval(conferir, 3000);
}
