/* ---------------------------------------------------------------------------
   Serviços externos do projeto (usinagem externa, corte laser, dobra, TTAT…).
   Puro cálculo.

   A lista vem da planilha de avanço: a aba SERVIÇOS e as peças marcadas com
   "Serviço ext" ou "TTAT" que não estão nela. O andamento fica em
   equipes/{id}/servicos/{projetoId}.itens[chave]: envios e retornos (podem ser
   parciais). No envio o técnico informa o prazo do fornecedor em dias úteis
   (padrão) ou corridos; vencido o prazo sem o retorno, ele é avisado.
--------------------------------------------------------------------------- */
import { addDias, fds, difDias, hoje } from '../nucleo/fmt.js';
import { chave, texto } from './planilha.js';
import { semelhanca } from './comerciais.js';

export function chaveServico(desenho, posicao, tipo) { return 'S|' + chave(desenho) + '|' + chave(posicao) + '|' + chave(tipo).slice(0, 30); }

/* ------------------------------------------------------ aba SERVIÇOS */
const COL = {
  tipo: function (k) { return k.indexOf('TIPODESERVICO') === 0 || k === 'TIPO'; },
  servico: function (k) { return k.indexOf('DESCRICAODOSERVICO') === 0; },
  peca: function (k) { return k.indexOf('DESCRCAODAPECA') === 0 || k.indexOf('DESCRICAODAPECA') === 0; },
  desenho: function (k) { return k === 'DESENHO'; },
  posicao: function (k) { return k.indexOf('POSICAO') === 0; },
  sc: function (k) { return k.indexOf('SOLICITACAO') === 0 || k === 'SC'; },
  pc: function (k) { return k.indexOf('PEDIDO') === 0 || k === 'PC'; },
  fornecedor: function (k) { return k.indexOf('FORNECEDOR') === 0; },
  obs: function (k) { return k.indexOf('OBSERVA') === 0; }
};
export function lerAba(matriz) {
  const linhas = matriz || [];
  for (let i = 0; i < Math.min(linhas.length, 30); i++) {
    const c = {};
    (linhas[i] || []).forEach(function (v, j) { const k = chave(v); Object.keys(COL).forEach(function (n) { if (c[n] == null && k && COL[n](k)) c[n] = j; }); });
    if (c.tipo == null || (c.desenho == null && c.peca == null)) continue;
    const cel = function (l, n) { return c[n] == null ? '' : texto(l[c[n]]); };
    const r = [];
    for (let j = i + 1; j < linhas.length; j++) {
      const l = linhas[j] || [];
      const tipo = cel(l, 'tipo');
      if (!tipo) continue;
      r.push({ tipo: tipo, servico: cel(l, 'servico'), peca: cel(l, 'peca'), desenho: cel(l, 'desenho'), posicao: cel(l, 'posicao'),
        sc: cel(l, 'sc').replace(/\D/g, ''), pc: cel(l, 'pc').replace(/\D/g, ''), fornecedor: cel(l, 'fornecedor'), obs: cel(l, 'obs') });
    }
    return r;
  }
  return [];
}

/* ---------------------------------------------------------- prazos */
// Data prevista de retorno: envio + prazo, em dias úteis (seg–sex) ou corridos.
export function previsto(envio, dias, tipo) {
  let d = envio, n = Math.max(0, Math.round(Number(dias) || 0));
  if (tipo === 'corridos') return addDias(envio, n);
  while (n > 0) { d = addDias(d, 1); if (!fds(d)) n--; }
  return d;
}

/* ------------------------------------------------------------ lista */
function soma(lista) { return (lista || []).reduce(function (t, x) { return t + (Number(x.qtd) || 0); }, 0); }

/**
 * Serviços do projeto com a situação:
 * { chave, tipo, servico, peca, desenho, posicao, qtd, sc, pc, fornecedor, obs, envios, retornos,
 *   enviado, voltou, naRua, situacao: 'aEnviar' | 'enviado' | 'parcial' | 'voltou', previsto, atrasoDias }
 */
