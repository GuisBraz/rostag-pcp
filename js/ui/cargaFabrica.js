/* ---------------------------------------------------------------------------
   Carga Fábrica (programadora de caldeiraria). O técnico cria a OP → ela
   aparece em "Aguardando programação" (por commessa) → a programadora escolhe
   a empresa (ex.: YANI) e, por etapa (Montagem = caldeireiros, Solda =
   soldadores, Acabamento = ajudantes...), quantas pessoas, o início e o fim
   (datas). O site não deixa passar do que a empresa tem em cada dia; a pessoa
   fica livre no fim da etapa (ou na baixa). Reprogramar segura o recurso até
   a nova data; recurso deslocado (0 pessoas) deixa a OP "programada sem
   recurso" e avisa no sino. Cadastros (empresas, pessoas, dias de trabalho)
   na aba Recursos. Depois da baixa do CQ, ela finaliza a OP.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto, opVisivel, nomeDaOp } from '../estado.js';
import { esc, br, hoje, numeroBr, compararNatural, dataValida } from '../nucleo/fmt.js';
import { T, meses } from '../i18n/index.js';
import * as Prog from '../dominio/programacao.js';
import * as R from '../dominio/recursos.js';
import * as Auth from '../dados/auth.js';
import * as DadosProg from '../dados/programacao.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal, confirmar } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';
import { opPorId } from './opDetalhe.js';

const ABAS = ['aguardando', 'lista', 'mapa', 'baixa', 'recursos'];
const COR = { atraso: 'var(--rust)', vence: 'var(--amber)', prazo: 'var(--violet)' };
const PALETA = ['var(--teal)', 'var(--terracotta)', 'var(--violet)', 'var(--green)', 'var(--amber)', 'var(--rust)'];
const DIAS_MAPA = 35, SEMANAS = 6;
const ui = { aba: 'lista', emp: '', com: '', mes: '', sel: {} };

function podeEditar() { return Auth.souGerente() || Auth.areaProgramador() === 'caldeiraria'; }
function cfg() { return R.normalizar(estado.recursosCald); }
function opsCald() { return estado.ops.filter(function (o) { return o.area === 'caldeiraria' && opVisivel(o); }); }
function kg(n) { return numeroBr(Math.round(Number(n) || 0)) + ' kg'; }
function brAno(s) { return s ? br(s) : '—'; }
function nomeMes(m) { return meses()[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4); }
function corEmpresa(id) {
  const i = cfg().empresas.findIndex(function (e) { return e.id === id; });
  return i < 0 ? 'var(--ink-faint)' : PALETA[i % PALETA.length];
}
function tipoDe(c, id) { return c.tipos.find(function (t) { return t.id === id; }) || { id: id, nome: id, etapa: id }; }
function situ(o, h) {
  const p = Prog.prazoCald(o, h);
  if (!p) return null;
  const txt = p.k === 'atraso' ? T('cf.atrasada', -p.dias) : (p.k === 'vence' ? (p.dias === 0 ? T('cf.venceHoje') : T('cf.venceEm', p.dias)) : T('cf.noPrazo'));
  return { k: p.k, txt: txt, cor: COR[p.k] };
}
function passa(o) {
  const pr = o.programacao || {};
  return (!ui.emp || pr.terceirizadaId === ui.emp) && (!ui.com || o.projetoId === ui.com) && (!ui.mes || String(pr.previsaoFim || '').slice(0, 7) === ui.mes);
}
// OPs que andam juntas (mesmo grupo = mesma equipe)
function doGrupo(o) {
  const g = o.programacao && o.programacao.grupo;
  return g ? opsCald().filter(function (x) { return x.programacao && x.programacao.grupo === g; }) : [o];
}
// empresas do cadastro + as que ainda aparecem em programações antigas
function empresasVistas(ops) {
  const r = cfg().empresas.map(function (e) { return { id: e.id, nome: e.nome }; });
  (ops || []).forEach(function (o) {
    const pr = o.programacao;
    if (pr && pr.terceirizadaId && !r.some(function (e) { return e.id === pr.terceirizadaId; })) r.push({ id: pr.terceirizadaId, nome: pr.terceirizada || pr.terceirizadaId, antiga: true });
  });
  return r;
}

export function renderCargaFabrica(alvoId) {
  const alvo = $(alvoId);
  if (!alvo) return;
  const h = hoje(), todas = opsCald(), c = cfg();
  const por = { emAberto: [], programada: [], baixaCq: [] };
  todas.forEach(function (o) { const s = Prog.situacao(o); if (por[s]) por[s].push(o); });
  const soma = function (l) { return l.reduce(function (t, o) { return t + (Number(o.pesoTotal) || 0); }, 0); };
  const atr = por.programada.filter(function (o) { return Prog.prazoCald(o, h).k === 'atraso'; });
  const semRec = R.semRecurso(c, por.programada, h);
  const nSem = por.programada.filter(function (o) { return semRec[o.id]; }).length;
  const kpi = function (aba, rot, val, det, cor) {
    return '<button type="button" class="cf-kpi" data-acao="abaCargaFab" data-arg="' + aba + '"><span class="cf-kpi-val" style="color:' + cor + '">' + val + '</span>' +
      '<span><span class="cf-kpi-rot">' + esc(rot) + '</span><span class="cf-kpi-det">' + esc(det) + '</span></span></button>';
  };
  const abas = { aguardando: por.emAberto.length, lista: por.programada.length, mapa: c.empresas.length, baixa: por.baixaCq.length, recursos: c.tipos.length };
  // filtros da lista: empresa, commessa, mês de término
  const coms = {}, mesesDe = {};
  por.programada.forEach(function (o) { coms[o.projetoId] = o.commessa; mesesDe[String(o.programacao.previsaoFim).slice(0, 7)] = 1; });
  const opt = function (v, t, atual) { return '<option value="' + esc(v) + '"' + (v === atual ? ' selected' : '') + '>' + esc(t) + '</option>'; };
  const filtros = ui.aba === 'lista'
    ? '<div class="cf-filtros"><select data-change="filtroCargaFab" data-arg2="emp" aria-label="' + esc(T('cf.fEmpresa')) + '">' + opt('', T('cf.todasEmpresas'), ui.emp) +
        empresasVistas(por.programada).map(function (e) { return opt(e.id, e.nome, ui.emp); }).join('') + '</select>' +
      '<select data-change="filtroCargaFab" data-arg2="com" aria-label="' + esc(T('cf.fCommessa')) + '">' + opt('', T('cf.todasCommessas'), ui.com) +
        Object.keys(coms).sort(function (a, b) { return compararNatural(coms[a], coms[b]); }).map(function (id) { return opt(id, coms[id], ui.com); }).join('') + '</select>' +
      '<select data-change="filtroCargaFab" data-arg2="mes" aria-label="' + esc(T('cf.fMes')) + '">' + opt('', T('cf.todosMeses'), ui.mes) +
        Object.keys(mesesDe).sort().map(function (m) { return opt(m, T('cf.entregasDe', nomeMes(m)), ui.mes); }).join('') + '</select>' +
      (ui.emp || ui.com || ui.mes ? '<button type="button" class="link-btn" data-acao="limparFiltroCargaFab">' + esc(T('pl.limpar')) + '</button>' : '') + '</div>' : '';
  alvo.innerHTML =
    '<div class="cf-kpis">' +
      kpi('aguardando', T('cf.kAguardando'), por.emAberto.length, kg(soma(por.emAberto)), 'var(--ink)') +
      kpi('lista', T('cf.kFabricacao'), por.programada.length, kg(soma(por.programada)), 'var(--ink)') +
      kpi('lista', T('cf.kAtrasadas'), atr.length, T(atr.length ? 'cf.kAtrasadasDet' : 'cf.kEmDia'), atr.length ? 'var(--rust)' : 'var(--green)') +
      kpi('lista', T('cf.kSemRecurso'), nSem, T(nSem ? 'cf.kSemRecursoDet' : 'cf.kComRecurso'), nSem ? 'var(--rust)' : 'var(--green)') + '</div>' +
    cargaSemanalHtml(por.programada, h) +
    '<div class="cf-topo"><div class="fab-visoes cf-abas" role="tablist">' + ABAS.map(function (a) {
      return '<button type="button" role="tab" aria-selected="' + (ui.aba === a) + '" class="' + (ui.aba === a ? 'ativa' : '') + '" data-acao="abaCargaFab" data-arg="' + a + '">' + esc(T('cf.aba.' + a)) + '<b>' + abas[a] + '</b></button>';
    }).join('') + '</div>' + filtros + '</div>' +
    '<div id="cf-conteudo">' + ({ aguardando: aguardando, lista: listaHtml, mapa: mapaHtml, baixa: baixaHtml, recursos: recursosHtml }[ui.aba])(por, h, semRec) + '</div>';
}

// Carga por semana (peças e kg) de cada empresa
function cargaSemanalHtml(programadas, h) {
  const sems = R.semanas(h, SEMANAS), carga = R.cargaSemanas(programadas, sems);
  const emps = empresasVistas(programadas).filter(function (e) { return carga[e.id] || !e.antiga; });
  if (!emps.length) return '';
  return '<div class="card cf-carga"><div class="table-wrap"><table class="cf-carga-tab"><thead><tr><th>' + esc(T('cf.cargaTit')) + '</th>' +
    sems.map(function (s, i) { return '<th>' + esc(i === 0 ? T('cg.estaSemana') : T('cf.semDe', br(s.inicio).slice(0, 5))) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    emps.map(function (e) {
      const l = carga[e.id] || [];
      return '<tr><td><span class="cf-empresa"><span class="cf-bola" style="background:' + corEmpresa(e.id) + '"></span>' + esc(e.nome) + '</span></td>' +
        sems.map(function (s, i) {
          const x = l[i];
          return '<td class="num">' + (x && x.ops ? '<b>' + esc(T('cf.pecas', numeroBr(x.pecas))) + '</b><span>' + kg(x.kg) + '</span>' : '<span class="hint-txt">—</span>') + '</td>';
        }).join('') + '</tr>';
    }).join('') + '</tbody></table></div></div>';
}

/* --------------------------------------------------- aguardando programação */
function aguardando(por) {
  const pc = {};
  por.emAberto.forEach(function (o) { (pc[o.projetoId] = pc[o.projetoId] || []).push(o); });
  const ids = Object.keys(pc).sort(function (a, b) { return compararNatural(pc[a][0].commessa, pc[b][0].commessa); });
  if (!ids.length) return '<div class="card panel-pad empty-state">' + esc(T('cf.semAguardando')) + '</div>';
  const editar = podeEditar();
  return ids.map(function (pid) {
    const l = pc[pid].sort(function (a, b) { return compararNatural(a.numero, b.numero); }), p = buscarProjeto(pid);
    const n = l.filter(function (o) { return ui.sel[o.id]; }).length, todas = n === l.length;
    return '<div class="card cf-grupo"><div class="cf-grupo-topo">' +
      (editar ? '<input type="checkbox" data-change="selTodasCargaFab" data-arg2="' + esc(pid) + '"' + (todas ? ' checked' : '') + ' aria-label="' + esc(T('cf.selTodas')) + '">' : '') +
      '<b class="mono cf-com">' + esc(nomeDaOp(l[0])) + '</b><span class="hint-txt">' + esc((p && p.descricao) || l[0].descricaoProjeto || '') + '</span>' +
      '<span class="cf-grupo-dir">' + esc(T('cf.nOpsKg', l.length, kg(l.reduce(function (t, o) { return t + (Number(o.pesoTotal) || 0); }, 0)))) +
      (editar ? '<button type="button" class="btn btn-primary btn-mini" data-acao="programarCargaFab" data-arg="' + esc(pid) + '"' + (n ? '' : ' disabled') + '>' + esc(n ? T('cf.programarN', n) : T('cf.programar')) + '</button>' : '') + '</span></div>' +
      '<div class="table-wrap"><table class="ord-tab"><thead><tr>' + (editar ? '<th style="width:34px"></th>' : '') + '<th>OP</th><th>' + esc(T('fab.cDesenho')) + '</th><th>' + esc(T('fab.cDescricao')) +
      '</th><th class="num">' + esc(T('fab.cQtd')) + '</th><th class="num">' + esc(T('fab.cPeso')) + '</th><th>' + esc(T('cf.esperando')) + '</th></tr></thead><tbody>' +
      l.map(function (o) {
        const d = String(o.desprogramadaEm || o.criadoEm || '').slice(0, 10);
        return '<tr>' + (editar ? '<td><input type="checkbox" data-change="selCargaFab" data-arg2="' + esc(o.id) + '"' + (ui.sel[o.id] ? ' checked' : '') + ' aria-label="' + esc(o.numero) + '"></td>' : '') +
          '<td class="mono">' + esc(o.numero) + '</td><td class="mono">' + esc(o.desenho) + (o.posicao ? ' · ' + esc(o.posicao) : '') + '</td><td>' + esc(o.descricao || '—') + '</td>' +
          '<td class="num">' + numeroBr(o.qtd) + '</td><td class="num">' + kg(o.pesoTotal) + '</td><td class="hint-txt">' + esc(d ? T('cf.desde', br(d)) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }).join('');
}

/* ------------------------------------------------------------------ lista */
function etapasHtml(o, h, editar) {
  const c = cfg(), pr = o.programacao;
  if (R.antiga(o)) return '<span class="pill-cf cf-antiga">' + esc(T('cf.antiga')) + '</span>';
  return '<div class="cf-etapas">' + pr.etapas.map(function (e, i) {
    const t = tipoDe(c, e.t);
    const estado_ = e.b ? 'feita' : (!(e.q > 0) ? 'sem' : (e.i <= h ? 'andando' : 'futura'));
    const baixa = editar && !e.b && e.i <= h ? '<button type="button" class="link-btn cf-et-baixa" data-acao="baixaEtapaCargaFab" data-arg="' + esc(o.id) + '" data-arg2="' + i + '">' + esc(T('cf.darBaixa')) + '</button>' : '';
    return '<span class="cf-et cf-et-' + estado_ + '" title="' + esc(t.etapa + ' · ' + T('cf.pessoas', e.q, t.nome) + ' · ' + br(e.i) + ' → ' + br(e.f) + (e.b ? ' · ' + T('cf.baixaEm', br(e.b)) : '')) + '">' +
      '<b>' + esc(t.etapa) + '</b> ' + (e.q > 0 ? esc(T('cf.pessoasCurto', e.q)) : '<i>' + esc(T('cf.semPessoas')) + '</i>') + ' · ' + esc(br(e.i).slice(0, 5) + '→' + br(e.f).slice(0, 5)) +
      (e.b ? ' ✓' : '') + baixa + '</span>';
  }).join('') + '</div>';
}
function listaHtml(por, h, semRec) {
  const l = por.programada.filter(passa).sort(function (a, b) { return String(a.programacao.previsaoFim).localeCompare(String(b.programacao.previsaoFim)) || compararNatural(a.numero, b.numero); });
  if (!l.length) return '<div class="card panel-pad empty-state">' + esc(T(por.programada.length ? 'fab.vazioFiltro' : 'cf.semProgramadas')) + '</div>';
  const editar = podeEditar();
  return '<div class="card"><div class="table-wrap"><table class="ord-tab cf-tab"><thead><tr><th>OP</th><th>' + esc(T('fab.cCommessa')) + '</th><th>' + esc(T('fab.cDescricao')) +
    '</th><th class="num">' + esc(T('cf.pecasPeso')) + '</th><th>' + esc(T('cf.empresa')) + '</th><th>' + esc(T('cf.etapas')) + '</th><th>' + esc(T('cf.termino')) +
    '</th><th>' + esc(T('fab.cSituacao')) + '</th><th></th></tr></thead><tbody>' +
    l.map(function (o) {
      const pr = o.programacao, s = situ(o, h), reag = Prog.reagendada(o), sem = semRec[o.id];
      return '<tr class="ord-linha' + (s.k === 'atraso' ? ' cf-atrasada' : '') + (sem ? ' cf-semrec' : '') + '" data-acao="verOpCargaFab" data-arg="' + esc(o.id) + '" tabindex="0" role="button">' +
        '<td class="mono">' + esc(o.numero) + '</td><td class="mono cf-com">' + esc(nomeDaOp(o)) + '</td><td>' + esc(o.descricao || '—') + '<div class="hint-txt mono">' + esc(o.desenho) + '</div></td>' +
        '<td class="num">' + numeroBr(o.qtd) + '<div class="hint-txt">' + kg(o.pesoTotal) + '</div></td>' +
        '<td><span class="cf-emp-pill" style="--cor:' + corEmpresa(pr.terceirizadaId) + '">' + esc(pr.terceirizada || '—') + '</span></td>' +
        '<td>' + etapasHtml(o, h, editar) + '</td>' +
        '<td><b>' + brAno(pr.previsaoFim) + '</b>' + (reag ? '<div class="hint-txt">' + esc(T('cf.antes', pr.historico.map(br).join(' → '))) + '</div>' : '') + '</td>' +
        '<td>' + (sem ? '<span class="pill-cf cf-semrec-pill">' + esc(T('cf.semRecurso')) + '</span> ' : '') + '<span class="pill-cf cf-' + s.k + '">' + esc(s.txt) + '</span>' +
          (reag ? ' <span class="pill-cf cf-reag">' + esc(T('cf.reagendada')) + '</span>' : '') + '</td>' +
        '<td>' + (editar ? '<button type="button" class="btn btn-outline btn-mini" data-acao="reprogramarCargaFab" data-arg="' + esc(o.id) + '">' + esc(T('cf.reprogramar')) + '</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
}

/* ------------------------------------------------------------------ mapa */
// Dias × recursos de cada empresa: pessoas em uso / pessoas que a empresa tem.
function mapaHtml(por, h) {
  const c = cfg(), alocs = R.alocacoes(por.programada), ocup = R.ocupacao(c, alocs);
  const ini = R.semanas(h, 1)[0].inicio, dias = [];
  for (let i = 0; i < DIAS_MAPA; i++) dias.push(R.somarDias(ini, i));
  const SEM = T('cm.semana').split(',');
  if (!c.empresas.length) return '<div class="card panel-pad empty-state">' + esc(T('cf.semEmpresas')) + '</div>';
  // quem está em cada dia (para a dica da célula)
  const quem = {};
  alocs.forEach(function (a) {
    a.etapas.forEach(function (e) {
      if (!(e.q > 0)) return;
      R.diasDaEtapa(c, e).forEach(function (d) {
        const k = a.empresa + '|' + e.t + '|' + d;
        (quem[k] = quem[k] || []).push(a.ops.map(function (o) { return o.numero; }).join(', ') + ' (' + e.q + ')');
      });
    });
  });
  const cab = '<tr><th class="cf-mapa-rot">' + esc(T('cf.recursoDia')) + '</th>' + dias.map(function (d) {
    const util = R.diaUtil(c, d);
    return '<th class="' + (util ? '' : 'cf-folga-h') + (d === h ? ' cf-hoje-h' : '') + '">' + d.slice(8) + '<small>' + esc(SEM[new Date(d + 'T12:00:00').getDay()]) + '</small></th>';
  }).join('') + '</tr>';
  let corpo = '';
  c.empresas.forEach(function (emp) {
    corpo += '<tr class="cf-mapa-emp"><td colspan="' + (dias.length + 1) + '"><span class="cf-bola" style="background:' + corEmpresa(emp.id) + '"></span>' + esc(emp.nome) + '</td></tr>';
    c.tipos.forEach(function (t) {
      const cap = emp.qtd[t.id] || 0, uso = (ocup[emp.id] || {})[t.id] || {};
      corpo += '<tr><td class="cf-mapa-rot"><b>' + esc(t.etapa) + '</b><small>' + esc(T('cf.capRec', cap, t.nome)) + '</small></td>' + dias.map(function (d) {
        if (!R.diaUtil(c, d)) return '<td class="cf-cel cf-folga"></td>';
        const u = uso[d] || 0;
        const k = !u ? 'livre' : (u > cap ? 'estouro' : (u === cap ? 'cheio' : 'parcial'));
        const dica = br(d) + ' · ' + t.etapa + ': ' + u + '/' + cap + (quem[emp.id + '|' + t.id + '|' + d] ? '\n' + quem[emp.id + '|' + t.id + '|' + d].join('\n') : '');
        return '<td class="cf-cel cf-cel-' + k + '" title="' + esc(dica) + '">' + (cap || u ? u + '/' + cap : '') + '</td>';
      }).join('') + '</tr>';
    });
  });
  return '<div class="card"><div class="cf-mapa-topo"><div class="panel-title" style="margin:0">' + esc(T('cf.mapaTit')) + '</div><div class="hint-txt">' + esc(T('cf.mapaNota')) + '</div></div>' +
    '<div class="table-wrap cf-mapa-wrap"><table class="cf-mapa">' + cab + corpo + '</table></div></div>';
}

/* --------------------------------------------------- baixa do CQ */
function baixaHtml(por) {
  if (!por.baixaCq.length) return '<div class="card panel-pad empty-state">' + esc(T('cf.semBaixa')) + '</div>';
  const editar = podeEditar();
  return '<div class="card"><div class="table-wrap"><table class="ord-tab"><thead><tr><th>OP</th><th>' + esc(T('fab.cCommessa')) + '</th><th>' + esc(T('fab.cDescricao')) + '</th><th class="num">' + esc(T('fab.cQtd')) +
    '</th><th>' + esc(T('cf.empresa')) + '</th><th>' + esc(T('passo.pergunta')) + '</th><th></th></tr></thead><tbody>' +
    por.baixaCq.sort(function (a, b) { return compararNatural(a.commessa, b.commessa) || compararNatural(a.numero, b.numero); }).map(function (o) {
      return '<tr><td class="mono">' + esc(o.numero) + '</td><td class="mono cf-com">' + esc(nomeDaOp(o)) + '</td><td>' + esc(o.descricao || '—') + '</td><td class="num">' + numeroBr(o.qtd) + '</td>' +
        '<td>' + esc((o.programacao && o.programacao.terceirizada) || '—') + '</td><td>' + esc(o.proximoPasso ? T('passo.' + o.proximoPasso) : '—') + '</td>' +
        '<td>' + (editar ? '<button type="button" class="btn btn-success btn-mini" data-acao="finalizarOp" data-arg="' + esc(o.id) + '">' + esc(T('prog.finalizar')) + '</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
}

/* ------------------------------------------------- recursos (cadastros) */
function recursosHtml(por) {
  const c = cfg(), editar = podeEditar(), dis = editar ? '' : ' disabled';
  const SEMS = T('cm.semana').split(',');
  const empresas = '<div class="card panel-pad"><div class="panel-title">' + esc(T('cf.empresas')) + '</div><div class="panel-note">' + esc(T('cf.empresasNota2')) + '</div>' +
    c.empresas.map(function (e) {
      const n = R.opsDaEmpresa(por.programada, e.id).length;
      return '<div class="carga-maq-linha prog-terc"><span class="cf-bola" style="background:' + corEmpresa(e.id) + '"></span><b>' + esc(e.nome) + '</b><span class="hint-txt">' + esc(T('cf.nOps', n)) + '</span>' +
        (editar ? '<button type="button" class="rm" data-acao="excluirEmpresaCargaFab" data-arg="' + esc(e.id) + '" aria-label="' + esc(T('btn.excluir') + ' — ' + e.nome) + '">✕</button>' : '') + '</div>';
    }).join('') +
    (editar ? '<div class="carga-maq-form prog-terc-form"><input id="cf-nova-empresa" maxlength="60" placeholder="' + esc(T('cf.empresaPh')) + '" data-enter="novaEmpresaCargaFab">' +
      '<button type="button" class="btn btn-outline" data-acao="novaEmpresaCargaFab">' + esc(T('cg.adicionar')) + '</button></div>' : '') + '</div>';
  const pessoas = '<div class="card panel-pad"><div class="panel-title">' + esc(T('cf.pessoasTit')) + '</div><div class="panel-note">' + esc(T('cf.pessoasNota')) + '</div>' +
    (c.empresas.length ? '<div class="table-wrap"><table class="ord-tab cf-rec-tab"><thead><tr><th>' + esc(T('cf.etapaRecurso')) + '</th>' + c.empresas.map(function (e) { return '<th class="num">' + esc(e.nome) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
      c.tipos.map(function (t) {
        const padrao = R.TIPOS_PADRAO.some(function (x) { return x.id === t.id; });
        return '<tr><td><b>' + esc(t.etapa) + '</b> <span class="hint-txt">' + esc(t.nome) + '</span></td>' + c.empresas.map(function (e) {
          return '<td class="num"><input type="number" min="0" max="999" step="1" class="cf-qtd" value="' + (e.qtd[t.id] || 0) + '" data-change="qtdRecCargaFab" data-arg="' + esc(e.id) + '" data-arg2="' + esc(t.id) + '" aria-label="' + esc(e.nome + ' — ' + t.nome) + '"' + dis + '></td>';
        }).join('') + '<td>' + (editar && !padrao ? '<button type="button" class="rm" data-acao="excluirTipoCargaFab" data-arg="' + esc(t.id) + '" aria-label="' + esc(T('btn.excluir') + ' — ' + t.nome) + '">✕</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="hint-txt">' + esc(T('cf.semEmpresas')) + '</div>') +
    (editar ? '<div class="carga-maq-form prog-terc-form"><input id="cf-novo-etapa" maxlength="40" placeholder="' + esc(T('cf.etapaPh')) + '"><input id="cf-novo-recurso" maxlength="40" placeholder="' + esc(T('cf.recursoPh')) + '" data-enter="novoTipoCargaFab">' +
      '<button type="button" class="btn btn-outline" data-acao="novoTipoCargaFab">' + esc(T('cg.adicionar')) + '</button></div>' : '') + '</div>';
  const extras = Object.keys(c.extras).sort();
  const dias = '<div class="card panel-pad"><div class="panel-title">' + esc(T('cf.diasTit')) + '</div><div class="panel-note">' + esc(T('cf.diasNota')) + '</div>' +
    '<div class="cf-dias">' + [1, 2, 3, 4, 5, 6, 0].map(function (i) {
      return '<label class="cf-dia' + (c.dias[i] ? ' on' : '') + '"><input type="checkbox" data-change="diaCargaFab" data-arg="' + i + '"' + (c.dias[i] ? ' checked' : '') + dis + '>' + esc(SEMS[i]) + '</label>';
    }).join('') + '</div>' +
    '<div class="sub-titulo">' + esc(T('cf.extrasTit')) + '</div>' +
    (extras.length ? extras.map(function (d) {
      return '<div class="carga-maq-linha"><b class="mono">' + esc(br(d)) + '</b><span class="pill-cf ' + (c.extras[d] ? 'cf-prazo' : 'cf-atraso') + '">' + esc(T(c.extras[d] ? 'cf.extraTrabalha' : 'cf.extraFolga')) + '</span>' +
        (editar ? '<button type="button" class="rm" data-acao="excluirExtraCargaFab" data-arg="' + esc(d) + '" aria-label="' + esc(T('btn.excluir') + ' — ' + br(d)) + '">✕</button>' : '') + '</div>';
    }).join('') : '<div class="hint-txt">' + esc(T('cf.semExtras')) + '</div>') +
    (editar ? '<div class="carga-maq-form prog-terc-form"><input type="date" id="cf-extra-dia" aria-label="' + esc(T('cf.extraDia')) + '"><select id="cf-extra-tipo" aria-label="' + esc(T('cf.extraTipo')) + '">' +
      '<option value="0">' + esc(T('cf.extraFolga')) + '</option><option value="1">' + esc(T('cf.extraTrabalha')) + '</option></select>' +
      '<button type="button" class="btn btn-outline" data-acao="novoExtraCargaFab">' + esc(T('cg.adicionar')) + '</button></div>' : '') + '</div>';
  return '<div class="cf-recursos">' + empresas + pessoas + dias + '</div>';
}
function salvarCfg(mudar, msg) {
  if (!podeEditar()) return;
  const c = cfg();
  if (mudar(c) === false) return;
  DadosProg.salvarRecursos(c).then(function () { if (msg) toast(msg); }).catch(function (e) { avisoErro(e); });
}
function novoId(nome, lista) {
  const base = String(nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'item';
  let id = base, n = 2;
  while (lista.some(function (x) { return x.id === id; })) id = base + '-' + n++;
  return id;
}

/* ------------------------------------------------- programar / reprogramar */
let prog = null;   // { ops, grupo }
function abrirProgramar(pid) {
  if (!podeEditar()) return;
  const l = opsCald().filter(function (o) { return o.projetoId === pid && Prog.situacao(o) === 'emAberto' && ui.sel[o.id]; });
  if (!l.length) return;
  abrirJanela(l, null);
}
function abrirReprogramar(id) {
  const o = opPorId(id);
  if (!o || !podeEditar()) return;
  const l = doGrupo(o);
  abrirJanela(l, o.programacao && o.programacao.grupo || null);
}
function abrirJanela(ops, grupo) {
  const c = cfg(), h = hoje(), o0 = ops[0], pr = R.temEtapas(o0) ? o0.programacao : null;
  prog = { ops: ops, grupo: grupo || (ops.length > 1 ? 'g' + Date.now().toString(36) : null), fora: grupo || (ops.length === 1 ? o0.id : null) };
  $('cfp-titulo').textContent = T(pr || o0.programacao ? 'cf.reprogramarTit' : 'cf.programarTit');
  $('cfp-sub').textContent = T('cf.programarSub', nomeDaOp(o0), ops.length, ops.map(function (o) { return o.numero; }).join(', '));
  const empAtual = o0.programacao && o0.programacao.terceirizadaId;
  $('cfp-empresa').innerHTML = c.empresas.map(function (e) { return '<option value="' + esc(e.id) + '"' + (e.id === empAtual ? ' selected' : '') + '>' + esc(e.nome) + '</option>'; }).join('');
  $('cfp-etapas').innerHTML = '<div class="cf-et-cab"><span>' + esc(T('cf.etapa')) + '</span><span>' + esc(T('cf.pessoasCol')) + '</span><span>' + esc(T('cf.inicio')) + '</span><span>' + esc(T('cf.fim')) + '</span><span></span></div>' +
    c.tipos.map(function (t, k) {
      const e = pr ? pr.etapas.find(function (x) { return x.t === t.id; }) : null;
      const novo = !pr && k === 0;
      const q = e ? e.q : (novo ? 1 : 0), i = e ? e.i : (novo ? h : ''), f = e ? e.f : (novo ? R.aposDiasUteis(c, h, 5) : '');
      return '<div class="cf-et-linha" data-tipo="' + esc(t.id) + '"' + (e && e.b ? ' data-baixa="' + esc(e.b) + '"' : '') + '><span><b>' + esc(t.etapa) + '</b><small>' + esc(t.nome) + (e && e.b ? ' · ' + esc(T('cf.baixaEm', br(e.b))) : '') + '</small></span>' +
        '<input type="number" min="0" max="999" step="1" class="cf-q" value="' + q + '" aria-label="' + esc(T('cf.pessoasCol') + ' — ' + t.etapa) + '">' +
        '<input type="date" class="cf-i" value="' + esc(i) + '" aria-label="' + esc(T('cf.inicio') + ' — ' + t.etapa) + '">' +
        '<input type="date" class="cf-f" value="' + esc(f) + '" aria-label="' + esc(T('cf.fim') + ' — ' + t.etapa) + '">' +
        '<span class="cf-livres"></span></div>';
    }).join('');
  $('cfp-erro').textContent = '';
  atualizarLivres();
  abrirModal('modal-cf-prog', { foco: 'cfp-empresa', aoFechar: function () { prog = null; } });
}
function linhasJanela() {
  return Array.prototype.map.call(document.querySelectorAll('#cfp-etapas .cf-et-linha'), function (el) {
    return { el: el, t: el.dataset.tipo, q: el.querySelector('.cf-q').value, i: el.querySelector('.cf-i').value, f: el.querySelector('.cf-f').value, b: el.dataset.baixa || null };
  });
}
function atualizarLivres() {
  if (!prog) return;
  const c = cfg(), emp = $('cfp-empresa').value;
  const ocup = R.ocupacao(c, R.alocacoes(opsCald(), prog.fora));
  linhasJanela().forEach(function (l) {
    const alvo = l.el.querySelector('.cf-livres');
    if (!dataValida(l.i) || !dataValida(l.f)) { alvo.textContent = ''; alvo.className = 'cf-livres'; return; }
    const cap = R.capacidade(c, emp, l.t), liv = R.livres(c, ocup, emp, l.t, l.i, l.f < l.i ? l.i : l.f);
    alvo.textContent = T('cf.livresDe', Math.max(0, liv), cap);
    alvo.className = 'cf-livres' + (Number(l.q) > liv ? ' falta' : '');
  });
}
document.addEventListener('input', function (e) { if (prog && e.target && e.target.closest && e.target.closest('#modal-cf-prog')) atualizarLivres(); });
document.addEventListener('change', function (e) { if (prog && e.target && e.target.closest && e.target.closest('#modal-cf-prog')) atualizarLivres(); });

function salvarProgramar(_a, _b, btn) {
  if (!prog) return;
  const c = cfg(), emp = c.empresas.find(function (x) { return x.id === $('cfp-empresa').value; });
  if (!emp) { $('cfp-erro').textContent = T('cf.erroSemEmpresa'); return; }
  const linhas = linhasJanela();
  if (linhas.some(function (l) { return (l.i && !dataValida(l.i)) || (l.f && !dataValida(l.f)) || (!!l.i !== !!l.f); })) { $('cfp-erro').textContent = T('cf.erroDatas'); return; }
  if (linhas.some(function (l) { return l.i && l.f && l.f < l.i; })) { $('cfp-erro').textContent = T('cf.erroFimAntes'); return; }
  const etapas = R.etapasValidas(linhas);
  if (!etapas.length) { $('cfp-erro').textContent = T('cf.erroSemEtapa'); return; }
  const ocup = R.ocupacao(c, R.alocacoes(opsCald(), prog.fora));
  const faltas = R.conferir(c, ocup, emp.id, etapas);
  if (faltas.length) {
    $('cfp-erro').textContent = faltas.map(function (f) {
      const t = tipoDe(c, f.tipo);
      return T('cf.erroFalta', t.nome, f.dias.slice(0, 6).map(function (d) { return br(d).slice(0, 5); }).join(', ') + (f.dias.length > 6 ? '…' : ''), f.cap);
    }).join(' ');
    return;
  }
  const p = prog, ops = p.ops;
  comBotaoOcupado(btn, DadosProg.programarEtapas(ops, emp, etapas, p.grupo, false).then(function () {
    ops.forEach(function (o) { delete ui.sel[o.id]; });
    fecharModal('modal-cf-prog');
    toast(T('cf.programadas', ops.length, emp.nome, br(R.periodo(etapas).fim)));
  }).catch(function (x) { avisoErro(x); }));
}

/* ---------------------------------------------------------------- janela da OP */
let opAberta = null;
function verOp(id) {
  const o = opPorId(id);
  if (!o || !o.programacao) return;
  opAberta = id;
  renderOp();
  abrirModal('modal-cf-op', { aoFechar: function () { opAberta = null; } });
}
function renderOp() {
  const o = opAberta && opPorId(opAberta);
  if (!o || !o.programacao) return;
  const pr = o.programacao, h = hoje(), s = situ(o, h), reag = Prog.reagendada(o), sem = R.semRecurso(cfg(), opsCald(), h)[o.id];
  $('cfo-titulo').textContent = 'OP ' + o.numero;
  $('cfo-sub').innerHTML = esc(o.descricao || o.desenho) + ' · <span class="pill-cf cf-' + s.k + '">' + esc(s.txt) + '</span>' + (reag ? ' <span class="pill-cf cf-reag">' + esc(T('cf.reagendada')) + '</span>' : '') +
    (sem ? ' <span class="pill-cf cf-semrec-pill">' + esc(T('cf.semRecurso')) + '</span>' : '');
  const item = function (rot, val, cls) { return '<div' + (cls ? ' class="' + cls + '"' : '') + '><span>' + esc(rot) + '</span><b>' + val + '</b></div>'; };
  const p = buscarProjeto(o.projetoId);
  $('cfo-corpo').innerHTML = '<div class="rnc-resumo cf-info">' +
    item('OP', esc(o.numero), 'mono') + item(T('fab.cCommessa'), '<span class="cf-com">' + esc(nomeDaOp(o)) + '</span>', 'mono') + item(T('fab.cQtd'), esc(T('cg.qtd', numeroBr(o.qtd)))) +
    item(T('fab.cPeso'), kg(o.pesoTotal)) + item(T('cf.inicio'), brAno(pr.inicio)) + item(T('cf.termino'), brAno(pr.previsaoFim)) +
    '<div class="rnc-resumo-peca"><span>' + esc(T('cf.empresa')) + '</span><b class="cf-empresa"><span class="cf-bola" style="background:' + corEmpresa(pr.terceirizadaId) + '"></span>' + esc(pr.terceirizada || '—') + '</b></div></div>' +
    '<div class="sub-titulo">' + esc(T('cf.etapas')) + '</div>' + etapasHtml(o, h, podeEditar()) +
    '<div class="hint-txt">' + esc((p && p.descricao) || o.descricaoProjeto || '') + (o.desenho ? ' · ' + esc(T('rnc.peca', o.desenho, o.posicao || '—')) : '') +
    (reag ? ' · ' + esc(T('cf.antes', pr.historico.map(br).join(' → '))) : '') + (doGrupo(o).length > 1 ? ' · ' + esc(T('cf.grupo', doGrupo(o).map(function (x) { return x.numero; }).join(', '))) : '') + '</div>';
  $('cfo-reagendar').hidden = !podeEditar();
}
export function renderJanelaCargaFab() { if (opAberta && $('modal-cf-op').classList.contains('open')) renderOp(); }

function baixaEtapa(id, idx) {
  const o = opPorId(id), i = Number(idx);
  if (!o || !R.temEtapas(o) || !podeEditar() || !o.programacao.etapas[i]) return;
  const t = tipoDe(cfg(), o.programacao.etapas[i].t);
  DadosProg.baixaEtapa(doGrupo(o), i, hoje()).then(function () { toast(T('cf.baixaOk', t.etapa, o.numero)); }).catch(function (e) { avisoErro(e); });
}

function redesenhar() { renderCargaFabrica('fab-quadro'); }
registrarAcoes({
  abaCargaFab: function (a) { if (ABAS.indexOf(a) >= 0) { ui.aba = a; redesenhar(); } },
  filtroCargaFab: function (v, campo) { if (campo === 'emp' || campo === 'com' || campo === 'mes') { ui[campo] = v; redesenhar(); } },
  limparFiltroCargaFab: function () { ui.emp = ui.com = ui.mes = ''; redesenhar(); },
  selCargaFab: function (_v, id, el) { ui.sel[id] = !!el.checked; redesenhar(); },
  selTodasCargaFab: function (_v, pid, el) { opsCald().forEach(function (o) { if (o.projetoId === pid && Prog.situacao(o) === 'emAberto') ui.sel[o.id] = !!el.checked; }); redesenhar(); },
  programarCargaFab: abrirProgramar,
  salvarProgramarCargaFab: salvarProgramar,
  verOpCargaFab: verOp,
  reprogramarCargaFab: function (id) { abrirReprogramar(id); },
  reagendarOpAberta: function () { const id = opAberta; fecharModal('modal-cf-op'); abrirReprogramar(id); },
  baixaEtapaCargaFab: baixaEtapa,
  // cadastros
  novaEmpresaCargaFab: function () {
    const nome = ($('cf-nova-empresa').value || '').trim();
    if (!nome) return;
    salvarCfg(function (c) {
      if (c.empresas.length >= R.MAX_EMPRESAS) { toast(T('cf.limite'), { tipo: 'erro' }); return false; }
      c.empresas.push({ id: novoId(nome, c.empresas), nome: nome.slice(0, 60), qtd: {} });
    }, T('cf.empresaOk', nome));
  },
  excluirEmpresaCargaFab: function (id) {
    const c = cfg(), e = c.empresas.find(function (x) { return x.id === id; });
    if (!e) return;
    const l = R.opsDaEmpresa(opsCald(), id);
    if (l.length) { toast(T('cf.empresaComOps', e.nome, l.slice(0, 8).map(function (o) { return o.numero; }).join(', ')), { tipo: 'erro' }); return; }
    confirmar(T('cf.excluirEmpresaQ', e.nome), { perigo: true }).then(function (ok) {
      if (ok) salvarCfg(function (x) { x.empresas = x.empresas.filter(function (y) { return y.id !== id; }); });
    });
  },
  qtdRecCargaFab: function (v, tipo, el) {
    const emp = el.dataset.arg, n = Math.max(0, Math.min(999, Math.floor(Number(v) || 0)));
    salvarCfg(function (c) { const e = c.empresas.find(function (x) { return x.id === emp; }); if (!e) return false; e.qtd[tipo] = n; });
  },
  novoTipoCargaFab: function () {
    const etapa = ($('cf-novo-etapa').value || '').trim(), nome = ($('cf-novo-recurso').value || '').trim();
    if (!etapa || !nome) { toast(T('cf.tipoIncompleto'), { tipo: 'erro' }); return; }
    salvarCfg(function (c) {
      if (c.tipos.length >= R.MAX_TIPOS) { toast(T('cf.limite'), { tipo: 'erro' }); return false; }
      c.tipos.push({ id: novoId(etapa, c.tipos), nome: nome.slice(0, 40), etapa: etapa.slice(0, 40) });
    }, T('cf.tipoOk', etapa));
  },
  excluirTipoCargaFab: function (id) {
    const usado = opsCald().some(function (o) { return R.temEtapas(o) && !o.encerradaEm && o.programacao.etapas.some(function (e) { return e.t === id; }); });
    if (usado) { toast(T('cf.tipoEmUso'), { tipo: 'erro' }); return; }
    salvarCfg(function (c) { c.tipos = c.tipos.filter(function (t) { return t.id !== id; }); c.empresas.forEach(function (e) { delete e.qtd[id]; }); });
  },
  diaCargaFab: function (_v, _b, el) { const i = Number(el.dataset.arg); salvarCfg(function (c) { c.dias[i] = !!el.checked; }); },
  novoExtraCargaFab: function () {
    const d = $('cf-extra-dia').value, trabalha = $('cf-extra-tipo').value === '1';
    if (!dataValida(d)) { toast(T('com.erroData'), { tipo: 'erro' }); return; }
    salvarCfg(function (c) {
      if (Object.keys(c.extras).length >= R.MAX_EXTRAS) { toast(T('cf.limite'), { tipo: 'erro' }); return false; }
      c.extras[d] = trabalha;
    }, T('cf.extraOk', br(d)));
  },
  excluirExtraCargaFab: function (d) { salvarCfg(function (c) { delete c.extras[d]; }); }
});
