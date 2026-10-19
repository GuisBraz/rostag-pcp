/* ---------------------------------------------------------------------------
   Alertas — notificações derivadas do estado dos projetos. Nada é gravado
   além do "lido" (nas preferências), então elas somem sozinhas quando o
   que as gerou é resolvido.
--------------------------------------------------------------------------- */
import { prefs } from '../nucleo/prefs.js';
import { hoje, br, difDias } from '../nucleo/fmt.js';
import { T, plural } from '../i18n/index.js';
import * as Cronograma from './cronograma.js';
import * as Projeto from './projeto.js';
import * as Producao from './producao.js';

// Quem recebe cada alerta automático (docs/ESPECIFICACAO.md, seção 5).
const DESTINO = {
  'aguardando': ['gerente_pcp', 'gp'],
  'paralisado': ['gerente_pcp', 'gp', 'tecnico'],
  'tarefa-atrasada': ['gp', 'tecnico'],
  'tarefa-chegando': ['gp', 'tecnico'],
  'pcp-estourado': ['gerente_pcp', 'gp'],
  'pcp-projecao': ['gp', 'tecnico'],
  'pcp-concluido': ['gerente_pcp', 'gp'],
  'prod-atrasada': ['gerente_pcp', 'gp'],
  'prod-concluida': ['gerente_pcp', 'gp', 'tecnico'],
  'entrega-chegando': ['gp', 'tecnico'],
  'entrega-atrasada': ['gerente_pcp', 'gp']
};

// O alerta vale para quem lê? Sem contexto (testes, telas antigas), vale para todos.
function paraMim(tipo, p, ctx) {
  if (!ctx || !ctx.papel) return true;
  if ((DESTINO[tipo] || []).indexOf(ctx.papel) < 0) return false;
  if (ctx.papel === 'gerente_pcp') return true;
  return (ctx.papel === 'gp' && p.gpUid === ctx.uid) || (ctx.papel === 'tecnico' && p.responsavelUid === ctx.uid);
}

