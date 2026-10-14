/* ---------------------------------------------------------------------------
   Tela do ano — a pontualidade das entregas aberta nos 12 meses.
--------------------------------------------------------------------------- */
import { estado } from '../estado.js';
import { hoje, esc } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Serie from '../dominio/serie.js';
import { $, $$, registrarAcoes } from './dom.js';
import { abrirModal, fecharModal } from './modal.js';
import { filtrarDash } from './filtros.js';
import { desenhar, destruir, opcoesBase, legenda, cor, falhaGrafico } from './graficos.js';

let anoTela = null;

export function anoAberto() { return $('modal-ano').classList.contains('open'); }

function abrir() {
  anoTela = Number(hoje().slice(0, 4));
  abrirModal('modal-ano', { aoFechar: function () { destruir('chartAno'); } });
  render();
}

export function mudarAno(passo) {
  const anos = Serie.anosComEntrega(estado.projetos);
  const alvo = anoTela + Number(passo);
  if (alvo < anos[0] || alvo > anos[anos.length - 1]) return;
  anoTela = alvo;
  render();
}

function kpi(rot, valorHtml) { return '<div class="ano-kpi"><div class="rot">' + esc(rot) + '</div><div class="val">' + valorHtml + '</div></div>'; }

function render() {
  const anos = Serie.anosComEntrega(estado.projetos);
  $('ano-atual').textContent = anoTela;
  const navs = $$('.ano-nav button');
  navs[0].disabled = anoTela <= anos[0];
  navs[1].disabled = anoTela >= anos[anos.length - 1];

  const d = Serie.pontualidade(filtrarDash(), anoTela, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const soma = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
  const ok = soma(d.noPrazo), atr = soma(d.atrasado), total = ok + atr;
  const s1 = soma(d.noPrazo.slice(0, 6)) + soma(d.atrasado.slice(0, 6));
  const pct = function (n) { return total ? Math.round(n / total * 100) : 0; };

  $('ano-resumo').innerHTML =
    kpi(T('ano.entregas'), String(total)) +
    kpi(T('ano.ok'), '<span style="color:var(--green)">' + ok + '</span><span class="ano-pct"> · ' + pct(ok) + '%</span>') +
    kpi(T('ano.atr'), '<span style="color:var(--rust)">' + atr + '</span><span class="ano-pct"> · ' + pct(atr) + '%</span>') +
    kpi(T('ano.sem'), s1 + ' · ' + (total - s1));

  if (!window.Chart) { falhaGrafico('chartAno'); return; }
  desenhar('chartAno', { type: 'bar',
    data: { labels: d.rotulos, datasets: [
      { label: T('g.noPrazo'), data: d.noPrazo, backgroundColor: cor('--green'), borderRadius: 6, borderSkipped: false },
      { label: T('g.atrasadas'), data: d.atrasado, backgroundColor: cor('--rust'), borderRadius: 6, borderSkipped: false }
    ] },
    options: legenda(opcoesBase(), true) });
}

registrarAcoes({
  abrirPontualidadeAno: abrir,
  fecharPontualidadeAno: function () { fecharModal('modal-ano'); },
  mudarAno: function (passo) { mudarAno(passo); }
});
