# ROSTAG PCP

Planejamento e Controle de Produção — controle de projetos e commessas.

Site estático hospedado no GitHub Pages. Os dados ficam guardados no
Firebase (Firestore), compartilhados entre todo mundo que abrir o link.

## Dois modos

- **Visualização** — qualquer pessoa com o link abre o site e vê tudo:
  painel, projetos, linha do tempo. Não precisa de conta nem login.
- **Edição** — só quem faz login (Firebase Authentication) pode criar,
  editar, apagar ou reorganizar projetos. Sem login, qualquer tentativa de
  editar abre a tela de login; se você tentar mesmo assim, o **Firestore
  recusa a gravação** — a trava de verdade é lá, não na tela.

Para logar, use o botão **🔓 Entrar** no rodapé do menu.

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
   → ative.
7. Ainda em Authentication, aba **Users → Add user**: cadastre o e-mail e a
   senha que você vai usar para editar o site. Esse é o único login que existe
   — não tem cadastro público.
8. Salve o `index.html` com o `FIREBASE_CONFIG` preenchido e envie
   (`git add`, `git commit`, `git push`) — o GitHub Pages publica sozinho em
   cerca de 1 minuto.

Pronto: qualquer um que abrir o link já vê os dados; só quem logar com o
e-mail cadastrado no passo 7 edita.

## Rodar localmente (sem publicar)

Basta abrir `index.html` com dois cliques — funciona igual, contanto que o
`FIREBASE_CONFIG` já esteja preenchido (senão fica só no modo visualização,
com um aviso na tela).

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

**Tema e idioma são só seus.** Ficam salvos no `localStorage` do seu
navegador — cada visitante escolhe o dele, isso não é compartilhado.

**Backup.** O Firestore não tem versionamento automático aqui — exporte JSON
de vez em quando (Configurações → Dados do app) se quiser um ponto de
restauração fora do Firebase.

---

Desenvolvido por Guilherme dos Santos Braz — ROSTAG Soluções.
