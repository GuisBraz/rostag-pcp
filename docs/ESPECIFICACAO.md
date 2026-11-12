# Especificação — ROSTAG PCP integrado

Sistema único, da criação da commessa à aprovação das peças na fábrica.
Este documento registra o que foi combinado com o usuário (out/2026). Itens
marcados **(depois)** ficaram para lapidar em outra etapa.

## 1. Fluxo

```
Gerente de PCP (ou GP) cria a commessa ─► GP define o cronograma macro ─► Técnico executa o PCP
        commessa, cliente, entrega,           PCP: início e fim             checklist + planilha de OPs
        GP e técnico responsáveis             Produção: fim                          │
                                                                                     ▼
                       CQ dá baixa em cada OP: ✅ Aprovada  ou  🔴 RNC (formulário R02) → retrabalho → reinspeção
```

Situação do projeto enquanto não tem cronograma: **Aguardando cronograma**
(só Gerente de PCP e GP veem; o técnico ainda não).

## 1.1 Entrada no sistema

1. **Login** (primeira tela) — ou **Criar conta** (nome, e-mail, senha ≥ 8).
   Sem chave de acesso nem plano.
2. **Tem equipe** → entra direto na **equipe principal** (`usuarios/{uid}.equipePrincipal`;
   sem escolha, a primeira em que entrou). "Trocar" vale só na aba atual até sair.
3. **Não tem equipe** → entra no app com menu reduzido (Painel, Notificações,
   Configurações) e o botão **"＋ Entrar em uma equipe"**: entrar por nome + senha,
   por link de convite, ou criar equipe (com "Migrar meus dados" para quem tem o
   espaço antigo).

## 2. Cargos

Uma pessoa tem **um** cargo por equipe. Um projeto tem **um** GP e **um** técnico.

| Ação | Gerente de PCP | GP | Técnico de processo | Prog. usinagem | Prog. caldeiraria | CQ |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Administrar a equipe (convites, cargos, remover) | ✅ | | | | | |
| Criar projeto | ✅ | ✅ (vira o GP do projeto) | | | | |
| Designar GP | ✅ | | | | | |
| Designar técnico | ✅ | ✅ | | | | |
| Cronograma macro e tarefas | ✅ | ✅ | | | | |
| Checklist do PCP | | | ✅ | | | |
| Subir a planilha de OPs | ✅ | | ✅ | | | |
| Ver OPs | todas | dos projetos dele | dos projetos dele | todas de usinagem | todas de caldeiraria | todas |
| Dar baixa na OP (Aprovar / RNC / reinspeção) | | | | | | ✅ |
| Aba RNC (formulário e PDF) | ✅ (leitura) | dos projetos dele (leitura) | dos projetos dele (leitura) | | | ✅ (edita) |
| Paralisar / cancelar projeto | ✅ (direto ou aprovando pedido) | pede à Gerência | | | | |
| Projetos que vê | todos | os dele | os dele (após o cronograma) | — | — | — |

- **Não há mais coordenador.** A Gerência pode ter várias pessoas; qualquer
  gerente administra a equipe e troca a senha. Ninguém muda o próprio cargo e
  gerente não sai sozinho (outro gerente muda o cargo dele antes), então a
  equipe nunca fica sem Gerência. Em equipe antiga, quem a criou vale como
  gerente até a migração gravar `papeisMigrados` na equipe.
- Programadores apenas **consultam** as OPs da área (não dão baixa).
- **Migração** das equipes que já existem: quem criou → Gerente de PCP,
  GP → GP, Planejador → Técnico de processo. Programadores e CQ são
  atribuídos depois pelo Gerente de PCP. Quem entra pelo nome + senha da
  equipe entra como Técnico de processo.

## 3. Cronograma macro

Duas etapas, cada uma com início e fim, mais a entrega:

- **PCP:** início e fim informados pelo GP (ou Gerente de PCP). As tarefas do
  checklist são encadeadas dentro dessa janela; se ainda não têm duração, o
  sistema distribui os dias úteis entre elas **(ajuste fino: depois)**.
- **Produção:** o início é **sempre o fim do PCP** (datas atreladas); o GP
  informa só o fim.
