/* ---------------------------------------------------------------------------
   PDF da OP (gerado pelo sistema da empresa) → dados da OP. Puro cálculo.

   Entrada: o texto de cada página com a posição de cada pedaço
   ([{ x, y, s }], y de cima para baixo). O modelo é sempre o mesmo, uma
   página por operação:
     ORDEM DE PRODUÇÃO  02053101001
     COMESSE/CLIENTE: 2026-039 / VALLOUREC …   DT EMISSÃO: 02/09/2026 …
     SETOR: MANDRILHADORA FOREST
     OPERAÇÃO: 01
     OP  Produto  Descrição  Qtd  UM  Peso Unit.  Tempo …
     02053101001  8000015635  DES. 1609570  1,00  PC  3.131,10  8,00
                  TRILHO SUPERIOR PARTE 1
     PRIMEIRA ETAPA: …
   PDF "impresso" (só imagem, sem texto) não dá para ler: volta semTexto.
--------------------------------------------------------------------------- */
import { chave, texto, numero } from './planilha.js';

const TOLERANCIA_Y = 3;
const MAX_TEXTO = 1500;

/**
 * Posição de um pedaço de texto na página, já "desgirada": x cresce no sentido
 * da leitura e y de cima para baixo. A OP impressa em retrato sai girada 90°
 * dentro da página (o texto fica de lado); aqui ela volta a ser lida normal.
 * transform: a matriz do PDF.js [a, b, c, d, e, f]; largura/altura da página.
 */
export function posicao(transform, largura, altura) {
  const a = transform[0], b = transform[1], e = transform[4], f = transform[5];
  if (Math.abs(b) > Math.abs(a)) {
    return b > 0 ? { x: f, y: e } : { x: altura - f, y: largura - e };   // girado 90° para um lado ou para o outro
  }
  if (a < 0) return { x: largura - e, y: f };                             // de cabeça para baixo
  return { x: e, y: altura - f };
}

// Linhas fixas do formulário (não são a instrução da operação).
const FIXAS = /^(LIDER$|LERTODAOP|ASSDATA|CERTIFICARSEFORAMEXECUTADAS|PCDATAASSINATURA$|PCDATA$|DATAASSINATURA$|ASSINATURA$|DATA$|PC$|RECEBIDODE|ENVIADOPARA$)/;

// Agrupa os pedaços em linhas (de cima para baixo), cada uma em ordem de x.
export function linhasDaPagina(itens) {
  const lista = (itens || []).filter(function (it) { return it && texto(it.s); })
    .slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; });
  const linhas = [];
  lista.forEach(function (it) {
    const ult = linhas[linhas.length - 1];
    if (ult && Math.abs(ult.y - it.y) <= TOLERANCIA_Y) ult.itens.push(it);
    else linhas.push({ y: it.y, itens: [it] });
  });
  return linhas.map(function (l) {
    const ord = l.itens.sort(function (a, b) { return a.x - b.x; });
    return { y: l.y, partes: ord.map(function (it) { return texto(it.s); }), itens: ord };
  });
}

function depoisDe(linha, rotuloChave) {
  for (let i = 0; i < linha.partes.length; i++) {
    const k = chave(linha.partes[i]);
    if (k.indexOf(rotuloChave) === 0) {
      const resto = texto(linha.partes[i].slice(linha.partes[i].indexOf(':') + 1));
      if (linha.partes[i].indexOf(':') >= 0 && resto) return resto;
      return linha.partes[i + 1] || '';
    }
  }
  return '';
}

const NUM_BR = /\d{1,3}(?:\.\d{3})*,\d+|\d+,\d+|\d+/g;

