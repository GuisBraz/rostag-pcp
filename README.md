# ROSTAG PCP

Planejamento e Controle de Produção — controle de projetos e commessas.

Site estático, sem servidor: abre no navegador e roda inteiro no seu computador.
Nada é enviado para nenhum lugar — nem os dados dos projetos, nem nada.

## Onde ficam os dados

No `localStorage` do navegador, só nesse navegador, nesse computador. Isso
significa:

- Limpar o cache/dados do site apaga os projetos.
- Não sincroniza sozinho entre navegadores ou computadores diferentes.
- **Faça backup:** Configurações → Dados do app → **Exportar JSON**. Guarde o
  arquivo em algum lugar seguro (ou importe no mesmo app em outra máquina para
  levar os dados com você).

## Rodar localmente (sem publicar)

Basta abrir `index.html` com dois cliques — não precisa de servidor,
instalação nem internet (a fonte web é opcional; se não carregar, cai em
fontes do sistema).

## Atalhos

| | |
|---|---|
| `Esc` | volta / fecha o que estiver aberto |
| `Alt+1` `Alt+2` `Alt+3` | Painel, Projetos, Linha do Tempo |
| `Alt+,` | Configurações |
| `N` | novo projeto |
| `F` | filtro da tela |
| `/` | buscar |
| `E` | editar o projeto aberto |
| `↑` `↓` | projeto anterior / próximo |
| `A` | notificações |
| `B` | recolher o menu |
| `T` | alternar tema |
| `Ctrl+S` | exportar backup JSON |
| `?` | lista completa |

Letras sozinhas só funcionam fora de campos de texto.

## Notas de uso

**Duas janelas de prazo.** Cada projeto tem a janela do PCP (início e fim do seu
trabalho de planejamento) e a data de entrega. O status do projeto vem da
entrega; o PCP tem indicador próprio.

**Cronograma encadeado.** Cada tarefa começa quando a anterior termina. Você
informa a duração em dias e as datas se calculam sozinhas — nunca são gravadas.
Duração `0` fecha a tarefa no mesmo dia da anterior, para quando você resolve
três coisas na mesma tarde.

**Paralisar antes de cancelar.** Um projeto só pode ser cancelado se estiver
paralisado. Enquanto parado, o cronograma congela: os dias de parada não contam
contra as tarefas. O tempo parado fica registrado e somado.

---

Desenvolvido por Guilherme dos Santos Braz — ROSTAG Soluções.