- **Nada se move sozinho.** Se o PCP atrasar, o sistema marca *PCP atrasado*,
  conta os dias e notifica GP e Gerente de PCP; quem decide reprogramar é o GP.
  Ao reprogramar o fim do PCP, o início da Produção acompanha; o fim da
  Produção só muda se o GP alterar.
- Produção que termina depois da entrega **não é bloqueada**: o sistema avisa
  e conta os dias.
- Toda reprogramação fica no histórico do projeto (data antiga, nova, quem e
  quando) e entra no **desempenho por pessoa** da Gerência.
- **Paralisar e cancelar** são da Gerência. O GP pede (com motivo); o projeto
  não muda enquanto o pedido espera ("Aguardando a Gerência"); a Gerência
  aprova (aplica) ou recusa (com motivo) pela fila de pendências ou pelo
  detalhe do projeto. Retomar, concluir e reabrir o GP faz direto.

Situação da Produção: *Planejada* (antes do início) → *Em produção* → *Atrasada*
(passou do fim com OPs abertas) → *Concluída* (todas as OPs aprovadas).

Avanço da Produção em 3 números: **geral, caldeiraria e usinagem** = OPs
aprovadas (com e sem desvio) ÷ total. OP em retrabalho conta como não
aprovada; peça morta sai do total (a OP de retrabalho que nasce dela entra).

## 4. Fábrica (OPs)

- O técnico sobe a **planilha de avanço pronta** (.xls, .xlsx ou .csv), quando
  o PCP está pronto (OPs, produtos e serviços já definidos).
  - A **lista inteira** fica guardada no projeto (`avanco/{projetoId}`):
    peças, conjuntos e itens comerciais, para todos verem em **Lista de avanço**.
  - Cada linha com "N° OP CALD" vira uma OP de caldeiraria; com
    "N° OP USINAGEM", uma OP de usinagem. A OP leva também o **N° Produto**, a
    **observação** e as marcas de **pintura, serviço externo, TTAT e oxidação**.
- Uma peça (desenho + posição) tem **no máximo uma OP por área**.
- Campos da OP: nº, área, commessa, desenho, posição, rev., descrição,
  quantidade, peso unitário, peso total, produto, observação e marcas.
- **PDF da OP** (Fábrica → ＋ Adicionar OPs → PDF da OP): um ou vários PDFs
  gerados pelo sistema da empresa. A OP é achada pelo número e recebe as
  **operações** (setor, horas, etapa). Os dados da peça continuam os da
  planilha; o que não bater aparece como aviso. O sistema às vezes exporta
  a OP como imagem (impressa): essas páginas são lidas por OCR (Tesseract,
  em português, no próprio navegador; ~5 s por página) e a OP fica marcada
  "lido da imagem — confira as horas".
- **Carga máquina:** OP com PDF entra pelas operações — cada setor vai para a
  máquina de mesmo nome ou para a escolhida em Carga → Setores do PDF da OP
  (ou "não é máquina"). OP sem PDF continua com máquina e horas à mão.
- **Avanço por peças:** aprovada (ou com desvio) = todas as peças feitas; com
  RNC = as boas feitas e as reprovadas (Qtde. N/C, obrigatória) em RNC; peça
  morta passa as reprovadas para a OP de retrabalho, que nasce com essa
  quantidade.
- **Baixar planilha de avanço:** devolve a aba no mesmo layout com MONT, SOLD,
  ACAB e PINTURA (caldeiraria) e AVANÇO TOTAL / Avanço Usi (usinagem) em peças
  feitas, e o resumo do topo com fórmulas corrigidas.
- **Reenvio da planilha:** OPs novas entram; as que já existem são
  atualizadas sem perder a finalização do CQ.
- Situações da OP: *Aberta* → *Em retrabalho* (com RNC) → *Aprovada*,
  *Aprovada com desvio* ou *Peça morta*. Aprovada, desvio e morta são finais.
- O **CQ dá baixa**: *Aprovar* (com confirmação) ou *Abrir RNC*. A RNC é o
  formulário **R02** da SOFIR em tela cheia; o que a OP já tem vem preenchido.
  Ao salvar, a OP volta para a Fábrica *em retrabalho*.
