/* ---------------------------------------------------------------------------
   PGMs do projeto (técnico): sobe os PDFs dos programas de corte, confere e
   grava; acompanha a situação (aguardando programação / na fila / cortando /
   cortado). A programação é da programadora de caldeiraria, na Carga Máquina
   (cortes).
--------------------------------------------------------------------------- */
import { estado, buscarProjeto } from '../estado.js';
import { esc, br, numeroBr, compararNatural } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as P from '../dominio/pgm.js';
import { mesmaCommessa } from '../dominio/planilha.js';
import * as Auth from '../dados/auth.js';
import * as Dados from '../dados/pgms.js';
import { paginasDoPdf } from './pdfTexto.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, confirmar } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';

let aberto = null;     // projetoId
let lidos = [];        // [{ arquivo, r, aviso, bloqueio }]

function podeMexer(p) { return !!p && (Auth.souGerente() || p.responsavelUid === Auth.uid()); }
export function pgmsDoProjeto(pid) { return (estado.pgms || []).filter(function (x) { return x.projetoId === pid; }); }
function naFila() {
  const s = new Set();
  (estado.maquinas || []).forEach(function (m) { (m.fila || []).forEach(function (f) { if (f && P.ehPgm(f.opId)) s.add(f.opId.slice(P.PREFIXO.length)); }); });
  return s;
}
function maquinaDaFila(id) {
  const m = (estado.maquinas || []).find(function (x) { return (x.fila || []).some(function (f) { return f.opId === P.PREFIXO + id; }); });
  return m ? m.nome : '';
}
function hm(h) { const t = Math.round((Number(h) || 0) * 60); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }

// Cartão da página do projeto
export function resumoCartao(pid) {
  const l = pgmsDoProjeto(pid);
  if (!l.length) return null;
  const f = naFila(), conta = { aguardando: 0, fila: 0, cortando: 0, cortado: 0 };
  l.forEach(function (x) { conta[P.situacao(x, f.has(x.id))]++; });
  return { valor: String(l.length), detalhe: T('pgm.cartaoDet', conta.aguardando, conta.fila + conta.cortando, conta.cortado), cor: conta.aguardando ? '--amber-ink' : '--ink' };
}

export function abrirPgms(pid) {
  const p = buscarProjeto(pid);
  if (!p) return;
  aberto = pid; lidos = [];
  abrirModal('modal-pgms', { aoFechar: function () { aberto = null; lidos = []; } });
  render();
}

