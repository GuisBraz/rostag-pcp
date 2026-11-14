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
export function agendasAtuais(h) {
  const opsId = {};
  estado.ops.forEach(function (o) { opsId[o.id] = o; });
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
function cartaoOp(o, extra, acoes) {
  return '<div class="prog-op' + classeAtraso(o) + '">' +
    '<button type="button" class="prog-op-info" data-acao="abrirOpDetalhe" data-arg="' + esc(o.id) + '">' +
      '<b class="mono">' + esc(o.numero) + '</b> <span class="hint-inline">' + esc(o.commessa) + '</span>' +
      '<span class="prog-op-desc">' + esc(o.desenho) + (o.posicao ? ' · ' + esc(T('pdf.pos', o.posicao)) : '') + ' · ' + esc(o.descricao || '—') + '</span>' +
      '<span class="hint-txt">' + esc(T('cg.qtd', numeroBr(o.qtd))) + ' · ' + numeroBr(o.pesoTotal) + ' kg' + (extra ? ' · ' + extra : '') + '</span>' +
    '</button>' + (acoes ? '<div class="prog-op-acoes">' + acoes + '</div>' : '') + '</div>';
}
function lista(itens, vazio) { return itens.length ? itens.join('') : '<div class="hint-txt prog-vazio">' + esc(T(vazio)) + '</div>'; }
function botao(acao, arg, texto, classe) {
  return '<button type="button" class="btn ' + (classe || 'btn-outline') + ' btn-mini" data-acao="' + acao + '" data-arg="' + esc(arg) + '">' + esc(texto) + '</button>';
}

/* ------------------------------------------------------------ caldeiraria */
export function renderQuadroCald(alvoId) {
  const alvo = $(alvoId);
  if (!alvo) return;
  const editar = podeProgramar('caldeiraria');
  const ops = estado.ops.filter(function (o) { return o.area === 'caldeiraria' && projetoVivo(o); }).sort(ordenar);
  const por = { emAberto: [], programada: [], baixaCq: [], rnc: [] };
  ops.forEach(function (o) { const s = Prog.situacao(o); if (por[s]) por[s].push(o); });
  const h = hoje();
  const kg = function (l) { return l.reduce(function (t, o) { return t + (Number(o.pesoTotal) || 0); }, 0); };
  const col = function (chave, itens, conteudo) {
    return '<div class="prog-col prog-col-' + chave + '"><div class="prog-col-topo"><b>' + esc(T('prog.col.' + chave)) + '</b><span>' + itens.length + ' · ' + numeroBr(Math.round(kg(itens))) + ' kg</span></div>' + conteudo + '</div>';
  };
  const emAberto = por.emAberto.map(function (o) {
    const d = diasEspera(o);
    return cartaoOp(o, d > Prog.DIAS_SEM_PROGRAMACAO ? '<span class="prog-espera">' + esc(T('prog.esperando', d)) + '</span>' : '',
      editar ? botao('programarOp', o.id, T('prog.programar'), 'btn-primary') : '');
  });
  const emFabrica = por.programada.map(function (o) {
    const pr = o.programacao, vence = difDias(h, pr.previsaoFim);
    const cls = pr.previsaoFim < h ? 'prog-vencida' : (vence <= Prog.DIAS_OP_VENCENDO ? 'prog-vencendo' : '');
    const prazo = prazoDe(o);
    return cartaoOp(o, '<b>' + esc(pr.terceirizada || '—') + '</b> · <span class="' + cls + '">' + esc(T('prog.ate', br(pr.previsaoFim))) + '</span>' +
      (prazo && pr.previsaoFim > prazo ? ' · <span class="prog-vencida">' + esc(T('prog.depoisPrazo')) + '</span>' : ''),
      editar ? botao('programarOp', o.id, T('prog.reprogramar')) + botao('tirarDaFabrica', o.id, T('prog.tirar')) : '');
  });
  const baixa = por.baixaCq.map(function (o) { return cartaoOp(o, '', editar ? botao('finalizarOp', o.id, T('prog.finalizar'), 'btn-success') : ''); });
  const rnc = por.rnc.map(function (o) { return cartaoOp(o, '<span class="av-rnc-txt">' + esc(T('prog.aguardaDisposicao', o.rncNumero || '—')) + '</span>', ''); });
  const carga = Prog.cargaTerceirizadas(ops, estado.terceirizadas);
  alvo.innerHTML =
    '<div class="ano-resumo">' + kpi(T('prog.col.emAberto'), String(por.emAberto.length)) + kpi(T('prog.col.programada'), String(por.programada.length)) +
      kpi(T('prog.col.baixaCq'), String(por.baixaCq.length)) + kpi(T('prog.col.rnc'), '<span style="color:var(--rust)">' + por.rnc.length + '</span>') + '</div>' +
    '<div class="prog-quadro">' + col('emAberto', por.emAberto, lista(emAberto, 'prog.vazio')) + col('programada', por.programada, lista(emFabrica, 'prog.vazio')) +
      col('baixaCq', por.baixaCq, lista(baixa, 'prog.vazio')) + col('rnc', por.rnc, lista(rnc, 'prog.vazio')) + '</div>' +
    '<div class="carga-grid2">' +
      '<div class="card panel-pad"><div class="panel-title">' + esc(T('prog.cargaTerc')) + '</div><div class="panel-note">' + esc(T('prog.cargaTercNota')) + '</div>' +
        (carga.length ? '<table class="carga-tab-proj"><tr><th>' + esc(T('prog.terceirizada')) + '</th><th>kg</th><th>' + esc(T('cg.opsAbertas')) + '</th></tr>' +
          carga.map(function (l) { return '<tr><td><b>' + esc(l.terceirizada.nome) + '</b></td><td class="num">' + numeroBr(Math.round(l.kg)) + '</td><td class="num">' + l.ops.length + '</td></tr>'; }).join('') + '</table>'
          : '<div class="hint-txt">' + esc(T('prog.semTerc')) + '</div>') + '</div>' +
      '<div class="card panel-pad"><div class="panel-title">' + esc(T('prog.tercTit')) + '</div><div class="panel-note">' + esc(T('prog.tercNota')) + '</div>' +
        ((estado.terceirizadas || []).map(function (t) {
          return '<div class="carga-maq-linha prog-terc"><b>' + esc(t.nome) + '</b>' + (editar ? '<button type="button" class="rm" data-acao="excluirTerceirizada" data-arg="' + esc(t.id) + '" aria-label="' + esc(T('btn.excluir') + ' — ' + t.nome) + '">✕</button>' : '') + '</div>';
        }).join('') || '<div class="hint-txt">' + esc(T('prog.semTerc')) + '</div>') +
        (editar ? '<div class="carga-maq-form prog-terc-form"><input id="' + alvoId + '-terc" maxlength="60" placeholder="' + esc(T('prog.tercPh')) + '" data-enter="adicionarTerceirizada" data-arg="' + alvoId + '">' +
          '<button type="button" class="btn btn-outline" data-acao="adicionarTerceirizada" data-arg="' + alvoId + '">' + esc(T('cg.adicionar')) + '</button></div>' : '') +
      '</div></div>';
}

/* --------------------------------------------------------------- usinagem */
export function renderFilaUsi(alvoId) {
  const alvo = $(alvoId);
  if (!alvo) return;
  const editar = podeProgramar('usinagem');
  const h = hoje();
  const agendas = agendasAtuais(h);
  const fila = naFila();
  const ops = estado.ops.filter(function (o) { return o.area === 'usinagem' && projetoVivo(o); }).sort(ordenar);
  const aguardando = ops.filter(function (o) { return Prog.situacao(o, fila.has(o.id)) === 'emAberto'; });
  const baixa = ops.filter(function (o) { return Prog.situacao(o, true) === 'baixaCq'; });
  const rnc = ops.filter(function (o) { return Prog.situacao(o, true) === 'rnc'; });
  const maqs = ativas();
  let atrasadas = 0, programadas = 0;
  Object.keys(agendas).forEach(function (k) { agendas[k].forEach(function (it) { if (it.op && !it.concluida) { programadas++; if (it.atraso) atrasadas++; } }); });

  const horasTxt = function (o) {
    const hm = Carga.horasPorMaquina(o, maqs, estado.setores).porMaquina;
    const partes = Object.keys(hm).map(function (id) { const m = maqs.find(function (x) { return x.id === id; }); return (m ? m.nome : '—') + ' ' + numeroBr(hm[id]) + ' h'; });
    return partes.length ? esc(partes.join(' · ')) : (Number(o.horasPrevistas) > 0 ? numeroBr(o.horasPrevistas) + ' h' : '<span class="prog-vencendo">' + esc(T('prog.semHoras')) + '</span>');
  };
  const cardsAguardando = aguardando.map(function (o) {
    const d = diasEspera(o);
    return cartaoOp(o, horasTxt(o) + (d > Prog.DIAS_SEM_PROGRAMACAO ? ' · <span class="prog-espera">' + esc(T('prog.esperando', d)) + '</span>' : ''),
      editar ? botao('programarOp', o.id, T('prog.programar'), 'btn-primary') : '');
  });
  const filas = maqs.map(function (m) {
    const itens = agendas[m.id] || [];
    const vivos = itens.filter(function (it) { return !it.ausente; });
    const linhas = vivos.map(function (it, i) {
      const o = it.op;
      const sit = it.concluida ? '<span class="pill-prog prog-baixaCq">' + esc(T('prog.sit.baixaCq')) + '</span>'
        : (it.atraso ? '<span class="pill-prog prog-atrasado">' + esc(T('prog.planejadoAtraso')) + '</span>' : '<span class="pill-prog prog-programada">' + esc(T('prog.noPrazo')) + '</span>');
      const excede = Prog.excedeuHoras(o, it.horas);
      return '<tr class="' + classeAtraso(o).trim() + '"><td class="num">' + (i + 1) + '</td>' +
        '<td><button type="button" class="link-btn mono" data-acao="abrirOpDetalhe" data-arg="' + esc(o.id) + '">' + esc(o.numero) + '</button><div class="hint-txt">' + esc(o.commessa + ' · ' + (o.descricao || o.desenho)) + '</div></td>' +
        '<td class="num">' + numeroBr(it.horas) + '</td>' +
        '<td class="num">' + (editar ? '<input type="number" min="0" max="10000" step="0.5" class="prog-h' + (excede ? ' prog-excede' : '') + '" value="' + (o.horasReais != null ? esc(o.horasReais) : '') + '" data-change="horasReaisOp" data-arg="' + esc(o.id) + '" aria-label="' + esc(T('prog.horasReais')) + '">'
          : (o.horasReais != null ? numeroBr(o.horasReais) : '—')) + (excede ? '<div class="prog-vencida">' + esc(T('prog.excedeu')) + '</div>' : '') + '</td>' +
        '<td>' + (it.inicio ? br(it.inicio) : '—') + (it.naoAntes ? '<div class="hint-txt">' + esc(T('prog.naoAntes', br(it.naoAntes))) + '</div>' : '') + '</td>' +
        '<td>' + (it.fim ? br(it.fim) : '—') + (it.prazo ? '<div class="hint-txt">' + esc(T('prog.prazo', br(it.prazo))) + '</div>' : '') + '</td><td>' + sit + '</td>' +
        (editar ? '<td class="prog-fila-acoes">' +
          '<button type="button" class="rm" data-acao="moverFila" data-arg="' + esc(m.id) + '" data-arg2="' + esc(o.id) + '|-1" aria-label="' + esc(T('prog.subir')) + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" class="rm" data-acao="moverFila" data-arg="' + esc(m.id) + '" data-arg2="' + esc(o.id) + '|1" aria-label="' + esc(T('prog.descer')) + '"' + (i === vivos.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" class="rm" data-acao="tirarDaFila" data-arg="' + esc(m.id) + '" data-arg2="' + esc(o.id) + '" aria-label="' + esc(T('prog.tirar')) + '">✕</button></td>' : '') + '</tr>';
    }).join('');
    const total = vivos.filter(function (it) { return !it.concluida; }).reduce(function (t, it) { return t + (it.horas || 0); }, 0);
    const fim = vivos.filter(function (it) { return it.fim; }).map(function (it) { return it.fim; }).sort().pop();
    return '<div class="card panel-pad prog-maquina"><div class="carga-cab"><div class="panel-title">' + esc(m.nome) + '</div><span class="hint-txt">' +
      esc(T('prog.filaResumo', vivos.length, numeroBr(Math.round(total * 10) / 10), numeroBr(m.horasDia), fim ? br(fim) : '—')) + '</span></div>' +
      (linhas ? '<div class="table-wrap"><table class="prog-fila"><thead><tr><th>#</th><th>OP</th><th class="num">' + esc(T('prog.hPrev')) + '</th><th class="num">' + esc(T('prog.hReais')) + '</th><th>' +
        esc(T('prog.inicio')) + '</th><th>' + esc(T('prog.fim')) + '</th><th>' + esc(T('prog.situacao')) + '</th>' + (editar ? '<th></th>' : '') + '</tr></thead><tbody>' + linhas + '</tbody></table></div>'
        : '<div class="hint-txt prog-vazio">' + esc(T('prog.filaVazia')) + '</div>') + '</div>';
  }).join('');
  alvo.innerHTML =
    '<div class="ano-resumo">' + kpi(T('prog.aguardando'), String(aguardando.length)) + kpi(T('prog.programadas'), String(programadas)) +
      kpi(T('prog.planejadoAtraso'), '<span style="color:var(' + (atrasadas ? '--rust' : '--green') + ')">' + atrasadas + '</span>') +
      kpi(T('prog.col.baixaCq'), String(baixa.length)) + '</div>' +
    '<div class="prog-usi">' +
      '<div class="card panel-pad prog-aguardando"><div class="panel-title">' + esc(T('prog.aguardando')) + '</div><div class="panel-note">' + esc(T('prog.aguardandoNota')) + '</div>' + lista(cardsAguardando, 'prog.vazio') + '</div>' +
      '<div class="prog-filas">' + (filas || '<div class="card panel-pad empty-state">' + esc(T('cg.semMaquinas')) + '</div>') + '</div>' +
    '</div>' +
    '<div class="carga-grid2">' +
      '<div class="card panel-pad"><div class="panel-title">' + esc(T('prog.col.baixaCq')) + '</div><div class="panel-note">' + esc(T('prog.baixaNota')) + '</div>' +
        lista(baixa.map(function (o) { return cartaoOp(o, '', editar ? botao('finalizarOp', o.id, T('prog.finalizar'), 'btn-success') : ''); }), 'prog.vazio') + '</div>' +
      '<div class="card panel-pad"><div class="panel-title">' + esc(T('prog.col.rnc')) + '</div>' +
        lista(rnc.map(function (o) { return cartaoOp(o, '<span class="av-rnc-txt">' + esc(T('prog.aguardaDisposicao', o.rncNumero || '—')) + '</span>', ''); }), 'prog.vazio') + '</div>' +
    '</div>';
}

/* ------------------------------------------------------- janela programar */
let progOp = null;

function abrirProgramar(id) {
  const o = opPorId(id);
  if (!o || !podeProgramar(o.area)) return;
  progOp = o;
  const h = hoje(), prazo = prazoDe(o);
  $('prog-titulo').textContent = T('prog.programarTit', o.numero);
  $('prog-sub').innerHTML = pillSituacao(o) + ' ' + esc(o.commessa + ' · ' + (o.descricao || o.desenho)) + (prazo ? ' · ' + esc(T('prog.prazo', br(prazo))) : '');
  let html;
  if (o.area === 'caldeiraria') {
    const pr = o.programacao || {};
    html = '<div class="field"><label for="prog-terc">' + esc(T('prog.terceirizada')) + ' *</label><select id="prog-terc">' +
      '<option value="">' + esc(T('cg.escolher')) + '</option>' + (estado.terceirizadas || []).map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (t.id === pr.terceirizadaId ? ' selected' : '') + '>' + esc(t.nome) + '</option>';
      }).join('') + '</select>' + ((estado.terceirizadas || []).length ? '' : '<div class="hint-txt">' + esc(T('prog.cadastreTerc')) + '</div>') + '</div>' +
      '<div class="field"><label for="prog-data">' + esc(T('prog.previsao')) + ' *</label><input type="date" id="prog-data" min="' + h + '" value="' + esc(pr.previsaoFim || '') + '" data-change="progPrevia"></div>';
  } else {
    const maqs = ativas();
    const hm = Carga.horasPorMaquina(o, maqs, estado.setores).porMaquina;
    const sugerida = Object.keys(hm).sort(function (a, b) { return hm[b] - hm[a]; })[0] || (maqs[0] && maqs[0].id) || '';
    html = '<div class="field"><label for="prog-maq">' + esc(T('cg.maquina')) + ' *</label><select id="prog-maq" data-change="progPrevia">' +
      maqs.map(function (m) {
        const jaNaFila = (m.fila || []).some(function (f) { return f.opId === o.id; });
        return '<option value="' + esc(m.id) + '"' + (m.id === sugerida ? ' selected' : '') + (jaNaFila ? ' disabled' : '') + '>' + esc(m.nome) +
          (hm[m.id] ? ' — ' + numeroBr(hm[m.id]) + ' h ' + T('prog.peloPdf') : '') + (jaNaFila ? ' (' + T('prog.jaNaFila') + ')' : '') + '</option>';
      }).join('') + '</select></div>' +
      '<div class="row2"><div class="field"><label for="prog-horas">' + esc(T('prog.horas')) + ' *</label><input type="number" id="prog-horas" min="0.1" max="10000" step="0.5" data-change="progPrevia"></div>' +
      '<div class="field"><label for="prog-naoantes">' + esc(T('prog.naoAntesCampo')) + '</label><input type="date" id="prog-naoantes" min="' + h + '" data-change="progPrevia"></div></div>';
  }
  $('prog-corpo').innerHTML = html;
  $('prog-erro').textContent = ''; $('prog-aviso').textContent = '';
  if (o.area === 'usinagem') { preencherHoras(); }
  previa();
  abrirModal('modal-programar', { foco: o.area === 'caldeiraria' ? 'prog-terc' : 'prog-maq', aoFechar: function () { progOp = null; } });
}

