# ROSTAG PCP

Planejamento e Controle de Produção — controle de projetos e commessas.

Site estático hospedado no GitHub Pages, sem etapa de build. Os dados ficam
no Firebase (Firestore), compartilhados ao vivo entre os membros de cada
equipe, e o app pode ser instalado no PC e no celular (funciona offline).

## Como funciona o acesso

- **Login obrigatório.** Nada aparece sem entrar. Qualquer pessoa pode
  **criar uma conta** (e-mail e senha) na própria tela de acesso.
- **Equipes.** Cada equipe tem seus próprios projetos; uma conta pode estar
  em várias equipes e trocar entre elas pelo menu lateral. Cada pessoa pode
  **criar até 3 equipes**.
- **Cargos dentro da equipe** (detalhes em [`docs/ESPECIFICACAO.md`](docs/ESPECIFICACAO.md)):
  - **Gerente de PCP** — cria projetos, designa GP e técnico, vê tudo e
    administra a equipe (convites, cargos, remover). O **coordenador** (quem
    criou a equipe; a coordenação pode ser passada) é sempre Gerente de PCP
    e é o único que troca a senha da equipe.
  - **GP (gerente de projetos)** — vê só os projetos dele, cria projetos (vira
    o GP deles), designa o técnico e define o **cronograma macro** (PCP e
    produção).
  - **Técnico de processo** — recebe o projeto quando o cronograma é
    definido, marca o checklist do PCP e sobe a **planilha de OPs**.
  - **Programador de usinagem / de caldeiraria** — consulta as OPs da área
    dele na aba Fábrica.
  - **Controle de qualidade (CQ)** — finaliza cada OP: *Aprovada* ou *Com
    RNC* (com observação). Não desfaz.
- **Como alguém entra numa equipe:**
  - pelo **link de convite** (Configurações → Equipe), já com o cargo
    escolhido pelo Gerente de PCP; ou
  - pela aba **Entrar em equipe**, digitando o **nome + senha da equipe** —
    quem entra assim vira técnico de processo.
- Equipes criadas antes dos cargos novos são convertidas sozinhas quando o
  Gerente de PCP abre o app: coordenador → Gerente de PCP, planejador →
  técnico de processo, GP continua GP.

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
3. Abra [`js/dados/firebase.js`](js/dados/firebase.js) (dá pra editar direto
   pelo site do GitHub, no ícone de lápis) e cole os valores dentro de
   `FIREBASE_CONFIG`. Se o projeto não se chamar `rostag-pcp`, troque também o
   endereço `rostag-pcp.firebaseapp.com` na linha `Content-Security-Policy`
   do `index.html`. É normal e seguro esses valores ficarem públicos
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
7. Salve o `js/dados/firebase.js` com o `FIREBASE_CONFIG` preenchido e envie
   (`git add`, `git commit`, `git push`) — o GitHub Pages publica sozinho em
   cerca de 1 minuto.

Pronto: abra o link, crie sua conta e depois sua primeira equipe.

## Atualizar o site e as regras

Quando uma mudança mexe tanto no site quanto no `firestore.rules`, a ordem
importa:

1. Primeiro envie o site (`git push`) e espere o GitHub Pages publicar
   (cerca de 1 minuto).
2. Só depois cole o `firestore.rules` novo no console e publique.

Se as regras forem publicadas antes, quem ainda estiver com o site antigo
aberto pode ter ações recusadas até recarregar a página.

## Rodar localmente (sem publicar)

O JavaScript é dividido em módulos, que o navegador não carrega com o
arquivo aberto por dois cliques. Sirva a pasta com qualquer servidor local:

```bash
python -m http.server 5173
```

e abra `http://localhost:5173`. Atenção: a versão local usa o **mesmo banco**
do site publicado — o que você mexer ali vale de verdade.

### Modo de teste (banco de mentira)

Para testar sem tocar no banco real, suba os emuladores do Firebase num
terminal (precisa de Java, como nos testes das regras):

