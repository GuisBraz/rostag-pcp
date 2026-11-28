/* ---------------------------------------------------------------------------
   Linha do tempo em Gantt: cada commessa numa linha, com uma barra por
   processo (PCP, Caldeiraria, Usinagem, Pintura, Montagem mecânica) e o
   losango da entrega. A escala cabe na largura da tela (sem barra lateral).
--------------------------------------------------------------------------- */
import { estado, nomeProjeto } from '../estado.js';
import { esc, br, hoje, nomeCurto, addDias, difDias } from '../nucleo/fmt.js';
import { T, STATUS_LABEL } from '../i18n/index.js';
import * as Projeto from '../dominio/projeto.js';
import { $, registrarAcoes } from './dom.js';
import { cor } from './graficos.js';
import * as Auth from '../dados/auth.js';
import * as Store from '../dados/store.js';

function idElemento(id) { return 'tl-item-' + String(id).replace(/[^\w-]/g, '_'); }

// Visão "Fábrica" (todos os projetos da equipe, para todos os cargos) ou
// "Meus projetos" (os de cada um). Lembrada neste navegador.
let visao = lerVisao();
function lerVisao() { try { return localStorage.getItem('rostag.linha.visao') === 'meus' ? 'meus' : 'fabrica'; } catch (e) { return 'fabrica'; } }
// quem tem projetos "seus": GP, técnico e programadores (a Gerência vê todos; o CQ, só a fábrica)
function temMeus() { const p = Auth.papel(); return p === 'gp' || p === 'tecnico' || !!Auth.areaProgramador(); }
function meus() {
  const area = Auth.areaProgramador();
  if (!area) return estado.projetos;
  const ids = new Set(estado.ops.filter(function (o) { return o.area === area; }).map(function (o) { return o.projetoId; }));
  return estado.projetos.filter(function (p) { return ids.has(p.id); });
}
function daFabrica() {
  if (Auth.souGerente()) return estado.projetos;
  if (!estado.projetosFabrica) {
    Store.escutarTodos(function (l) { estado.projetosFabrica = l; if (document.getElementById('tab-linha').classList.contains('active')) renderLinha(); },
      function () { estado.projetosFabrica = null; });
  }
  return estado.projetosFabrica || estado.projetos;
}

export function renderLinha() {
  if (!temMeus()) visao = 'fabrica';
  const v = $('tl-visao');
  if (v) v.innerHTML = temMeus() ? ['fabrica', 'meus'].map(function (k) {
    return '<button type="button" role="tab" aria-selected="' + (visao === k) + '" class="' + (visao === k ? 'ativa' : '') + '" data-acao="visaoLinha" data-arg="' + k + '">' + esc(T('tl.visao.' + k)) + '</button>';
  }).join('') : '';
  const fonte = visao === 'meus' ? meus() : daFabrica();
  const ordenados = fonte.slice().sort(function (a, b) { return a.entrega.localeCompare(b.entrega); });
  $('tl-sidebar-list').innerHTML = ordenados.length ? ordenados.map(function (p) {
    return '<button type="button" class="tl-sidebar-item" data-acao="focarNaLinha" data-arg="' + esc(p.id) + '">' +
      '<span class="cm">' + esc(nomeProjeto(p)) + '</span>' + esc(p.descricao) + '</button>';
  }).join('') : '<div class="empty-state">' + esc(T(estado.carregado ? 'lista.semProjetos' : 'x.carregandoDados')) + '</div>';

  $('timeline-track').innerHTML = gantt(ordenados);
}

