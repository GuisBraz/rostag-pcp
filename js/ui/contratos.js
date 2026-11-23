/* ---------------------------------------------------------------------------
   Configurações → contratos com OM (só a Gerência edita). Os projetos dessas
   commessas aparecem agrupados por contrato e cada OM é um projeto.
--------------------------------------------------------------------------- */
import { estado } from '../estado.js';
import { esc } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Contratos from '../dominio/contratos.js';
import * as Dados from '../dados/contratos.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes } from './dom.js';
import { confirmar } from './modal.js';
import { toast } from './toast.js';
import { redesenhar } from './app.js';

export function iniciar() {
  Contratos.definir(null);
  Dados.escutar(function (l) { Contratos.definir(l); redesenhar(); });
}
export function parar() { Dados.pararEscuta(); Contratos.definir(null); }

export function renderConfig() {
  const el = $('cfg-contratos');
  if (!el) return;
  el.hidden = !Auth.souGerente();
  if (el.hidden) return;
  const foco = document.activeElement && document.activeElement.id === 'cfg-contrato-novo';
  const valor = foco ? document.activeElement.value : '';
  el.innerHTML = '<div class="panel-title">' + esc(T('om.cfgTitulo')) + '</div><div class="panel-note">' + esc(T('om.cfgNota')) + '</div>' +
    '<div class="om-chips">' + Contratos.atual().map(function (c) {
      const n = Contratos.doContrato(c, estado.projetos).length;
      return '<span class="om-chip"><b class="mono">' + esc(c) + '</b><span class="hint-txt">' + esc(T('om.nOms', n)) + '</span>' +
        '<button type="button" class="om-chip-x" data-acao="tirarContrato" data-arg="' + esc(c) + '" aria-label="' + esc(T('om.tirar', c)) + '">×</button></span>';
    }).join('') + '</div>' +
    '<div class="om-novo"><input type="text" id="cfg-contrato-novo" class="input" maxlength="40" placeholder="2026-010" data-enter="addContrato" aria-label="' + esc(T('om.addRot')) + '">' +
    '<button type="button" class="btn btn-primary btn-mini" data-acao="addContrato">' + esc(T('om.add')) + '</button></div>';
  if (foco) { const i = $('cfg-contrato-novo'); i.value = valor; i.focus(); }
}

function salvar(lista, msg) {
  return Dados.salvar(lista).then(function () { toast(msg); }).catch(function (e) {
    console.warn(e); toast(T('t.semPermissao'), { tipo: 'erro' });
  });
}
function adicionar() {
  const i = $('cfg-contrato-novo');
  const novos = Contratos.normalizar(i ? i.value : '');
  if (!novos.length) { toast(T('om.invalido'), { tipo: 'erro' }); return; }
  const lista = Contratos.normalizar(Contratos.atual().concat(novos));
  i.value = '';
  salvar(lista, T('om.adicionado', novos.join(', ')));
}
function tirar(c) {
  confirmar(T('om.tirarQ', c), { titulo: T('om.cfgTitulo'), textoOk: T('om.tirarOk') }).then(function (ok) {
    if (!ok) return;
    const lista = Contratos.atual().filter(function (x) { return x !== c; });
    salvar(lista, T('om.tirado', c));
  });
}

registrarAcoes({ addContrato: adicionar, tirarContrato: tirar });
