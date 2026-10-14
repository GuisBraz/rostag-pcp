/* ---------------------------------------------------------------------------
   Gráficos (Chart.js, servido junto com o site em vendor/).
--------------------------------------------------------------------------- */
import { T } from '../i18n/index.js';
import { $ } from './dom.js';

const charts = {};

export function cor(nome) { return getComputedStyle(document.documentElement).getPropertyValue(nome).trim(); }
export function corStatus(k) {
  return { andamento: cor('--violet'), concluido: cor('--green'), atrasado: cor('--rust'),
    paralisado: cor('--amber'), cancelado: cor('--ink-faint') }[k];
}
export function corSituacao(s) {
  return { planejada: cor('--ink-faint'), andamento: cor('--teal'), chegando: cor('--amber'),
    atrasada: cor('--rust'), parada: cor('--amber'), concluida: cor('--green') }[s];
}

export function opcoesBase() {
  const corTexto = cor('--ink-dim');
  const fonte = { family: 'Inter', size: 11 };
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
    plugins: { legend: { display: false },
      tooltip: { backgroundColor: cor('--bg-panel'), titleColor: cor('--ink'), bodyColor: cor('--ink'), borderColor: cor('--line'), borderWidth: 1 } },
    scales: { x: { grid: { display: false }, ticks: { font: fonte, color: corTexto } },
      y: { beginAtZero: true, ticks: { font: fonte, color: corTexto, precision: 0 }, grid: { color: cor('--line-soft') } } }
  };
}

// Mesma base, com legenda embaixo (e barras empilhadas, se pedido).
export function legenda(base, empilhado) {
  const corTexto = cor('--ink-dim');
  const o = Object.assign({}, base, { plugins: Object.assign({}, base.plugins, {
    legend: { display: true, position: 'bottom', labels: { color: corTexto, font: { family: 'Inter', size: 11 }, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' } } }) });
  if (empilhado) {
    o.scales = {
      x: Object.assign({}, base.scales.x, { stacked: true }),
      y: Object.assign({}, base.scales.y, { stacked: true })
    };
  }
  return o;
}

export function desenhar(id, cfg) {
  const el = $(id);
  if (!el) return;
  limparFalha(id);
  try {
    if (charts[id]) charts[id].destroy();
    charts[id] = new window.Chart(el, cfg);
  } catch (e) {
    console.warn('gráfico indisponível:', id, e);
    falhaGrafico(id);
  }
}

export function destruir(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

// Mostra um aviso por cima do gráfico sem destruir o canvas — na próxima
// renderização ele pode voltar.
export function falhaGrafico(id) {
  const el = $(id);
  if (!el || !el.parentElement) return;
  el.style.visibility = 'hidden';
  if (!el.parentElement.querySelector('.grafico-falhou')) {
    const aviso = document.createElement('div');
    aviso.className = 'empty-state grafico-falhou';
    aviso.textContent = T('g.falhou');
    el.parentElement.appendChild(aviso);
  }
}
function limparFalha(id) {
  const el = $(id);
  if (!el) return;
  el.style.visibility = '';
  const aviso = el.parentElement && el.parentElement.querySelector('.grafico-falhou');
  if (aviso) aviso.remove();
}
