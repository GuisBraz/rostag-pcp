// Os cinco estados de um projeto. 'andamento' e 'atrasado' saem das datas;
// 'paralisado', 'concluido' e 'cancelado' são marcados à mão.
export const STATUS_KEYS = ['andamento', 'concluido', 'atrasado', 'paralisado', 'cancelado'];

// Situação de uma tarefa do cronograma — é o que pinta a bolinha.
export const SIT_KEYS = ['atrasada', 'chegando', 'andamento', 'planejada', 'parada', 'concluida'];
export const SIT_ORDEM = ['atrasada', 'chegando', 'andamento', 'parada', 'planejada', 'concluida']; // da mais grave para a menos

export const DIAS_MAX_TAREFA = 90;

export const CHECKLIST_PADRAO = Object.freeze([
  'Receber o Projeto', 'Análise de escopo e desenhos', 'Solicitar itens críticos (quando aplicável)', 'Criar lista de materiais',
  'Criar aproveitamento de Laminados', 'Emitir SC de Laminados', 'Detalhar as posições em chapas', 'Emitir SC das chapas',
  'Criar croqui de dobra (quando aplicável)', 'Emitir SC de dobra (quando aplicável)', 'Criar as ordens de produção', 'Imprimir book em A3',
  "Imprimir as OP's", 'Verificar chegada da MP', 'Criar OP de Pintura', 'Verificar PC de serviços externos',
  'Emitir NF para serviços internos', 'Criar plano de pintura', 'Emitir SC de pintura', 'Entregar os documentos para a responsável (OP, PGM e P.P)'
]);

export const VERSAO = '3.0';
