/* ---------------------------------------------------------------------------
   Papéis (cargos) da equipe — fonte única para a interface. A trava de
   verdade continua nas regras do Firestore (firestore.rules), que usam os
   mesmos nomes.
--------------------------------------------------------------------------- */

export const PAPEIS = ['gerente_pcp', 'gp', 'tecnico', 'prog_usinagem', 'prog_caldeiraria', 'cq'];

// Áreas de OP — cada programador enxerga uma delas.
export const AREAS = ['caldeiraria', 'usinagem'];
const AREA_DO_PROGRAMADOR = { prog_usinagem: 'usinagem', prog_caldeiraria: 'caldeiraria' };

// Normaliza o papel gravado: o coordenador da equipe é sempre Gerente de PCP
// e o antigo "planejador" virou Técnico de processo.
export function papelEfetivo(papel, ehCoordenador) {
  if (ehCoordenador) return 'gerente_pcp';
  if (papel === 'planejador') return 'tecnico';
  return PAPEIS.indexOf(papel) >= 0 ? papel : 'tecnico';
}

export function ehGerente(p) { return p === 'gerente_pcp'; }
// Módulo de cada cargo (aparece no título do Painel Geral).
const MODULO = { gerente_pcp: 'gerencia', cq: 'qualidade', tecnico: 'processos', gp: 'planejamento',
  prog_usinagem: 'planejamento', prog_caldeiraria: 'planejamento' };
export function moduloDe(p) { return MODULO[p] || null; }
// Quem cria e edita projetos (o GP só os dele — a consulta já filtra).
export function gereProjetos(p) { return p === 'gerente_pcp' || p === 'gp'; }
// Quem trabalha com projetos (painel, lista, linha do tempo).
export function veProjetos(p) { return p === 'gerente_pcp' || p === 'gp' || p === 'tecnico'; }
export function ehProgramador(p) { return !!AREA_DO_PROGRAMADOR[p]; }
export function areaDoProgramador(p) { return AREA_DO_PROGRAMADOR[p] || null; }
export function ehCQ(p) { return p === 'cq'; }
// Programadores leem os projetos (painel, linha do tempo e carga), sem editar.
export function leProjetos(p) { return veProjetos(p) || ehProgramador(p); }
// Carga máquina (usinagem) e carga fábrica (caldeiraria).
export function veCarga(p) { return p === 'gerente_pcp' || ehProgramador(p); }
export function sobePlanilha(p) { return p === 'gerente_pcp' || p === 'tecnico'; }
export function veRnc(p) { return p === 'gerente_pcp' || p === 'gp' || p === 'tecnico'; }