- **Reinspeção** (na RNC atual): conforme → aprovada; liberada com desvio →
  aprovada com desvio; não conforme → RNC encerrada e a OP segue em retrabalho
  (pode abrir nova RNC); **Nº OP – Retrabalho** preenchido → nasce a OP nova
  ligada à original (`origemOpId`) e a original vira **peça morta**.
- **PDF** da RNC igual à planilha R02 (logo SOFIR, frente e verso).
- Aba **RNC**: todas as RNCs (abertas e encerradas) com o resultado; o
  formulário completo e o PDF para Gerência, GP e técnico do projeto.
- **Painel do CQ**: aprovadas × RNC e em aberto × finalizadas do mês, com tela
  cheia de 6 e 12 meses; retrabalho, peças mortas e desvio.

## 4.1 Programação (programadores) e OPs finalizadas

- **Abas do programador de caldeiraria:** Painel (gráfico mês a mês: em aberto ×
  concluídas × RNC), Linha do Tempo, Ordens de Produção, **Fábrica** (o quadro),
  RNC (só leitura) e OPs Finalizadas. **Usinagem:** o mesmo, com a **Carga
  Máquina** no lugar da Fábrica.
- **Caldeiraria (quadro):** Em aberto → **Em fábrica** (terceirizada + data
  prevista para finalizar; nunca antes de hoje; depois do prazo do projeto só
  avisa) → Baixa do CQ → Finalizar. "Tirar" devolve para em aberto. RNC fica
  "aguardando disposição". Carga em kg por terceirizada; cadastro de
  terceirizadas só com o nome (programadora e Gerência).
- **Usinagem (Carga Máquina, como o MS Project):** uma fila por máquina
  (`maquinas/{id}.fila`). As horas vêm do PDF da OP (setor → máquina) ou são
  digitadas; início e fim saem do calendário da máquina (horas/dia, seg–sex),
  a partir de hoje ou de "não iniciar antes de". Máquina ocupada empurra a OP;
  fim depois do prazo do projeto = "planejado em atraso". Horas reais por OP,
  com aviso quando passam das previstas. OP aprovada pelo CQ deixa de ocupar a
  máquina.
- **Finalizar:** CQ aprova → o programador da área é avisado → ele finaliza
  (`encerradaEm`) → a OP sai da programação e o técnico e o GP recebem o
  próximo passo (TTAT → serviço externo → oxidação → pintura, pelas marcas da
  planilha) ou "sem próxima etapa".
- **Avisos graduais do programador** (sino): OPs em aberto há mais de 2 dias,
  OP programada com a data a 2 dias (ou vencida), OP planejada em atraso,
  projeto com o fim da produção a 7 dias e projeto atrasado — este também põe
  a **borda vermelha** nas OPs do projeto.
- **OPs Finalizadas (todos):** botões Expedição, Montagem mecânica, Pintura e
  OP sem destino → commessas não finalizadas (tela cheia) → peças da commessa
  (disponível, em produção, outro destino) e **romaneio** (.xlsx, só as
  disponíveis). Peça pronta = todas as OPs dela finalizadas; destino gravado em
  `op.destino` (Gerência, GP e técnico do projeto); sem destino gravado, peça
  com pintura marcada vai para Pintura.

## 4.2 Página do projeto do técnico e Todas as OPs

- **Cartões no projeto (só técnico):** **Checklist** (abre e fecha o cronograma
  do PCP; começa fechado toda vez que se entra no projeto), **Planilha de
  avanço**, **Ordens de Produção** (tela cheia: as OPs do projeto, importar PDF e
  OP manual; clicar abre o roteiro com o texto de cada operação), **Itens
  comerciais** e **Serviços**. Gerência e GP abrem Planilha, Itens comerciais e
  Serviços pelos botões do acompanhamento do projeto.
- **Planilha de avanço (personalizada):** não é mais o espelho do Excel. Topo:
  qtd de peças, peso total, qtd de usinagem e de caldeiraria (só peças finais —
  o conjunto já soma as filhas; comerciais fora). Colunas: Revisão, Desenho,
  Posição, Descrição (observação vira 💬), Qtd total, Peso unitário, Peso total,
  Comercial, Cald, Usinagem, Pintura, Oxidação negra, Serviços externos, TTAT,
  Produto, OP cald, OP usi. Sem colunas de avanço e sem as linhas comerciais.
  Subir, baixar e "apagar lista e OPs" continuam.