// Uma página = uma operação.
export function lerPagina(itens) {
  const linhas = linhasDaPagina(itens);
  const r = { numero: '', commessa: '', cliente: '', setor: '', operacao: '', etapa: '', produto: '', desenho: '',
    descricao: '', qtd: null, um: '', pesoUnit: null, horas: null, emissao: '', texto: '' };
  let iDados = -1;
  linhas.forEach(function (l, i) {
    const tudo = l.partes.join(' ');
    const k = chave(tudo);
    if (k.indexOf('ORDEMDEPRODUCAO') === 0) {
      const m = tudo.match(/\b(\d{6,})\b/);
      if (m) r.numero = m[1];
    } else if (k.indexOf('COMESSECLIENTE') === 0 || k.indexOf('COMESSACLIENTE') === 0 || k.indexOf('COMMESSACLIENTE') === 0) {
      const cc = depoisDe(l, k.slice(0, 8));
      const partes = cc.split('/');
      r.commessa = texto(partes[0]);
      r.cliente = texto(partes.slice(1).join('/'));
      const em = tudo.match(/EMISS[ÃA]O:\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (em) r.emissao = em[1];
    } else if (k.indexOf('SETOR') === 0 && !r.setor) {
      r.setor = depoisDe(l, 'SETOR');
    } else if (k.indexOf('OPERACAO') === 0 && !r.operacao) {
      r.operacao = depoisDe(l, 'OPERACAO');
    } else if (/ETAPA:?$/.test(tudo.trim().toUpperCase()) && !r.etapa) {
      r.etapa = tudo.replace(/:$/, '').trim();
    } else if (r.numero && iDados < 0 && l.partes[0] === r.numero && i > 0) {
      iDados = i;
    }
  });
  if (iDados >= 0) {
    const l = linhas[iDados];
    r.produto = l.partes[1] && /^\d+$/.test(l.partes[1]) ? l.partes[1] : '';
    const des = l.partes.find(function (p) { return /^DES\.?\s*/i.test(p); });
    r.desenho = des ? texto(des.replace(/^DES\.?\s*/i, '')) : '';
    // depois do desenho: qtd, UM, peso unit. e tempo (às vezes peso e tempo vêm juntos)
    const iDes = des ? l.partes.indexOf(des) : 1;
    const resto = l.partes.slice(iDes + 1);
    const um = resto.find(function (p) { return /^[A-Za-z]{1,4}$/.test(p); });
    r.um = um || '';
    const nums = (resto.filter(function (p) { return p !== um; }).join(' ').match(NUM_BR) || []).map(numero);
    r.qtd = nums[0] == null ? null : nums[0];
    r.pesoUnit = nums[1] == null ? null : nums[1];
    r.horas = nums[2] == null ? null : nums[2];
    const prox = linhas[iDados + 1];
    let inicioTexto = iDados + 1;
    if (prox && prox.y - l.y < 30) { r.descricao = prox.partes.join(' '); inicioTexto = iDados + 2; }
    // o texto da instrução: as linhas depois da peça, sem as linhas fixas do formulário
    const instrucao = [];
    linhas.slice(inicioTexto).forEach(function (ln) {
      const t = ln.partes.join(' ').trim();
      const k = chave(t);
      if (!k || FIXAS.test(k) || (/ETAPA$/.test(k) && k.length <= 20) || /^\d+$/.test(k)) return;
      instrucao.push(t);
    });
    r.texto = instrucao.join('\n').slice(0, MAX_TEXTO);
  }
  return r;
}

/**
 * O PDF inteiro → { ok, motivo?, numero, commessa, cliente, emissao, produto,
 * desenho, descricao, qtd, um, pesoUnit, operacoes: [{ n, setor, horas, etapa }], horas }
 *  motivo: 'semTexto' (PDF impresso / imagem) · 'naoEhOp' (não achou o nº)
 */
export function lerOp(paginas) {
  const comTexto = (paginas || []).filter(function (p) { return p && p.some(function (it) { return texto(it.s); }); });
  if (!comTexto.length) return { ok: false, motivo: 'semTexto' };
  const lidas = comTexto.map(lerPagina).filter(function (p) { return p.numero; });
  if (!lidas.length) return { ok: false, motivo: 'naoEhOp' };
  const base = lidas[0];
  const numeros = Array.from(new Set(lidas.map(function (p) { return p.numero; })));
  const operacoes = lidas.map(function (p, i) {
    return { n: p.operacao || String(i + 1).padStart(2, '0'), setor: p.setor.slice(0, 60), horas: p.horas == null ? 0 : p.horas, etapa: p.etapa.slice(0, 40), texto: p.texto || '' };
  }).slice(0, 60);
  const horas = Math.round(operacoes.reduce(function (s, o) { return s + (o.horas || 0); }, 0) * 100) / 100;
  const primeiro = function (k) { const p = lidas.find(function (x) { return x[k] != null && x[k] !== ''; }); return p ? p[k] : (base[k] == null ? '' : base[k]); };
  return {
    ok: true, numero: base.numero, outrosNumeros: numeros.slice(1),
    commessa: primeiro('commessa'), cliente: primeiro('cliente'), emissao: primeiro('emissao'),
    produto: primeiro('produto'), desenho: primeiro('desenho'), descricao: primeiro('descricao'),
    qtd: primeiro('qtd') === '' ? null : primeiro('qtd'), um: primeiro('um'),
    pesoUnit: primeiro('pesoUnit') === '' ? null : primeiro('pesoUnit'),
    operacoes: operacoes, horas: horas
  };
}

// Área provável de uma OP que não está na planilha, pelos setores do roteiro
// (montagem, solda e acabamento são da caldeiraria; o resto, usinagem).
export function areaProvavel(pdf) {
  const setores = (pdf && pdf.operacoes || []).map(function (o) { return chave(o.setor); });
  return setores.some(function (k) { return /CALD|SOLDA|MONT|ACABAMENTO|CHAPARIA|CORTE/.test(k); }) ? 'caldeiraria' : 'usinagem';
}

/**
 * Confere o PDF com a OP que já está no sistema (vinda da planilha).
 * Devolve a lista do que não bate: [{ campo, pdf, op }]. A planilha manda;
 * isso é só aviso.
 */
export function divergencias(pdf, op) {
  const lista = [];
  const dif = function (campo, a, b, num) {
    if (a == null || a === '' || b == null || b === '') return;
    const igual = num ? Math.abs(Number(a) - Number(b)) < 0.01 : chave(a) === chave(b);
    if (!igual) lista.push({ campo: campo, pdf: a, op: b });
  };
  dif('desenho', pdf.desenho, op.desenho);
  dif('produto', pdf.produto, op.produto);
  dif('qtd', pdf.qtd, op.qtd, true);
  dif('pesoUnit', pdf.pesoUnit, op.pesoUnit, true);
  dif('commessa', pdf.commessa, op.commessa);
  return lista;
}