export function lista(itensPlanilha, linhasAba, doc, h) {
  h = h || hoje();
  const regs = (doc && doc.itens) || {};
  const porPeca = {};
  (itensPlanilha || []).forEach(function (it) { porPeca[chave(it.desenho) + '|' + chave(it.posicao)] = it; });
  const r = [], vistos = {};
  (linhasAba || []).forEach(function (s) {
    const it = porPeca[chave(s.desenho) + '|' + chave(s.posicao)];
    const k = chaveServico(s.desenho, s.posicao, s.tipo);
    if (vistos[k]) return;
    vistos[k] = true; vistos['peca|' + chave(s.desenho) + '|' + chave(s.posicao)] = true;
    r.push(montar(k, { tipo: s.tipo, servico: s.servico, peca: s.peca || (it && it.descricao) || '', desenho: s.desenho, posicao: s.posicao,
      qtd: it && it.qtd > 0 ? it.qtd : 1, sc: s.sc, pc: s.pc, fornecedor: s.fornecedor, obs: s.obs }, regs[k], h));
  });
  // peças marcadas na planilha que não estão na aba SERVIÇOS
  (itensPlanilha || []).forEach(function (it) {
    if (it.comercial || vistos['peca|' + chave(it.desenho) + '|' + chave(it.posicao)]) return;
    [['ttat', 'TTAT'], ['servicoExterno', 'Serviço externo']].forEach(function (m) {
      if (!it.marcas || !it.marcas[m[0]]) return;
      const k = chaveServico(it.desenho, it.posicao, m[1]);
      if (vistos[k]) return;
      vistos[k] = true;
      r.push(montar(k, { tipo: m[1], servico: '', peca: it.descricao, desenho: it.desenho, posicao: it.posicao, qtd: it.qtd > 0 ? it.qtd : 1,
        sc: '', pc: '', fornecedor: '', obs: it.obs || '' }, regs[k], h));
    });
  });
  return r;
}
function montar(k, base, reg, h) {
  reg = reg || {};
  const envios = reg.envios || [], retornos = reg.retornos || [];
  const enviado = soma(envios), voltou = soma(retornos), naRua = Math.max(0, enviado - voltou);
  // a enviar · enviado (tudo na rua) · parcial (parte foi ou parte voltou) · voltou (tudo de volta)
  let situacao;
  if (!enviado && !voltou) situacao = 'aEnviar';
  else if (voltou >= base.qtd) situacao = 'voltou';
  else if (naRua > 0 && enviado >= base.qtd && !voltou) situacao = 'enviado';
  else situacao = 'parcial';
  // o prazo que vale é o do envio mais antigo que ainda não voltou inteiro
  let prev = null;
  if (naRua > 0) {
    let resta = voltou;
    for (const e of envios.slice().sort(function (a, b) { return String(a.em).localeCompare(String(b.em)); })) {
      if (resta >= e.qtd) { resta -= e.qtd; continue; }
      prev = e.previsto || previsto(e.em, e.prazo, e.tipoPrazo); break;
    }
  }
  return Object.assign({ chave: k, envios: envios, retornos: retornos, enviado: enviado, voltou: voltou, naRua: naRua, situacao: situacao,
    previsto: prev, atrasoDias: prev && h > prev ? difDias(prev, h) : 0, fornecedorEnvio: reg.fornecedor || '' }, base,
    { fornecedor: reg.fornecedor || base.fornecedor || '', pc: reg.pc || base.pc || '' });
}

export function resumo(linhas) {
  const r = { total: linhas.length, aEnviar: 0, naRua: 0, voltou: 0, atrasados: 0 };
  linhas.forEach(function (l) {
    if (l.situacao === 'voltou') r.voltou++;
    else if (l.naRua > 0) { r.naRua++; if (l.atrasoDias > 0) r.atrasados++; }
    else r.aEnviar++;
  });
  return r;
}

/**
 * Avisos de cobrança para o técnico (calculados, não gravados): serviços com
 * peças na rua cujo prazo chegou (hoje) ou passou.
 * docs: [{ projetoId, itens }] · projetos: { id: projeto } · uid: o técnico
 */
export function avisos(docs, projetos, uid, h) {
  h = h || hoje();
  const r = [];
  (docs || []).forEach(function (d) {
    const p = projetos[d.projetoId];
    if (!p || p.responsavelUid !== uid) return;
    Object.keys(d.itens || {}).forEach(function (k) {
      const reg = d.itens[k];
      const base = { qtd: Number(reg.qtd) || soma(reg.envios), tipo: reg.tipo || '', peca: reg.peca || '', desenho: reg.desenho || '', posicao: reg.posicao || '' };
      const s = montar(k, base, reg, h);
      if (!s.previsto || s.naRua <= 0 || s.previsto > h) return;
      r.push({ id: 'serv-cobrar:' + d.projetoId + ':' + k, tipo: 'serv-cobrar', nivel: s.atrasoDias > 0 ? 'alerta' : 'aviso', projetoId: d.projetoId,
        commessa: p.commessa, peca: base.peca, tipoServico: base.tipo, fornecedor: s.fornecedor, naRua: s.naRua, previsto: s.previsto, atrasoDias: s.atrasoDias });
    });
  });
  return r;
}


/* ------------------------------------------- pedido de compra do serviço */
function textoServico(s) { return [s.tipo, s.servico, s.peca].join(' '); }
// O desenho da peça aparece na descrição do item do pedido?
function citaDesenho(ln, s) { const d = chave(s.desenho); return d.length >= 5 && chave(ln.descricao).indexOf(d) >= 0; }

/**
 * Liga cada linha do pedido (já da commessa do projeto) ao serviço da lista:
 * pela SC (a mais parecida, se a SC tiver vários), depois pelo desenho citado
 * na descrição e, por fim, só sugestão pela descrição.
 * Devolve [{ linha, chave, por: 'sc' | 'desenho' | 'sugestao' | null }]
 */
export function ligarPedido(linhasPedido, servicos) {
  const livres = (servicos || []).slice();
  return (linhasPedido || []).map(function (ln) {
    let achado = null, por = null;
    if (ln.sc) {
      const mesmaSc = livres.filter(function (s) { return s.sc && s.sc === ln.sc; });
      if (mesmaSc.length) {
        achado = mesmaSc.filter(function (s) { return citaDesenho(ln, s); })[0] ||
          mesmaSc.slice().sort(function (a, b) { return semelhanca(ln.descricao, textoServico(b)) - semelhanca(ln.descricao, textoServico(a)); })[0];
        por = 'sc';
      }
    }
    if (!achado) { achado = livres.filter(function (s) { return citaDesenho(ln, s); })[0] || null; if (achado) por = 'desenho'; }
    if (!achado) {
      const melhor = livres.map(function (s) { return { s: s, n: semelhanca(ln.descricao, textoServico(s)) }; }).sort(function (a, b) { return b.n - a.n; })[0];
      if (melhor && melhor.n >= 0.5) { achado = melhor.s; por = 'sugestao'; }
    }
    if (achado) livres.splice(livres.indexOf(achado), 1);
    return { linha: ln, chave: achado ? achado.chave : null, por: por };
  });
}
