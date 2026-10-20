/* ---------------------------------------------------------------------------
   Desempenho por pessoa (tela cheia da Gerência): técnicos de processo
   (atividades do PCP no prazo × com atraso) e GPs (entregas no prazo ×
   com atraso, carga atual e reagendamentos). O cálculo está em
   dominio/desempenho.js.
--------------------------------------------------------------------------- */
import { estado } from '../estado.js';
import { esc, hoje } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Desempenho from '../dominio/desempenho.js';
import * as Papeis from '../dominio/papeis.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes } from './dom.js';
import { abrirModal } from './modal.js';

function nomes(ms) {
  const r = {};
  (ms || []).forEach(function (m) { r[m.uid] = m.nome || m.email || '—'; });
  return r;
}

function barraPct(pct) {
  if (pct == null) return '<span class="hint-txt">—</span>';
  const corPct = pct >= 85 ? '--green' : (pct >= 60 ? '--amber' : '--rust');
  return '<div class="des-pct"><div class="des-barra"><div style="width:' + pct + '%; background:var(' + corPct + ')"></div></div><b>' + pct + '%</b></div>';
}

function tabela(colunas, linhas) {
  if (!linhas.length) return '<div class="empty-state">' + esc(T('des.vazio')) + '</div>';
  return '<div class="table-wrap"><table class="des-tabela"><thead><tr>' +
    colunas.map(function (c, i) { return '<th' + (i ? ' class="num"' : '') + '>' + esc(T(c)) + '</th>'; }).join('') +
    '</tr></thead><tbody>' + linhas.join('') + '</tbody></table></div>';
}
function n(v, cor) { return '<td class="num"' + (cor && v ? ' style="color:var(' + cor + '); font-weight:700"' : '') + '>' + v + '</td>'; }

function render(ms) {
  const h = hoje();
  const nome = nomes(ms);
  const coord = Auth.coordenadorUidAtual();
  const tecs = Desempenho.porTecnico(estado.projetos, h);
  const gps = Desempenho.porGp(estado.projetos, h);
  // quem tem o cargo aparece mesmo sem projeto
  (ms || []).forEach(function (m) {
    const papel = Papeis.papelEfetivo(m.papel, m.uid === coord);
    if (papel === 'tecnico' && !tecs[m.uid]) tecs[m.uid] = { noPrazo: 0, comAtraso: 0, atrasadasAgora: 0, abertas: 0, projetos: 0 };
    if (papel === 'gp' && !gps[m.uid]) gps[m.uid] = { entreguesNoPrazo: 0, entreguesAtrasados: 0, abertos: 0, atrasadosAgora: 0, reagendamentos: 0, cancelados: 0 };
  });
  const ordenar = function (obj, chave) {
    return Object.keys(obj).sort(function (a, b) { return (chave(obj[b]) - chave(obj[a])) || String(nome[a] || '').localeCompare(String(nome[b] || ''), 'pt-BR'); });
  };
  const linhasTec = ordenar(tecs, function (l) { return l.projetos; }).map(function (uid) {
    const l = tecs[uid];
    return '<tr><td>' + esc(nome[uid] || T('des.exMembro')) + '</td>' + n(l.projetos) + n(l.abertas) + n(l.atrasadasAgora, '--rust') +
      n(l.noPrazo) + n(l.comAtraso, '--rust') + '<td class="num">' + barraPct(Desempenho.pctNoPrazo(l.noPrazo, l.comAtraso)) + '</td></tr>';
  });
  const linhasGp = ordenar(gps, function (l) { return l.abertos; }).map(function (uid) {
    const l = gps[uid];
    return '<tr><td>' + esc(nome[uid] || T('des.exMembro')) + '</td>' + n(l.abertos) + n(l.atrasadosAgora, '--rust') +
      n(l.entreguesNoPrazo) + n(l.entreguesAtrasados, '--rust') + '<td class="num">' + barraPct(Desempenho.pctNoPrazo(l.entreguesNoPrazo, l.entreguesAtrasados)) + '</td>' +
      n(l.reagendamentos, '--amber-ink') + n(l.cancelados) + '</tr>';
  });
  $('des-tec').innerHTML = tabela(['des.pessoa', 'des.projAbertos', 'des.ativAbertas', 'des.atrasadasAgora', 'des.feitasNoPrazo', 'des.feitasAtraso', 'des.pctNoPrazo'], linhasTec);
  $('des-gp').innerHTML = tabela(['des.pessoa', 'des.projAbertos', 'des.atrasadosAgora', 'des.entreguesNoPrazo', 'des.entreguesAtraso', 'des.pctNoPrazo', 'des.reagendamentos', 'des.cancelados'], linhasGp);
}

function abrirDesempenho() {
  $('des-tec').innerHTML = $('des-gp').innerHTML = '<div class="hint-txt">' + esc(T('des.carregando')) + '</div>';
  abrirModal('modal-desempenho');
  Auth.listarEquipe().catch(function () { return []; }).then(render);
}

registrarAcoes({ abrirDesempenho: abrirDesempenho });