function preencherHoras() {
  const o = progOp, m = $('prog-maq') && $('prog-maq').value;
  if (!o || !m) return;
  const hrs = Prog.horasNaMaquina(o, m, ativas(), estado.setores);
  $('prog-horas').value = hrs ? Math.round(hrs * 100) / 100 : '';
}

// Mostra antes de gravar: data inválida, aviso de prazo e, na usinagem, quando a OP entra e sai.
function previa(_v, _b, el) {
  const o = progOp;
  if (!o) return;
  if (el && el.id === 'prog-maq') preencherHoras();
  const h = hoje(), prazo = prazoDe(o);
  $('prog-erro').textContent = ''; $('prog-aviso').textContent = '';
  if (o.area === 'caldeiraria') {
    const v = Prog.validarData($('prog-data').value, h, prazo);
    if ($('prog-data').value && v.erro) $('prog-erro').textContent = T('prog.erro.' + v.erro);
    if (v.aviso) $('prog-aviso').textContent = T('prog.avisoPrazo', br(prazo));
    return;
  }
  const m = ativas().find(function (x) { return x.id === $('prog-maq').value; });
  const naoAntes = $('prog-naoantes').value;
  if (naoAntes && naoAntes < h) { $('prog-erro').textContent = T('prog.erro.antesDeHoje'); return; }
  if (!m) return;
  const opsId = {}; estado.ops.forEach(function (x) { opsId[x.id] = x; });
  const simulada = Object.assign({}, m, { fila: (m.fila || []).concat([{ opId: o.id, horas: Number($('prog-horas').value) || null, naoAntes: naoAntes || null }]) });
  const ag = Prog.agendar(simulada, opsId, projetosPorId(), ativas(), estado.setores, h);
  const it = ag[ag.length - 1];
  if (it && it.inicio) {
    $('prog-aviso').textContent = T('prog.previa', br(it.inicio), br(it.fim)) + (it.atraso ? ' ' + T('prog.avisoPrazo', br(prazo)) : '');
    $('prog-aviso').classList.toggle('prog-aviso-ruim', !!it.atraso);
  }
}

