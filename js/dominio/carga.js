/* ---------------------------------------------------------------------------
   Carga — quanto trabalho de produção cai em cada semana.
     carga máquina (usinagem): horas previstas de cada OP na máquina escolhida
     carga fábrica (caldeiraria): peso (kg) das OPs
   O trabalho de uma OP aberta é espalhado pelos dias úteis (seg–sex) que
   ainda restam na janela de produção do projeto (fim do PCP → fim da
   produção). Janela já vencida: tudo cai na semana atual (é atraso a tirar).
   OP aprovada, com RNC ou de projeto parado/encerrado não conta.
--------------------------------------------------------------------------- */
import { hoje, addDias, fds } from '../nucleo/fmt.js';
import { inicioSemana } from './semana.js';
import * as Projeto from './projeto.js';

export const SEMANAS_PADRAO = 8;
export const DIAS_UTEIS_SEMANA = 5;

// n semanas a partir da semana de h: [{ inicio (segunda), fim (domingo) }]
export function semanas(n, h) {
  const base = inicioSemana(h || hoje());
  const lista = [];
  for (let i = 0; i < n; i++) {
    const ini = addDias(base, i * 7);
    lista.push({ inicio: ini, fim: addDias(ini, 6) });
  }
  return lista;
}

function diasUteis(de, ate) {
  const lista = [];
  for (let d = de; d <= ate; d = addDias(d, 1)) if (!fds(d)) lista.push(d);
  return lista;
}

// Janela que ainda resta da produção do projeto, a partir de h.
// null quando o projeto não tem as datas (aguardando cronograma).
export function janelaRestante(p, h) {
  h = h || hoje();
  if (!p || !p.pcpFim || !p.prodFim) return null;
  const ini = p.pcpFim > h ? p.pcpFim : h;
  if (p.prodFim < h) return { inicio: h, fim: h, vencida: true };
  return { inicio: ini, fim: p.prodFim < ini ? ini : p.prodFim, vencida: false };
}

// Distribui `valor` pelos dias úteis da janela e soma por semana.
// O que cai depois da última semana mostrada vai para `depois`.
export function distribuir(valor, janela, sems) {
  const porSemana = sems.map(function () { return 0; });
  let depois = 0;
  if (!valor || !janela) return { porSemana: porSemana, depois: depois };
  let dias = diasUteis(janela.inicio, janela.fim);
  if (!dias.length) dias = [janela.inicio];          // janela só de fim de semana: um dia só
  const cota = valor / dias.length;
  dias.forEach(function (d) {
    const i = sems.findIndex(function (s) { return d >= s.inicio && d <= s.fim; });
    if (i >= 0) porSemana[i] += cota;
    else if (d > sems[sems.length - 1].fim) depois += cota;
    else porSemana[0] += cota;                        // antes da 1ª semana: atraso, entra agora
  });
  return { porSemana: porSemana, depois: depois };
}

function opConta(o, p) {
  return o.status === 'aberta' && p && Projeto.aberto(p) && Projeto.status(p) !== 'paralisado';
}

// Carga máquina: por máquina, horas por semana x capacidade (horasDia × 5).
export function cargaMaquinas(ops, projetos, maquinas, sems, h) {
  const porId = {};
  (projetos || []).forEach(function (p) { porId[p.id] = p; });
  const linhas = {};
  (maquinas || []).forEach(function (m) {
    linhas[m.id] = { maquina: m, porSemana: sems.map(function () { return 0; }), depois: 0,
      capacidade: (Number(m.horasDia) || 0) * DIAS_UTEIS_SEMANA, ops: 0, horas: 0 };
  });
  const resumo = { semMaquina: 0, semHoras: 0, semJanela: 0, horasSemJanela: 0 };
  (ops || []).forEach(function (o) {
    if (o.area !== 'usinagem') return;
    const p = porId[o.projetoId];
    if (!opConta(o, p)) return;
    if (!o.maquinaId || !linhas[o.maquinaId]) { resumo.semMaquina++; return; }
    const horas = Number(o.horasPrevistas) || 0;
    if (!horas) { resumo.semHoras++; return; }
    const l = linhas[o.maquinaId];
    l.ops++; l.horas += horas;
    const jan = janelaRestante(p, h);
    if (!jan) { resumo.semJanela++; resumo.horasSemJanela += horas; return; }
    const d = distribuir(horas, jan, sems);
    d.porSemana.forEach(function (v, i) { l.porSemana[i] += v; });
    l.depois += d.depois;
  });
  return { linhas: (maquinas || []).map(function (m) { return linhas[m.id]; }), resumo: resumo };
}

// Carga fábrica: kg de caldeiraria por semana (e por projeto) x capacidade.
export function cargaFabrica(ops, projetos, capacidadeKgSemana, sems, h) {
  const porId = {};
  (projetos || []).forEach(function (p) { porId[p.id] = p; });
  const porSemana = sems.map(function () { return 0; });
  const porProjeto = {};
  let depois = 0, semJanela = 0, total = 0;
  (ops || []).forEach(function (o) {
    if (o.area !== 'caldeiraria') return;
    const p = porId[o.projetoId];
    if (!opConta(o, p)) return;
    const kg = Number(o.pesoTotal) || 0;
    if (!kg) return;
    total += kg;
    const pp = porProjeto[p.id] = porProjeto[p.id] || { projeto: p, kg: 0, ops: 0 };
    pp.kg += kg; pp.ops++;
    const jan = janelaRestante(p, h);
    if (!jan) { semJanela += kg; return; }
    const d = distribuir(kg, jan, sems);
    d.porSemana.forEach(function (v, i) { porSemana[i] += v; });
    depois += d.depois;
  });
  const projetosOrd = Object.keys(porProjeto).map(function (k) { return porProjeto[k]; })
    .sort(function (a, b) { return b.kg - a.kg; });
  return { porSemana: porSemana, depois: depois, semJanela: semJanela, total: total,
    capacidade: Number(capacidadeKgSemana) || 0, projetos: projetosOrd };
}

// Ocupação em %: 0 quando não há capacidade cadastrada.
export function ocupacao(valor, capacidade) { return capacidade > 0 ? Math.round(valor / capacidade * 100) : 0; }
// Faixa de cor: ok < 80% ≤ alta ≤ 100% < sobrecarga
export function faixa(pct) { return pct > 100 ? 'sobrecarga' : (pct >= 80 ? 'alta' : 'ok'); }

