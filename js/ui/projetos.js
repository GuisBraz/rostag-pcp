/* ---------------------------------------------------------------------------
   Lista de projetos — tabela ordenável com filtro.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, opsDoProjeto, nomeProjeto } from '../estado.js';
import { esc, br, hoje } from '../nucleo/fmt.js';
import { T, plural, STATUS_LABEL } from '../i18n/index.js';
import { STATUS_KEYS } from '../dominio/constantes.js';
import * as Projeto from '../dominio/projeto.js';
import * as Producao from '../dominio/producao.js';
import * as Andamento from '../dominio/andamento.js';
import * as Contratos from '../dominio/contratos.js';
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
  { campo: 'entrega', rot: 'c.entrega' },
  { campo: 'fase', rot: 'c.fase', calc: function (p) { return Andamento.FASES.indexOf(andamentoDe(p).fase); } },
  { campo: 'status', rot: 'c.status', calc: function (p) { return STATUS_KEYS.indexOf(Projeto.status(p)); } }
];

// Andamento geral: PCP (checklist) 20% + Fábrica (peças feitas das OPs) 80%
const memoAnd = new Map();
let memoRev = -1;
export function andamentoDe(p) {
  if (memoRev !== estado.rev) { memoAnd.clear(); memoRev = estado.rev; }
  if (!memoAnd.has(p.id)) memoAnd.set(p.id, Andamento.calcular(p, opsDoProjeto(p.id)));
  return memoAnd.get(p.id);
}
// Fase do projeto (e o aviso de risco da fábrica); o andamento vai na dica
function celulaFase(a) {
  const s = a.stats;
  const dica = T('c.andamento') + ' ' + a.geral + '% · ' + T('and.pcp') + ' ' + a.pcp + '% · ' + T('and.fabrica') + ' ' + (a.fabrica == null ? '—' : a.fabrica + '%') +
    (a.fabrica == null ? '' : '\n' + T('and.dica', s.caldeiraria.pct, s.usinagem.pct, s.abertas, s.retrabalho));
  return '<td class="col-fase" title="' + esc(dica) + '"><span class="fase-chip fase-' + a.fase + '">' + esc(T('fase.' + a.fase)) + '</span>' +
    (a.risco ? '<div class="hint-txt and-risco-' + a.risco + '">' + esc(T('and.risco.' + a.risco)) + '</div>' : '') + '</td>';
}

function valorOrdenacao(p, campo) {
  const col = COLUNAS.find(function (c) { return c.campo === campo; });
  return col && col.calc ? col.calc(p) : p[campo];
}

// Gerência e GP finalizam a commessa pela lista (o GP só os projetos dele).
function podeFinalizar() { return Auth.souGPouCoordenador(); }

function celulaFinalizar(p) {
  const st = Projeto.status(p);
  if (st === 'concluido') return '<td class="col-finalizar"><span class="hint-txt">' + esc(T('fin.em', br(p.concluidoEm))) + '</span></td>';
  if (st === 'cancelado') return '<td class="col-finalizar"><span class="hint-txt">—</span></td>';
  return '<td class="col-finalizar"><button type="button" class="btn btn-success btn-mini" data-acao="finalizarCommessa" data-arg="' + esc(p.id) + '" title="' + esc(T('fin.titulo')) + '">' +
    esc(T('fin.curto')) + '</button></td>';
}

// Contratos com OM: uma linha que abre e fecha, com as OMs dentro.
const CHAVE_ABERTOS = 'rostag.contratos.abertos';
let abertos = (function () { try { return new Set(JSON.parse(localStorage.getItem(CHAVE_ABERTOS) || '[]')); } catch (e) { return new Set(); } })();
function gravarAbertos() { try { localStorage.setItem(CHAVE_ABERTOS, JSON.stringify(Array.from(abertos))); } catch (e) { /* sem armazenamento */ } }

function linhaProjeto(p, comFinalizar, sub) {
  const st = Projeto.status(p), and = andamentoDe(p);
  const com = sub ? '<span class="om-sub" title="' + esc(nomeProjeto(p)) + '">' + (p.om ? esc(T('om.rot', p.om)) : '<span class="om-falta">' + esc(T('om.semOm')) + '</span>') + '</span>' : esc(nomeProjeto(p));
  // a descrição vai numa linha pequena embaixo do número (sem coluna própria)
  const desc = '<div class="lp-desc" title="' + esc(p.descricao) + '">' + esc(p.descricao || '') + '</div>';
  return '<tr class="linha-projeto' + (sub ? ' linha-om' : '') + '" data-acao="abrirProjeto" data-arg="' + esc(p.id) + '" tabindex="0" role="button" aria-label="' + esc(nomeProjeto(p) + ' — ' + p.descricao) + '">' +
    '<td class="col-commessa">' + com + desc + '</td>' +
    '<td class="col-cliente">' + esc(p.cliente) + '</td>' +
    '<td class="nowrap">' + br(p.entrega) + '</td>' + celulaFase(and) +
    '<td><span class="pill pill-' + st + '">' + esc(STATUS_LABEL(st)) + '</span></td>' +
    (comFinalizar ? celulaFinalizar(p) : '') + '</tr>';
}
function linhaContrato(g, comFinalizar, aberto, prefixo) {
  const ps = g.projetos;
  const abertas = ps.filter(Projeto.aberto);
  const atrasadas = ps.filter(function (p) { return Projeto.status(p) === 'atrasado'; }).length;
  const prox = abertas.map(function (p) { return p.entrega; }).filter(Boolean).sort()[0];
  const cli = (ps.find(function (p) { return p.cliente && p.cliente !== '—'; }) || ps[0]).cliente;
  return '<tr class="linha-contrato' + (aberto ? ' aberto' : '') + '" data-acao="alternarContrato" data-arg="' + esc((prefixo || '') + g.contrato) + '" tabindex="0" role="button" aria-expanded="' + aberto + '">' +
    '<td class="col-commessa"><span class="om-seta" aria-hidden="true">' + (aberto ? '▾' : '▸') + '</span><b>' + esc(g.contrato) + '</b>' +
      '<div class="lp-desc">' + esc(T('om.nOms', ps.length)) + ' · ' + esc(T('om.nAbertas', abertas.length)) + '</div></td>' +
    '<td class="col-cliente">' + esc(cli) + '</td>' +
    '<td class="nowrap">' + (prox ? '<span class="hint-txt">' + esc(T('om.proxima')) + '</span> ' + br(prox) : '—') + '</td><td></td>' +
    '<td>' + (atrasadas ? '<span class="pill pill-atrasado">' + esc(T('om.nAtrasadas', atrasadas)) + '</span>' : (abertas.length ? '<span class="pill pill-andamento">' + esc(T('om.emDia')) + '</span>' : '')) + '</td>' +
    (comFinalizar ? '<td class="col-finalizar"><button type="button" class="btn btn-outline btn-mini" data-acao="novaOm" data-arg="' + esc(g.contrato) + '">' + esc(T('om.nova')) + '</button></td>' : '') + '</tr>';
}

