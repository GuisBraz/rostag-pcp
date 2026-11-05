/* ---------------------------------------------------------------------------
   Pedaços de HTML repetidos entre telas.
--------------------------------------------------------------------------- */
import { esc } from '../nucleo/fmt.js';

// Indicador pequeno (rótulo + valor) das telas cheias e das áreas do projeto.
// O valor já vem em HTML (pode ter cor); o rótulo é texto.
export function kpi(rotulo, valorHtml) {
  return '<div class="ano-kpi"><div class="rot">' + esc(rotulo) + '</div><div class="val">' + valorHtml + '</div></div>';
}
