/* ---------------------------------------------------------------------------
   I18N — todo texto de interface passa por T(chave, ...args).
   {0}, {1}... no texto são trocados pelos argumentos. Chave ausente no
   idioma atual cai no português; ausente nos dois, devolve a própria chave.
--------------------------------------------------------------------------- */
import { prefs } from '../nucleo/prefs.js';
import pt from './pt.js';
import en from './en.js';

export const I18N = { pt: pt, en: en };

function dicionario() { return I18N[prefs.idioma] || I18N.pt; }

export function T(chave) {
  let txt = dicionario()[chave];
  if (txt == null) txt = I18N.pt[chave] != null ? I18N.pt[chave] : chave;
  if (typeof txt !== 'string') return txt;
  for (let i = 1; i < arguments.length; i++) {
    txt = txt.split('{' + (i - 1) + '}').join(arguments[i]);
  }
  return txt;
}
export function plural(n, chaveU, chaveM) { return n + ' ' + T(n === 1 ? chaveU : chaveM); }
export function meses() { return dicionario().meses; }
export function mesesCurto() { return dicionario().mesesCurto; }
export function codigoIdioma() { return dicionario().idioma; }
export function STATUS_LABEL(k) { return T('st.' + k); }
export function SIT_LABEL(k) { return T('sit.' + k); }
