/* ---------------------------------------------------------------------------
   PDF da RNC — reproduz o formulário "R02 - Registro de não conformidade"
   (planilha RNC.xlsx da SOFIR): frente com o formulário e verso com as
   observações, mesma estrutura, cores e logo. Gerado no navegador (jsPDF,
   servido junto em vendor/), sem servidor.

   As posições abaixo vêm da planilha original medida em pixels (folha de
   1194 × 1974); px() e py() convertem para pontos numa A4 em pé.
--------------------------------------------------------------------------- */
import { br } from '../nucleo/fmt.js';

const LARG = 1194, ALT = 1974;
const A4 = { w: 595.28, h: 841.89 };
const ESC = Math.min((A4.w - 40) / LARG, (A4.h - 40) / ALT);
const X0 = (A4.w - LARG * ESC) / 2, Y0 = (A4.h - ALT * ESC) / 2;
const px = function (v) { return X0 + v * ESC; };
const py = function (v) { return Y0 + v * ESC; };
const tam = function (ptExcel) { return ptExcel * 1.669 * ESC; };   // corpo da fonte da planilha → PDF
const AZUL = [218, 233, 248];
const RODAPE = 'R02 - Registro de não conformidade - rev.: 01 data 08/10/2024';

let carregando = null, logoUrl = null;
function garantirJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!carregando) {
    carregando = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'vendor/jspdf.umd.min.js';
      s.onload = function () { resolve(window.jspdf.jsPDF); };
      s.onerror = function () { carregando = null; reject(new Error('pdf-indisponivel')); };
      document.head.appendChild(s);
    });
  }
  return carregando;
}
function garantirLogo() {
  if (logoUrl) return Promise.resolve(logoUrl);
  return fetch('img/logo-sofir.png').then(function (r) { return r.blob(); }).then(function (b) {
    return new Promise(function (resolve) {
      const fr = new FileReader();
      fr.onload = function () { logoUrl = fr.result; resolve(logoUrl); };
      fr.readAsDataURL(b);
    });
  }).catch(function () { return null; });
}

/* ------------------------------------------------------------ desenho */
function caixa(doc, x1, y1, x2, y2) { doc.setLineWidth(0.6); doc.rect(px(x1), py(y1), (x2 - x1) * ESC, (y2 - y1) * ESC); }
function linhaH(doc, x1, x2, y, largura) { doc.setLineWidth(largura || 0.6); doc.line(px(x1), py(y), px(x2), py(y)); }
function rotulo(doc, txt, xFim, y, tamanho, negrito) {
  doc.setFont('helvetica', negrito === false ? 'normal' : 'bold');
  let t = tamanho || 11;
  doc.setFontSize(tam(t));
  // não passa da borda da folha
  while (t > 6 && doc.getTextWidth(txt) > (xFim - 8) * ESC) { t -= 0.25; doc.setFontSize(tam(t)); }
  doc.text(txt, px(xFim), py(y), { align: 'right', baseline: 'middle' });
}
// Texto que precisa caber até xMax: diminui o corpo até caber.
function textoCabe(doc, txt, x, xMax, y, tamanho) {
  doc.setFont('helvetica', 'normal');
  let t = tamanho;
  doc.setFontSize(tam(t));
  while (t > 4 && doc.getTextWidth(txt) > (xMax - x) * ESC) { t -= 0.25; doc.setFontSize(tam(t)); }
  doc.text(txt, px(x), py(y), { baseline: 'middle' });
}
function texto(doc, txt, x, y, tamanho, opcoes) {
  doc.setFont('helvetica', (opcoes && opcoes.negrito) ? 'bold' : 'normal');
  doc.setFontSize(tam(tamanho || 11));
  doc.text(String(txt), px(x), py(y), Object.assign({ baseline: 'middle' }, opcoes && opcoes.align ? { align: opcoes.align } : {}));
}
// Valor dentro de uma caixa de campo (cortado se não couber).
function valor(doc, v, x1, x2, y1, y2) {
  if (v == null || v === '') return;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(tam(10));
  const larg = (x2 - x1 - 8) * ESC;
  let s = String(v);
  while (s.length > 1 && doc.getTextWidth(s) > larg) s = s.slice(0, -1);
  doc.text(s, px(x1 + 5), py((y1 + y2) / 2), { baseline: 'middle' });
}
function marca(doc, sim, x1, x2, y1, y2) {
  caixa(doc, x1, y1, x2, y2);
  if (!sim) return;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(tam(11));
  doc.text('X', px((x1 + x2) / 2), py((y1 + y2) / 2), { align: 'center', baseline: 'middle' });
}
// Área pautada: linhas a cada 24 px; o texto vai quebrado sobre elas.
function pautado(doc, txt, x1, x2, yIni, nLinhas) {
  caixa(doc, x1, yIni, x2, yIni + nLinhas * 24);
  for (let i = 1; i < nLinhas; i++) linhaH(doc, x1, x2, yIni + i * 24, 0.4);
  if (!txt) return '';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(tam(10));
  const linhas = doc.splitTextToSize(String(txt), (x2 - x1 - 12) * ESC);
  const cabem = linhas.slice(0, nLinhas);
  cabem.forEach(function (l, i) { doc.text(l, px(x1 + 6), py(yIni + i * 24 + 13), { baseline: 'middle' }); });
  return linhas.slice(nLinhas).join(' ');
}
function cabecalho(doc, logo, titulo, comNumero, numero) {
  doc.setDrawColor(0); doc.setLineWidth(0.9);
  doc.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
  doc.rect(px(190), py(2), (LARG - 2 - 190) * ESC, 73 * ESC, 'F');
  doc.rect(px(2), py(2), (LARG - 4) * ESC, (ALT - 4) * ESC);          // moldura da folha
  linhaH(doc, 2, LARG - 2, 75, 0.9);
  doc.line(px(190), py(2), px(190), py(75));
  if (logo) doc.addImage(logo, 'PNG', px(15), py(9), 163 * ESC, 56 * ESC);
  texto(doc, titulo, comNumero ? 565 : 690, 40, 18, { negrito: true, align: 'center' });
  if (comNumero) {
    texto(doc, 'Nº', 950, 40, 11, { align: 'center' });
    doc.setFillColor(255, 255, 255);
    doc.rect(px(1017), py(27), 160 * ESC, 23 * ESC, 'FD');
    valor(doc, numero, 1017, 1177, 27, 50);
  }
}
function rodape(doc) {
  linhaH(doc, 2, LARG - 2, 1947, 0.9);
  texto(doc, RODAPE, LARG - 6, 1959, 8, { align: 'right' });
}

