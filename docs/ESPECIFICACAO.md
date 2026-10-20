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

- O técnico sobe a **planilha de controle de avanço** (.xls, .xlsx ou .csv).
  Cada linha com "N° OP CALD" vira uma OP de caldeiraria; cada linha com
  "N° OP USINAGEM" vira uma OP de usinagem. Pintura, serviço externo e TTAT
  ficam fora.
- Uma peça (desenho + posição) tem **no máximo uma OP por área**.
- Campos da OP: nº, área, commessa, desenho, posição, rev., descrição,
  quantidade, peso unitário e peso total.
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
  `origemOpId`/`origemRncId`.
- `equipes/{id}/rncs/{id}`: os campos do R02, `opId`, `projetoId`, `area`,
  `gpUid`, `tecnicoUid`, `situacao` (`aberta`/`encerrada`). Só o CQ grava;
  ninguém apaga.
- Projeto: `pedido {tipo, motivo, porUid, porNome, em}` enquanto espera a
  Gerência; `motivoCancelamento`. Equipe: `papeisMigrados`.
- `equipes/{id}/config/checklist`: checklist padrão do PCP da equipe (`itens [{t, dias}]`, `atualizadoEm`, `porUid`, `porNome`); Gerência e GP gravam. Sem ele vale a lista de fábrica.
- `usuarios/{uid}`: o dono pode apagar (encerrar conta).
- `notificacoes/{id}`: `tipo`, `mensagem`, `deUid`/`deNome`, `paraUid`,
  `projetoId`, `equipeId`, `lida`, `lidaEm`, `criadoEm`.
