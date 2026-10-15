/* ---------------------------------------------------------------------------
   Fmt — datas, dias úteis e escape.
   Datas são strings 'AAAA-MM-DD' sempre montadas em horário LOCAL:
   toISOString() converte para UTC e pode deslocar o dia.
--------------------------------------------------------------------------- */
import { prefs } from './prefs.js';

const MAPA_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Escapa texto para HTML (conteúdo e valores de atributo entre aspas).
export function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return MAPA_ESC[c]; });
}

export function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function parse(s) { const p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
export function hoje() { return iso(new Date()); }
export function addDias(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
export function difDias(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
export function dataValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return iso(parse(s)) === s;
}

// Formato de data segue o idioma: dd/mm/aaaa no português, mm/dd/aaaa no inglês.
export function br(s) {
  if (!s) return '—';
  const a = s.slice(0, 4), m = s.slice(5, 7), d = s.slice(8, 10);
  return prefs.idioma === 'en' ? (m + '/' + d + '/' + a) : (d + '/' + m + '/' + a);
}
export function brCurto(s) {
  if (!s) return '—';
  const m = s.slice(5, 7), d = s.slice(8, 10);
  return prefs.idioma === 'en' ? (m + '/' + d) : (d + '/' + m);
}
// Instantes gravados com toISOString() (notificações, chat) estão em UTC:
// à noite no Brasil já caem no dia seguinte. Estes convertem para o local.
export function dataDoInstante(ts) { const d = new Date(ts); return isNaN(d) ? '' : iso(d); }
export function horaDoInstante(ts) {
  const d = new Date(ts);
  return isNaN(d) ? '' : String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
export function fds(s) { const d = parse(s).getDay(); return d === 0 || d === 6; }
export function bytes(n) {
  const sep = prefs.idioma === 'en' ? '.' : ',';
  return n < 1024 ? n + ' B' : (n / 1024).toFixed(1).replace('.', sep) + ' KB';
}

// Célula de CSV (separador ;). Prefixa ' em texto que o Excel interpretaria
// como fórmula (=, +, -, @) — evita injeção de fórmula ao abrir a planilha.
export function csvCampo(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function iniciais(nome) {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

export function copiaProfunda(v) { return JSON.parse(JSON.stringify(v)); }
