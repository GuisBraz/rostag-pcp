/* ---------------------------------------------------------------------------
   Lista de OPs em tela cheia, com filtros. Duas entradas:
     - dentro do projeto (técnico): todas as OPs dele, com os botões de
       importar o PDF e de cadastrar OP manual
     - Todas as OPs → "Em andamento" / "Em RNC": OPs dos projetos em andamento
   Clicar no título de uma coluna ordena por ela (de novo: inverte), como no
   Excel. Clicar numa OP abre a janela com o roteiro e o texto do PDF.
   No projeto, destaca as OPs sem roteiro (PDF não importado) e as que estão
   fora da planilha de avanço (OP extra, entrou só pelo PDF ou manual).
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, opVisivel } from '../estado.js';
import { esc, br, numeroBr, compararNatural } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Prog from '../dominio/programacao.js';
import * as Producao from '../dominio/producao.js';
import * as Avanco from '../dominio/avanco.js';
import { chave } from '../dominio/planilha.js';
import * as Auth from '../dados/auth.js';
import * as DadosAvanco from '../dados/avanco.js';
import { $, registrarAcoes } from './dom.js';
import { abrirModal } from './modal.js';
import { naFila, pillSituacao, classeAtraso } from './opDetalhe.js';

const SITUACOES = ['todas', 'emAberto', 'programada', 'baixaCq', 'rnc', 'encerrada'];
const ORDEM_SIT = { emAberto: 0, programada: 1, baixaCq: 2, rnc: 3, encerrada: 4, morta: 5 };
const ALERTAS = ['semRoteiro', 'foraPlanilha'];
const GRUPOS = { andamento: ['emAberto', 'programada', 'baixaCq'], rnc: ['rnc'] };
const ICONES = { pintura: '🎨', servicoExterno: '🚚', ttat: '🔥', oxidacao: '⚫' };
let aberta = null;   // { projetoId, grupo, sit, alerta, area, projeto, busca, planilha }
let ordem = { campo: 'numero', dir: 1 };   // vale entre aberturas, como no Explorer

/**
 * modo: { projetoId } (as OPs de um projeto) ou { grupo: 'andamento' | 'rnc' }.
 */
export function abrirListaOps(modo) {
  aberta = { projetoId: modo.projetoId || null, grupo: modo.grupo || null, sit: 'todas', alerta: '', area: '', projeto: '', busca: '', planilha: undefined };
  $('lops-busca').value = '';
  $('lops-area').value = '';
  abrirModal('modal-lista-ops', { aoFechar: function () { aberta = null; } });
  render();
  // números de OP da planilha de avanço do projeto (para achar as OPs fora dela)
  if (aberta.projetoId) {
    const pid = aberta.projetoId;
    DadosAvanco.ler(pid).then(function (doc) {
      if (!aberta || aberta.projetoId !== pid) return;
      aberta.planilha = numerosDaPlanilha(doc);
      render();
    }).catch(function (e) { console.warn(e); if (aberta) { aberta.planilha = null; render(); } });
  }
}

// "area|número" de cada OP da planilha; null se o projeto não tem planilha.
function numerosDaPlanilha(doc) {
  const lidos = doc ? Avanco.itens(doc.matriz) : null;
  if (!lidos) return null;
  const s = new Set();
  lidos.itens.forEach(function (it) {
    if (it.opCald) s.add('caldeiraria|' + chave(it.opCald));
    if (it.opUsin) s.add('usinagem|' + chave(it.opUsin));
  });
  return s;
}

function semRoteiro(o) { return !(Array.isArray(o.operacoes) && o.operacoes.length); }
// OP de retrabalho (nasceu de uma peça morta) não está na planilha, e está tudo bem.
function foraPlanilha(o) { return !!(aberta && aberta.planilha) && !o.origemOpId && !aberta.planilha.has(o.area + '|' + chave(o.numero)); }
function horasDe(o) { return (o.operacoes || []).reduce(function (t, x) { return t + (Number(x.horas) || 0); }, 0); }
function filasDe(o) { return (estado.maquinas || []).filter(function (m) { return (m.fila || []).some(function (f) { return f.opId === o.id; }); }).map(function (m) { return m.nome; }); }
function programacaoDe(o) {
  if (o.programacao) return (o.programacao.terceirizada || '—') + ' · ' + T('prog.ate', br(o.programacao.previsaoFim));
  const f = filasDe(o);
  return f.length ? f.join(', ') : '';
}

function podeAdicionar(p) { return !!p && (Auth.souGerente() || p.responsavelUid === Auth.uid()); }