export function renderProjetos() {
  memoAnd.clear();   // um cálculo por projeto nesta tela (a ordenação reaproveita)
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
  // técnico: os projetos que ainda aguardam o cronograma do GP vão para um bloco no fim
  const souTec = Auth.papel() === 'tecnico';
  const espera = souTec ? lista.filter(Projeto.aguardandoCronograma) : [];
  const grupos = Contratos.agrupar(souTec ? lista.filter(function (p) { return !Projeto.aguardandoCronograma(p); }) : lista);
  const gruposEspera = Contratos.agrupar(espera);
  estado.ordemVisivel = [];
  grupos.concat(gruposEspera).forEach(function (g) { (g.projeto ? [g.projeto] : g.projetos).forEach(function (p) { estado.ordemVisivel.push(p.id); }); });

  $('proj-count').textContent = lista.length === total
    ? plural(total, 'lista.projeto', 'lista.projetos')
    : T('lista.de', lista.length, plural(total, 'lista.projeto', 'lista.projetos'));

  if (!lista.length) {
    const msg = !estado.carregado ? T('x.carregandoDados') : (total ? T('lista.vazia') : T('lista.semProjetos'));
    $('projetos-tbody').innerHTML = '<tr><td colspan="' + (COLUNAS.length + (comFinalizar ? 1 : 0)) + '"><div class="empty-state">' + esc(msg) + '</div></td></tr>';
    return;
  }
  // com busca digitada, os contratos abrem para mostrar a OM encontrada
  const buscando = !!String(estado.filtroProj.busca || '').trim();
  const linhas = function (gs, chaveAberto) {
    return gs.map(function (g) {
      if (g.projeto) return linhaProjeto(g.projeto, comFinalizar, false);
      const aberto = buscando || abertos.has(chaveAberto + g.contrato);
      return linhaContrato(g, comFinalizar, aberto, chaveAberto) + (aberto ? g.projetos.map(function (p) { return linhaProjeto(p, comFinalizar, true); }).join('') : '');
    }).join('');
  };
  $('projetos-tbody').innerHTML = linhas(grupos, '') +
    (espera.length ? '<tr class="linha-bloco-espera"><td colspan="' + (COLUNAS.length + (comFinalizar ? 1 : 0)) + '">⏳ ' + esc(T('lista.esperaTit', espera.length)) +
      '<span class="hint-txt"> — ' + esc(T('lista.esperaNota')) + '</span></td></tr>' +
      '' : '') +
    (espera.length ? linhas(gruposEspera, 'espera:').replace(/<tr class="(linha-[a-z-]+)/g, '<tr class="$1 linha-espera') : '');
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
  const msg = T('fin.q', nomeProjeto(p), br(hoje())) + (avisos.length ? '\n\n⚠ ' + avisos.join('\n⚠ ') : '');
  confirmar(msg, { titulo: T('fin.titulo'), textoOk: T('fin.botao') }).then(function (ok) {
    if (!ok || !buscarProjeto(p.id) || !Projeto.aberto(p)) return;
    const aberta = Projeto.pausaAtual(p);
    if (aberta) aberta.fim = hoje();
    p.status = 'concluido'; p.concluidoEm = hoje(); p.canceladoEm = null; p.pedido = null;
    redesenhar();
    toast(T('fin.feito', nomeProjeto(p)));
    persistir().catch(function () { /* persistir já avisou e desfez */ });
  });
}

registrarAcoes({
  finalizarCommessa: finalizarCommessa,
  ordenarPor: function (campo) {
    if (estado.ordem.campo === campo) estado.ordem.dir *= -1; else { estado.ordem.campo = campo; estado.ordem.dir = 1; }
    renderProjetos();
  },
  abrirProjeto: function (id) { irPara('projetos', id); },
  alternarContrato: function (c) {
    if (abertos.has(c)) abertos.delete(c); else abertos.add(c);
    gravarAbertos();
    renderProjetos();
  }
});
