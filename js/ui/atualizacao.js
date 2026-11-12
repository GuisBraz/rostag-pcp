/* ---------------------------------------------------------------------------
   Aviso de versão nova do site.
   A versão é o nome do cache em sw.js ('rostag-pcp-vNN'), que sobe a cada
   publicação. Ao abrir, a página guarda a versão com que veio (os arquivos
   vêm da rede, então são os daquela versão). Depois confere de novo a cada
   30 minutos, quando a aba volta a ficar visível e quando o service worker
   troca: se a publicada for outra, aparece uma faixa fixa com o botão
   "Recarregar" — quem está no meio de algo escolhe a hora.
--------------------------------------------------------------------------- */
import { $, registrarAcoes } from './dom.js';

const INTERVALO = 30 * 60 * 1000;
let versaoDaPagina = null;

function versaoPublicada() {
  return fetch('sw.js', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
    const m = t.match(/rostag-pcp-v\d+/);
    return m ? m[0] : null;
  }).catch(function () { return null; });   // offline: não avisa nada
}

function conferir() {
  if (!versaoDaPagina) return;
  versaoPublicada().then(function (v) { if (v && v !== versaoDaPagina) $('aviso-versao').hidden = false; });
}

export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  versaoPublicada().then(function (v) { versaoDaPagina = v; });
  navigator.serviceWorker.addEventListener('controllerchange', conferir);
  setInterval(conferir, INTERVALO);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') conferir(); });
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      setInterval(function () { reg.update().catch(function () {}); }, INTERVALO);
    }).catch(function (e) { console.info('service worker não registrado:', e && e.message); });
  });
}

registrarAcoes({
  recarregarVersao: function () { location.reload(); },
  fecharAvisoVersao: function () { $('aviso-versao').hidden = true; }
});