function salvarProgramacao(_a, _b, btn) {
  const o = progOp;
  if (!o) return;
  const h = hoje(), prazo = prazoDe(o);
  if (o.area === 'caldeiraria') {
    const t = (estado.terceirizadas || []).find(function (x) { return x.id === $('prog-terc').value; });
    const data = $('prog-data').value;
    if (!t) { $('prog-erro').textContent = T('prog.erro.semTerc'); return; }
    const v = Prog.validarData(data, h, prazo);
    if (v.erro) { $('prog-erro').textContent = T('prog.erro.' + v.erro); return; }
    comBotaoOcupado(btn, DadosProg.programarCald(o.id, t, data).then(function () {
      fecharModal('modal-programar');
      toast(T(v.aviso ? 'prog.programadaAviso' : 'prog.programada', o.numero, t.nome, br(data)), v.aviso ? { tipo: 'erro' } : undefined);
    }).catch(function (e) { avisoErro(e); }));
    return;
  }
  const m = ativas().find(function (x) { return x.id === $('prog-maq').value; });
  const horas = Number($('prog-horas').value), naoAntes = $('prog-naoantes').value || null;
  if (!m) { $('prog-erro').textContent = T('prog.erro.semMaquina'); return; }
  if (!(horas > 0)) { $('prog-erro').textContent = T('prog.erro.semHoras'); return; }
  if (naoAntes && naoAntes < h) { $('prog-erro').textContent = T('prog.erro.antesDeHoje'); return; }
  if ((m.fila || []).length >= Prog.MAX_FILA) { $('prog-erro').textContent = T('prog.erro.filaCheia'); return; }
  const padrao = Prog.horasNaMaquina(o, m.id, ativas(), estado.setores);
  const item = { opId: o.id, horas: Math.abs(horas - padrao) < 1e-9 ? null : horas, naoAntes: naoAntes };
  comBotaoOcupado(btn, DadosProg.salvarFila(m.id, (m.fila || []).concat([item])).then(function () {
    fecharModal('modal-programar');
    toast(T('prog.naFilaOk', o.numero, m.nome));
  }).catch(function (e) { avisoErro(e); }));
}

