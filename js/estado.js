/* ---------------------------------------------------------------------------
   Estado da interface, compartilhado entre as telas.
--------------------------------------------------------------------------- */
import * as Projeto from './dominio/projeto.js';
import { nomeProjeto } from './dominio/contratos.js';
export { nomeProjeto };
export const estado = {
  projetos: [],
  carregado: false,          // primeira leitura da equipe já chegou
  filtroDash: { ano: '', mes: '', solicDe: '', entregaAte: '', descricao: '', gp: '', status: '', pcp: '' },
  filtroProj: { busca: '', status: '', pcp: '', gp: '', fase: '' },
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
  tarefas: [],               // tarefas avulsas da equipe
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

// Índices (projeto por id, OPs por projeto): refeitos só quando a lista muda.
let idxProj = { lista: null, n: -1, mapa: null }, idxOps = { lista: null, n: -1, mapa: null };
export function buscarProjeto(id) {
  const l = estado.projetos;
  if (idxProj.lista !== l || idxProj.n !== l.length) {
    const m = new Map();
    l.forEach(function (p) { m.set(p.id, p); });
    idxProj = { lista: l, n: l.length, mapa: m };
  }
  return idxProj.mapa.get(id) || null;
}
export function opsDoProjeto(id) {
  const l = estado.ops;
  if (idxOps.lista !== l || idxOps.n !== l.length) {
    const m = new Map();
    l.forEach(function (o) { const k = o.projetoId; if (!m.has(k)) m.set(k, []); m.get(k).push(o); });
    idxOps = { lista: l, n: l.length, mapa: m };
  }
  return (idxOps.mapa.get(id) || []).slice();
}
export function projetoAtual() { return estado.idDetalhe ? buscarProjeto(estado.idDetalhe) : null; }

export function limparFiltros() {
  Object.keys(estado.filtroDash).forEach(function (k) { estado.filtroDash[k] = ''; });
  Object.keys(estado.filtroProj).forEach(function (k) { estado.filtroProj[k] = ''; });
  Object.keys(estado.filtroFab).forEach(function (k) { estado.filtroFab[k] = ''; });
}

// Commessa da OP como aparece nas telas: com a OM quando o projeto é de um contrato
export function nomeDaOp(o) {
  const p = o && o.projetoId ? buscarProjeto(o.projetoId) : null;
  return p ? nomeProjeto(p) : String((o && o.commessa) || '');
}