- **Itens comerciais:** as linhas "Comercial" da planilha com quantidade, SC,
  pedido de compra, fornecedor, valor e chegada (parcial ou completa). O pedido
  entra pelo **PDF do pedido de compra** (sistema da empresa): o site lê número,
  fornecedor, emissão, comprador, total e os itens da commessa do projeto e liga
  cada linha ao item da planilha pelo código do produto, depois pela SC (a mais
  parecida) e, por fim, só sugere pela descrição; o técnico confere, escolhe à
  mão, ignora ou cria item "fora da planilha". SC e pedido têm 6 dígitos (a SC
  que quebra em duas linhas no PDF é juntada). A data de entrega do sistema não
  é usada. **Valores** ficam num documento à parte que só Gerência, o GP e o
  técnico do projeto leem (programadores e CQ não).
- **Serviços:** usinagem externa, corte laser, dobra, TTAT… vindos da aba
  SERVIÇOS da planilha e das peças marcadas com Serviço externo / TTAT. Situação
  a enviar · enviado · parcial · voltou. O técnico registra o envio (data, qtd,
  fornecedor e prazo em **dias úteis** — padrão — ou **corridos**) e o retorno;
  os dois podem ser parciais. Sem nº de NF/romaneio e sem ligação automática
  com a próxima etapa da OP.
- **Checklist padrão novo (14 tarefas):** Análise de escopo, Criar lista de
  avanço, SC itens críticos, Criar LM, Aproveitamento de laminados, SC
  laminados, Aproveitamento de chapas, SC chapas, Detalhamento de dobra (quando
  aplicável), SC dobra (quando aplicável), Criar ordem de produção, Imprimir as
  OPs, Criar plano de pintura, Entregar os documentos. Os dias do PCP são
  divididos com peso maior para Criar LM, Lista de avanço, Aproveitamento de
  chapas e Ordem de produção (1ª tarefa no início do PCP, última no fim).
  Projetos com PCP em andamento migram para a lista nova mantendo o que já foi
  feito e as observações; PCP concluído fica como está.
- O técnico não tem mais a aba **Fábrica**: tudo do projeto fica no projeto.
- **PDF da OP por projeto:** a OP é procurada só no projeto escolhido; PDF de
  outra commessa é recusado. PDF impresso em retrato (texto girado 90°) é lido
  normalmente; o texto das instruções vai para `operacoes[].texto`.
- **Todas as OPs** (antes "OPs Finalizadas"): Em andamento, Em RNC, Expedição,
  Montagem mecânica, Pintura e Sem destino — só projetos em andamento.
- **Excluir projeto** apaga junto as OPs, a lista de avanço, os comerciais e os serviços (as RNCs ficam).
- **Início da produção** (`prodInicio`) é escolhido pelo GP, independente do
  PCP; sem ele, vale o fim do PCP. O tipo de serviço saiu do projeto.

## 4.3 RNC (tela simples) e tarefas avulsas

- **RNC:** o CQ abre pela OP numa janela simples — desenho, posição, rev.,
  commessa, OP, qtd e setor vêm da OP; inspetor, data e nº são automáticos; o
  CQ informa só a observação, a quantidade não conforme e a procedência. A RNC
  vai para o GP, o técnico do projeto e a Gerência (**aguardando
  disposição**); basta um deles dar a disposição, que sai assinada por quem
  deu, e a RNC volta para o CQ (**aguardando o CQ**). O CQ dá seguimento:
  conforme, liberada com desvio, não conforme ou OP nova de retrabalho
  (**encerrada**). O PDF continua saindo na folha padrão SOFIR R02. A aba RNC
  filtra por situação e o número no menu é o que espera por você.
