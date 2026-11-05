/* ---------------------------------------------------------------------------
   Importar o PDF da OP (Fábrica → ＋ Adicionar OPs → PDF). Lê um ou vários
   PDFs gerados pelo sistema da empresa, acha a OP pelo número (ela já veio
   da planilha de avanço) e grava as operações (setor e horas), que vão para
   a carga máquina. Os dados da peça continuam os da planilha: o que não
   bater só aparece como aviso na conferência.
--------------------------------------------------------------------------- */
import { estado } from '../estado.js';
import { esc, numeroBr } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as OpPdf from '../dominio/opPdf.js';
import { chave } from '../dominio/planilha.js';
import * as Producao from '../dominio/producao.js';
import * as Ops from '../dados/ops.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';
import { garantirPdfJs } from './bibliotecas.js';

const MAX_ARQUIVOS = 40;
const MAX_BYTES = 20 * 1024 * 1024;
let lidos = [];   // [{ arquivo, pdf, op, situacao, divergencias }]

export function abrirImportarPdf() {
  lidos = [];
  $('oppdf-arquivo').value = '';
  $('oppdf-lista').innerHTML = '';
  $('oppdf-erro').textContent = '';
  $('oppdf-gravar').disabled = true;
  abrirModal('modal-oppdf', { foco: 'oppdf-arquivo', aoFechar: function () { lidos = []; } });
}

// Texto de cada página com a posição (y de cima para baixo).
function paginasDoPdf(lib, dados) {
  return lib.getDocument({ data: dados, isEvalSupported: false, disableFontFace: true }).promise.then(function (doc) {
    const paginas = [];
    let cadeia = Promise.resolve();
    for (let n = 1; n <= Math.min(doc.numPages, 80); n++) {
      cadeia = cadeia.then(function () { return doc.getPage(n); }).then(function (pg) {
        const vp = pg.getViewport({ scale: 1 });
        return pg.getTextContent().then(function (tc) {
          paginas.push(tc.items.map(function (it) { return { x: it.transform[4], y: vp.height - it.transform[5], s: it.str }; }));
        });
      });
    }
    return cadeia.then(function () { doc.destroy(); return paginas; });
  });
}

function acharOp(numero) {
  const k = chave(numero);
  return estado.ops.find(function (o) { return chave(o.numero) === k && Producao.statusOp(o) !== 'morta'; }) || null;
}

function lerArquivos(ev) {
  const arquivos = Array.from((ev && ev.target && ev.target.files) || []).slice(0, MAX_ARQUIVOS);
  lidos = [];
  $('oppdf-erro').textContent = '';
  $('oppdf-gravar').disabled = true;
  if (!arquivos.length) { $('oppdf-lista').innerHTML = ''; return; }
  $('oppdf-lista').innerHTML = '<div class="hint-txt">' + esc(T('pdf.lendo', arquivos.length)) + '</div>';
  garantirPdfJs().then(function (lib) {
    let cadeia = Promise.resolve();
    arquivos.forEach(function (arq) {
      cadeia = cadeia.then(function () {
        if (arq.size > MAX_BYTES) { lidos.push({ arquivo: arq.name, situacao: 'grande' }); return; }
        return arq.arrayBuffer().then(function (buf) { return paginasDoPdf(lib, new Uint8Array(buf)); }).then(function (paginas) {
          const pdf = OpPdf.lerOp(paginas);
          if (!pdf.ok) { lidos.push({ arquivo: arq.name, situacao: pdf.motivo }); return; }
          const op = acharOp(pdf.numero);
          const repetido = lidos.some(function (l) { return l.pdf && l.pdf.numero === pdf.numero; });
          lidos.push({
            arquivo: arq.name, pdf: pdf, op: op,
            situacao: repetido ? 'repetido' : (op ? 'ok' : 'naoEncontrada'),
            divergencias: op ? OpPdf.divergencias(pdf, op) : []
          });
        }).catch(function (e) { console.warn(e); lidos.push({ arquivo: arq.name, situacao: 'erro' }); });
      });
    });
    return cadeia;
  }).then(mostrar).catch(function (e) {
    console.warn(e);
    $('oppdf-lista').innerHTML = '';
    $('oppdf-erro').textContent = T('pdf.erroBiblioteca');
  });
}

