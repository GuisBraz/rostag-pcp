/* ---------------------------------------------------------------------------
   OPs Finalizadas (todos os cargos). Quatro botões — Expedição, Montagem
   mecânica, Pintura e Sem destino — abrem, em tela cheia, as commessas não
   finalizadas com peças prontas naquele destino; cada commessa abre a lista
   das peças (o que está disponível para embarque) e exporta o romaneio
   (só as disponíveis). Gerência, GP e técnico do projeto dão o destino.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, opVisivel } from '../estado.js';
import * as Prog from '../dominio/programacao.js';
import './listaOps.js';
import { esc, br, hoje, dataHora, numeroBr } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Fin from '../dominio/finalizadas.js';
import * as Projeto from '../dominio/projeto.js';
import * as Auth from '../dados/auth.js';
import * as DadosProg from '../dados/programacao.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';
import { garantirXlsx } from './bibliotecas.js';

const ICONE = { expedicao: '🚚', montagem: '🔧', pintura: '🎨', semDestino: '❔' };
let aberto = { grupo: null, projetoId: null };

// Só projetos em andamento (concluído, cancelado ou excluído some).
function projetoAberto(pid) { const p = buscarProjeto(pid); return p ? Projeto.aberto(p) : !estado.leProjetos; }
function pecasAtuais() { return Fin.pecas(estado.ops); }

function podeDestinar(projetoId) {
  if (Auth.souGerente()) return true;
  const p = buscarProjeto(projetoId);
  if (!p) return false;
  const papel = Auth.papel(), uid = Auth.uid();
  return (papel === 'gp' && p.gpUid === uid) || (papel === 'tecnico' && p.responsavelUid === uid);
}

export function renderFinalizadas() {
  const lista = pecasAtuais();
  const c = Fin.contagem(lista, projetoAberto);
  // OPs em andamento e em RNC (dos projetos em andamento)
  const fila = Prog.opsNaFila(estado.maquinas);
  const vivas = estado.ops.filter(opVisivel).map(function (o) { return Prog.situacao(o, o.area === 'usinagem' && fila.has(o.id)); });
  const nAndamento = vivas.filter(function (s) { return s === 'emAberto' || s === 'programada' || s === 'baixaCq'; }).length;
  const nRnc = vivas.filter(function (s) { return s === 'rnc'; }).length;
  $('fin-botoes').innerHTML = [['andamento', '⚙', nAndamento, 'fin.ops'], ['rnc', '⚠', nRnc, 'fin.ops']].map(function (x) {
    return '<button type="button" class="card fin-botao fin-' + x[0] + '" data-acao="abrirListaOpsGrupo" data-arg="' + x[0] + '">' +
      '<span class="fin-icone" aria-hidden="true">' + x[1] + '</span><span class="fin-rot">' + esc(T('fin.g.' + x[0])) + '</span>' +
      '<span class="fin-n">' + x[2] + '</span><span class="hint-txt">' + esc(T(x[3])) + '</span></button>';
  }).join('') + Fin.GRUPOS.map(function (g) {
    return '<button type="button" class="card fin-botao fin-' + g + '" data-acao="abrirFinGrupo" data-arg="' + g + '">' +
      '<span class="fin-icone" aria-hidden="true">' + ICONE[g] + '</span><span class="fin-rot">' + esc(T('fin.g.' + g)) + '</span>' +
      '<span class="fin-n">' + c[g] + '</span><span class="hint-txt">' + esc(T('fin.pecasProntas')) + '</span></button>';
  }).join('');
  const recentes = lista.filter(function (p) { return p.pronta && projetoAberto(p.projetoId); })
    .sort(function (a, b) { return String(b.finalizadaEm || '').localeCompare(String(a.finalizadaEm || '')); }).slice(0, 30);
  $('fin-recentes').innerHTML = recentes.length ? '<div class="table-wrap"><table class="ord-tab"><thead><tr><th>' + esc(T('fab.cCommessa')) + '</th><th>' +
    esc(T('fab.cDesenho')) + '</th><th>' + esc(T('fab.cDescricao')) + '</th><th class="num">' + esc(T('fab.cQtd')) + '</th><th>' + esc(T('fin.destino')) + '</th><th>' + esc(T('fin.finalizadaEm')) + '</th></tr></thead><tbody>' +
    recentes.map(function (p) {
      return '<tr><td class="mono">' + esc(p.commessa) + '</td><td class="mono">' + esc(p.desenho) + (p.posicao ? ' · ' + esc(p.posicao) : '') + '</td><td>' + esc(p.descricao || '—') + '</td>' +
        '<td class="num">' + numeroBr(p.qtd) + '</td><td>' + ICONE[Fin.grupo(p)] + ' ' + esc(T('fin.g.' + Fin.grupo(p))) + '</td><td>' + esc(dataHora(p.finalizadaEm)) + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="empty-state">' + esc(T('fin.vazio')) + '</div>';
  renderJanelas();
}

/* --------------------------------------------------------- tela cheia 1 */
function abrirGrupo(g) {
  if (Fin.GRUPOS.indexOf(g) < 0) return;
  aberto = { grupo: g, projetoId: null };
  renderCommessas();
  abrirModal('modal-fin-commessas', { aoFechar: function () { aberto.grupo = null; } });
}
function renderCommessas() {
  const g = aberto.grupo;
  if (!g) return;
  const lista = Fin.commessas(pecasAtuais(), g, projetoAberto);
  $('finc-titulo').textContent = ICONE[g] + ' ' + T('fin.g.' + g);
  $('finc-sub').textContent = T('fin.commessasSub', lista.length);
  $('finc-lista').innerHTML = lista.length ? lista.map(function (c) {
    const p = buscarProjeto(c.projetoId);
    return '<button type="button" class="card fin-commessa" data-acao="abrirFinCommessa" data-arg="' + esc(c.projetoId) + '">' +
      '<b class="mono">' + esc(c.commessa) + '</b><span>' + esc((p && p.descricao) || c.descricaoProjeto || '') + '</span>' +
      '<span class="hint-txt">' + esc(c.cliente || '') + '</span>' +
      '<span class="fin-commessa-n">' + esc(T('fin.prontasDe', c.prontas, c.total)) + '</span></button>';
  }).join('') : '<div class="empty-state">' + esc(T('fin.semCommessas')) + '</div>';
}

