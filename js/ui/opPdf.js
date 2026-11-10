/* ---------------------------------------------------------------------------
   Importar o PDF da OP (Fábrica → ＋ Adicionar OPs → PDF). Lê um ou vários
   PDFs gerados pelo sistema da empresa, acha a OP pelo número (ela já veio
   da planilha de avanço) e grava as operações (setor e horas), que vão para
   a carga máquina. Os dados da peça continuam os da planilha: o que não
   bater só aparece como aviso na conferência. PDF que veio só como imagem
   é lido por OCR (ver pdfTexto.js) e fica marcado para conferir.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto } from '../estado.js';
import { esc, numeroBr } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as OpPdf from '../dominio/opPdf.js';
import { chave } from '../dominio/planilha.js';
import * as Producao from '../dominio/producao.js';
import * as Projeto from '../dominio/projeto.js';
import * as Auth from '../dados/auth.js';
import * as Ops from '../dados/ops.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';
import { paginasDoPdf } from './pdfTexto.js';

const MAX_ARQUIVOS = 40;
const MAX_BYTES = 20 * 1024 * 1024;
let lidos = [];   // [{ arquivo, pdf, op, situacao, divergencias }]
let projetoFixo = null;

// Projetos em que dá para importar: os mesmos da planilha (Gerência: todos os abertos).
function projetosPermitidos() {
  return estado.projetos.filter(function (p) {
    return Projeto.aberto(p) && (Auth.souGerente() || p.responsavelUid === Auth.uid());
  }).sort(function (a, b) { return String(a.commessa).localeCompare(String(b.commessa), 'pt-BR', { numeric: true }); });
}
function projetoAtualId() { return projetoFixo || $('oppdf-projeto').value; }

// projetoId: aberto de dentro do projeto (fica fixo). Sem ele, escolhe na lista.
export function abrirImportarPdf(projetoId) {
  const lista = projetosPermitidos();
  if (!lista.length) { toast(T('fab.semProjetos'), { tipo: 'erro' }); return; }
  projetoFixo = projetoId && lista.some(function (p) { return p.id === projetoId; }) ? projetoId : null;
  const sel = $('oppdf-projeto');
  sel.innerHTML = lista.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.commessa + ' — ' + p.descricao) + '</option>'; }).join('');
  if (projetoFixo) sel.value = projetoFixo;
  sel.disabled = !!projetoFixo;
  lidos = [];
  $('oppdf-arquivo').value = '';
  $('oppdf-lista').innerHTML = '';
  $('oppdf-erro').textContent = '';
  $('oppdf-gravar').disabled = true;
  abrirModal('modal-oppdf', { foco: 'oppdf-arquivo', aoFechar: function () { lidos = []; projetoFixo = null; } });
}

// Só procura a OP dentro do projeto escolhido: outra commessa nunca se mistura.
function acharOp(numero) {
  const k = chave(numero), pid = projetoAtualId();
  return estado.ops.find(function (o) { return o.projetoId === pid && chave(o.numero) === k && Producao.statusOp(o) !== 'morta'; }) || null;
}
function commessaDiferente(pdf) {
  const p = buscarProjeto(projetoAtualId());
  return !!(p && pdf.commessa && p.commessa && chave(pdf.commessa) !== chave(p.commessa));
}

function lerArquivos(ev) {
  const arquivos = Array.from((ev && ev.target && ev.target.files) || []).slice(0, MAX_ARQUIVOS);
  lidos = [];
  $('oppdf-erro').textContent = '';
  $('oppdf-gravar').disabled = true;
  if (!arquivos.length) { $('oppdf-lista').innerHTML = ''; return; }
  const aviso = function (txt) { $('oppdf-lista').innerHTML = '<div class="hint-txt">' + esc(txt) + '</div>'; };
  aviso(T('pdf.lendo', arquivos.length));
  // um arquivo por vez (o OCR é pesado); a lista avisa em qual está
  const lerTodos = Promise.resolve().then(function () {
    let cadeia = Promise.resolve();
    arquivos.forEach(function (arq, i) {
      cadeia = cadeia.then(function () {
        if (arq.size > MAX_BYTES) { lidos.push({ arquivo: arq.name, situacao: 'grande' }); return; }
        const aoOcr = function (n, total) { aviso(T('pdf.lendoOcr', i + 1, arquivos.length, arq.name, n, total)); };
        return arq.arrayBuffer().then(function (buf) { return paginasDoPdf(new Uint8Array(buf), aoOcr); }).then(function (r) {
          const pdf = OpPdf.lerOp(r.paginas);
          if (!pdf.ok) { lidos.push({ arquivo: arq.name, situacao: r.porOcr && pdf.motivo === 'naoEhOp' ? 'ocrFalhou' : pdf.motivo }); return; }
          const outra = commessaDiferente(pdf);
          const op = outra ? null : acharOp(pdf.numero);
          const repetido = lidos.some(function (l) { return l.pdf && l.pdf.numero === pdf.numero; });
          lidos.push({
            arquivo: arq.name, pdf: pdf, op: op, porOcr: r.porOcr > 0,
            situacao: outra ? 'outraCommessa' : (repetido ? 'repetido' : (op ? 'ok' : 'nova')),
            area: op ? op.area : OpPdf.areaProvavel(pdf),
            divergencias: op ? OpPdf.divergencias(pdf, op).filter(function (d) { return d.campo !== 'commessa'; }) : []
          });
        }).catch(function (e) {
          console.warn(e);
          if (e && e.message === 'biblioteca-indisponivel') throw e;
          lidos.push({ arquivo: arq.name, situacao: 'erro' });
        });
      });
    });
    return cadeia;
  });
  lerTodos.then(mostrar).catch(function (e) {
    console.warn(e);
    $('oppdf-lista').innerHTML = '';
    $('oppdf-erro').textContent = T('pdf.erroBiblioteca');
  });
}

function rotuloCampo(c) { return T('pdf.campo.' + c); }
function valorCampo(c, v) { return (c === 'qtd' || c === 'pesoUnit') ? numeroBr(v) : String(v); }

function prontos() { return lidos.filter(function (l) { return l.situacao === 'ok' || l.situacao === 'nova'; }); }

function mostrar() {
  const ok = prontos();
  const novas = lidos.filter(function (l) { return l.situacao === 'nova'; }).length;
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
    if (l.situacao === 'outraCommessa') conf = '✕ ' + esc(T('pdf.sit.outraCommessa', p.commessa, (buscarProjeto(projetoAtualId()) || {}).commessa || ''));
    else if (l.situacao === 'nova') {
      // não está na planilha: entra como OP extra; a área vem dos setores e pode ser trocada
      const i = lidos.indexOf(l);
      conf = '➕ ' + esc(T('pdf.sit.nova')) + '<div class="oppdf-area"><label>' + esc(T('fab.cArea')) + ' <select data-change="areaPdfNova" data-arg="' + i + '">' +
        ['caldeiraria', 'usinagem'].map(function (a) { return '<option value="' + a + '"' + (l.area === a ? ' selected' : '') + '>' + esc(T('area.' + a)) + '</option>'; }).join('') +
        '</select></label></div>';
    }
    else if (l.situacao !== 'ok') conf = '✕ ' + esc(T('pdf.sit.' + l.situacao));
    else if (l.divergencias.length) {
      conf = '⚠ ' + esc(T('pdf.divergeTit')) + '<ul>' + l.divergencias.map(function (d) {
        return '<li>' + esc(T('pdf.diverge', rotuloCampo(d.campo), valorCampo(d.campo, d.pdf), valorCampo(d.campo, d.op))) + '</li>';
      }).join('') + '</ul>';
    } else conf = '✓ ' + esc(T('pdf.confere'));
    if (l.situacao === 'ok' && o && Array.isArray(o.operacoes) && o.operacoes.length) conf += '<div class="hint-txt">' + esc(T('pdf.jaTinha')) + '</div>';
    if (l.porOcr && (l.situacao === 'ok' || l.situacao === 'nova')) conf += '<div class="hint-txt">' + esc(T('pdf.porOcr')) + '</div>';
    const classe = l.situacao === 'nova' ? 'oppdf-nova' : (l.situacao !== 'ok' ? 'oppdf-ruim' : (l.divergencias.length ? 'oppdf-aviso' : ''));
    return '<tr class="' + classe + '"><td class="oppdf-arq">' + esc(l.arquivo) + '</td><td class="mono">' + esc(p.numero) +
      (o ? '<div class="hint-txt">' + esc(T('area.' + o.area)) + '</div>' : '') + '</td><td>' + peca + '</td><td>' + opers + '</td><td>' + conf + '</td></tr>';
  }).join('');
  $('oppdf-lista').innerHTML = '<div class="hint-txt oppdf-resumo">' + esc(T('pdf.resumo', lidos.length, ok.length)) + (novas ? ' · ' + esc(T('pdf.resumoNovas', novas)) : '') + '</div>' +
    '<div class="table-wrap"><table class="oppdf-tab"><thead><tr><th>' + esc(T('pdf.cArquivo')) + '</th><th>' + esc(T('fab.cOp')) + '</th><th>' +
    esc(T('pdf.cPeca')) + '</th><th>' + esc(T('pdf.cOperacoes')) + '</th><th>' + esc(T('pdf.cConferencia')) + '</th></tr></thead><tbody>' + linhas + '</tbody></table></div>';
  $('oppdf-gravar').disabled = !ok.length;
  $('oppdf-gravar').textContent = T('pdf.gravar', ok.length);
}

function gravar(_a, _b, btn) {
  const ok = prontos();
  if (!ok.length) return;
  const p = buscarProjeto(projetoAtualId());
  if (!p) return;
  const novas = ok.filter(function (l) { return l.situacao === 'nova'; }).length;
  comBotaoOcupado(btn, Promise.all(ok.map(function (l) {
    return l.situacao === 'nova' ? Ops.criarDoPdf(p, l.pdf, l.area) : Ops.gravarPdf(l.op.id, l.pdf);
  })).then(function () {
    fecharModal('modal-oppdf');
    toast(T('pdf.gravados', ok.length) + (novas ? ' ' + T('pdf.criadas', novas) : ''));
    if (novas && p.gpUid) Auth.criarNotificacao(p.gpUid, 'planilhaOps', T('notif.opsExtras', p.commessa, novas), p.id);
  }).catch(function (e) { avisoErro(e, 'pdf.erroGravar'); }));
}

// trocar o projeto na lista lê de novo os arquivos já escolhidos
document.addEventListener('change', function (e) {
  if (e.target && e.target.id === 'oppdf-projeto' && $('oppdf-arquivo').files.length) lerArquivos({ target: $('oppdf-arquivo') });
});

registrarAcoes({
  areaPdfNova: function (v, _b, el) { const l = lidos[Number(el.dataset.arg)]; if (l && (v === 'caldeiraria' || v === 'usinagem')) l.area = v; },
  addOpsPdf: function (projetoId) { abrirImportarPdf(projetoId || null); },
  lerPdfsOp: lerArquivos,
  gravarPdfsOp: gravar
});
