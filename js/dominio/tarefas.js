/* ---------------------------------------------------------------------------
   Tarefas avulsas do projeto: o que aparece fora do checklist (um problema
   para resolver, um pedido de última hora). GP e Gerência criam para alguém
   da equipe; a pessoa conclui. Não entram no cronograma. Puro cálculo.
   Documento: equipes/{id}/tarefas/{id}.
--------------------------------------------------------------------------- */
import { difDias } from '../nucleo/fmt.js';

export const LIMITES = { titulo: 120, descricao: 2000, obsConclusao: 1000 };

// Quanto tempo levou, da criação à conclusão: { dias, horas, minutos } (null sem as datas).
export function duracao(inicioIso, fimIso) {
  const a = Date.parse(inicioIso || ''), b = Date.parse(fimIso || '');
  if (!isFinite(a) || !isFinite(b) || b < a) return null;
  const min = Math.round((b - a) / 60000);
  return { dias: Math.floor(min / 1440), horas: Math.floor((min % 1440) / 60), minutos: min % 60 };
}

// Situação do prazo de uma tarefa em aberto: 'semPrazo' | 'noPrazo' | 'hoje' | 'atrasada'.
export function prazo(t, h) {
  if (!t.prazo || t.status === 'concluida') return 'semPrazo';
  if (t.prazo === h) return 'hoje';
  return t.prazo < h ? 'atrasada' : 'noPrazo';
}

// Em aberto primeiro as atrasadas e as que vencem antes; concluídas, as mais recentes.
export function ordenar(lista, h) {
  const peso = { atrasada: 0, hoje: 1, noPrazo: 2, semPrazo: 3 };
  return lista.slice().sort(function (a, b) {
    if (a.status !== b.status) return a.status === 'concluida' ? 1 : -1;
    if (a.status === 'concluida') return String(b.concluidaEm || '').localeCompare(String(a.concluidaEm || ''));
    const pa = peso[prazo(a, h)], pb = peso[prazo(b, h)];
    if (pa !== pb) return pa - pb;
    return String(a.prazo || '9999').localeCompare(String(b.prazo || '9999')) || String(a.criadoEm || '').localeCompare(String(b.criadoEm || ''));
  });
}

// Avisos calculados para quem recebeu: prazo vence hoje (aviso) ou venceu (alerta).
export function avisos(tarefas, uid, h) {
  return (tarefas || []).filter(function (t) { return t.status !== 'concluida' && t.paraUid === uid && t.prazo && t.prazo <= h; })
    .map(function (t) {
      const atraso = difDias(t.prazo, h);
      return { id: 'tarefa-prazo:' + t.id, tipo: atraso > 0 ? 'tarefa-atrasada' : 'tarefa-vence', nivel: atraso > 0 ? 'alerta' : 'aviso',
        projetoId: t.projetoId, commessa: t.commessa || '', titulo: t.titulo, prazo: t.prazo, atrasoDias: atraso };
    });
}