```bash
npx firebase emulators:start --only firestore,auth --project demo-rostag
```

e abra `http://localhost:5173/?emulador=1`. Contas, equipes e projetos criados
assim ficam só no emulador e somem quando ele é desligado. O modo de teste só
liga em `localhost` com `?emulador` na URL.

## Estrutura do código

```
index.html            marcação das telas (sem script inline)
css/app.css           estilos, tema claro e escuro
js/main.js            ponto de entrada: liga login, equipe e telas
js/nucleo/            preferências e formatação (datas, escape de HTML)
js/i18n/              textos em português (pt.js) e inglês (en.js)
js/dominio/           regras de negócio puras: cronograma, status, alertas
js/dados/             Firebase: conta e equipes (auth.js), projetos (store.js), OPs (ops.js)
js/ui/                uma tela ou componente por arquivo (fabrica.js: Fábrica, CQ e RNC)
vendor/               Chart.js e SheetJS (leitura de planilhas), servidos junto, sem CDN
docs/                 especificação do sistema integrado
sw.js                 service worker: abre o app instalado sem internet
firestore.rules       regras de segurança do banco
tests/                testes automáticos das regras de negócio
tests/regras/         testes do firestore.rules no emulador (npm run test:regras)
```

Alguns princípios que o código segue:

- **Nada de `onclick` no HTML.** Botões usam `data-acao="nome"` e o
  despachante em `js/ui/dom.js` chama a função registrada com
  `registrarAcoes()`. A página tem uma política de segurança (CSP) que
  bloqueia qualquer script inline — texto digitado nunca vira código.
- **Gravação por diferença.** `js/dados/store.js` envia só os projetos e os
  campos que mudaram e confirma cada gravação; se o servidor recusar, a tela
  volta para a última versão boa e avisa. Mudanças de colegas chegam ao vivo.
- **Todo texto passa por `T()`** (`js/i18n/`). Texto novo entra nos dois
  dicionários.
- **Datas são strings `AAAA-MM-DD` locais** — nunca `toISOString()`, que
  converte para UTC e pode mudar o dia.

## Testes e verificação

Precisa só do [Node.js](https://nodejs.org) (versão 20 ou mais nova):

```bash
npm test
```

roda os testes do cronograma, status, validação, migração de dados e da
gravação por diferença.

```bash
npm run check
```

confere que todo módulo compila, que todo botão tem uma ação registrada, que
não sobrou script inline e que o service worker lista todos os arquivos.
Rode os dois antes de cada `git push`.

### Testes das regras do Firestore

Testam o `firestore.rules` de verdade, num emulador local do Firestore (nada
vai para o banco real): o que cada um dos 6 cargos vê e pode mudar nos
projetos e nas OPs, o CQ finalizando uma vez só, convite de uso único que
vence em 7 dias, nome + senha sempre entrando como técnico, só o gerente
mudando cargos, notificações, perfil pessoal e o limite de 3 equipes.
Precisam de Java 21 (uma vez: `winget install Microsoft.OpenJDK.21`) e das
dependências de desenvolvimento (uma vez: `npm install`):

```bash
npm run test:regras
```

Rode sempre que mudar o `firestore.rules`, antes de publicar as regras.
Se o emulador parar com "Unable to establish loopback connection", aponte o
Java para outra pasta temporária antes de rodar, por exemplo no PowerShell:
`$env:JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=C:/temp"`. Ao adicionar um arquivo em `js/`,
inclua o caminho na lista `ARQUIVOS` do `sw.js` e troque a versão em `CACHE`.

## Atalhos

| | |
|---|---|
| `Esc` | volta / fecha o que estiver aberto |
| `Alt+1` `Alt+2` `Alt+3` | Painel, Projetos, Linha do Tempo |
| `Alt+4` `Alt+5` `Alt+6` | Fábrica, RNC, Notificações |
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