- **Tarefas avulsas:** imprevistos do projeto, fora do checklist. GP do
  projeto e Gerência criam (título, detalhes, para quem, prazo opcional); a
  pessoa recebe notificação, vê em "Minhas tarefas" (menu) ou no cartão
  Tarefas do projeto, marca como concluída (com observação opcional) e quem
  pediu é avisado. A concluída mostra quem fez e quanto tempo levou. Não
  entram no cronograma nem no % do checklist.

## 5. Notificações

| # | Evento | Quem recebe | Origem |
|---|---|---|---|
| 1 | Projeto criado e designado a você | GP designado | quem criou |
| 2 | Cronograma definido — projeto liberado | Técnico | GP |
| 3 | Datas do cronograma alteradas | Técnico | quem alterou |
| 4 | Designação trocada | quem entrou e quem saiu | quem alterou |
| 5 | Tarefa do checklist vencendo / atrasada | Técnico e GP | Sistema |
| 6 | PCP concluído (checklist 100%) | GP e Gerente de PCP | Sistema |
| 7 | Planilha de OPs enviada | GP do projeto | técnico |
| 8 | RNC aberta | Gerente de PCP, GP e técnico | CQ |
| 9 | Produção atrasada | Gerente de PCP e GP | Sistema |
| 10 | Produção concluída | Gerente de PCP, GP e técnico | Sistema |
| 11 | Entrega se aproximando | GP e técnico | Sistema |
| 12 | Entrega atrasada | Gerente de PCP e GP | Sistema |
| 13 | Mensagem no chat do projeto | GP e técnico, menos quem enviou | quem enviou |
| 14 | Observação numa tarefa | técnico do projeto | quem escreveu |
| 15 | PCP atrasado | GP e Gerente de PCP | Sistema |
| 16 | Pedido para paralisar / cancelar | Gerentes | GP |
| 17 | Pedido aprovado ou recusado (com motivo) | GP que pediu | Gerente |
| 18 | Serviço externo: prazo do fornecedor vence hoje / venceu (cobrar) | técnico do projeto | Sistema |
| 19 | Disposição dada na RNC | CQ | quem deu |
| 20 | Tarefa avulsa para você | quem recebe | GP / Gerência |
| 21 | Tarefa avulsa concluída | quem pediu | quem concluiu |
| 22 | Tarefa avulsa vence hoje / atrasada | quem recebe | Sistema |

As de *Sistema* são calculadas pelas datas e aparecem com origem "Sistema".

**Tela cheia** (menu Notificações, `Alt+6`): abas Não lidas / Lidas / Todas,
filtros por assunto, origem (pessoas ou Sistema) e projeto, agrupadas por
dia. Cada uma mostra de quem veio, quando chegou e quando foi lida, e pode ser
marcada como lida ou não lida. O "lido" vale em todos os aparelhos.

**Expiração semanal** (semana de segunda a domingo): na segunda, todas as
notificações da semana anterior somem — lidas ou não. Os alertas do Sistema
que continuam valendo reaparecem como não lidos. No plano gratuito do
Firebase não há rotina agendada no servidor: a virada acontece quando cada
pessoa abre o app (cada um apaga as próprias). O estado dos alertas do
Sistema (quando apareceu, quando foi lido) fica em
`usuarios/{uid}/alertas/{semana_equipe_alerta}`.

## 6. Ordem de construção

1. Cargos, permissões e migração das equipes. ✅
2. Fluxo do projeto: designação, cronograma macro, notificações dos eventos. ✅
3. Fábrica: planilha, lista de OPs, finalização pelo CQ, aba RNC. ✅
4. Tela cheia de notificações com expiração semanal. ✅
5. Linha do tempo com as etapas. **(depois)**
6. CQ completo (RNC R02, reinspeção, peça morta, PDF, painel) e Gerência
   (pedidos, pendências, desempenho, vários gerentes). ✅

## 7. Modelo de dados (Firestore)

- `equipes/{id}/membros/{uid}.papel`: `gerente_pcp`, `gp`, `tecnico`,
  `prog_usinagem`, `prog_caldeiraria`, `cq` (o legado `planejador` vale como
  `tecnico`).
- `equipes/{id}/projetos/{id}`: além dos campos anteriores, `gpUid` (GP),
  `responsavelUid` (técnico), `prodFim`, `cronogramaDefinido`.
  `pcpInicio`/`pcpFim` podem ficar vazios enquanto aguarda o cronograma.
