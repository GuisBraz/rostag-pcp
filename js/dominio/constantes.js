// Os cinco estados de um projeto. 'andamento' e 'atrasado' saem das datas;
// 'paralisado', 'concluido' e 'cancelado' são marcados à mão.
export const STATUS_KEYS = ['andamento', 'concluido', 'atrasado', 'paralisado', 'cancelado'];

// Situação de uma tarefa do cronograma — é o que pinta a bolinha.
export const SIT_KEYS = ['atrasada', 'chegando', 'andamento', 'planejada', 'parada', 'concluida'];
export const SIT_ORDEM = ['atrasada', 'chegando', 'andamento', 'parada', 'planejada', 'concluida']; // da mais grave para a menos

export const DIAS_MAX_TAREFA = 90;

export const CHECKLIST_PADRAO = Object.freeze([
  'Análise de escopo', 'Criar lista de avanço', 'SC itens críticos', 'Criar LM', 'Aproveitamento de laminados', 'SC laminados',
  'Aproveitamento de chapas', 'SC chapas', 'Detalhamento de dobra (quando aplicável)', 'SC dobra (quando aplicável)',
  'Criar ordem de produção', 'Imprimir as OPs', 'Criar plano de pintura', 'Entregar os documentos'
]);
// A lista padrão mudou nesta data: listas da equipe salvas antes disso são trocadas uma vez.
export const CHECKLIST_PADRAO_DESDE = '2026-11-12';

export const VERSAO = '3.0';