// ctx: { papel, uid, ops } — filtra pelo cargo e usa as OPs para a produção.
export function gerar(projetos, ctx) {
  const h = hoje(), todos = [];
  const alertaEntrega = Number(prefs.alerta) || 10;
  const opsPorProjeto = {};
  ((ctx && ctx.ops) || []).forEach(function (o) { (opsPorProjeto[o.projetoId] = opsPorProjeto[o.projetoId] || []).push(o); });

  projetos.filter(Projeto.aberto).forEach(function (p) {
    const lista = [];
    if (Projeto.aguardandoCronograma(p)) {
      lista.push({ id: 'aguardando:' + p.id, tipo: 'aguardando', nivel: 'aviso', projetoId: p.id, ordem: 2.8,
        titulo: T('n.aguardando', p.commessa), meta: T('n.aguardandoM'), quando: p.dataSolicitacao || h });
      lista.forEach(function (n) { if (paraMim(n.tipo, p, ctx)) todos.push(n); });
      return;
    }
    const c = Cronograma.calcular(p);

    // projeto parado para inteiro (PCP, produção e entrega): só o aviso de
    // que está parado, nenhum alarme de prazo
    const pausa = Projeto.pausaAtual(p);
    if (pausa) {
      lista.push({
        id: 'paralisado:' + p.id, tipo: 'paralisado', nivel: 'aviso', projetoId: p.id, ordem: 2.5,
        titulo: T('n.paralisado', p.commessa),
        meta: T('n.paralisadoM', plural(Projeto.diasParadoAtual(p), 'x.dia', 'x.dias'), pausa.motivo ? ' — ' + pausa.motivo : ''),
        quando: pausa.inicio
      });
      lista.forEach(function (n) { if (paraMim(n.tipo, p, ctx)) todos.push(n); });
      return;
    }

    const atrasadas = c.itens.filter(function (i) { return i.situacao === 'atrasada'; });
    if (atrasadas.length) {
      const pior = atrasadas[0];
      lista.push({
        id: 'tarefa-atrasada:' + p.id, nivel: 'alerta', projetoId: p.id, ordem: 1,
        titulo: T('n.tarefaAtrasada', p.commessa, plural(atrasadas.length, 'n.tarefaAtrasadaU', 'n.tarefasAtrasadas')),
        meta: T('n.tarefaAtrasadaM', pior.t, br(pior.fim), plural(pior.atrasoDias, 'x.dia', 'x.dias')),
        quando: pior.fim
      });
    }

    const chegando = c.itens.filter(function (i) { return i.situacao === 'chegando'; });
    if (chegando.length) {
      const prox = chegando[0];
      const d = difDias(h, prox.fim);
      lista.push({
        id: 'tarefa-chegando:' + p.id, nivel: 'aviso', projetoId: p.id, ordem: 3,
        titulo: T('n.tarefaVencendo', p.commessa),
        meta: d === 0 ? T('n.tarefaVencendoHoje', prox.t) : T('n.tarefaVencendoEm', prox.t, plural(d, 'x.dia', 'x.dias')),
        quando: prox.fim
      });
    }

    if (!c.concluido && p.pcpFim < h) {
      lista.push({
        id: 'pcp-estourado:' + p.id, nivel: 'alerta', projetoId: p.id, ordem: 2,
        titulo: T('n.pcpEstourado', p.commessa),
        meta: T('n.pcpEstouradoM', br(p.pcpFim), Projeto.progresso(p)),
        quando: p.pcpFim
      });
    } else if (!c.concluido && c.estouro > 0) {
      lista.push({
        id: 'pcp-projecao:' + p.id, nivel: 'aviso', projetoId: p.id, ordem: 4,
        titulo: T('n.pcpProjecao', p.commessa),
        meta: T('n.pcpProjecaoM', br(c.fimPrevisto), plural(c.estouro, 'x.dia', 'x.dias')),
        quando: c.fimPrevisto
      });
    }

    // produção: só depois do PCP; avanço pelas OPs aprovadas
    const stOps = Producao.estatisticas(opsPorProjeto[p.id]);
    const sitProd = Producao.situacao(p, stOps, h);
    if (c.concluido && sitProd !== 'concluida') {
      const fimReal = c.itens.length ? c.itens[c.itens.length - 1].fim : h;
      lista.push({ id: 'pcp-concluido:' + p.id, nivel: 'aviso', projetoId: p.id, ordem: 6,
        titulo: T('n.pcpConcluido', p.commessa), meta: T('n.pcpConcluidoM', br(fimReal)), quando: fimReal || h });
    }
    if (sitProd === 'atrasada' && !pausa) {
      lista.push({ id: 'prod-atrasada:' + p.id, nivel: 'alerta', projetoId: p.id, ordem: 1.5,
        titulo: T('n.prodAtrasada', p.commessa),
        meta: T('n.prodAtrasadaM', br(p.prodFim), plural(Producao.diasAtraso(p, h), 'x.dia', 'x.dias'), stOps.pct), quando: p.prodFim });
    } else if (sitProd === 'concluida') {
      lista.push({ id: 'prod-concluida:' + p.id, nivel: 'aviso', projetoId: p.id, ordem: 6.5,
        titulo: T('n.prodConcluida', p.commessa), meta: T('n.prodConcluidaM', stOps.total), quando: h });
    }

    if (p.entrega < h) {
      lista.push({
        id: 'entrega-atrasada:' + p.id, nivel: 'alerta', projetoId: p.id, ordem: 0,
        titulo: T('n.entregaAtrasada', p.commessa),
        meta: T('n.entregaAtrasadaM', br(p.entrega), plural(difDias(p.entrega, h), 'x.dia', 'x.dias')),
        quando: p.entrega
      });
    } else if (difDias(h, p.entrega) <= alertaEntrega) {
      const d = difDias(h, p.entrega);
      lista.push({
        id: 'entrega-chegando:' + p.id, nivel: 'aviso', projetoId: p.id, ordem: 5,
        titulo: T('n.entregaChegando', p.commessa),
        meta: d === 0 ? T('n.entregaHoje') : T('n.entregaFaltam', plural(d, 'x.dia', 'x.dias')),
        quando: p.entrega
      });
    }
    lista.forEach(function (n) {
      n.tipo = n.tipo || n.id.split(':')[0];
      if (paraMim(n.tipo, p, ctx)) todos.push(n);
    });
  });

  todos.sort(function (a, b) { return a.ordem - b.ordem || String(a.quando).localeCompare(String(b.quando)); });
  todos.forEach(function (n) { n.lida = !!prefs.lidas[n.id]; n.origem = 'sistema'; });
  return todos;
}

// Não deixa o registro de lidas crescer para sempre: só guarda o que ainda existe.
export function podarLidas(lista) {
  const vivos = {};
  lista.forEach(function (n) { if (prefs.lidas[n.id]) vivos[n.id] = true; });
  prefs.lidas = vivos;
}
