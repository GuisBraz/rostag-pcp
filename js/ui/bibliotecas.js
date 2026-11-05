/* ---------------------------------------------------------------------------
   Bibliotecas pesadas (vendor/), carregadas só na primeira vez que alguém
   usa: SheetJS (planilhas), jsPDF (PDF da RNC) e PDF.js (ler o PDF da OP).
--------------------------------------------------------------------------- */
const carregando = {};

function carregar(src, pegar) {
  const pronto = pegar();
  if (pronto) return Promise.resolve(pronto);
  if (!carregando[src]) {
    carregando[src] = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { const lib = pegar(); if (lib) resolve(lib); else { delete carregando[src]; reject(new Error('biblioteca-indisponivel')); } };
      s.onerror = function () { delete carregando[src]; reject(new Error('biblioteca-indisponivel')); };
      document.head.appendChild(s);
    });
  }
  return carregando[src];
}

export function garantirXlsx() { return carregar('vendor/xlsx.full.min.js', function () { return window.XLSX; }); }
export function garantirJsPdf() { return carregar('vendor/jspdf.umd.min.js', function () { return window.jspdf && window.jspdf.jsPDF; }); }
export function garantirPdfJs() {
  return carregar('vendor/pdf.min.js', function () { return window.pdfjsLib; }).then(function (lib) {
    lib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    return lib;
  });
}
