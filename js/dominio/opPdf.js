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

// Vão entre palavras, em alturas de letra: até isso é a mesma frase
// ("MONT. CALD TERCEIROS"); mais que isso é outra coluna.
const VAO_FRASE = 0.9;

/**
 * Resultado do OCR (Tesseract) → os mesmos pedaços { x, y, s } do PDF com
 * texto, em pontos do PDF. linhas: data.lines do Tesseract (palavras com
 * bbox em pixels); escala: pixels por ponto. Cada linha usa a altura da
 * linha de base, para as palavras dela caírem juntas em linhasDaPagina.
 */
export function itensDoOcr(linhas, escala) {
  const itens = [];
  (linhas || []).forEach(function (ln) {
    const palavras = (ln && ln.words || []).filter(function (w) { return w && w.bbox && texto(w.text); })
      .sort(function (a, b) { return a.bbox.x0 - b.bbox.x0; });
    if (!palavras.length) return;
    const alturas = palavras.map(function (w) { return w.bbox.y1 - w.bbox.y0; }).sort(function (a, b) { return a - b; });
    const altura = alturas[Math.floor(alturas.length / 2)] || 1;
    const b = ln.baseline;
    const y = b && b.y0 != null ? (b.y0 + b.y1) / 2 : Math.max.apply(null, palavras.map(function (w) { return w.bbox.y1; }));
    let atual = null;
    palavras.forEach(function (w) {
      if (atual && w.bbox.x0 - atual.x1 <= altura * VAO_FRASE) {
        atual.s += ' ' + texto(w.text); atual.x1 = w.bbox.x1;
      } else {
        atual = { x0: w.bbox.x0, x1: w.bbox.x1, s: texto(w.text) };
        itens.push(atual);
      }
      atual.y = y;
    });
  });
  return itens.map(function (it) { return { x: it.x0 / escala, y: it.y / escala, s: it.s }; });
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

// O OCR confunde letra com algarismo: "o1" → "01", "SMO6125010103" → "SM06125010103".
const PARECE_DIGITO = /^[0-9oOIl|]+$/;
function soDigitos(s) { return s.replace(/[oO]/g, '0').replace(/[Il|]/g, '1'); }
export function codigoOcr(s) {
  const t = texto(s);
  if (PARECE_DIGITO.test(t)) return soDigitos(t);
  // prefixo de letras o mais curto possível; o resto tem de parecer número
  const m = t.match(/^([A-Za-z]+?)([0-9oOIl|]+)$/);
  return m && (m[2].match(/\d/g) || []).length >= 4 ? m[1] + soDigitos(m[2]) : t;
}
// Qtd, peso e tempo sempre vêm com 2 casas ("40,00"); se o OCR perdeu a
// vírgula ("1148"), ela volta antes dos 2 últimos algarismos.
function decimalOcr(p) { return /^\d{3,}$/.test(p) ? p.slice(0, -2) + ',' + p.slice(-2) : p; }

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
      r.operacao = codigoOcr(depoisDe(l, 'OPERACAO'));
    } else if (/ETAPA:?$/.test(tudo.trim().toUpperCase()) && !r.etapa) {
      r.etapa = tudo.replace(/:$/, '').trim();
    } else if (r.numero && iDados < 0 && l.partes[0] === r.numero && i > 0) {
      iDados = i;
    }
  });
  if (iDados >= 0) {
    const l = linhas[iDados];
    const prod = codigoOcr((l.partes[1] || '').split(/\s+/)[0]);
    r.produto = /^\d{6,}$/.test(prod) ? prod : '';
    const des = l.partes.find(function (p) { return /^DES\.?\s*/i.test(p); });
    let resto;
    if (des) {
      r.desenho = texto(des.replace(/^DES\.?\s*/i, ''));
      resto = l.partes.slice(l.partes.indexOf(des) + 1);
    } else {
      // sem "DES.": o código do desenho (ex.: SM06125010103) vem logo depois do produto
      const tokens = l.partes.join(' ').split(/\s+/);
      const iDes = r.produto ? 2 : 1;
      const cand = tokens[iDes] || '';
      const temDesenho = cand && !/^[\d.,]+$/.test(cand) && !/^[A-Za-z]{1,4}$/.test(cand);
      r.desenho = temDesenho ? codigoOcr(cand) : '';
      resto = tokens.slice(temDesenho ? iDes + 1 : iDes).map(decimalOcr);
    }
    // depois do desenho: qtd, UM, peso unit. e tempo (às vezes peso e tempo vêm juntos)
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
    let fimDoTexto = false;
    linhas.slice(inicioTexto).forEach(function (ln, j, resto) {
      const t = ln.partes.join(' ').trim();
      const k = chave(t);
      // "PC Data Assinatura" seguido da grade 001, 002…: dali pra baixo é só
      // o quadro de assinaturas (no OCR ele vira lixo, então nem entra)
      if (k === 'PCDATAASSINATURA' && resto[j + 1] && /^0*01\b/.test(resto[j + 1].partes.join(' ').trim())) fimDoTexto = true;
      if (fimDoTexto) return;
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
  let lidas = comTexto.map(lerPagina).filter(function (p) { return p.numero; });
  // página de continuação (só o cabeçalho, sem setor nem operação) não é outra operação
  if (lidas.some(function (p) { return p.setor || p.operacao; })) lidas = lidas.filter(function (p) { return p.setor || p.operacao; });
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