/* --------------------------------------------------------- tela cheia 2 */
function abrirCommessa(pid) {
  aberto.projetoId = pid;
  renderItens();
  abrirModal('modal-fin-itens', { aoFechar: function () { aberto.projetoId = null; } });
}
function itensAtuais() { return Fin.itensDaCommessa(pecasAtuais(), aberto.projetoId, aberto.grupo); }
function renderItens() {
  const g = aberto.grupo, pid = aberto.projetoId;
  if (!g || !pid) return;
  const itens = itensAtuais();
  const p = buscarProjeto(pid), i0 = itens[0] || {};
  const destinar = podeDestinar(pid);
  const disp = itens.filter(function (i) { return i.situacao === 'disponivel'; });
  $('fini-titulo').textContent = T('fin.itensTit', (p && p.commessa) || i0.commessa || '', T('fin.g.' + g));
  $('fini-sub').textContent = [(p && p.descricao) || i0.descricaoProjeto, (p && p.cliente) || i0.cliente].filter(Boolean).join(' · ');
  $('fini-resumo').textContent = T(g === 'semDestino' ? 'fin.resumoSem' : 'fin.resumo', disp.length, itens.length);
  $('fini-romaneio').hidden = g === 'semDestino';
  $('fini-romaneio').disabled = !disp.length;
  $('fini-lista').innerHTML = '<div class="table-wrap"><table class="ord-tab fin-tab"><thead><tr><th>' + esc(T('fab.cDesenho')) + '</th><th>' + esc(T('fab.cPos')) + '</th><th>' +
    esc(T('fab.cDescricao')) + '</th><th>OP</th><th class="num">' + esc(T('fab.cQtd')) + '</th><th class="num">' + esc(T('fab.cPeso')) + '</th><th>' + esc(T('fab.cSituacao')) + '</th>' +
    (destinar ? '<th>' + esc(T('fin.destino')) + '</th>' : '') + '</tr></thead><tbody>' +
    itens.map(function (i) {
      const sitTxt = i.situacao === 'outroDestino' ? T('fin.sit.outroDestino', T('fin.g.' + Fin.grupo(i))) : T('fin.sit.' + (g === 'semDestino' && i.situacao === 'disponivel' ? 'semDestino' : i.situacao));
      const nums = i.ops.filter(function (o) { return o.status !== 'morta'; }).map(function (o) { return o.numero; }).join(' / ');
      let acao = '';
      if (destinar && i.pronta) {
        acao = '<td class="fin-destinos">' + Fin.DESTINOS.map(function (d) {
          const atual = i.destino === d;
          return '<button type="button" class="btn btn-mini ' + (atual ? 'btn-primary' : 'btn-outline') + '" data-acao="destinarPeca" data-arg="' + esc(i.id) + '" data-arg2="' + d + '"' + (atual && i.destinoGravado ? ' disabled' : '') + '>' +
            ICONE[d] + ' ' + esc(T('fin.g.' + d)) + '</button>';
        }).join('') + '</td>';
      } else if (destinar) acao = '<td></td>';
      return '<tr class="fin-' + i.situacao + '"><td class="mono">' + esc(i.desenho) + '</td><td>' + esc(i.posicao || '—') + '</td><td>' + esc(i.descricao || '—') + '</td>' +
        '<td class="mono">' + esc(nums) + '</td><td class="num">' + numeroBr(i.qtd) + '</td><td class="num">' + numeroBr(i.pesoTotal) + '</td>' +
        '<td><span class="pill-fin fin-sit-' + esc(i.situacao) + '">' + esc(sitTxt) + '</span></td>' + acao + '</tr>';
    }).join('') + '</tbody></table></div>';
}