// Colunas: chave de ordenação, título, classe e como comparar.
function colunas(sit) {
  const lista = [
    { c: 'numero', t: 'OP', v: function (o) { return o.numero; } },
    { c: 'area', t: T('fab.cArea'), v: function (o) { return T('area.' + o.area); } },
    { c: 'desenho', t: T('fab.cDesenho'), v: function (o) { return o.desenho; } },
    { c: 'posicao', t: T('fab.cPos'), v: function (o) { return o.posicao; } },
    { c: 'descricao', t: T('fab.cDescricao'), v: function (o) { return o.descricao; } },
    { c: 'produto', t: T('pdf.campo.produto'), v: function (o) { return o.produto; } },
    { c: 'qtd', t: T('fab.cQtd'), num: true, v: function (o) { return Number(o.qtd) || 0; } },
    { c: 'pesoTotal', t: T('fab.cPeso'), num: true, v: function (o) { return Number(o.pesoTotal) || 0; } },
    { c: 'marcas', t: T('av.cMarcas'), num: true, v: function (o) { return Object.keys(o.marcas || {}).length; } },
    { c: 'roteiro', t: T('lops.roteiro'), num: true, v: function (o) { return semRoteiro(o) ? -1 : horasDe(o); } },
    { c: 'programacao', t: T('lops.programacao'), v: programacaoDe },
    { c: 'situacao', t: T('fab.cSituacao'), num: true, v: function (o) { return ORDEM_SIT[sit(o)] == null ? 9 : ORDEM_SIT[sit(o)]; } }
  ];
  if (!aberta.projetoId) lista.unshift({ c: 'commessa', t: T('fab.cCommessa'), v: function (o) { return o.commessa; } });
  return lista;
}