- `equipes/{id}/ops/{id}`: uma por peça e área. Id =
  `projeto__area__desenho__posicao`. Guarda cópia de `gpUid`/`tecnicoUid` do
  projeto para as regras decidirem quem vê.
  Situação em `status`: `aberta`, `retrabalho` (legado `rnc`), `aprovada`,
  `desvio`, `morta`; mais `rncAtualId`/`rncNumero`, `retrabalhoDesde`,
  `finalizadoEm`, `mortaEm`, `opNovaId` e, na OP de retrabalho,
  `origemOpId`/`origemRncId`. Da planilha: `produto`, `obs`, `marcas`
  (`pintura`, `servicoExterno`, `ttat`, `oxidacao`). Do PDF: `operacoes
  [{n, setor, horas, etapa}]`, `pdfEm`, `pdfPorUid`. Da RNC: `qtdNc` (peças
  reprovadas).
- `equipes/{id}/avanco/{projetoId}`: a aba da planilha como valores
  (`linhas [{c: [...]}]`, `merges`, `larguras`), `arquivo`, `aba`,
  `opPintura`, `servicos` (linhas da aba SERVIÇOS), `enviadoEm/PorUid/PorNome`.
  Toda a equipe lê; Gerência e o técnico do projeto gravam.
- `equipes/{id}/comerciais/{projetoId}`: `itens {chave: {pc, sc, fornecedor,
  produtoPc, descricaoPc, unidade, qtdPedido, chegadas [{qtd, em, porNome}]}}`,
  `pedidos {numero: {fornecedor, emissao, comprador, importadoEm, porNome,
  itens}}`. Toda a equipe lê; Gerência, GP e técnico do projeto gravam.
- `equipes/{id}/comerciaisValores/{projetoId}`: `itens {chave: {pc, valorUnit,
  valorTotal}}`, `pedidos {numero: {total}}`. Só Gerência, GP e técnico do
  projeto leem e gravam.
- `equipes/{id}/servicos/{projetoId}`: `itens {chave: {qtd, tipo, peca, desenho,
  posicao, fornecedor, envios [{qtd, em, prazo, tipoPrazo, previsto,
  fornecedor}], retornos [{qtd, em}]}}`. Toda a equipe lê; Gerência, GP e
  técnico do projeto gravam.
- `equipes/{id}/config/setores`: `mapa {SETOR: idDaMaquina | ''}`; programador
  de usinagem e Gerência gravam.
- `equipes/{id}/rncs/{id}`: os campos do R02, `opId`, `projetoId`, `area`,
  `gpUid`, `tecnicoUid`, `situacao` (`aberta`/`encerrada`). O CQ grava tudo;
  Gerência, o GP ou o técnico do projeto gravam só a disposição
  (`disposicao`, `dispResponsavel`, `dispData`) — uma vez, quem der primeiro —
  enquanto a RNC está aberta. Ninguém apaga.
- `equipes/{id}/tarefas/{id}`: tarefa avulsa (`projetoId`, `commessa`,
  `titulo`, `descricao`, `paraUid/Nome`, `prazo`, `status` aberta/concluida,
  `criadoPor*`, `criadoEm`, `concluidaEm`, `concluidaPor*`, `obsConclusao`).
  Toda a equipe lê; GP do projeto e Gerência criam, editam, reabrem e apagam;
  quem recebeu só conclui.
- Projeto: `pedido {tipo, motivo, porUid, porNome, em}` enquanto espera a
  Gerência; `motivoCancelamento`. Equipe: `papeisMigrados`.
- `equipes/{id}/config/checklist`: checklist padrão do PCP da equipe (`itens [{t, dias}]`, `atualizadoEm`, `porUid`, `porNome`); Gerência e GP gravam. Sem ele vale a lista de fábrica.
- `usuarios/{uid}`: o dono pode apagar (encerrar conta).
- `notificacoes/{id}`: `tipo`, `mensagem`, `deUid`/`deNome`, `paraUid`,
  `projetoId`, `equipeId`, `lida`, `lidaEm`, `criadoEm`.
