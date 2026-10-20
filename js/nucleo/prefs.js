/* ---------------------------------------------------------------------------
   Preferências de quem está usando o app.
   Tema, idioma e alertas seguem a conta (perfil no Firestore); uma cópia fica
   no localStorage, separada por usuário, para o app já abrir com o tema certo
   antes de o perfil chegar. Nada aqui é dado de negócio.
--------------------------------------------------------------------------- */

export const PREFS_PADRAO = Object.freeze({
  idioma: 'pt', tema: 'claro', alerta: 10, alertaTarefa: 2, fimDeSemana: 'nao',
  nome: '', sidebarRecolhida: false, temaClaro: 'claro', lidas: {}
});

// Campos que também vivem no perfil da conta (/usuarios/{uid}).
export const CAMPOS_PERFIL = ['nome', 'tema', 'idioma', 'alerta', 'alertaTarefa', 'fimDeSemana'];

// Objeto único e mutável: os módulos leem sempre o valor atual.
export const prefs = Object.assign({}, PREFS_PADRAO, { lidas: {} });

const CHAVE_BASE = 'rostag_pcp_prefs';
let chaveAtual = CHAVE_BASE;

function lerLocal(chave) {
  try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch (e) { return null; }
}

// Troca de usuário: volta ao padrão e carrega o que este usuário salvou neste navegador.
export function carregarPrefsDoUsuario(uid) {
  chaveAtual = uid ? CHAVE_BASE + '_' + uid : CHAVE_BASE;
  resetarPrefs();
  const salvas = lerLocal(chaveAtual) || (uid ? null : lerLocal(CHAVE_BASE));
  if (salvas && typeof salvas === 'object') Object.assign(prefs, salvas);
  if (!prefs.lidas || typeof prefs.lidas !== 'object') prefs.lidas = {};
}

export function resetarPrefs() {
  Object.keys(prefs).forEach(function (k) { delete prefs[k]; });
  Object.assign(prefs, PREFS_PADRAO, { lidas: {} });
}

export function aplicarPerfil(perfil) {
  if (!perfil) return;
  CAMPOS_PERFIL.forEach(function (k) { if (perfil[k] != null && perfil[k] !== '') prefs[k] = perfil[k]; });
}

export function salvarPrefsLocais() {
  try { localStorage.setItem(chaveAtual, JSON.stringify(prefs)); return true; } catch (e) { return false; }
}

// O tema salvo é aplicado o quanto antes, sem esperar o login.
export const TEMAS = ['claro', 'escuro', 'pastel', 'tecnico', 'st', 'grego', 'prata'];
export function temaValido(t) { return TEMAS.indexOf(t) >= 0 ? t : 'claro'; }
export function temaInicial() {
  return temaValido(lerLocal(CHAVE_BASE + '_ultimoTema'));
}
export function lembrarTema(tema) {
  try { localStorage.setItem(CHAVE_BASE + '_ultimoTema', JSON.stringify(tema)); } catch (e) { /* sem armazenamento */ }
}
