/* ---------------------------------------------------------------------------
   Lista de OPs em tela cheia, com filtros. Duas entradas:
     - dentro do projeto (técnico): todas as OPs dele, com os botões de
       importar o PDF e de cadastrar OP manual
     - Todas as OPs → "Em andamento" / "Em RNC": OPs dos projetos em andamento
   Clicar numa OP abre a janela com o roteiro e o texto do PDF.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, opVisivel } from '../estado.js';
import { esc, br, numeroBr, compararNatural } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Prog from '../dominio/programacao.js';
import * as Producao from '../dominio/producao.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes } from './dom.js';
import { abrirModal } from './modal.js';
import { naFila, pillSituacao, classeAtraso } from './opDetalhe.js';

const SITUACOES = ['todas', 'emAberto', 'programada', 'baixaCq', 'rnc', 'encerrada'];
const GRUPOS = { andamento: ['emAberto', 'programada', 'baixaCq'], rnc: ['rnc'] };
const ICONES = { pintura: '🎨', servicoExterno: '🚚', ttat: '🔥', oxidacao: '⚫' };
let aberta = null;   // { projetoId, grupo, sit, area, projeto, busca }

/**
 * modo: { projetoId } (as OPs de um projeto) ou { grupo: 'andamento' | 'rnc' }.
 */
export function abrirListaOps(modo) {
  aberta = { projetoId: modo.projetoId || null, grupo: modo.grupo || null, sit: 'todas', area: '', projeto: '', busca: '' };
  $('lops-busca').value = '';
  $('lops-area').value = '';
  abrirModal('modal-lista-ops', { aoFechar: function () { aberta = null; } });
  render();
}

function podeAdicionar(p) { return !!p && (Auth.souGerente() || p.responsavelUid === Auth.uid()); }

