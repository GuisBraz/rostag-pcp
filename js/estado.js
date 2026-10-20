/* ---------------------------------------------------------------------------
   Estado da interface, compartilhado entre as telas.
--------------------------------------------------------------------------- */
export const estado = {
  projetos: [],
  carregado: false,          // primeira leitura da equipe já chegou
  filtroDash: { ano: '', mes: '', solicDe: '', entregaAte: '', descricao: '', gp: '', tipo: '', status: '', pcp: '' },
  filtroProj: { busca: '', status: '', pcp: '', gp: '', tipo: '' },
  ordem: { campo: 'entrega', dir: 1 },
  ordemVisivel: [],          // ids na ordem da lista — usado pelo ↑/↓ no detalhe
  idDetalhe: null,
  notifReais: [],            // avisos entre pessoas (Firestore), separados dos alertas calculados
  ops: [],                   // ordens de produção que este cargo enxerga
  opsCarregadas: false,
  maquinas: [],              // máquinas da usinagem (carga máquina)
  cfgFabrica: {},            // capacidade da caldeiraria (carga fábrica)
  rncs: [],                  // registros de não conformidade que este cargo enxerga
  filtroFab: { visao: '', area: '', projeto: '', cliente: '', busca: '' }
};

export function buscarProjeto(id) {
  return estado.projetos.find(function (p) { return p.id === id; }) || null;
}
export function opsDoProjeto(id) {
  return estado.ops.filter(function (o) { return o.projetoId === id; });
}
export function projetoAtual() { return estado.idDetalhe ? buscarProjeto(estado.idDetalhe) : null; }

export function limparFiltros() {
  Object.keys(estado.filtroDash).forEach(function (k) { estado.filtroDash[k] = ''; });
  Object.keys(estado.filtroProj).forEach(function (k) { estado.filtroProj[k] = ''; });
  Object.keys(estado.filtroFab).forEach(function (k) { estado.filtroFab[k] = ''; });
}
