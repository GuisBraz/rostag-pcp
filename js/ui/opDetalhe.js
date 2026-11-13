/* ---------------------------------------------------------------------------
   Janela com tudo de uma OP (Ordens de Produção, programação, finalizadas)
   e o "Finalizar OP" do programador: depois da baixa do CQ, a OP sai da
   programação e o técnico e o GP do projeto são avisados do próximo passo.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto } from '../estado.js';
import { esc, br, dataHora, numeroBr } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Producao from '../dominio/producao.js';
import * as Prog from '../dominio/programacao.js';
import * as Auth from '../dados/auth.js';
import * as DadosProg from '../dados/programacao.js';
import { $, registrarAcoes, comBotaoOcupado } from './dom.js';
import { abrirModal, fecharModal, confirmar } from './modal.js';
import { toast } from './toast.js';
import { avisoErro } from './app.js';

let aberta = null;   // id da OP na janela

// O CQ desfaz a própria baixa: aprovada direto (sem RNC) e o programador ainda não encerrou.
export function podeDesfazerBaixa(o) { return Auth.souCQ() && !!o && o.status === 'aprovada' && !o.rncAtualId && !o.encerradaEm; }
export function opPorId(id) { return estado.ops.find(function (o) { return o.id === id; }) || null; }
export function naFila() { return Prog.opsNaFila(estado.maquinas); }
export function situacaoDe(o) { return Prog.situacao(o, o.area === 'usinagem' && naFila().has(o.id)); }

// Quem finaliza: o programador da área (ou a Gerência).
export function podeFinalizar(o) {
  return !!o && (Auth.souGerente() || Auth.areaProgramador() === o.area) && situacaoDe(o) === 'baixaCq';
}

export function pillSituacao(o) {
  const s = situacaoDe(o);
  return '<span class="pill-prog prog-' + esc(s) + '">' + esc(T('prog.sit.' + s)) + '</span>';
}

// OPs de projeto atrasado ganham a borda vermelha.
export function classeAtraso(o) { return Prog.projetoAtrasado(buscarProjeto(o.projetoId)) ? ' op-proj-atrasado' : ''; }

export function textoEtapas(o) {
  const etapas = Prog.proximasEtapas(o);
  return etapas.length ? etapas.map(function (k) { return T('av.marca.' + k); }).join(' → ') : '';
}

export function finalizarOp(o) {
  if (!podeFinalizar(o)) return Promise.resolve(false);
  return confirmar(T('prog.finalizarQ', o.numero, o.descricao || o.desenho), { titulo: T('prog.finalizar'), textoOk: T('prog.finalizarOk') }).then(function (ok) {
    if (!ok) return false;
    return DadosProg.finalizar(o, estado.maquinas).then(function () {
      const etapas = textoEtapas(o);
      const msg = etapas ? T('notif.opFinalizadaProx', o.numero, o.commessa, o.descricao || o.desenho, etapas)
        : T('notif.opFinalizadaSem', o.numero, o.commessa, o.descricao || o.desenho);
      Auth.notificarVarios([o.gpUid, o.tecnicoUid], 'opFinalizada', msg, o.projetoId);
      toast(T('prog.finalizada', o.numero));
      if (aberta === o.id) fecharModal('modal-op-detalhe');
      return true;
    }).catch(function (e) { avisoErro(e); return false; });
  });
}

function linha(rot, valor) { return '<div class="opd-linha"><span>' + esc(rot) + '</span><b>' + valor + '</b></div>'; }

export function abrirOpDetalhe(id) {
  const o = opPorId(id);
  if (!o) return;
  aberta = id;
  $('modal-op-detalhe').classList.toggle('tela-cheia', Auth.souCQ());   // o CQ inspeciona pela tela cheia
  abrirModal('modal-op-detalhe', { aoFechar: function () { aberta = null; } });
  render();
}

export function render() {
  if (!aberta || !$('modal-op-detalhe').classList.contains('open')) return;
  const o = opPorId(aberta);
  if (!o) { fecharModal('modal-op-detalhe'); return; }
  const p = buscarProjeto(o.projetoId);
  const pc = Producao.pecasOp(o);
  $('opd-titulo').textContent = T('opd.titulo', o.numero);
  $('opd-sub').innerHTML = '<span class="pill-area area-' + esc(o.area) + '">' + esc(T('area.' + o.area)) + '</span> ' + pillSituacao(o) +
    (Prog.projetoAtrasado(p) ? ' <span class="pill-prog prog-atrasado">' + esc(T('prog.projAtrasado')) + '</span>' : '');
  const marcas = ['pintura', 'servicoExterno', 'ttat', 'oxidacao'].filter(function (k) { return o.marcas && o.marcas[k]; })
    .map(function (k) { return T('av.marca.' + k); }).join(', ');
  const rncs = (estado.rncs || []).filter(function (r) { return r.opId === o.id; });
  const prog = o.programacao;
  const fila = (estado.maquinas || []).filter(function (m) { return (m.fila || []).some(function (f) { return f.opId === o.id; }); }).map(function (m) { return m.nome; });
  const horasPrev = (o.operacoes || []).reduce(function (t, x) { return t + (Number(x.horas) || 0); }, 0);
  let html = '<div class="opd-grid">' +
    '<div class="opd-bloco"><div class="panel-title">' + esc(T('opd.peca')) + '</div>' +
      linha(T('fab.cCommessa'), esc(o.commessa) + (p ? ' — ' + esc(p.descricao || '') : '')) +
      linha(T('fab.cDesenho'), esc(o.desenho) + (o.posicao ? ' · ' + esc(T('pdf.pos', o.posicao)) : '')) +
      linha(T('fab.cDescricao'), esc(o.descricao || '—')) +
      (o.produto ? linha(T('pdf.campo.produto'), esc(o.produto)) : '') +
      linha(T('fab.cQtd'), numeroBr(o.qtd) + (pc.rnc ? ' · <span class="av-rnc-txt">' + esc(T('fab.qtdRnc', numeroBr(pc.rnc))) + '</span>' : '')) +
      linha(T('fab.cPeso'), numeroBr(o.pesoTotal) + ' kg') +
      (marcas ? linha(T('av.cMarcas'), esc(marcas)) : '') +
      (o.obs ? linha(T('av.cObs'), '<span class="op-obs">' + esc(o.obs) + '</span>') : '') +
    '</div>' +
    '<div class="opd-bloco"><div class="panel-title">' + esc(T('opd.andamento')) + '</div>' +
      (o.proximoPasso ? linha(T('passo.pergunta'), esc(T('passo.' + o.proximoPasso))) : '') +
      linha(T('opd.prazoProjeto'), p && p.prodFim ? br(p.prodFim) : '—') +
      (o.area === 'caldeiraria' ? linha(T('prog.terceirizada'), prog ? esc(prog.terceirizada || '—') + ' · ' + esc(T('prog.ate', br(prog.previsaoFim))) : '—') : '') +
      (o.area === 'usinagem' ? linha(T('prog.naFila'), fila.length ? esc(fila.join(', ')) : '—') : '') +
      (o.area === 'usinagem' ? linha(T('prog.horas'), numeroBr(Math.round(horasPrev * 100) / 100) + ' h' + (o.horasReais != null ? ' · ' + esc(T('prog.reais', numeroBr(o.horasReais))) : '')) : '') +
      linha(T('opd.baixaCq'), o.finalizadoEm ? esc((o.finalizadoPorNome || '—') + ' · ' + dataHora(o.finalizadoEm)) : '—') +
      linha(T('opd.finalizada'), o.encerradaEm ? esc((o.encerradaPorNome || '—') + ' · ' + dataHora(o.encerradaEm)) : '—') +
      (o.destino ? linha(T('fin.destino'), esc(T('fin.g.' + o.destino))) : '') +
      (textoEtapas(o) ? linha(T('opd.proximo'), esc(textoEtapas(o))) : '') +
    '</div></div>';
  if (Array.isArray(o.operacoes) && o.operacoes.length) {
    html += '<div class="panel-title opd-sec">' + esc(T('opd.roteiro')) + '</div><div class="table-wrap"><table class="opd-tab"><thead><tr><th>Nº</th><th>' +
      esc(T('opd.setor')) + '</th><th>' + esc(T('opd.etapa')) + '</th><th class="num">h</th></tr></thead><tbody>' +
      o.operacoes.map(function (x) {
        return '<tr><td class="mono">' + esc(x.n) + '</td><td><b>' + esc(x.setor) + '</b>' +
          (x.texto ? '<div class="opd-texto">' + esc(x.texto) + '</div>' : '') + '</td><td>' + esc(x.etapa || '') + '</td><td class="num">' + numeroBr(x.horas) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (o.operacoes.some(function (x) { return x.texto; }) ? '' : '<div class="hint-txt">' + esc(T('opd.semTexto')) + '</div>');
  }
  if (rncs.length) {
    html += '<div class="panel-title opd-sec">' + esc(T('opd.rncs')) + '</div>' + rncs.map(function (r) {
      return '<div class="opd-rnc"><b class="mono">RNC ' + esc(r.numero) + '</b> · ' + esc(r.descricao || '—') +
        ' <span class="hint-txt">(' + esc(T(r.situacao === 'encerrada' ? 'rnc.encerrada' : 'rnc.aguardando')) + ')</span> ' +
        '<button type="button" class="link-btn" data-acao="verRnc" data-arg="' + esc(r.id) + '">' + esc(T('rnc.verFormulario')) + '</button></div>';
    }).join('');
  }
  $('opd-corpo').innerHTML = html;
  $('opd-finalizar').hidden = !podeFinalizar(o);
  // CQ: aprovar ou abrir RNC (em retrabalho: ver a RNC atual)
  const st = Producao.statusOp(o);
  $('opd-cq').innerHTML = !Auth.souCQ() ? '' : (st === 'aberta'
    ? '<button type="button" class="btn btn-success" data-acao="cqAprovarOp" data-arg="' + esc(o.id) + '">' + esc(T('cq.aprovar')) + '</button>' +
      '<button type="button" class="btn btn-danger" data-acao="cqNovaRncOp" data-arg="' + esc(o.id) + '">' + esc(T('baixa.abrirRnc')) + '</button>'
    : (st === 'retrabalho' ? '<button type="button" class="btn btn-danger" data-acao="verRncDaOp" data-arg="' + esc(o.id) + '">' + esc(T('fab.verRnc', o.rncNumero || '—')) + '</button>'
      : (podeDesfazerBaixa(o) ? '<button type="button" class="btn btn-outline" data-acao="cqDesfazerBaixa" data-arg="' + esc(o.id) + '">' + esc(T('cq.desfazer')) + '</button>' : '')));
}

registrarAcoes({
  abrirOpDetalhe: abrirOpDetalhe,
  finalizarOpDetalhe: function (_a, _b, btn) { const o = opPorId(aberta); if (o) comBotaoOcupado(btn, finalizarOp(o)); },
  finalizarOp: function (id, _b, btn) { const o = opPorId(id); if (o) comBotaoOcupado(btn, finalizarOp(o)); }
});