function maquinaPorId(id) { return (estado.maquinas || []).find(function (m) { return m.id === id; }); }

registrarAcoes({
  programarOp: abrirProgramar,
  progPrevia: previa,
  salvarProgramacao: salvarProgramacao,
  tirarDaFabrica: function (id) {
    const o = opPorId(id); if (!o) return;
    confirmar(T('prog.tirarQ', o.numero), { titulo: T('prog.tirar'), textoOk: T('prog.tirar') }).then(function (ok) {
      if (ok) DadosProg.tirarDaFabrica(o.id).then(function () { toast(T('prog.tirada', o.numero)); }).catch(function (e) { avisoErro(e); });
    });
  },
  tirarDaFila: function (mid, opId) {
    const m = maquinaPorId(mid), o = opPorId(opId); if (!m) return;
    confirmar(T('prog.tirarFilaQ', o ? o.numero : opId, m.nome), { titulo: T('prog.tirar'), textoOk: T('prog.tirar') }).then(function (ok) {
      if (ok) DadosProg.tirarDasFilas(opId, [m]).catch(function (e) { avisoErro(e); });
    });
  },
  moverFila: function (mid, arg2) {
    const m = maquinaPorId(mid); if (!m) return;
    const partes = String(arg2).split('|'), opId = partes[0], passo = Number(partes[1]);
    const fila = (m.fila || []).slice();
    const i = fila.findIndex(function (f) { return f.opId === opId; }), j = i + passo;
    if (i < 0 || j < 0 || j >= fila.length) return;
    const tmp = fila[i]; fila[i] = fila[j]; fila[j] = tmp;
    DadosProg.salvarFila(m.id, fila).catch(function (e) { avisoErro(e); });
  },
  horasReaisOp: function (v, _b, el) {
    const h = v === '' ? null : Math.max(0, Math.min(10000, Number(v)));
    DadosProg.salvarHorasReais(el.dataset.arg, h).catch(function (e) { avisoErro(e); });
  },
  adicionarTerceirizada: function (alvoId, _b, origem) {
    alvoId = alvoId || (origem && origem.dataset.arg);   // pelo Enter o despachante não passa o data-arg
    const el = $(alvoId + '-terc'); if (!el) return;
    const nome = el.value.trim();
    if (!nome) return;
    if ((estado.terceirizadas || []).some(function (t) { return t.nome.toLowerCase() === nome.toLowerCase(); })) { toast(T('prog.tercRepetida', nome), { tipo: 'erro' }); return; }
    DadosProg.salvarTerceirizada(nome).then(function () { toast(T('prog.tercSalva', nome)); }).catch(function (e) { avisoErro(e); });
  },
  excluirTerceirizada: function (id) {
    const t = (estado.terceirizadas || []).find(function (x) { return x.id === id; }); if (!t) return;
    const usando = estado.ops.filter(function (o) { return o.programacao && o.programacao.terceirizadaId === id && !o.encerradaEm; }).length;
    confirmar(T('prog.excluirTercQ', t.nome, usando), { titulo: T('btn.excluir'), textoOk: T('btn.excluir'), perigo: true }).then(function (ok) {
      if (ok) DadosProg.excluirTerceirizada(id).catch(function (e) { avisoErro(e); });
    });
  }
});