export function renderJanelas() {
  if (aberto.grupo && $('modal-fin-commessas').classList.contains('open')) renderCommessas();
  if (aberto.projetoId && $('modal-fin-itens').classList.contains('open')) renderItens();
}

/* --------------------------------------------------------------- romaneio */
// Planilha simples (o modelo da empresa entra depois): cabeçalho do projeto
// e as peças disponíveis, com totais.
function exportarRomaneio(_a, _b, btn) {
  const g = aberto.grupo, pid = aberto.projetoId;
  if (!g || !pid) return;
  const r = Fin.romaneio(itensAtuais());
  if (!r.linhas.length) return;
  const p = buscarProjeto(pid), i0 = itensAtuais()[0] || {};
  const commessa = (p && p.commessa) || i0.commessa || '';
  comBotaoOcupado(btn, garantirXlsx().then(function (XLSX) {
    const aoa = [
      [T('fin.romTitulo', T('fin.g.' + g).toUpperCase())],
      [T('fab.cCommessa'), commessa],
      [T('fin.romCliente'), (p && p.cliente) || i0.cliente || ''],
      [T('fin.romProjeto'), (p && p.descricao) || i0.descricaoProjeto || ''],
      [T('fin.romData'), br(hoje())],
      [],
      ['Item', T('fab.cDesenho'), T('fab.cPos'), T('fab.cDescricao'), T('pdf.campo.produto'), 'OP', T('fab.cQtd'), T('fin.romPesoUnit'), T('fin.romPesoTotal')]
    ];
    r.linhas.forEach(function (l) { aoa.push([l.item, l.desenho, l.posicao, l.descricao, l.produto, l.ops, l.qtd, l.pesoUnit, l.pesoTotal]); });
    aoa.push([]);
    aoa.push(['', '', '', T('fin.romTotal'), '', '', r.totais.qtd, '', r.totais.peso]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 9 }, { wch: 40 }, { wch: 14 }, { wch: 26 }, { wch: 8 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ROMANEIO');
    XLSX.writeFile(wb, ('ROMANEIO - ' + commessa + ' - ' + T('fin.g.' + g)).replace(/[\\/:*?"<>|]+/g, '-') + '.xlsx');
    toast(T('fin.romaneioOk', r.linhas.length));
  }).catch(function (e) { console.warn(e); toast(T('av.erroBaixar'), { tipo: 'erro' }); }));
}

function destinar(pecaId, destino, btn) {
  const peca = pecasAtuais().find(function (x) { return x.id === pecaId; });
  if (!peca || Fin.DESTINOS.indexOf(destino) < 0 || !podeDestinar(peca.projetoId)) return;
  comBotaoOcupado(btn, DadosProg.definirDestino(peca.ops, destino).then(function () {
    toast(T('fin.destinoOk', peca.descricao || peca.desenho, T('fin.g.' + destino)));
  }).catch(function (e) { avisoErro(e); }));
}

registrarAcoes({
  abrirFinGrupo: abrirGrupo,
  abrirFinCommessa: abrirCommessa,
  exportarRomaneio: exportarRomaneio,
  destinarPeca: function (id, destino, btn) { destinar(id, destino, btn); }
});
