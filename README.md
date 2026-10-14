# ROSTAG PCP

Planejamento e Controle de Produção — controle de projetos e commessas.

Site estático hospedado no GitHub Pages. Os dados ficam guardados no
Firebase (Firestore), compartilhados entre todo mundo que abrir o link.

## Como funciona o acesso

- **Login obrigatório.** Nada aparece sem entrar. Qualquer pessoa pode
  **criar uma conta** (e-mail e senha) na própria tela de acesso.
- **Equipes.** Cada equipe tem seus próprios projetos; uma conta pode estar
  em várias equipes e trocar entre elas pelo menu lateral. Cada pessoa pode
  **criar até 3 equipes**.
- **Papéis dentro da equipe:**
  - **Coordenador** — quem criou a equipe (o cargo pode ser transferido).
    Faz tudo o que o GP faz e ainda muda o cargo das pessoas, remove membros
    e troca a senha da equipe.
  - **GP** — cria, edita e apaga qualquer projeto da equipe e gera convites.
  - **Planejador** — só vê os projetos designados a ele e só marca o
    checklist das tarefas.
- **Como alguém entra numa equipe:**
  - pelo **link de convite** (Configurações → Equipe), já com o cargo do
    convite (GP ou planejador); ou
  - pela aba **Entrar em equipe**, digitando o **nome + senha da equipe** —
    quem entra assim vira planejador.

A trava de verdade fica nas regras do Firestore
([`firestore.rules`](firestore.rules)), não na tela: mesmo que alguém mexa no
código do navegador, o banco recusa o que o papel da pessoa não permite.

**Senha da equipe.** Nunca é guardada em texto puro: o app calcula um hash
(PBKDF2 com um "sal" aleatório por equipe) e esse hash fica num lugar que
nenhum usuário consegue ler — só as regras do Firestore comparam. Equipes
criadas antes dessa mudança usam um formato antigo; o coordenador vê um aviso
em **Configurações → Equipe** e basta **trocar a senha da equipe** ali para
migrar.

## Configurar o Firebase

O site sozinho não guarda nada até você conectar um projeto Firebase seu —
é rápido e o plano gratuito (Spark) é suficiente, sem cartão de crédito.

1. Acesse **[console.firebase.google.com](https://console.firebase.google.com)**
   com uma conta Google e clique em **Adicionar projeto**. Dê um nome (ex.:
   `rostag-pcp`) e pode desligar o Google Analytics — não é usado aqui.
2. Dentro do projeto, clique no ícone **`</>`** (Web) para registrar um app
   web. Dê um apelido qualquer e **não** marque "Firebase Hosting" (o site já
   está no GitHub Pages). Ao final, o Firebase mostra um bloco `firebaseConfig`
   — copie ele inteiro.
3. Abra `index.html` (aqui no repositório, dá pra editar direto pelo site do
   GitHub, no ícone de lápis) e cole os valores dentro de `FIREBASE_CONFIG`,
   perto do topo do arquivo. É normal e seguro esses valores ficarem públicos
   — a segurança do Firebase não depende de esconder essa chave, e sim das
   regras do Firestore e do login (próximos passos).
4. No menu lateral do console, **Build → Firestore Database → Criar banco de
   dados**. Escolha uma região (qualquer uma serve; `southamerica-east1` fica
   mais perto do Brasil) e comece em modo produção.
5. Ainda no Firestore, aba **Regras**, apague o conteúdo e cole o arquivo
   [`firestore.rules`](firestore.rules) deste repositório. Publique.
6. **Build → Authentication → Vamos começar → Método de login → E-mail/senha**
   → ative. Não precisa cadastrar ninguém à mão: cada pessoa cria a própria
   conta pela tela do app.
7. Salve o `index.html` com o `FIREBASE_CONFIG` preenchido e envie
   (`git add`, `git commit`, `git push`) — o GitHub Pages publica sozinho em
   cerca de 1 minuto.

Pronto: abra o link, crie sua conta e depois sua primeira equipe.

## Atualizar o site e as regras

Quando uma mudança mexe tanto no `index.html` quanto no `firestore.rules`,
a ordem importa:

1. Primeiro envie o `index.html` (`git push`) e espere o GitHub Pages
   publicar (cerca de 1 minuto).
2. Só depois cole o `firestore.rules` novo no console e publique.

Se as regras forem publicadas antes, quem ainda estiver com o site antigo
aberto pode ter ações recusadas até recarregar a página.

## Rodar localmente (sem publicar)

Basta abrir `index.html` com dois cliques — funciona igual ao site
publicado, contanto que o `FIREBASE_CONFIG` já esteja preenchido (senão
aparece um aviso de Firebase não configurado e não dá pra entrar).

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

**Tema e idioma são só seus.** Ficam salvos na sua conta (valem em todas as
suas equipes e em qualquer aparelho em que você entrar) — cada pessoa escolhe
os dela, isso não é compartilhado com a equipe.

**Backup.** O Firestore não tem versionamento automático aqui — exporte JSON
de vez em quando (Configurações → Dados do app) se quiser um ponto de
restauração fora do Firebase.

---

Desenvolvido por Guilherme dos Santos Braz — ROSTAG Soluções.
