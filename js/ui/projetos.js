/* ---------------------------------------------------------------------------
   Lista de projetos — tabela ordenável com filtro.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, opsDoProjeto } from '../estado.js';
import { esc, br, brCurto, hoje } from '../nucleo/fmt.js';
import { T, plural, STATUS_LABEL, SIT_LABEL } from '../i18n/index.js';
import { STATUS_KEYS, SIT_ORDEM } from '../dominio/constantes.js';
import * as Projeto from '../dominio/projeto.js';
import * as Cronograma from '../dominio/cronograma.js';
import * as Producao from '../dominio/producao.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes } from './dom.js';
import { filtrarProj, limparCampos, atualizarBadge } from './filtros.js';
import { irPara } from './rota.js';
import { confirmar } from './modal.js';
import { toast } from './toast.js';
import { persistir, redesenhar } from './app.js';

export { refreshOpcoes } from './filtros.js';

const COLUNAS = [
  { campo: 'commessa', rot: 'c.commessa' },
  { campo: 'cliente', rot: 'c.cliente' },
  { campo: 'descricao', rot: 'c.descricao' },
  { campo: 'gp', rot: 'c.gp' },
  { campo: 'pcp', rot: 'c.pcp', calc: function (p) { return SIT_ORDEM.indexOf(Projeto.situacaoPcp(p)); } },
  { campo: 'entrega', rot: 'c.entrega' },
  { campo: 'progresso', rot: 'c.progresso', calc: Projeto.progresso },
  { campo: 'status', rot: 'c.status', calc: function (p) { return STATUS_KEYS.indexOf(Projeto.status(p)); } }
];

function valorOrdenacao(p, campo) {
  const col = COLUNAS.find(function (c) { return c.campo === campo; });
  return col && col.calc ? col.calc(p) : p[campo];
}

function celulaPcp(p) {
  const st = Projeto.status(p);
  if (st === 'cancelado') return '<span class="sit-chip" style="color:var(--ink-faint)"><span class="dot dot-planejada"></span>—</span>';
  const c = Cronograma.calcular(p);
  if (st === 'concluido' || c.concluido) {
    return '<span class="sit-chip"><span class="dot dot-concluida"></span>' + esc(T('lista.pcpConcluido')) + '</span>';
  }
  const s = Projeto.situacaoPcp(p);
  const texto = c.proxima && c.proxima.fim ? brCurto(c.proxima.fim) + ' · ' + SIT_LABEL(s) : SIT_LABEL(s);
  return '<span class="sit-chip" title="' + esc(T('lista.proxima', c.proxima ? c.proxima.t : '—')) + '">' +
    '<span class="dot dot-' + s + '"></span>' + esc(texto) + '</span>';
}

// Gerência e GP finalizam a commessa pela lista (o GP só os projetos dele).
function podeFinalizar() { return Auth.souGPouCoordenador(); }

function celulaFinalizar(p) {
  const st = Projeto.status(p);
  if (st === 'concluido') return '<td class="col-finalizar"><span class="hint-txt">' + esc(T('fin.em', br(p.concluidoEm))) + '</span></td>';
  if (st === 'cancelado') return '<td class="col-finalizar"><span class="hint-txt">—</span></td>';
  return '<td class="col-finalizar"><button type="button" class="btn btn-success btn-mini" data-acao="finalizarCommessa" data-arg="' + esc(p.id) + '">' +
    esc(T('fin.botao')) + '</button></td>';
}

export function renderProjetos() {
  const comFinalizar = podeFinalizar();
  $('projetos-thead').innerHTML = COLUNAS.map(function (c) {
    const ativo = estado.ordem.campo === c.campo;
    const seta = ativo ? (estado.ordem.dir === 1 ? '▲' : '▼') : '▲';
    const rot = T(c.rot);
    return '<th class="' + (ativo ? 'ordenado' : '') + '" aria-sort="' + (ativo ? (estado.ordem.dir === 1 ? 'ascending' : 'descending') : 'none') + '">' +
      '<button type="button" data-acao="ordenarPor" data-arg="' + c.campo + '" aria-label="' + esc(T('c.ordenarPor', rot)) + '">' +
      esc(rot) + '<span class="ord" aria-hidden="true">' + seta + '</span></button></th>';
  }).join('') + (comFinalizar ? '<th class="col-finalizar">' + esc(T('fin.coluna')) + '</th>' : '');

  const total = estado.projetos.length;
  const lista = filtrarProj().slice().sort(function (a, b) {
    const va = valorOrdenacao(a, estado.ordem.campo), vb = valorOrdenacao(b, estado.ordem.campo);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * estado.ordem.dir;
    return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * estado.ordem.dir;
  });
  estado.ordemVisivel = lista.map(function (p) { return p.id; });

  $('proj-count').textContent = lista.length === total
    ? plural(total, 'lista.projeto', 'lista.projetos')
    : T('lista.de', lista.length, plural(total, 'lista.projeto', 'lista.projetos'));

  if (!lista.length) {
    const msg = !estado.carregado ? T('x.carregandoDados') : (total ? T('lista.vazia') : T('lista.semProjetos'));
    $('projetos-tbody').innerHTML = '<tr><td colspan="' + (COLUNAS.length + (comFinalizar ? 1 : 0)) + '"><div class="empty-state">' + esc(msg) + '</div></td></tr>';
    return;
  }
  $('projetos-tbody').innerHTML = lista.map(function (p) {
    const st = Projeto.status(p), pr = Projeto.progresso(p);
    return '<tr class="linha-projeto" data-acao="abrirProjeto" data-arg="' + esc(p.id) + '" tabindex="0" role="button" aria-label="' + esc(p.commessa + ' — ' + p.descricao) + '">' +
      '<td class="col-commessa">' + esc(p.commessa) + '</td>' +
      '<td>' + esc(p.cliente) + '</td><td>' + esc(p.descricao) + '</td><td>' + esc(p.gp) + '</td>' +
      '<td class="nowrap">' + celulaPcp(p) + '</td>' +
      '<td class="nowrap">' + br(p.entrega) + '</td>' +
      '<td class="col-progresso"><div class="mini-progresso"><div class="trilho"><div style="width:' + pr + '%"></div></div>' +
        '<span>' + pr + '%</span></div></td>' +
      '<td><span class="pill pill-' + st + '">' + esc(STATUS_LABEL(st)) + '</span></td>' +
      (comFinalizar ? celulaFinalizar(p) : '') + '</tr>';
  }).join('');
}

// Abre a lista só com os projetos que têm tarefa do PCP nessa situação.
export function limparFiltroProjPcp(sit) {
  limparCampos('pf', estado.filtroProj);
  estado.filtroProj.pcp = sit;
  $('pf-pcp').value = sit;
  atualizarBadge('proj', estado.filtroProj);
}
export function limparFiltroProjComStatus(k) {
  limparCampos('pf', estado.filtroProj);
  estado.filtroProj.status = k;
  $('pf-status').value = k;
  atualizarBadge('proj', estado.filtroProj);
}

// Finalizar = concluir a commessa hoje. Avisa (sem bloquear) o que ainda
// está aberto: OPs sem baixa do CQ e atividades do PCP não feitas.
function finalizarCommessa(id) {
  const p = buscarProjeto(id);
  if (!p || !podeFinalizar() || !Projeto.aberto(p)) return;
  const avisos = [];
  const ops = opsDoProjeto(p.id).filter(Producao.emAberto).length;
  if (ops) avisos.push(T('fin.avisoOps', ops));
  const faltam = (p.checklist || []).filter(function (i) { return !i.done; }).length;
  if (faltam) avisos.push(T('fin.avisoPcp', faltam));
  const msg = T('fin.q', p.commessa, br(hoje())) + (avisos.length ? '\n\n⚠ ' + avisos.join('\n⚠ ') : '');
  confirmar(msg, { titulo: T('fin.titulo'), textoOk: T('fin.botao') }).then(function (ok) {
    if (!ok || !buscarProjeto(p.id) || !Projeto.aberto(p)) return;
    const aberta = Projeto.pausaAtual(p);
    if (aberta) aberta.fim = hoje();
    p.status = 'concluido'; p.concluidoEm = hoje(); p.canceladoEm = null; p.pedido = null;
    redesenhar();
    toast(T('fin.feito', p.commessa));
    persistir().catch(function () { /* persistir já avisou e desfez */ });
  });
}

registrarAcoes({
  finalizarCommessa: finalizarCommessa,
  ordenarPor: function (campo) {
    if (estado.ordem.campo === campo) estado.ordem.dir *= -1; else { estado.ordem.campo = campo; estado.ordem.dir = 1; }
    renderProjetos();
  },
  abrirProjeto: function (id) { irPara('projetos', id); }
});