/**
 * Gera o PDF da RNC e devolve um Blob. `r` = dados da RNC (dominio/rnc.js).
 */
export function gerarPdf(r) {
  return Promise.all([garantirJsPdf(), garantirLogo()]).then(function (res) {
    const JsPDF = res[0], logo = res[1];
    const doc = new JsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    doc.setProperties({ title: 'RNC ' + (r.numero || ''), subject: 'Registro de não conformidade', creator: 'ROSTAG PCP' });

    /* ------------------------------------------------------------ frente */
    cabecalho(doc, logo, 'REGISTRO DE NÃO CONFORMIDADE', true, r.numero);
    // produto · nº des · rev
    rotulo(doc, 'PRODUTO:', 112, 113); caixa(doc, 115, 101, 628, 126); valor(doc, r.produto, 115, 628, 101, 126);
    rotulo(doc, 'Nº DES:', 693, 113); caixa(doc, 697, 101, 1017, 126); valor(doc, r.desenho, 697, 1017, 101, 126);
    rotulo(doc, 'REV:', 1094, 113); caixa(doc, 1097, 101, 1177, 126); valor(doc, r.rev, 1097, 1177, 101, 126);
    // commessa · op · qtd · tag · item
    rotulo(doc, 'COMMESSA:', 112, 163); caixa(doc, 115, 151, 350, 176); valor(doc, r.commessa, 115, 350, 151, 176);
    rotulo(doc, 'OP:', 431, 163); caixa(doc, 435, 151, 628, 176); valor(doc, r.op, 435, 628, 151, 176);
    rotulo(doc, 'QTD:', 693, 163); caixa(doc, 697, 151, 869, 176); valor(doc, r.qtd, 697, 869, 151, 176);
    rotulo(doc, 'TAG:', 933, 163); caixa(doc, 937, 151, 1017, 176); valor(doc, r.tag, 937, 1017, 151, 176);
    rotulo(doc, 'ITEM:', 1094, 163); caixa(doc, 1097, 151, 1177, 176); valor(doc, r.item, 1097, 1177, 151, 176);
    // setor
    const st = r.setor || {};
    rotulo(doc, 'SETOR:', 112, 213);
    marca(doc, st.usinagem, 115, 190, 201, 225); textoCabe(doc, 'USINAGEM', 194, 268, 215, 8);
    marca(doc, st.caldeiraria, 271, 350, 201, 225); textoCabe(doc, 'CALDEIRARIA', 354, 432, 215, 8);
    marca(doc, st.pintura, 435, 517, 201, 225); textoCabe(doc, 'PINTURA', 520, 625, 215, 8);
    marca(doc, st.fornecedor, 628, 697, 201, 225); textoCabe(doc, 'FORNECEDOR', 700, 866, 215, 8);
    marca(doc, st.outros, 869, 937, 201, 225); textoCabe(doc, 'OUTROS:', 940, 1014, 215, 8);
    linhaH(doc, 1017, 1177, 225, 0.6); if (r.setorOutros) valor(doc, r.setorOutros, 1017, 1177, 201, 225);
    doc.setLineDashPattern([2, 2], 0); linhaH(doc, 5, LARG - 5, 250, 0.4); doc.setLineDashPattern([], 0);
    // procedência
    texto(doc, 'PROCEDÊNCIA:', 119, 288, 11, { negrito: true });
    marca(doc, r.procedencia === 'interno', 350, 435, 275, 300); texto(doc, 'Interno', 439, 288, 11);
    marca(doc, r.procedencia === 'externo', 697, 789, 275, 300); texto(doc, 'Externo', 793, 288, 11);
    linhaH(doc, 2, LARG - 2, 325, 0.9);
    // descrição da não conformidade
    caixa(doc, 2, 325, 350, 350); texto(doc, 'Descrição da não-conformidade:', 176, 338, 11, { negrito: true, align: 'center' });
    let sobra = pautado(doc, r.descricao, 17, 1177, 350, 24);
    // inspetor · qtde n/c · data
    rotulo(doc, 'Inpetor:', 112, 963); caixa(doc, 115, 951, 628, 976); valor(doc, r.inspetor, 115, 628, 951, 976);
    rotulo(doc, 'Qtde - N/C:', 785, 963); caixa(doc, 789, 951, 937, 976); valor(doc, r.qtdNc, 789, 937, 951, 976);
    rotulo(doc, 'Data:', 1013, 963); caixa(doc, 1017, 951, 1177, 976); valor(doc, r.data ? br(r.data) : '', 1017, 1177, 951, 976);
    linhaH(doc, 2, LARG - 2, 1000, 0.9); linhaH(doc, 2, LARG - 2, 1025, 0.9);
    // disposição / correção
    texto(doc, 'Disposição/correção:', 20, 1039, 11, { negrito: true });
    const sobraDisp = pautado(doc, r.disposicao, 17, 1177, 1049, 24);
    rotulo(doc, 'Responsável:', 187, 1663); caixa(doc, 190, 1651, 789, 1676); valor(doc, r.dispResponsavel, 190, 789, 1651, 1676);
    rotulo(doc, 'Data:', 866, 1663); caixa(doc, 869, 1651, 1177, 1676); valor(doc, r.dispData ? br(r.dispData) : '', 869, 1177, 1651, 1676);
    // reinspeção
    doc.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
    doc.rect(px(2), py(1700), (LARG - 4) * ESC, 25 * ESC, 'FD');
    texto(doc, 'REINSPEÇÃO', LARG / 2, 1713, 11, { negrito: true, align: 'center' });
    rotulo(doc, 'Nº OP - RETRABALHO:', 187, 1763); caixa(doc, 190, 1751, 517, 1776); valor(doc, r.reOp, 190, 517, 1751, 1776);
    rotulo(doc, 'INSPETOR:', 624, 1763); caixa(doc, 628, 1751, 937, 1776); valor(doc, r.reInspetor, 628, 937, 1751, 1776);
    rotulo(doc, 'DATA:', 1013, 1763); caixa(doc, 1017, 1751, 1177, 1776); valor(doc, r.reData ? br(r.reData) : '', 1017, 1177, 1751, 1776);
    rotulo(doc, 'RETRABALHO:', 187, 1837); marca(doc, r.reResultado === 'retrabalho', 190, 271, 1825, 1849);
    rotulo(doc, 'CONFORME:', 431, 1837); marca(doc, r.reResultado === 'conforme', 435, 517, 1825, 1849);
    rotulo(doc, 'NÃO CONFORME:', 693, 1837); marca(doc, r.reResultado === 'nao_conforme', 697, 789, 1825, 1849);
    rotulo(doc, 'LIBERADA COM DESVIO:', 1013, 1837); marca(doc, r.reResultado === 'desvio', 1017, 1097, 1825, 1849);
    rotulo(doc, 'RESPONSÁVEL:', 268, 1911); caixa(doc, 271, 1898, 869, 1923); valor(doc, r.reResponsavel, 271, 869, 1898, 1923);
    rodape(doc);

    /* ------------------------------------------------------------- verso */
    doc.addPage('a4', 'portrait');
    cabecalho(doc, logo, 'OBSERVAÇÕES', false);
    // o que não coube na frente continua aqui, antes das observações
    const extra = [];
    if (sobra) extra.push('(continuação da descrição) ' + sobra);
    if (sobraDisp) extra.push('(continuação da disposição) ' + sobraDisp);
    if (r.observacoes) extra.push(r.observacoes);
    pautado(doc, extra.join('\n\n'), 17, 1177, 100, 76);
    rodape(doc);
    return doc.output('blob');
  });
}

export function baixarPdf(r) {
  return gerarPdf(r).then(function (blob) {
    const nome = 'RNC ' + String(r.numero || 'sem-numero').replace(/[^\w.-]+/g, '_') + (r.op ? ' - OP ' + String(r.op).replace(/[^\w.-]+/g, '_') : '') + '.pdf';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return nome;
  });
}
