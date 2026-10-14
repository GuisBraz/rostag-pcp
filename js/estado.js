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
  notifReais: []             // designações/observações (Firestore), separadas dos alertas calculados
};

export function buscarProjeto(id) {
  return estado.projetos.find(function (p) { return p.id === id; }) || null;
}
export function projetoAtual() { return estado.idDetalhe ? buscarProjeto(estado.idDetalhe) : null; }

export function limparFiltros() {
  Object.keys(estado.filtroDash).forEach(function (k) { estado.filtroDash[k] = ''; });
  Object.keys(estado.filtroProj).forEach(function (k) { estado.filtroProj[k] = ''; });
}