// Barras do projeto: PCP e os processos ligados com datas
function barras(p) {
  const r = [];
  if (p.pcpInicio && p.pcpFim) r.push({ k: 'pcp', ini: p.pcpInicio, fim: p.pcpFim });
  const proc = Projeto.processosDe(p);
  Projeto.PROCESSOS.forEach(function (k) { const x = proc[k]; if (x.on && x.ini && x.fim) r.push({ k: k, ini: x.ini, fim: x.fim }); });
  return r;
}
function gantt(lista) {
  if (!lista.length) return '';
  const h = hoje();
  // escala: de ~2 semanas antes de hoje (ou do 1º início, se for depois) até a última data
  let ini = null, fim = h;
  lista.forEach(function (p) {
    barras(p).forEach(function (b) { if (!ini || b.ini < ini) ini = b.ini; if (b.fim > fim) fim = b.fim; });
    if (p.entrega > fim) fim = p.entrega;
  });
  const minIni = addDias(h, -14);
  ini = !ini || ini < minIni ? minIni : ini;
  if (ini > h) ini = h;
  const maxFim = addDias(h, 400);
  if (fim > maxFim) fim = maxFim;
  fim = addDias(fim, 7);
  const total = Math.max(1, difDias(ini, fim));
  const pos = function (d) { return Math.max(0, Math.min(100, difDias(ini, d) / total * 100)); };
  // régua: um traço por mês (ou por semana, em janelas curtas)
  const marcas = [];
  const porSemana = total <= 70;
  let d = porSemana ? ini : ini.slice(0, 8) + '01';
  if (!porSemana && d < ini) d = addDias(d, 32).slice(0, 8) + '01';
  for (let n = 0; d <= fim && n < 60; n++) {
    marcas.push('<span class="gt-marca" style="left:' + pos(d) + '%">' + esc(porSemana ? br(d).slice(0, 5) : T('tl.mes' + Number(d.slice(5, 7))) + '/' + d.slice(2, 4)) + '</span>');
    d = porSemana ? addDias(d, 7) : addDias(d, 32).slice(0, 8) + '01';
  }
  const linhas = lista.map(function (p) {
    const st = Projeto.status(p);
    const abre = (Auth.veProjetos() || !!Auth.areaProgramador()) && estado.projetos.some(function (x) { return x.id === p.id; });
    const bs = barras(p).map(function (b) {
      const l = pos(b.ini), w = Math.max(0.6, pos(addDias(b.fim, 1)) - l);
      return '<span class="gt-barra gt-' + b.k + '" style="left:' + l + '%;width:' + w + '%" title="' + esc(T('proc.' + b.k) + ': ' + br(b.ini) + ' → ' + br(b.fim)) + '"></span>';
    }).join('');
    const ent = p.entrega && p.entrega >= ini && p.entrega <= fim
      ? '<span class="gt-losango gt-st-' + st + '" style="left:' + pos(p.entrega) + '%" title="' + esc(T('tl.entrega') + ': ' + br(p.entrega) + ' · ' + STATUS_LABEL(st)) + '">◆</span>' : '';
    const rot = '<span class="gt-com">' + esc(nomeProjeto(p)) + '</span><span class="gt-desc">' + esc(p.descricao) + '</span>';
    return '<' + (abre ? 'button type="button"' : 'div') + ' class="gt-linha' + (Projeto.aberto(p) ? '' : ' gt-fechado') + (st === 'atrasado' ? ' gt-atrasado' : '') + '" id="' + idElemento(p.id) + '"' +
      (abre ? ' data-acao="abrirProjeto" data-arg="' + esc(p.id) + '"' : '') + '>' +
      '<span class="gt-rot" title="' + esc(nomeProjeto(p) + ' — ' + p.descricao) + '">' + rot + '</span>' +
      '<span class="gt-trilho">' + bs + ent + '</span></' + (abre ? 'button' : 'div') + '>';
  }).join('');
  return '<div class="gt"><div class="gt-cab"><span class="gt-rot"></span><span class="gt-trilho gt-regua">' + marcas.join('') +
    '<span class="gt-hoje-rot" style="left:' + pos(h) + '%">' + esc(T('tl.hoje')) + '</span></span></div>' +
    '<div class="gt-corpo"><span class="gt-hoje" style="--x:' + pos(h) + '"></span>' + linhas + '</div></div>';
}

registrarAcoes({
  visaoLinha: function (k) {
    visao = k === 'meus' ? 'meus' : 'fabrica';
    try { localStorage.setItem('rostag.linha.visao', visao); } catch (e) { /* sem armazenamento */ }
    renderLinha();
  },
  focarNaLinha: function (id) {
    const el = $(idElemento(id));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.boxShadow = '0 0 0 2px ' + cor('--teal');
    setTimeout(function () { el.style.boxShadow = ''; }, 1200);
  }
});
