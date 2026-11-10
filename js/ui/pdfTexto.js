/* ---------------------------------------------------------------------------
   Texto de cada página de um PDF, com a posição de cada pedaço.
   O sistema da empresa às vezes exporta a OP com texto e às vezes como
   imagem (impressa): página sem texto é lida por OCR (Tesseract, em
   português, rodando no próprio navegador) e devolve os mesmos pedaços
   { x, y, s } — o resto da leitura não sabe a diferença.
--------------------------------------------------------------------------- */
import * as OpPdf from '../dominio/opPdf.js';
import { garantirPdfJs, garantirTesseract } from './bibliotecas.js';

const MAX_PAGINAS = 80;
const ESCALA_OCR = 3;   // pixels por ponto do PDF (~216 dpi): letra pequena ainda legível

let trabalhador = null;   // worker do Tesseract, criado uma vez e reaproveitado
function ocr() {
  if (!trabalhador) {
    trabalhador = garantirTesseract().then(function (Tesseract) {
      const base = new URL('vendor/tesseract/', location.href).href;
      // caminhos absolutos: o worker resolve relativo a ele mesmo; sem blob:
      // a CSP só deixa worker do próprio site
      return Tesseract.createWorker('por', Tesseract.OEM.LSTM_ONLY, {
        workerPath: base + 'worker.min.js', corePath: base, langPath: base.replace(/\/$/, ''),
        workerBlobURL: false, gzip: true
      }).then(function (w) {
        return w.setParameters({ preserve_interword_spaces: '1' }).then(function () { return w; });
      });
    }).catch(function (e) { trabalhador = null; throw e; });
  }
  return trabalhador;
}

function paginaPorOcr(pg) {
  const vp = pg.getViewport({ scale: ESCALA_OCR });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  // intent 'print': desenha sem esperar requestAnimationFrame, que para quando
  // a aba sai de vista (o OCR de vários arquivos continua em segundo plano)
  return pg.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise
    .then(ocr)
    .then(function (w) { return w.recognize(canvas); })
    .then(function (r) { canvas.width = canvas.height = 0; return OpPdf.itensDoOcr(r.data.lines, ESCALA_OCR); });
}

/**
 * dados: o arquivo (Uint8Array). aoOcr(n, total): avisa quando uma página
 * vai por OCR (é lento: alguns segundos por página).
 * → { paginas: [[{ x, y, s }]], porOcr: nº de páginas lidas por OCR }
 */
export function paginasDoPdf(dados, aoOcr) {
  return garantirPdfJs().then(function (lib) {
    return lib.getDocument({ data: dados, isEvalSupported: false, disableFontFace: true }).promise;
  }).then(function (doc) {
    const paginas = [];
    let porOcr = 0;
    const total = Math.min(doc.numPages, MAX_PAGINAS);
    let cadeia = Promise.resolve();
    for (let n = 1; n <= total; n++) {
      cadeia = cadeia.then(function () { return doc.getPage(n); }).then(function (pg) {
        const vp = pg.getViewport({ scale: 1 });
        return pg.getTextContent().then(function (tc) {
          const itens = tc.items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
            const p = OpPdf.posicao(it.transform, vp.width, vp.height);
            return { x: p.x, y: p.y, s: it.str };
          });
          if (itens.length) { paginas.push(itens); return; }
          porOcr++;
          if (aoOcr) aoOcr(n, total);
          return paginaPorOcr(pg).then(function (lidos) { paginas.push(lidos); });
        });
      });
    }
    return cadeia.then(function () { doc.destroy(); return { paginas: paginas, porOcr: porOcr }; },
      function (e) { doc.destroy(); throw e; });
  });
}
