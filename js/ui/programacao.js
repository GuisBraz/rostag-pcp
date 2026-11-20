/* ---------------------------------------------------------------------------
   Programação das OPs (programadores e Gerência).

   Caldeiraria — quadro na aba Fábrica do programador (e na Carga da
   Gerência): Em aberto → Em fábrica (terceirizada + data prevista) →
   Baixa do CQ (finalizar) · RNC aguardando disposição; carga em kg por
   terceirizada e o cadastro das terceirizadas.
   Usinagem — Carga Máquina: OPs aguardando programação, a fila de cada
   máquina com início e fim calculados (como no MS Project), horas reais,
   baixa do CQ (finalizar) e RNC.
--------------------------------------------------------------------------- */
import * as Pgm from '../dominio/pgm.js';
import { estado, buscarProjeto, opVisivel } from '../estado.js';
import { esc, br, hoje, numeroBr, difDias, compararNatural } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Prog from '../dominio/programacao.js';
import * as Carga from '../dominio/carga.js';
import * as Auth from '../dados/auth.js';
import * as DadosProg from '../dados/programacao.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal, confirmar } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';
import { kpi } from './componentes.js';
import { opPorId, naFila, situacaoDe, pillSituacao, classeAtraso } from './opDetalhe.js';

function projetosPorId() { const r = {}; estado.projetos.forEach(function (p) { r[p.id] = p; }); return r; }
function ativas() { return (estado.maquinas || []).filter(function (m) { return m.ativa !== false; }); }
function podeProgramar(area) { return Auth.souGerente() || Auth.areaProgramador() === area; }
function prazoDe(o) { const p = buscarProjeto(o.projetoId); return p ? p.prodFim || null : null; }
function projetoVivo(o) { return opVisivel(o); }
function ordenar(a, b) { return compararNatural(a.commessa, b.commessa) || compararNatural(a.numero, b.numero); }
function diasEspera(o) { const d = String(o.desprogramadaEm || o.criadoEm || '').slice(0, 10); return d ? difDias(d, hoje()) : 0; }

// Agenda de cada máquina ativa: { maquinaId: itens } (usada também na grade e nos avisos).
// A agenda é calculada uma vez por redesenho (e por minuto): a Carga, o sino e os
// resumos usam o mesmo resultado.
let memoAgenda = { chave: null, valor: null };
export function agendasAtuais(h) {
  const d0 = new Date();
  const chave = (estado.rev || 0) + '|' + (h || '') + '|' + d0.getHours() + ':' + d0.getMinutes() + '|' + d0.getDate() +
    '|' + (estado.ops || []).length + '|' + (estado.maquinas || []).length + '|' + (estado.pgms || []).length;
  if (memoAgenda.chave === chave && memoAgenda.ops === estado.ops && memoAgenda.maqs === estado.maquinas && memoAgenda.pgms === estado.pgms) return memoAgenda.valor;
  const valor = calcularAgendas(h);
  memoAgenda = { chave: chave, valor: valor, ops: estado.ops, maqs: estado.maquinas, pgms: estado.pgms };

  return valor;
}
function calcularAgendas(h) {
  const opsId = {};
  estado.ops.forEach(function (o) { opsId[o.id] = o; });
  (estado.pgms || []).forEach(function (p) { const o = Pgm.comoOp(p); opsId[o.id] = o; });
  const proj = projetosPorId(), maqs = ativas(), r = {};
  // por operação do roteiro, com a ordem entre as operações da mesma OP
  // agora (data e hora): a fila começa no próximo minuto de trabalho
  const d = new Date(), p2 = function (n) { return String(n).padStart(2, '0'); };
  const agora = h && h !== hoje() ? h : d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  const tudo = Prog.agendarTudo(maqs, opsId, proj, estado.setores, agora);
  maqs.forEach(function (m) { r[m.id] = tudo[m.id] || []; });
  return r;
}
export function agendaPorOp(agendas) {
  const r = {};
  Object.keys(agendas || {}).forEach(function (mid) {
    agendas[mid].forEach(function (it) {
      if (!it.op || it.concluida || it.ausente || !it.fim) return;
      const atual = r[it.opId];
      if (!atual || it.fim > atual.fim) r[it.opId] = { fim: it.fim, atraso: it.atraso || (atual && atual.atraso) };
      else if (it.atraso) atual.atraso = true;
    });
  });
  return r;
}

/* -------------------------------------------------------- cartão de OP */
