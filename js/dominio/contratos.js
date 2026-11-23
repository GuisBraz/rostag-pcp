/* ---------------------------------------------------------------------------
   Contratos com OM (Ordem de Manutenção). Um contrato (ex.: 2026-004) é só um
   agrupador: dentro dele cada OM é um projeto independente (entrega,
   cronograma, OPs, avanço…). O projeto é identificado por commessa + OM.
   A lista de contratos fica em Configurações (config/contratos); sem ela,
   vale a lista padrão. Sem Firebase.
--------------------------------------------------------------------------- */
import { chave, texto, commessaBase } from './planilha.js';

export const PADRAO = ['2025-006', '2025-016', '2025-031', '2025-067', '2026-003', '2026-004'];
const NUM = /\d{4}-\d{3}[A-Z]?/i;
let lista = PADRAO.slice();

// null = ainda sem cadastro (vale a lista padrão); [] = nenhum contrato
export function definir(l) { lista = Array.isArray(l) ? normalizar(l) : PADRAO.slice(); }
export function atual() { return lista.slice(); }

// "2026-004 - OM 9000…" → "2026-004"
export function base(commessa) {
  const m = texto(commessa).match(NUM);
  return m ? m[0].toUpperCase() : commessaBase(commessa);
}
export function ehContrato(commessa, l) {
  const b = base(commessa);
  return !!b && (l || lista).some(function (e) { return base(e) === b; });
}
// Texto digitado ("2025-016, 2026-004 …") → lista limpa, sem repetidos
export function normalizar(entrada) {
  const itens = Array.isArray(entrada) ? entrada : String(entrada || '').split(/[\s,;]+/);
  const vistos = new Set();
  return itens.map(function (s) { const m = texto(s).match(NUM); return m ? m[0].toUpperCase() : ''; })
    .filter(function (s) { if (!s || vistos.has(s)) return false; vistos.add(s); return true; })
    .sort().slice(0, 60);
}

export function mesmaOm(a, b) { return !!chave(a) && chave(a) === chave(b); }

// Nome do projeto em todas as telas: "2026-004 · OM 900038789147"
export function nomeProjeto(p) {
  if (!p) return '';
  const c = String(p.commessa || '');
  if (!p.om || chave(c).indexOf(chave(p.om)) >= 0) return c;
  return c + ' · OM ' + p.om;
}

/** Lista já ordenada → [{ contrato: '2026-004', projetos: [...] } | { projeto }], o contrato
    no lugar do seu primeiro projeto. */
export function agrupar(projetos, l) {
  const saida = [], grupos = {};
  (projetos || []).forEach(function (p) {
    if (!ehContrato(p.commessa, l)) { saida.push({ projeto: p }); return; }
    const b = base(p.commessa);
    if (!grupos[b]) { grupos[b] = { contrato: b, projetos: [] }; saida.push(grupos[b]); }
    grupos[b].projetos.push(p);
  });
  return saida;
}

// Os projetos (OMs) de um contrato
export function doContrato(b, projetos) {
  return (projetos || []).filter(function (p) { return base(p.commessa) === b && ehContrato(p.commessa); });
}
