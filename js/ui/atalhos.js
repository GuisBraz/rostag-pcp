/* ---------------------------------------------------------------------------
   Atalhos de teclado.
--------------------------------------------------------------------------- */
import { estado } from '../estado.js';
import { esc } from '../nucleo/fmt.js';
import { T } from '../i18n/index.js';
import * as Auth from '../dados/auth.js';
import { $ } from './dom.js';
import { modalAberto, fecharModal, prenderFoco } from './modal.js';
import { toast } from './toast.js';
import { fecharPopups } from './app.js';
import { irPara, abaAtual } from './rota.js';
import { abrirNovoProjeto, abrirEditarProjeto } from './formulario.js';
import { reagendarAberto, fecharReagendar } from './detalhe.js';
import { mudarAno } from './ano.js';
import { toggleNotificacoes } from './notificacoes.js';
import { toggleSidebar, alternarTema } from './preferencias.js';
import { exportarJSON } from './dados.js';

const ATALHOS = [
  { grupo: 'a.navegar', itens: [
    { o: 'a.voltar', k: ['Esc'] }, { o: 'a.painel', k: ['Alt', '1'] }, { o: 'a.projetos', k: ['Alt', '2'] },
    { o: 'a.linha', k: ['Alt', '3'] }, { o: 'a.fabrica', k: ['Alt', '4'] }, { o: 'a.rnc', k: ['Alt', '5'] }, { o: 'a.notificacoes', k: ['Alt', '6'] }, { o: 'a.carga', k: ['Alt', '7'] }, { o: 'a.config', k: ['Alt', ','] }, { o: 'a.prevProx', k: ['↑', '↓'] }
  ] },
  { grupo: 'a.acoes', itens: [
    { o: 'a.novo', k: ['N'] }, { o: 'a.filtro', k: ['F'] }, { o: 'a.busca', k: ['/'] },
    { o: 'a.editar', k: ['E'] }, { o: 'a.exportar', k: ['Ctrl', 'S'] }, { o: 'a.imprimir', k: ['Ctrl', 'P'] }
  ] },
  { grupo: 'a.interface', itens: [
    { o: 'a.notif', k: ['A'] }, { o: 'a.recolher', k: ['B'] }, { o: 'a.tema', k: ['T'] }, { o: 'a.lista', k: ['?'] }
  ] }
];

export function renderAtalhos() {
  $('atalhos-lista').innerHTML = ATALHOS.map(function (g) {
    return '<div class="atalho-grupo">' + esc(T(g.grupo)) + '</div>' + g.itens.map(function (a) {
      return '<div class="atalho-linha"><span>' + esc(T(a.o)) + '</span><span>' +
        a.k.map(function (k) { return '<kbd>' + esc(k) + '</kbd>'; }).join(' ') + '</span></div>';
    }).join('');
  }).join('');
}

function digitando(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
function appVisivel() { return $('app-shell').style.display !== 'none'; }

function abrirFiltroDaTela() {
  const a = abaAtual();
  if (a === 'painel') $('dash-filter-panel').classList.add('open');
  else if (a === 'projetos' && !estado.idDetalhe) $('proj-filter-panel').classList.add('open');
  else toast(T('t.semFiltro'));
}
function focarBusca() {
  if (abaAtual() !== 'projetos' || estado.idDetalhe) irPara('projetos');
  setTimeout(function () { $('proj-filter-panel').classList.add('open'); $('pf-busca').focus(); }, 60);
}
function navegarProjeto(passo) {
  const lista = estado.ordemVisivel, i = lista.indexOf(estado.idDetalhe);
  if (i < 0 || !lista.length) return;
  irPara('projetos', lista[(i + passo + lista.length) % lista.length]);
}

export function iniciarAtalhos() {
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (modalAberto()) { e.preventDefault(); fecharModal(); return; }
      if (document.querySelector('.filter-panel.open, .notif-panel.open, .profile-menu.open')) { fecharPopups(); return; }
      if (appVisivel() && reagendarAberto()) { fecharReagendar(); return; }
      if (appVisivel() && estado.idDetalhe && !digitando(e)) irPara('projetos');
      return;
    }
    if (e.key === 'Tab' && prenderFoco(e)) return;
    if (modalAberto()) {
      if (modalAberto() === 'modal-ano' && !digitando(e)) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); mudarAno(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); mudarAno(1); }
      }
      return;
    }
    if (!appVisivel()) return;

    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 's' && !e.shiftKey && !e.altKey) { e.preventDefault(); exportarJSON(); }
      return;   // demais combinações com Ctrl ficam com o navegador
    }
    if (e.altKey) {
      const mapa = { '1': 'painel', '2': 'projetos', '3': 'linha', '4': 'fabrica', '5': 'rnc', '6': 'notificacoes', '7': 'carga', ',': 'config' };
      if (mapa[e.key]) { e.preventDefault(); irPara(mapa[e.key]); }
      return;
    }
    if (digitando(e)) return;

    switch (e.key) {
      case 'n': case 'N': if (Auth.souGPouCoordenador()) { e.preventDefault(); abrirNovoProjeto(); } break;
      case 'f': case 'F': e.preventDefault(); abrirFiltroDaTela(); break;
      case '/': e.preventDefault(); focarBusca(); break;
      case 'e': case 'E': if (estado.idDetalhe && Auth.souGPouCoordenador()) { e.preventDefault(); abrirEditarProjeto(); } break;
      case 'a': case 'A': e.preventDefault(); toggleNotificacoes(); break;
      case 'b': case 'B': e.preventDefault(); toggleSidebar(); break;
      case 't': case 'T': e.preventDefault(); alternarTema(); break;
      case '?': e.preventDefault(); irPara('config', 'atalhos'); break;
      case 'ArrowUp': if (estado.idDetalhe) { e.preventDefault(); navegarProjeto(-1); } break;
      case 'ArrowDown': if (estado.idDetalhe) { e.preventDefault(); navegarProjeto(1); } break;
    }
  });
}
