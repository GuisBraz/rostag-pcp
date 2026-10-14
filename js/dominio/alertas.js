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

export function gerar(projetos) {
  const h = hoje(), lista = [];
  const alertaEntrega = Number(prefs.alerta) || 10;

  projetos.filter(Projeto.aberto).forEach(function (p) {
    const c = Cronograma.calcular(p);

    // projeto parado não gera alarme de tarefa: o cronograma está congelado
    const pausa = Projeto.pausaAtual(p);
    if (pausa) {
      lista.push({
        id: 'paralisado:' + p.id, nivel: 'aviso', projetoId: p.id, ordem: 2.5,
        titulo: T('n.paralisado', p.commessa),
        meta: T('n.paralisadoM', plural(Projeto.diasParadoAtual(p), 'x.dia', 'x.dias'), pausa.motivo ? ' — ' + pausa.motivo : ''),
        quando: pausa.inicio
      });
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
  });

  lista.sort(function (a, b) { return a.ordem - b.ordem || a.quando.localeCompare(b.quando); });
  lista.forEach(function (n) { n.lida = !!prefs.lidas[n.id]; });
  return lista;
}

// Não deixa o registro de lidas crescer para sempre: só guarda o que ainda existe.
export function podarLidas(lista) {
  const vivos = {};
  lista.forEach(function (n) { if (prefs.lidas[n.id]) vivos[n.id] = true; });
  prefs.lidas = vivos;
}
