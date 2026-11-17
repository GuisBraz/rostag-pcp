/* ---------------------------------------------------------------------------
   Recursos da Carga Fábrica (caldeiraria), sem Firebase:
     - cadastro (config/recursosCald): empresas (ex.: YANI), tipos de recurso
       ligados a uma etapa (Montagem = caldeireiros, Solda = soldadores,
       Acabamento = ajudantes, e outros que a programadora criar), quantas
       pessoas cada empresa tem de cada tipo, dias de trabalho e datas avulsas;
     - programação da OP (op.programacao.etapas): por etapa, o recurso, quantas
       pessoas, início e fim (datas) e a baixa da etapa;
     - ocupação por dia, conferência ao programar (não deixa passar do que a
       empresa tem), OPs "programadas sem recurso" e a carga (peças e kg) por semana.
   OPs programadas juntas (mesmo "grupo") dividem a mesma equipe: contam uma vez.
--------------------------------------------------------------------------- */

export const TIPOS_PADRAO = [
  { id: 'montagem', nome: 'Caldeireiros', etapa: 'Montagem' },
  { id: 'solda', nome: 'Soldadores', etapa: 'Solda' },
  { id: 'acabamento', nome: 'Ajudantes', etapa: 'Acabamento' }
];
export const EMPRESA_PADRAO = { id: 'yani', nome: 'YANI', qtd: {} };
// índice = getDay() (0 = domingo): segunda a sexta
export const DIAS_PADRAO = [false, true, true, true, true, true, false];
export const MAX_TIPOS = 12, MAX_EMPRESAS = 20, MAX_EXTRAS = 120, MAX_ETAPAS = 12;

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
function texto(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
function inteiro(v, max) { const n = Math.floor(Number(v)); return n > 0 ? Math.min(n, max) : 0; }

// Cadastro com os valores padrão no que faltar.
export function normalizar(cfg) {
  const c = cfg || {};
  const tipos = Array.isArray(c.tipos) && c.tipos.length ? c.tipos : TIPOS_PADRAO;
  const empresas = Array.isArray(c.empresas) ? c.empresas : [EMPRESA_PADRAO];
  return {
    tipos: tipos.slice(0, MAX_TIPOS).map(function (t) { return { id: texto(t.id, 40), nome: texto(t.nome, 40), etapa: texto(t.etapa || t.nome, 40) }; }).filter(function (t) { return t.id && t.nome; }),
    empresas: empresas.slice(0, MAX_EMPRESAS).map(function (e) {
      const qtd = {};
      Object.keys(e.qtd || {}).forEach(function (k) { const n = inteiro(e.qtd[k], 999); if (n) qtd[k] = n; });
      return { id: texto(e.id, 40), nome: texto(e.nome, 60), qtd: qtd };
    }).filter(function (e) { return e.id && e.nome; }),
    dias: Array.isArray(c.dias) && c.dias.length === 7 ? c.dias.map(Boolean) : DIAS_PADRAO.slice(),
    extras: Object.keys(c.extras || {}).filter(function (d) { return RE_DIA.test(d); }).slice(0, MAX_EXTRAS)
      .reduce(function (r, d) { r[d] = !!c.extras[d]; return r; }, {})
  };
}

/* ------------------------------------------------------------------ datas */
function dt(s) { return new Date(s + 'T12:00:00'); }
function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function somarDias(s, n) { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); }
// Dia de trabalho: a data avulsa manda; senão, o dia da semana.
export function diaUtil(cfg, dia) {
  if (Object.prototype.hasOwnProperty.call(cfg.extras || {}, dia)) return !!cfg.extras[dia];
  return !!(cfg.dias || DIAS_PADRAO)[dt(dia).getDay()];
}
export function diasUteis(cfg, ini, fim) {
  const r = [];
  if (!RE_DIA.test(ini || '') || !RE_DIA.test(fim || '') || fim < ini) return r;
  for (let d = ini, k = 0; d <= fim && k < 800; d = somarDias(d, 1), k++) if (diaUtil(cfg, d)) r.push(d);
  return r;
}
// Soma n dias de trabalho a partir de "ini" (o próprio ini conta se for útil).
export function aposDiasUteis(cfg, ini, n) {
  let d = ini, conta = 0;
  for (let k = 0; k < 800; k++, d = somarDias(d, 1)) { if (diaUtil(cfg, d)) { conta++; if (conta >= n) return d; } }
  return d;
}

/* ------------------------------------------------------------- programação */
// A OP tem programação no modelo novo (por etapas)? A antiga só tinha empresa e datas.
export function temEtapas(o) { return !!(o && o.programacao && Array.isArray(o.programacao.etapas)); }
export function antiga(o) { return !!(o && o.programacao) && !temEtapas(o); }
// Dias que a etapa segura o recurso: do início ao fim (ou até a baixa, se veio antes).
export function diasDaEtapa(cfg, e) {
  const fim = e.b && e.b < e.f ? e.b : e.f;
  return diasUteis(cfg, e.i, fim);
}
// Etapas a partir das linhas do formulário: só as que têm datas.
export function etapasValidas(linhas) {
  return (linhas || []).filter(function (l) { return l && RE_DIA.test(l.i || '') && RE_DIA.test(l.f || ''); }).slice(0, MAX_ETAPAS).map(function (l) {
    return { t: texto(l.t, 40), q: inteiro(l.q, 999), i: l.i, f: l.f < l.i ? l.i : l.f, b: RE_DIA.test(l.b || '') ? l.b : null };
  });
}
export function periodo(etapas) {
  const l = etapas || [];
  if (!l.length) return null;
  return { inicio: l.map(function (e) { return e.i; }).sort()[0], fim: l.map(function (e) { return e.f; }).sort().pop() };
}