export function render() {
  if (!aberto || !$('modal-pgms').classList.contains('open')) return;
  const p = buscarProjeto(aberto), mexe = podeMexer(p), f = naFila();
  $('pgm-titulo').textContent = T('pgm.titulo', p ? p.commessa : '');
  $('pgm-acoes').innerHTML = mexe ? '<label class="btn btn-outline pgm-arquivo">' + esc(T('pgm.subir')) +
    '<input type="file" id="pgm-arquivos" accept="application/pdf,.pdf" multiple hidden data-change="lerPgms"></label>' : '';
  // conferência do que foi lido
  const conf = lidos.length ? '<div class="card pgm-conf"><div class="panel-title">' + esc(T('pgm.conferir', lidos.filter(function (x) { return !x.bloqueio; }).length, lidos.length)) + '</div>' +
    '<div class="table-wrap"><table class="ord-tab"><thead><tr><th>' + esc(T('pgm.arquivo')) + '</th><th>PGM</th><th>' + esc(T('pgm.maquina')) + '</th><th>' + esc(T('pgm.chapa')) +
    '</th><th class="num">' + esc(T('pgm.tempo')) + '</th><th>' + esc(T('pgm.conferencia')) + '</th></tr></thead><tbody>' +
    lidos.map(function (x) {
      const r = x.r || {};
      return '<tr class="' + (x.bloqueio ? 'pgm-bloq' : (x.aviso ? 'pgm-aviso' : '')) + '"><td class="hint-txt">' + esc(x.arquivo) + '</td><td class="mono"><b>' + esc(r.numero || '—') + '</b></td>' +
        '<td>' + esc(r.maquina ? T('pgm.maq.' + r.maquina) : (r.maquinaTexto || '—')) + '</td><td>' + esc([r.chapa, r.dimensoes].filter(Boolean).join(' · ') || '—') + '</td>' +
        '<td class="num">' + (r.horas ? esc(hm(r.horas)) + '<div class="hint-txt">' + esc(T('pgm.tempoDet', r.tempoMin, r.quantidade)) + '</div>' : '—') + '</td>' +
        '<td>' + esc(x.bloqueio || x.aviso || T('pgm.ok')) + '</td></tr>';
    }).join('') + '</tbody></table></div><div class="pgm-conf-acoes"><button type="button" class="btn btn-outline" data-acao="descartarPgms">' + esc(T('btn.cancelar')) + '</button>' +
    '<button type="button" class="btn btn-primary" data-acao="gravarPgms"' + (lidos.some(function (x) { return !x.bloqueio; }) ? '' : ' disabled') + '>' +
    esc(T('pgm.gravar', lidos.filter(function (x) { return !x.bloqueio; }).length)) + '</button></div></div>' : '';
  const l = pgmsDoProjeto(aberto).sort(function (a, b) { return compararNatural(a.numero, b.numero); });
  const lista = l.length ? '<div class="table-wrap"><table class="ord-tab"><thead><tr><th>PGM</th><th>' + esc(T('pgm.maquina')) + '</th><th>' + esc(T('pgm.chapa')) +
    '</th><th class="num">' + esc(T('pgm.chapas')) + '</th><th class="num">' + esc(T('pgm.peso')) + '</th><th class="num">' + esc(T('pgm.tempo')) + '</th><th>' + esc(T('pgm.situacao')) + '</th><th></th></tr></thead><tbody>' +
    l.map(function (x) {
      const s = P.situacao(x, f.has(x.id));
      const det = s === 'fila' || s === 'cortando' ? maquinaDaFila(x.id) : (s === 'cortado' && x.cortadoEm ? br(String(x.cortadoEm).slice(0, 10)) : '');
      return '<tr><td class="mono"><b>' + esc(x.numero) + '</b><div class="hint-txt">' + esc(x.trabalho || '') + '</div></td>' +
        '<td>' + esc(x.maquina ? T('pgm.maq.' + x.maquina) : (x.maquinaTexto || '—')) + '</td><td>' + esc([x.chapa, x.dimensoes].filter(Boolean).join(' · ') || '—') + '</td>' +
        '<td class="num">' + esc(x.quantidade || 1) + '</td><td class="num">' + (x.peso ? esc(numeroBr(Math.round(x.peso * 10) / 10)) + ' kg' : '—') + '</td><td class="num">' + esc(hm(x.horas)) + '</td>' +
        '<td><span class="pill-cm pgm-s-' + s + '">' + esc(T('pgm.s.' + s)) + '</span>' + (det ? '<div class="hint-txt">' + esc(det) + '</div>' : '') + '</td>' +
        '<td>' + (mexe && s === 'aguardando' ? '<button type="button" class="cm-ic cm-ic-tirar" data-acao="apagarPgm" data-arg="' + esc(x.id) + '" title="' + esc(T('pgm.apagar')) + '" aria-label="' + esc(T('pgm.apagar') + ' ' + x.numero) + '">🗑</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="empty-state">' + esc(T('pgm.vazio')) + '</div>';
  $('pgm-corpo').innerHTML = conf + lista;
}

function lerArquivos(_v, _b, el) {
  const p = buscarProjeto(aberto);
  if (!p || !podeMexer(p) || !el.files || !el.files.length) return;
  const arqs = Array.prototype.slice.call(el.files, 0, 40);
  lidos = arqs.map(function (a) { return { arquivo: a.name, r: null, aviso: '', bloqueio: T('pgm.lendo') }; });
  render();
  let cadeia = Promise.resolve();
  arqs.forEach(function (a, i) {
    cadeia = cadeia.then(function () {
      return a.arrayBuffer().then(function (buf) { return paginasDoPdf(new Uint8Array(buf)); }).then(function (res) {
        const r = P.lerPgm(res.paginas, a.name);
        r.arquivo = a.name;
        const x = lidos[i];
        x.r = r; x.bloqueio = ''; x.aviso = '';
        if (!r.ok) x.bloqueio = T('pgm.erro.' + r.motivo);
        else {
          const existe = pgmsDoProjeto(p.id).find(function (y) { return y.id === P.idPgm(p.id, r.numero); });
          const repetido = lidos.slice(0, i).some(function (y) { return y.r && y.r.numero === r.numero; });
          if (repetido) x.bloqueio = T('pgm.repetidoArq');
          else if (existe && P.situacao(existe, naFila().has(existe.id)) !== 'aguardando') x.bloqueio = T('pgm.jaProgramado');
          else {
            const av = [];
            if (existe) av.push(T('pgm.atualiza'));
            if (!r.maquina) av.push(T('pgm.semMaquina'));
            if (r.commessa && !mesmaCommessa(r.commessa, p.commessa)) av.push(T('pgm.outraCommessa', r.commessa));
            x.aviso = av.join(' · ');
          }
        }
      }).catch(function (e) { console.warn(e); lidos[i].bloqueio = T('pgm.erro.leitura'); }).then(render);
    });
  });
  el.value = '';
}

registrarAcoes({
  abrirPgmsProjeto: abrirPgms,
  lerPgms: lerArquivos,
  descartarPgms: function () { lidos = []; render(); },
  gravarPgms: function (_a, _b, btn) {
    const p = buscarProjeto(aberto);
    const ok = lidos.filter(function (x) { return !x.bloqueio && x.r && x.r.ok; }).map(function (x) { return x.r; });
    if (!p || !ok.length) return;
    comBotaoOcupado(btn, Dados.gravar(p, ok).then(function () { lidos = []; toast(T('pgm.gravados', ok.length)); render(); }).catch(function (e) { avisoErro(e); }));
  },
  apagarPgm: function (id) {
    const x = (estado.pgms || []).find(function (y) { return y.id === id; });
    if (!x) return;
    confirmar(T('pgm.apagarQ', x.numero), { perigo: true, textoOk: T('btn.excluir') }).then(function (sim) {
      if (sim) Dados.apagar(id).then(function () { toast(T('pgm.apagado', x.numero)); }).catch(function (e) { avisoErro(e); });
    });
  }
});