export function render() {
  if (!aberta || !$('modal-lista-ops').classList.contains('open')) return;
  const fila = naFila();
  const sit = function (o) { return Prog.situacao(o, o.area === 'usinagem' && fila.has(o.id)); };
  const p = aberta.projetoId ? buscarProjeto(aberta.projetoId) : null;
  $('lops-titulo').textContent = p ? T('lops.tituloProjeto', p.commessa) : T('lops.titulo.' + aberta.grupo);
  $('lops-sub').textContent = p ? (p.descricao || '') : T('lops.sub');
  const adicionar = podeAdicionar(p);
  $('lops-acoes').innerHTML = adicionar
    ? '<button type="button" class="btn btn-outline" data-acao="addOpsPdf" data-arg="' + esc(p.id) + '">' + esc(T('lops.pdf')) + '</button>' +
      '<button type="button" class="btn btn-outline" data-acao="novaOpProjeto" data-arg="' + esc(p.id) + '">' + esc(T('lops.manual')) + '</button>'
    : '';
  // base: as OPs do projeto (todas) ou as dos projetos em andamento, no grupo pedido
  let base = estado.ops.filter(function (o) {
    if (aberta.projetoId) return o.projetoId === aberta.projetoId;
    if (!opVisivel(o)) return false;
    return GRUPOS[aberta.grupo].indexOf(sit(o)) >= 0;
  });
  // filtro de projeto (só na lista geral)
  const selProj = $('lops-projeto');
  selProj.hidden = !!aberta.projetoId;
  if (!aberta.projetoId) {
    const vistos = {};
    base.forEach(function (o) { vistos[o.projetoId] = o.commessa || o.projetoId; });
    const ids = Object.keys(vistos).sort(function (a, b) { return compararNatural(vistos[a], vistos[b]); });
    selProj.innerHTML = '<option value="">' + esc(T('lops.todosProjetos')) + '</option>' + ids.map(function (id) { return '<option value="' + esc(id) + '">' + esc(vistos[id]) + '</option>'; }).join('');
    selProj.value = vistos[aberta.projeto] ? aberta.projeto : '';
    if (aberta.projeto) base = base.filter(function (o) { return o.projetoId === aberta.projeto; });
  }
  if (aberta.area) base = base.filter(function (o) { return o.area === aberta.area; });
  const busca = aberta.busca.trim().toLowerCase();
  if (busca) base = base.filter(function (o) { return [o.numero, o.desenho, o.descricao, o.produto, o.commessa].join(' ').toLowerCase().indexOf(busca) >= 0; });
  const sits = aberta.projetoId ? SITUACOES : ['todas'].concat(GRUPOS[aberta.grupo].length > 1 ? GRUPOS[aberta.grupo] : []);
  $('lops-filtros').innerHTML = sits.map(function (k) {
    const n = k === 'todas' ? base.length : base.filter(function (o) { return sit(o) === k; }).length;
    const ativo = aberta.sit === k;
    return '<button type="button" role="tab" aria-selected="' + ativo + '" class="' + (ativo ? 'ativa' : '') + '" data-acao="filtroListaOps" data-arg="' + k + '">' +
      esc(T(k === 'todas' ? 'ord.todas' : 'prog.sit.' + k)) + '<b>' + n + '</b></button>';
  }).join('');
  const lista = (aberta.sit === 'todas' ? base : base.filter(function (o) { return sit(o) === aberta.sit; })).sort(function (a, b) {
    return compararNatural(a.commessa, b.commessa) || compararNatural(a.desenho, b.desenho) || compararNatural(a.posicao, b.posicao) || compararNatural(a.area, b.area);
  });
  const st = Producao.estatisticas(base);
  $('lops-resumo').textContent = T('lops.resumo', lista.length, st.pct, numeroBr(st.pecasFeitas), numeroBr(st.pecas), numeroBr(st.pecasRnc));
  if (!lista.length) {
    $('lops-corpo').innerHTML = '<div class="empty-state">' + esc(T(estado.ops.some(function (o) { return !aberta.projetoId || o.projetoId === aberta.projetoId; }) ? 'fab.vazioFiltro' : 'lops.vazio')) + '</div>';
    return;
  }
  $('lops-corpo').innerHTML = '<div class="table-wrap lops-tabela"><table class="ord-tab"><thead><tr>' +
    (aberta.projetoId ? '' : '<th>' + esc(T('fab.cCommessa')) + '</th>') +
    ['OP', T('fab.cArea'), T('fab.cDesenho'), T('fab.cPos'), T('fab.cDescricao'), T('pdf.campo.produto')].map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
    '<th class="num">' + esc(T('fab.cQtd')) + '</th><th class="num">' + esc(T('fab.cPeso')) + '</th><th>' + esc(T('av.cMarcas')) + '</th><th>' + esc(T('lops.roteiro')) +
    '</th><th>' + esc(T('lops.programacao')) + '</th><th>' + esc(T('fab.cSituacao')) + '</th></tr></thead><tbody>' +
    lista.map(function (o) {
      const pc = Producao.pecasOp(o);
      const horas = (o.operacoes || []).reduce(function (t, x) { return t + (Number(x.horas) || 0); }, 0);
      const roteiro = o.operacoes && o.operacoes.length ? T('fab.roteiro', o.operacoes.length, numeroBr(Math.round(horas * 100) / 100)) : '—';
      const filas = (estado.maquinas || []).filter(function (m) { return (m.fila || []).some(function (f) { return f.opId === o.id; }); }).map(function (m) { return m.nome; });
      const progr = o.programacao ? (o.programacao.terceirizada || '—') + ' · ' + T('prog.ate', br(o.programacao.previsaoFim)) : (filas.length ? filas.join(', ') : '—');
      const marcas = Object.keys(ICONES).filter(function (k) { return o.marcas && o.marcas[k]; }).map(function (k) { return '<span title="' + esc(T('av.marca.' + k)) + '">' + ICONES[k] + '</span>'; }).join(' ');
      return '<tr class="ord-linha' + classeAtraso(o) + '" data-acao="abrirOpDetalhe" data-arg="' + esc(o.id) + '" tabindex="0" role="button">' +
        (aberta.projetoId ? '' : '<td class="mono">' + esc(o.commessa) + '</td>') +
        '<td class="mono">' + esc(o.numero) + '</td><td><span class="pill-area area-' + esc(o.area) + '">' + esc(T('area.' + o.area)) + '</span></td>' +
        '<td class="mono">' + esc(o.desenho) + '</td><td>' + esc(o.posicao || '—') + '</td><td>' + esc(o.descricao || '—') +
        (o.obs ? '<div class="hint-txt op-obs">' + esc(o.obs) + '</div>' : '') + '</td><td class="mono">' + esc(o.produto || '—') + '</td>' +
        '<td class="num">' + numeroBr(o.qtd) + (pc.rnc ? '<div class="op-pecas-rnc">' + esc(T('fab.qtdRnc', numeroBr(pc.rnc))) + '</div>' : '') + '</td>' +
        '<td class="num">' + numeroBr(o.pesoTotal) + '</td><td>' + marcas + '</td><td class="hint-txt">' + esc(roteiro) + '</td>' +
        '<td class="hint-txt">' + esc(progr) + '</td><td>' + pillSituacao(o) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}

document.addEventListener('input', function (e) {
  if (e.target && e.target.id === 'lops-busca' && aberta) { aberta.busca = e.target.value; render(); }
});

registrarAcoes({
  filtroListaOps: function (k) { if (aberta && SITUACOES.indexOf(k) >= 0) { aberta.sit = k; render(); } },
  areaListaOps: function (v) { if (aberta) { aberta.area = v === 'caldeiraria' || v === 'usinagem' ? v : ''; render(); } },
  projetoListaOps: function (v) { if (aberta) { aberta.projeto = v || ''; render(); } },
  abrirListaOpsProjeto: function (id) { abrirListaOps({ projetoId: id }); },
  abrirListaOpsGrupo: function (g) { if (GRUPOS[g]) abrirListaOps({ grupo: g }); }
});