function rotuloCampo(c) { return T('pdf.campo.' + c); }
function valorCampo(c, v) { return (c === 'qtd' || c === 'pesoUnit') ? numeroBr(v) : String(v); }

function mostrar() {
  const ok = lidos.filter(function (l) { return l.situacao === 'ok'; });
  const linhas = lidos.map(function (l) {
    if (!l.pdf) {
      return '<tr class="oppdf-ruim"><td class="oppdf-arq">' + esc(l.arquivo) + '</td><td colspan="3">—</td><td>✕ ' + esc(T('pdf.sit.' + l.situacao)) + '</td></tr>';
    }
    const p = l.pdf, o = l.op;
    const peca = o ? esc(o.desenho) + (o.posicao ? ' · ' + esc(T('pdf.pos', o.posicao)) : '') + '<div class="hint-txt">' + esc(o.commessa + ' — ' + (o.descricao || '')) + '</div>'
      : esc(p.desenho) + '<div class="hint-txt">' + esc(p.commessa + ' — ' + p.descricao) + '</div>';
    const opers = '<b>' + p.operacoes.length + '</b> · ' + esc(numeroBr(p.horas)) + ' h' +
      '<div class="hint-txt">' + esc(Array.from(new Set(p.operacoes.map(function (x) { return x.setor; }))).join(', ')) + '</div>';
    let conf;
    if (l.situacao !== 'ok') conf = '✕ ' + esc(T('pdf.sit.' + l.situacao));
    else if (l.divergencias.length) {
      conf = '⚠ ' + esc(T('pdf.divergeTit')) + '<ul>' + l.divergencias.map(function (d) {
        return '<li>' + esc(T('pdf.diverge', rotuloCampo(d.campo), valorCampo(d.campo, d.pdf), valorCampo(d.campo, d.op))) + '</li>';
      }).join('') + '</ul>';
    } else conf = '✓ ' + esc(T('pdf.confere'));
    if (l.situacao === 'ok' && o && Array.isArray(o.operacoes) && o.operacoes.length) conf += '<div class="hint-txt">' + esc(T('pdf.jaTinha')) + '</div>';
    const classe = l.situacao !== 'ok' ? 'oppdf-ruim' : (l.divergencias.length ? 'oppdf-aviso' : '');
    return '<tr class="' + classe + '"><td class="oppdf-arq">' + esc(l.arquivo) + '</td><td class="mono">' + esc(p.numero) +
      (o ? '<div class="hint-txt">' + esc(T('area.' + o.area)) + '</div>' : '') + '</td><td>' + peca + '</td><td>' + opers + '</td><td>' + conf + '</td></tr>';
  }).join('');
  $('oppdf-lista').innerHTML = '<div class="hint-txt oppdf-resumo">' + esc(T('pdf.resumo', lidos.length, ok.length)) + '</div>' +
    '<div class="table-wrap"><table class="oppdf-tab"><thead><tr><th>' + esc(T('pdf.cArquivo')) + '</th><th>' + esc(T('fab.cOp')) + '</th><th>' +
    esc(T('pdf.cPeca')) + '</th><th>' + esc(T('pdf.cOperacoes')) + '</th><th>' + esc(T('pdf.cConferencia')) + '</th></tr></thead><tbody>' + linhas + '</tbody></table></div>';
  $('oppdf-gravar').disabled = !ok.length;
  $('oppdf-gravar').textContent = T('pdf.gravar', ok.length);
}

function gravar(_a, _b, btn) {
  const ok = lidos.filter(function (l) { return l.situacao === 'ok'; });
  if (!ok.length) return;
  comBotaoOcupado(btn, Promise.all(ok.map(function (l) { return Ops.gravarPdf(l.op.id, l.pdf); })).then(function () {
    fecharModal('modal-oppdf');
    toast(T('pdf.gravados', ok.length));
  }).catch(function (e) { avisoErro(e, 'pdf.erroGravar'); }));
}

registrarAcoes({
  addOpsPdf: abrirImportarPdf,
  lerPdfsOp: lerArquivos,
  gravarPdfsOp: gravar
});
