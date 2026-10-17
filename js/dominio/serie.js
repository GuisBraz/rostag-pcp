/* ---------------------------------------------------------------------------
   Serie — séries temporais do painel. Puro cálculo, sem DOM.
--------------------------------------------------------------------------- */
import { hoje, addDias } from '../nucleo/fmt.js';
import { T, mesesCurto } from '../i18n/index.js';

// O projeto estava aberto naquele dia? Usado para a foto semana a semana.
export function abertoEm(p, dia) {
  const inicio = p.pcpInicio || p.dataSolicitacao;
  if (inicio && inicio > dia) return false;                  // ainda não tinha começado
  if (p.concluidoEm && p.concluidoEm <= dia) return false;   // já entregue
  if (p.canceladoEm && p.canceladoEm <= dia) return false;   // já cancelado
  return true;
}

// No prazo x atrasados: fotografia dos projetos abertos em cada uma das últimas n semanas.
export function prazoSemanal(lista, semanas) {
  const rotulos = [], noPrazo = [], atrasados = [];
  for (let i = semanas - 1; i >= 0; i--) {
    const dia = addDias(hoje(), -7 * i);
    rotulos.push(i === 0 ? T('g.hoje') : T('g.semanaAtras', i));
    const abertos = lista.filter(function (p) { return abertoEm(p, dia); });
    const atr = abertos.filter(function (p) { return p.entrega < dia; }).length;
    atrasados.push(atr);
    noPrazo.push(abertos.length - atr);
  }
  return { rotulos: rotulos, noPrazo: noPrazo, atrasados: atrasados };
}

export function semestreAtual() {
  const h = hoje(), ano = Number(h.slice(0, 4)), mes = Number(h.slice(5, 7));
  return mes <= 6
    ? { ano: ano, meses: [1, 2, 3, 4, 5, 6], rotulo: T('g.sem1') }
    : { ano: ano, meses: [7, 8, 9, 10, 11, 12], rotulo: T('g.sem2') };
}

// Entregas concluídas no período, separadas por quem cumpriu o prazo.
export function pontualidade(lista, ano, meses) {
  const rotulos = [], noPrazo = [], atrasado = [];
  meses.forEach(function (m) {
    const prefixo = ano + '-' + String(m).padStart(2, '0');
    const doMes = lista.filter(function (p) { return p.concluidoEm && p.concluidoEm.slice(0, 7) === prefixo; });
    rotulos.push(mesesCurto()[m - 1].slice(0, 3));
    noPrazo.push(doMes.filter(function (p) { return p.concluidoEm <= p.entrega; }).length);
    atrasado.push(doMes.filter(function (p) { return p.concluidoEm > p.entrega; }).length);
  });
  return { rotulos: rotulos, noPrazo: noPrazo, atrasado: atrasado };
}

// Anos que têm alguma entrega registrada (mais o atual) — limita a navegação da tela do ano.
export function anosComEntrega(projetos) {
  const set = {};
  projetos.forEach(function (p) { if (p.concluidoEm) set[p.concluidoEm.slice(0, 4)] = 1; });
  const anos = Object.keys(set).map(Number);
  const atual = Number(hoje().slice(0, 4));
  if (anos.indexOf(atual) < 0) anos.push(atual);
  return anos.sort(function (a, b) { return a - b; });
}