// Alocações em vigor (uma por etapa; o grupo conta uma vez), de OPs ainda na fábrica.
// "fora": opId ou grupo para deixar de fora (ao reprogramar a própria OP).
export function alocacoes(ops, fora) {
  const r = [], vistos = {};
  (ops || []).forEach(function (o) {
    if (!temEtapas(o) || o.encerradaEm || o.status === 'aprovada' || o.status === 'desvio') return;
    const pr = o.programacao, chave = pr.grupo || o.id;
    if (fora && (fora === o.id || fora === pr.grupo)) return;
    if (vistos[chave]) { vistos[chave].ops.push(o); return; }
    const a = { chave: chave, empresa: pr.terceirizadaId, em: pr.em || '', ops: [o], etapas: pr.etapas };
    vistos[chave] = a;
    r.push(a);
  });
  return r;
}
// Ocupação: empresa → tipo → dia → pessoas em uso
export function ocupacao(cfg, alocs) {
  const r = {};
  (alocs || []).forEach(function (a) {
    a.etapas.forEach(function (e) {
      if (!(e.q > 0)) return;
      diasDaEtapa(cfg, e).forEach(function (d) {
        const pe = r[a.empresa] = r[a.empresa] || {}, pt = pe[e.t] = pe[e.t] || {};
        pt[d] = (pt[d] || 0) + e.q;
      });
    });
  });
  return r;
}
export function capacidade(cfg, empresaId, tipo) {
  const e = (cfg.empresas || []).find(function (x) { return x.id === empresaId; });
  return e ? (e.qtd[tipo] || 0) : 0;
}
// Pessoas livres do tipo no período (o menor valor entre os dias).
export function livres(cfg, ocup, empresaId, tipo, ini, fim) {
  const cap = capacidade(cfg, empresaId, tipo), dias = diasUteis(cfg, ini, fim);
  if (!dias.length) return cap;
  const usado = ((ocup[empresaId] || {})[tipo]) || {};
  return dias.reduce(function (m, d) { return Math.min(m, cap - (usado[d] || 0)); }, cap);
}
// Conferência ao programar: os dias em que faltaria gente.
export function conferir(cfg, ocup, empresaId, etapas) {
  const faltas = [];
  (etapas || []).forEach(function (e) {
    if (!(e.q > 0)) return;
    const cap = capacidade(cfg, empresaId, e.t), usado = ((ocup[empresaId] || {})[e.t]) || {};
    const dias = diasDaEtapa(cfg, e).filter(function (d) { return (usado[d] || 0) + e.q > cap; });
    if (dias.length) faltas.push({ tipo: e.t, cap: cap, dias: dias, usado: Math.max.apply(null, dias.map(function (d) { return usado[d] || 0; })) });
  });
  return faltas;
}

// OPs "programadas sem recurso": etapa com datas e 0 pessoas (recurso deslocado),
// marcada à mão, ou o recurso acabou (diminuíram as pessoas): as programadas por
// último perdem o recurso primeiro.
export function semRecurso(cfg, ops, h) {
  const r = {};
  const alocs = alocacoes(ops);
  alocs.forEach(function (a) {
    const pr = a.ops[0].programacao;
    const pendente = function (e) { return !e.b && e.f >= (h || ''); };
    if (pr.semRecurso || a.etapas.some(function (e) { return !(e.q > 0) && pendente(e); })) a.ops.forEach(function (o) { r[o.id] = true; });
  });
  const ordem = alocs.slice().sort(function (x, y) { return String(x.em).localeCompare(String(y.em)); });
  const uso = {};
  ordem.forEach(function (a) {
    let falta = false;
    a.etapas.forEach(function (e) {
      if (!(e.q > 0) || e.b) return;
      const cap = capacidade(cfg, a.empresa, e.t);
      diasDaEtapa(cfg, e).forEach(function (d) {
        if (h && d < h) return;
        const k = a.empresa + '|' + e.t + '|' + d;
        if ((uso[k] || 0) + e.q > cap) falta = true; else uso[k] = (uso[k] || 0) + e.q;
      });
    });
    if (falta) a.ops.forEach(function (o) { r[o.id] = true; });
  });
  return r;
}

/* ------------------------------------------------------------------- carga */
// Peças e kg por semana e por empresa: a OP conta em cada semana que o
// período dela (início da 1ª etapa ao fim da última) toca.
export function cargaSemanas(ops, semanas) {
  const r = {};
  (ops || []).forEach(function (o) {
    const pr = o.programacao;
    if (!pr || o.encerradaEm || !pr.previsaoFim) return;
    const ini = pr.inicio || pr.previsaoFim, fim = pr.previsaoFim;
    semanas.forEach(function (s, i) {
      if (fim < s.inicio || ini > s.fim) return;
      const pe = r[pr.terceirizadaId] = r[pr.terceirizadaId] || semanas.map(function () { return { pecas: 0, kg: 0, ops: 0 }; });
      pe[i].pecas += Number(o.qtd) || 0;
      pe[i].kg += Number(o.pesoTotal) || 0;
      pe[i].ops++;
    });
  });
  return r;
}
// Semanas de segunda a domingo a partir da semana de "h".
export function semanas(h, n) {
  const d = dt(h), dow = d.getDay(), seg = somarDias(h, dow === 0 ? -6 : 1 - dow), r = [];
  for (let i = 0; i < n; i++) { const ini = somarDias(seg, i * 7); r.push({ inicio: ini, fim: somarDias(ini, 6) }); }
  return r;
}
// Empresa pode sair do cadastro? Não se tiver OP programada nela.
export function opsDaEmpresa(ops, empresaId) {
  return (ops || []).filter(function (o) { return o.programacao && !o.encerradaEm && o.programacao.terceirizadaId === empresaId; });
}
