/* ---------------------------------------------------------------------------
   Despertador da planilha "Controle de Commesse em aberto" (Gerência).
   A Gerência escolhe o arquivo uma vez (Chrome/Edge lembram o acesso); com o
   site aberto, a cada 5 minutos ele relê a aba Controle e cria no site os
   projetos novos (regras em dominio/controle.js). O navegador pede para
   "permitir leitura" uma vez a cada vez que o site é aberto.
--------------------------------------------------------------------------- */
import { estado } from '../estado.js';
import { esc, br, hoje } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Controle from '../dominio/controle.js';
import * as Projeto from '../dominio/projeto.js';
import * as Auth from '../dados/auth.js';
import { garantirXlsx } from './bibliotecas.js';
import { $, registrarAcoes } from './dom.js';
import { toast } from './toast.js';
import { persistir, redesenhar } from './app.js';

const INTERVALO = 5 * 60 * 1000;
const CHAVE_INFO = 'rostag.controle.info';
let arquivo = null, permissao = '', timer = null, ocupado = false, pedido = false;
let info = lerInfo();

export function suportado() { return typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'indexedDB' in window; }
function lerInfo() { try { return JSON.parse(localStorage.getItem(CHAVE_INFO) || '{}') || {}; } catch (e) { return {}; } }
function gravarInfo() { try { localStorage.setItem(CHAVE_INFO, JSON.stringify(info)); } catch (e) { /* sem armazenamento */ } }
function agora() { const d = new Date(), p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
function quando(dt) { return dt ? br(dt.slice(0, 10)) + ' ' + dt.slice(11, 16) : '—'; }

/* -------------------------------------- o arquivo escolhido (IndexedDB) */
function banco() {
  return new Promise(function (ok, erro) {
    const r = indexedDB.open('rostag-pcp-arquivos', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('arquivos'); };
    r.onsuccess = function () { ok(r.result); };
    r.onerror = function () { erro(r.error); };
  });
}
function guardar(valor) {
  return banco().then(function (db) {
    return new Promise(function (ok, erro) {
      const t = db.transaction('arquivos', 'readwrite');
      if (valor) t.objectStore('arquivos').put(valor, 'controle'); else t.objectStore('arquivos').delete('controle');
      t.oncomplete = function () { ok(); }; t.onerror = function () { erro(t.error); };
    });
  });
}
function ler() {
  return banco().then(function (db) {
    return new Promise(function (ok) {
      const r = db.transaction('arquivos').objectStore('arquivos').get('controle');
      r.onsuccess = function () { ok(r.result || null); }; r.onerror = function () { ok(null); };
    });
  }).catch(function () { return null; });
}

/* ------------------------------------------------------------ ciclo */
export function iniciar() {
  parar();
  if (!Auth.souGerente() || !suportado()) { renderConfig(); return; }
  ler().then(function (h) {
    arquivo = h;
    if (!arquivo) { renderConfig(); return; }
    return arquivo.queryPermission({ mode: 'read' }).then(function (p) {
      permissao = p;
      renderConfig();
      if (p === 'granted') agendar();
      else if (!pedido) {
        pedido = true;
        toast(T('ctl.pedirPermissao', arquivo.name), { acao: { label: T('ctl.permitir'), fn: permitir }, ms: 20000 });
      }
    });
  }).catch(function (e) { console.warn('planilha de commesses:', e); renderConfig(); });
}
export function parar() { if (timer) { clearInterval(timer); timer = null; } }
function agendar() { parar(); timer = setInterval(function () { consultar(false); }, INTERVALO); consultar(false); }
function permitir() {
  if (!arquivo) return;
  arquivo.requestPermission({ mode: 'read' }).then(function (p) { permissao = p; renderConfig(); if (p === 'granted') agendar(); }).catch(function () {});
}
function escolher() {
  if (!suportado()) { toast(T('ctl.semSuporte'), { tipo: 'erro' }); return; }
  window.showOpenFilePicker({ multiple: false, types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xlsm'] } }] })
    .then(function (l) {
      arquivo = l[0];
      return guardar(arquivo).then(function () { return arquivo.requestPermission({ mode: 'read' }); });
    }).then(function (p) {
      permissao = p;
      info = { nome: arquivo.name };
      gravarInfo();
      renderConfig();
      if (p === 'granted') agendar();
    }).catch(function (e) { if (e && e.name !== 'AbortError') console.warn(e); });
}
function esquecer() {
  parar(); arquivo = null; permissao = ''; info = {}; gravarInfo();
  guardar(null).catch(function () {}).then(renderConfig);
}

// Lê a aba Controle e cria os projetos novos. "forcar": mesmo sem o arquivo ter mudado.
export function consultar(forcar) {
  if (ocupado || !arquivo || permissao !== 'granted' || !Auth.souGerente()) return Promise.resolve();
  // os projetos ainda não chegaram: tenta de novo logo (para comparar com o que já existe)
  if (!estado.carregado) { setTimeout(function () { consultar(forcar); }, 10000); return Promise.resolve(); }
  ocupado = true;
  return arquivo.getFile().then(function (f) {
    info.nome = f.name;
    if (!forcar && info.modificado === f.lastModified && info.semData) { info.consulta = agora(); gravarInfo(); renderConfig(); return null; }
    return Promise.all([garantirXlsx(), f.arrayBuffer()]).then(function (r) {
      const XLSX = r[0], wb = XLSX.read(r[1], { type: 'array', cellDates: true });
      const nomeAba = wb.SheetNames.find(function (n) { return n.trim().toLowerCase() === 'controle'; }) || wb.SheetNames[0];
      const matriz = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, defval: '', raw: true });
      const res = Controle.novosProjetos(matriz, estado.projetos);
      info.modificado = f.lastModified;
      info.consulta = agora();
      if (!res.ok) { info.erro = T('ctl.erroAba'); gravarInfo(); renderConfig(); return null; }
      info.erro = '';
      info.semData = res.semData.map(function (c) { return c.commessa + (c.om ? ' · OM ' + c.om : '') + ' — ' + c.descricao.slice(0, 60); });
      info.linhas = res.linhas; info.entregues = res.entregues; info.existentes = res.existentes;
      return importar(res.novos);
    });
  }).catch(function (e) {
    console.warn('planilha de commesses:', e);
    info.consulta = agora(); info.erro = T('ctl.erroLer'); gravarInfo(); renderConfig();
  }).then(function () { ocupado = false; });
}

function itensPadrao() { return estado.checklistPadrao ? estado.checklistPadrao.itens : null; }
function importar(novos) {
  if (!novos.length) { info.ultimos = info.ultimos || []; gravarInfo(); renderConfig(); return null; }
  const nomes = [];
  novos.forEach(function (c) {
    if (estado.projetos.some(function (p) { return p.id === Controle.idDe(c); })) return;
    estado.projetos.push({
      id: Controle.idDe(c), commessa: c.commessa, om: c.om || '', cliente: c.cliente, descricao: c.descricao, entrega: c.entrega,
      status: 'ativo', concluidoEm: null, canceladoEm: null, dataSolicitacao: hoje(), pcpInicio: null, pcpFim: null, prodInicio: null, prodFim: null,
      cronogramaDefinido: false, gp: '—', gpUid: null, tecnico: '', responsavelUid: null,
      reagendamentos: [], paralisacoes: [], checklist: Projeto.checklistNovo(itensPadrao()), criadoPor: T('ctl.criadoPor')
    });
    nomes.push(c.commessa + (c.om ? ' · OM ' + c.om : ''));
  });
  if (!nomes.length) { renderConfig(); return null; }
  info.ultimos = nomes; info.importadosEm = agora();
  gravarInfo();
  redesenhar();
  return persistir().then(function () {
    toast(T('ctl.importados', nomes.length));
    // aviso para toda a Gerência (inclusive quem estava com a planilha)
    const msg = T('ctl.notif', nomes.length, nomes.slice(0, 12).join(', ') + (nomes.length > 12 ? '…' : ''));
    Auth.uidsGerentes().catch(function () { return []; }).then(function (uids) {
      const todos = Array.from(new Set((uids || []).concat([Auth.uid()])));
      return Promise.all(todos.map(function (u) { return Auth.criarNotificacao(u, 'projetoCriado', msg, null, true); }));
    });
    renderConfig();
  }).catch(function () { /* persistir já avisou */ });
}

// Testes: usa um "arquivo" já aberto (a janela de escolher arquivo não dá para automatizar).
export function _usarArquivo(h) { arquivo = h; permissao = 'granted'; info = {}; renderConfig(); return consultar(true); }

/* ------------------------------------------------------ Configurações */
export function renderConfig() {
  const el = $('cfg-controle');
  if (!el) return;
  el.hidden = !Auth.souGerente();
  if (el.hidden) return;
  if (!suportado()) { el.innerHTML = cab() + '<div class="hint-txt">' + esc(T('ctl.semSuporte')) + '</div>'; return; }
  if (!arquivo) {
    el.innerHTML = cab() + '<div class="panel-note">' + esc(T('ctl.nota')) + '</div><button type="button" class="btn btn-primary" data-acao="escolherControle">' + esc(T('ctl.escolher')) + '</button>';
    return;
  }
  const st = permissao === 'granted' ? '<span class="pill-cm cm-p-maquina">' + esc(T('ctl.ativo')) + '</span>' : '<span class="pill-cm cm-p-reprog">' + esc(T('ctl.semPermissao')) + '</span>';
  const res = info.consulta ? T('ctl.resumo', quando(info.consulta), info.linhas || 0, info.entregues || 0, info.existentes || 0) : T('ctl.nuncaLida');
  el.innerHTML = cab() + '<div class="ctl-arquivo"><b>📄 ' + esc(arquivo.name) + '</b> ' + st + '</div>' +
    '<div class="hint-txt">' + esc(res) + '</div>' + (info.erro ? '<div class="form-error">' + esc(info.erro) + '</div>' : '') +
    (info.ultimos && info.ultimos.length ? '<div class="ctl-bloco"><b>' + esc(T('ctl.ultimos', quando(info.importadosEm))) + '</b><div class="hint-txt">' + esc(info.ultimos.join(' · ')) + '</div></div>' : '') +
    (info.semData && info.semData.length ? '<details class="ctl-bloco"><summary>' + esc(T('ctl.semData', info.semData.length)) + '</summary><ul class="ctl-lista">' +
      info.semData.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details>' : '') +
    '<div class="ctl-acoes">' + (permissao === 'granted' ? '<button type="button" class="btn btn-primary btn-mini" data-acao="consultarControle">' + esc(T('ctl.agora')) + '</button>'
      : '<button type="button" class="btn btn-primary btn-mini" data-acao="permitirControle">' + esc(T('ctl.permitir')) + '</button>') +
    '<button type="button" class="btn btn-outline btn-mini" data-acao="escolherControle">' + esc(T('ctl.trocar')) + '</button>' +
    '<button type="button" class="btn btn-outline btn-mini" data-acao="esquecerControle">' + esc(T('ctl.esquecer')) + '</button></div>';
}
function cab() { return '<div class="panel-title">' + esc(T('ctl.titulo')) + '</div>'; }

registrarAcoes({
  escolherControle: escolher,
  permitirControle: permitir,
  consultarControle: function () { consultar(true); },
  esquecerControle: esquecer
});