export function render() {
  if (!aberta || !$('modal-lista-ops').classList.contains('open')) return;
  const fila = naFila();
  const sit = function (o) { return Prog.situacao(o, o.area === 'usinagem' && fila.has(o.id)); };
  const p = aberta.projetoId ? buscarProjeto(aberta.projetoId) : null;
  // o CQ não carrega os projetos: o nome vem da própria OP
  const op0 = aberta.projetoId && !p ? estado.ops.find(function (o) { return o.projetoId === aberta.projetoId; }) : null;
  $('lops-titulo').textContent = p ? T('lops.tituloProjeto', p.commessa) : (op0 ? T('lops.tituloProjeto', op0.commessa) : T('lops.titulo.' + aberta.grupo));
  $('lops-sub').textContent = p ? (p.descricao || '') : (op0 ? (op0.descricaoProjeto || '') : T('lops.sub'));
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
  // situação + os dois alertas (só no projeto: sem roteiro e fora da planilha)
  const sits = aberta.projetoId ? SITUACOES : ['todas'].concat(GRUPOS[aberta.grupo].length > 1 ? GRUPOS[aberta.grupo] : []);
  const testaAlerta = { semRoteiro: semRoteiro, foraPlanilha: foraPlanilha };
  $('lops-filtros').innerHTML = sits.map(function (k) {
    const n = k === 'todas' ? base.length : base.filter(function (o) { return sit(o) === k; }).length;
    const ativo = aberta.sit === k && !aberta.alerta;
    return '<button type="button" role="tab" aria-selected="' + ativo + '" class="' + (ativo ? 'ativa' : '') + '" data-acao="filtroListaOps" data-arg="' + k + '">' +
      esc(T(k === 'todas' ? 'ord.todas' : 'prog.sit.' + k)) + '<b>' + n + '</b></button>';
  }).join('') + (aberta.projetoId ? ALERTAS.map(function (k) {
    const n = base.filter(testaAlerta[k]).length;
    const ativo = aberta.alerta === k;
    const indisponivel = k === 'foraPlanilha' && !aberta.planilha;
    return '<button type="button" role="tab" aria-selected="' + ativo + '" class="lops-alerta lops-alerta-' + k + (ativo ? ' ativa' : '') + '" data-acao="alertaListaOps" data-arg="' + k + '"' +
      (indisponivel ? ' disabled title="' + esc(T(aberta.planilha === undefined ? 'av.carregando' : 'tec.semPlanilha')) + '"' : '') + '>' +
      esc(T('lops.alerta.' + k)) + '<b>' + (indisponivel ? '—' : n) + '</b></button>';
  }).join('') : '');
  let lista = aberta.alerta ? base.filter(testaAlerta[aberta.alerta]) : (aberta.sit === 'todas' ? base : base.filter(function (o) { return sit(o) === aberta.sit; }));
  const cols = colunas(sit);
  const col = cols.find(function (x) { return x.c === ordem.campo; }) || cols.find(function (x) { return x.c === 'numero'; });
  lista = lista.slice().sort(function (a, b) {
    const va = col.v(a), vb = col.v(b);
    const r = col.num ? (va - vb) : compararNatural(va, vb);
    return r * ordem.dir || compararNatural(a.numero, b.numero);
  });
  const st = Producao.estatisticas(base);
  $('lops-resumo').textContent = T('lops.resumo', lista.length, st.pct, numeroBr(st.pecasFeitas), numeroBr(st.pecas), numeroBr(st.pecasRnc));
  if (!lista.length) {
    $('lops-corpo').innerHTML = '<div class="empty-state">' + esc(T(estado.ops.some(function (o) { return !aberta.projetoId || o.projetoId === aberta.projetoId; }) ? 'fab.vazioFiltro' : 'lops.vazio')) + '</div>';
    return;
  }
  const cab = cols.map(function (x) {
    const atual = x.c === col.c;
    return '<th class="lops-ord' + (x.num ? ' num' : '') + (atual ? ' atual' : '') + '" data-acao="ordenarListaOps" data-arg="' + x.c + '" role="button" tabindex="0"' +
      ' aria-sort="' + (atual ? (ordem.dir > 0 ? 'ascending' : 'descending') : 'none') + '" title="' + esc(T('lops.ordenar')) + '">' +
      esc(x.t) + '<span class="lops-seta">' + (atual ? (ordem.dir > 0 ? '▲' : '▼') : '') + '</span></th>';
  }).join('');
  $('lops-corpo').innerHTML = '<div class="table-wrap lops-tabela"><table class="ord-tab"><thead><tr>' + cab + '</tr></thead><tbody>' +
    lista.map(function (o) {
      const pc = Producao.pecasOp(o);
      const sr = semRoteiro(o), fp = foraPlanilha(o);
      const roteiro = sr ? '<span class="lops-badge lops-badge-semRoteiro">' + esc(T('lops.badge.semRoteiro')) + '</span>'
        : esc(T('fab.roteiro', o.operacoes.length, numeroBr(Math.round(horasDe(o) * 100) / 100)));
      const marcas = Object.keys(ICONES).filter(function (k) { return o.marcas && o.marcas[k]; }).map(function (k) { return '<span title="' + esc(T('av.marca.' + k)) + '">' + ICONES[k] + '</span>'; }).join(' ');
      return '<tr class="ord-linha' + classeAtraso(o) + (sr ? ' lops-linha-semRoteiro' : '') + (fp ? ' lops-linha-fora' : '') + '" data-acao="abrirOpDetalhe" data-arg="' + esc(o.id) + '" tabindex="0" role="button">' +
        (aberta.projetoId ? '' : '<td class="mono">' + esc(o.commessa) + '</td>') +
        '<td class="mono">' + esc(o.numero) + (fp ? '<div><span class="lops-badge lops-badge-foraPlanilha">' + esc(T('lops.badge.foraPlanilha')) + '</span></div>' : '') + '</td>' +
        '<td><span class="pill-area area-' + esc(o.area) + '">' + esc(T('area.' + o.area)) + '</span></td>' +
        '<td class="mono">' + esc(o.desenho) + '</td><td>' + esc(o.posicao || '—') + '</td><td>' + esc(o.descricao || '—') +
        (o.obs ? '<div class="hint-txt op-obs">' + esc(o.obs) + '</div>' : '') + '</td><td class="mono">' + esc(o.produto || '—') + '</td>' +
        '<td class="num">' + numeroBr(o.qtd) + (pc.rnc ? '<div class="op-pecas-rnc">' + esc(T('fab.qtdRnc', numeroBr(pc.rnc))) + '</div>' : '') + '</td>' +
        '<td class="num">' + numeroBr(o.pesoTotal) + '</td><td>' + marcas + '</td><td class="hint-txt">' + roteiro + '</td>' +
        '<td class="hint-txt">' + esc(programacaoDe(o) || '—') + '</td><td>' + pillSituacao(o) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}

document.addEventListener('input', function (e) {
  if (e.target && e.target.id === 'lops-busca' && aberta) { aberta.busca = e.target.value; render(); }
});
// planilha subida de novo: recarrega os números dela
document.addEventListener('rostag:planilhaGravada', function (e) {
  if (!aberta || aberta.projetoId !== e.detail) return;
  DadosAvanco.ler(e.detail).then(function (doc) { if (aberta && aberta.projetoId === e.detail) { aberta.planilha = numerosDaPlanilha(doc); render(); } }).catch(function () {});
});

registrarAcoes({
  filtroListaOps: function (k) { if (aberta && SITUACOES.indexOf(k) >= 0) { aberta.sit = k; aberta.alerta = ''; render(); } },
  alertaListaOps: function (k) { if (aberta && ALERTAS.indexOf(k) >= 0) { aberta.alerta = aberta.alerta === k ? '' : k; render(); } },
  ordenarListaOps: function (c) {
    if (ordem.campo === c) ordem.dir = -ordem.dir; else ordem = { campo: c, dir: 1 };
    render();
  },
  areaListaOps: function (v) { if (aberta) { aberta.area = v === 'caldeiraria' || v === 'usinagem' ? v : ''; render(); } },
  projetoListaOps: function (v) { if (aberta) { aberta.projeto = v || ''; render(); } },
  abrirListaOpsProjeto: function (id) { abrirListaOps({ projetoId: id }); },
  abrirListaOpsGrupo: function (g) { if (GRUPOS[g]) abrirListaOps({ grupo: g }); }
});
