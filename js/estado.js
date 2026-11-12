/* ---------------------------------------------------------------------------
   Estado da interface, compartilhado entre as telas.
--------------------------------------------------------------------------- */
import * as Projeto from './dominio/projeto.js';
export const estado = {
  projetos: [],
  carregado: false,          // primeira leitura da equipe já chegou
  filtroDash: { ano: '', mes: '', solicDe: '', entregaAte: '', descricao: '', gp: '', status: '', pcp: '' },
  filtroProj: { busca: '', status: '', pcp: '', gp: '' },
  ordem: { campo: 'entrega', dir: 1 },
  ordemVisivel: [],          // ids na ordem da lista — usado pelo ↑/↓ no detalhe
  idDetalhe: null,
  notifReais: [],            // avisos entre pessoas (Firestore), separados dos alertas calculados
  ops: [],                   // ordens de produção que este cargo enxerga
  opsCarregadas: false,
  maquinas: [],              // máquinas da usinagem (carga máquina)
  cfgFabrica: {},            // capacidade da caldeiraria (carga fábrica)
  setores: {},               // setor do PDF da OP → máquina (config/setores)
  rncs: [],                  // registros de não conformidade que este cargo enxerga
  servicosDocs: [],          // serviços externos dos projetos (avisos de cobrança do técnico)
  checklistPadrao: null,     // config/checklist da equipe ({itens, atualizadoEm, porNome}); null = lista de fábrica
  filtroFab: { visao: '', area: '', projeto: '', cliente: '', busca: '' },
  leProjetos: false          // o cargo lê projetos (sem o projeto da OP = projeto excluído)
};

// OP de projeto em andamento? Projeto concluído, cancelado ou excluído some
// das telas de OPs. Quem não lê projetos (CQ) vê todas.
export function opVisivel(o) {
  const p = buscarProjeto(o.projetoId);
  if (p) return Projeto.aberto(p);
  return !estado.leProjetos;
}

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
