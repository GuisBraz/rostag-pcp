/* ---------------------------------------------------------------------------
   Planilha "Controle de Commesse em aberto" (aba Controle) → projetos novos.
   Só entram projetos: os Entregues ficam de fora; commessa repetida vira um
   projeto só (descrições juntas, cliente, o embarque mais longe); as commessas
   da lista de exceções entram uma por OM (subprojetos). O que já existe no
   site é ignorado (o site manda depois de importado). Sem Firebase.
--------------------------------------------------------------------------- */
import { chave, texto, commessaBase, mesmaCommessa } from './planilha.js';
import * as Contratos from './contratos.js';

// Commessas com subprojetos (uma por OM): os contratos de Configurações
const LIM = { commessa: 40, cliente: 80, descricao: 160, om: 40 };

function p2(n) { return String(n).padStart(2, '0'); }
// Data da célula (Date do Excel, "28/08/2026", "8/28/26", número de série) → 'AAAA-MM-DD'
export function dataCelula(v) {
  if (v == null || v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return v.getFullYear() + '-' + p2(v.getMonth() + 1) + '-' + p2(v.getDate());
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { const a = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return a + '-' + p2(m[2]) + '-' + p2(m[1]); }   // dd/mm/aaaa
  return null;
}

// Acha a linha do cabeçalho e as colunas que interessam.
function cabecalho(matriz) {
  for (let i = 0; i < Math.min(matriz.length, 30); i++) {
    const l = (matriz[i] || []).map(function (c) { return chave(c); });
    const com = l.findIndex(function (c) { return c === 'COMMESSES' || c === 'COMMESSA' || c === 'COMMESSAS'; });
    const cli = l.indexOf('CLIENTE'), st = l.indexOf('STATUS');
    if (com >= 0 && cli >= 0 && st >= 0) {
      return { linha: i, com: com, cli: cli, st: st,
        desc: l.findIndex(function (c) { return c.indexOf('DESCRICAO') === 0; }),
        emb: l.findIndex(function (c) { return c.indexOf('EMBARQUE') >= 0; }),
        pc: l.findIndex(function (c) { return c.indexOf('PRAZODEENTREGA') === 0; }) };
    }
  }
  return null;
}

// Commessa da planilha → { base: '2025-016', om: '9000371989' | 'P.3785' | '' }
export function partesCommessa(txt) {
  const s = texto(txt);
  const m = s.match(/\d{4}-\d{3}[A-Z]?/i);
  if (!m) return { base: '', om: '' };
  const base = m[0].toUpperCase();
  const om = s.match(/\bOM\s*[-:.]?\s*(\d{5,})/i);
  if (om) return { base: base, om: om[1] };
  const resto = texto(s.slice(m.index + m[0].length).replace(/^[\s\-–·:]+/, '').replace(/\bREV\.?\s*\d+\b/i, ''));
  return { base: base, om: resto.slice(0, LIM.om) };
}
function ehExcecao(base, excecoes) { return (excecoes || Contratos.atual()).some(function (e) { return mesmaCommessa(e, base); }); }

/** matriz da aba (linhas × colunas) → { ok, motivo?, linhas: [{ base, om, cliente, descricao, status, entrega }] } */
export function lerControle(matriz) {
  const h = cabecalho(matriz || []);
  if (!h) return { ok: false, motivo: 'semCabecalho', linhas: [] };
  const linhas = [];
  for (let i = h.linha + 1; i < matriz.length; i++) {
    const l = matriz[i] || [];
    const c = partesCommessa(l[h.com]);
    if (!c.base) continue;
    linhas.push({ base: c.base, om: c.om, cliente: texto(l[h.cli]), descricao: h.desc >= 0 ? texto(l[h.desc]) : '', status: texto(l[h.st]),
      entrega: (h.emb >= 0 ? dataCelula(l[h.emb]) : null) || (h.pc >= 0 ? dataCelula(l[h.pc]) : null), linha: i + 1 });
  }
  return { ok: true, linhas: linhas };
}

/** linhas → projetos candidatos (sem Entregues; repetidas juntas; contratos por OM —
    linha de contrato sem número de OM vira um subprojeto pela descrição) */
export function agrupar(linhas, excecoes) {
  const grupos = {}, ordem = [];
  (linhas || []).forEach(function (l) {
    if (chave(l.status) === 'ENTREGUE') return;
    const exc = ehExcecao(l.base, excecoes);
    const k = exc ? l.base + '|' + (l.om ? chave(l.om) : 'D' + chave(l.descricao)) : l.base;
    if (!grupos[k]) { grupos[k] = { chave: k, base: l.base, om: exc ? l.om : '', contrato: exc, cliente: '', descricoes: [], entrega: null, linhas: 0 }; ordem.push(k); }
    const g = grupos[k];
    g.linhas++;
    if (!g.cliente && l.cliente) g.cliente = l.cliente;
    if (l.descricao && !g.descricoes.some(function (d) { return chave(d) === chave(l.descricao); })) g.descricoes.push(l.descricao);
    if (l.entrega && (!g.entrega || l.entrega > g.entrega)) g.entrega = l.entrega;
  });
  return ordem.map(function (k) {
    const g = grupos[k];
    return { chave: g.chave, base: g.base, om: g.om, contrato: g.contrato, commessa: g.base.slice(0, LIM.commessa), cliente: (g.cliente || '—').slice(0, LIM.cliente),
      descricao: g.descricoes.join(' · ').slice(0, LIM.descricao) || g.base, entrega: g.entrega, linhas: g.linhas };
  });
}

// Já existe no site? (commessa sem REV/COMPL; nos contratos, a mesma OM — ou a
// mesma descrição, quando a linha não traz OM)
export function jaExiste(c, projetos) {
  return (projetos || []).some(function (p) {
    if (!mesmaCommessa(p.commessa, c.base) && Contratos.base(p.commessa) !== c.base) return false;
    if (!c.om) return !c.contrato || chave(p.descricao) === chave(c.descricao);
    const om = chave(c.om);
    if (chave(p.om) === om || chave(p.commessa).indexOf(om) >= 0) return true;
    // projeto da exceção cadastrado antes sem a OM: reconhece pela descrição
    return !p.om && chave(p.commessa) === chave(c.base) && chave(p.descricao) === chave(c.descricao);
  });
}

// Id fixo (duas pessoas importando ao mesmo tempo não duplicam)
export function idDe(c) { return 'ctl_' + (c.base + (c.om ? '_' + c.om : c.contrato ? '_' + c.descricao : '')).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60); }

/** → { novos: [candidatos], existentes: n, entregues: n, semData: [candidatos sem embarque] } */
export function novosProjetos(matriz, projetos, excecoes) {
  const r = lerControle(matriz);
  if (!r.ok) return { ok: false, motivo: r.motivo, novos: [], existentes: 0, entregues: 0, semData: [] };
  const entregues = r.linhas.filter(function (l) { return chave(l.status) === 'ENTREGUE'; }).length;
  const cands = agrupar(r.linhas, excecoes);
  const ids = new Set((projetos || []).map(function (p) { return p.id; }));
  const fora = cands.filter(function (c) { return !jaExiste(c, projetos) && !ids.has(idDe(c)); });
  return { ok: true, novos: fora.filter(function (c) { return c.entrega; }), semData: fora.filter(function (c) { return !c.entrega; }),
    existentes: cands.length - fora.length, entregues: entregues, linhas: r.linhas.length };
}
export { commessaBase };
