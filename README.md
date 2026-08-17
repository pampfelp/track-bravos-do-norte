# Track Bravos do Norte

App pessoal para o TOP 1650 (10 a 13/09) do Legendários Bravos do Norte:
checklist da mochila, registro de atividades por dia, anotação de
ensinamentos e um painel com as métricas do retiro.

Frontend estático (HTML/CSS/JS puro, sem framework) hospedado no GitHub
Pages, com **Cloud Firestore** (Firebase) como banco de dados em tempo real
e **Google Drive** (via um Apps Script mínimo) guardando as fotos anexadas
às atividades e ensinamentos.

Funciona **offline**: o Firestore guarda tudo localmente no aparelho
(IndexedDB) e sincroniza sozinho assim que a internet voltar — pensado pra
usar durante a trilha, sem sinal.

## 1. Criar o projeto Firebase

1. Acesse o [console do Firebase](https://console.firebase.google.com) e crie um projeto novo (gratuito, plano Spark).
2. Ative o **Firestore**: menu lateral → "Bancos de dados e armazenamento" → **Firestore** → **Criar banco de dados** → escolha uma região → **modo de produção**.
   - Não precisa ativar o Storage — as fotos vão pro Google Drive, não pro Firebase.
3. Publique as regras de segurança: **Firestore Database → Regras** → apague o conteúdo → cole o de [`firestore.rules`](firestore.rules) → **Publicar**.
4. Registre um app Web: ícone de engrenagem → **Configurações do projeto** → role até "Seus apps" → ícone `</>` (Web) → dê um nome → **não** marque Firebase Hosting → **Registrar app**. Copie o bloco `firebaseConfig = {...}`.
5. Abra [`firebase-init.js`](firebase-init.js) e substitua os valores de `firebaseConfig` pelos que você copiou.

Essas chaves (`apiKey`, `projectId` etc.) são **públicas por design** no Firebase Web — pode subir pro GitHub sem problema. A segurança de verdade vem das regras do Firestore (passo 3).

## 2. Configurar o Apps Script (upload de fotos)

1. Crie uma planilha Google Sheets em branco (só serve de "casa" pro script).
2. Menu **Extensões → Apps Script**.
3. Apague o código atual e cole o conteúdo de [`Code.gs`](Code.gs).
4. Rode a função `getUploadsFolder` uma vez direto no editor (▶) pra autorizar o acesso ao Google Drive.
5. **Implantar → Nova implantação** → tipo "Aplicativo da Web" → Executar como "Eu" → Quem pode acessar "Qualquer pessoa" → **Implantar**. Copie a URL `.../exec`.
6. Abra [`app.js`](app.js) e cole essa URL na constante `PHOTO_UPLOAD_URL` (primeira linha depois dos imports).

Se você não fizer esse passo, o app funciona normalmente — só não consegue anexar fotos às atividades/ensinamentos (aparece um aviso, mas o texto é salvo do mesmo jeito).

## 3. Planilha administrativa

Este projeto inclui [`planilha.html`](planilha.html) — uma página que
funciona como uma planilha (abas, células editáveis, exportar/importar
CSV/XLSX) por cima do banco de dados, pra editar ou apagar registros sem
precisar entrar no console do Firebase. Ela é protegida por uma senha
simples (só um cadeado contra acesso acidental, não segurança de verdade —
veja o aviso dentro da própria página).

**Senha combinada ao criar o app: `bravosdonorte1650`** — troque quando quiser
(peça pra gerar um novo hash e substituir a constante `SENHA_HASH` no
arquivo). **Não há link pra ela em nenhum menu do app** — o acesso é direto
pela URL `.../planilha.html` da sua hospedagem. Guarde o link e a senha em
lugar seguro.

## 4. Rodar o app

O app é 100% estático — todos os arquivos ficam juntos, sem subpastas
(`index.html`, `style.css`, `app.js`, `firebase-init.js`, `planilha.html`,
`manifest.json`, `service-worker.js`, `Code.gs`, os ícones .png). Isso é
proposital: uploads pela interface web do GitHub não preservam pastas ao
arrastar arquivos soltos.

- **Não abra `index.html` direto do disco (duplo clique) para testar** —
  módulos ES são bloqueados por CORS no protocolo `file://`. Use um
  servidor local (`python -m http.server` / `npx serve`) ou teste direto na
  hospedagem.
- Suba a pasta em qualquer hospedagem estática com HTTPS (GitHub Pages,
  Netlify, Vercel) pra usar de verdade e pro "Instalar app" funcionar.

### Publicar no GitHub Pages (passo a passo)

1. Crie uma conta gratuita em [github.com](https://github.com), se ainda não tiver.
2. Crie um repositório novo (pode ser privado).
3. Arraste todos os arquivos deste pacote pra dentro dele (soltos, sem pastas) — **exceto** `pdf_extract.txt`/`pdf_extract2.txt`, que são só rascunho.
4. Nas configurações do repositório → **Pages**, ative apontando pra branch principal, pasta raiz (`/`).
5. Em alguns minutos, o link aparece (`https://seu-usuario.github.io/nome-do-repo/`) — é esse link que você vai usar e instalar no celular ("Adicionar à tela inicial").

## Estrutura de dados no Firestore

- **itens/{id}**: `nome`, `categoria`, `obrigatorio` (bool), `marcado` (bool), `createdAt`. Checklist da mochila — carregado automaticamente com a lista do TOP 1650 na primeira vez que o app abre sem nenhum item salvo.
- **atividades/{id}**: `titulo`, `dia` (1 a 4), `horario` (opcional), `concluida` (bool), `fotos` (array opcional de `{url, fileId}`, uma ou mais fotos), `createdAt`.
- **ensinamentos/{id}**: `titulo`, `texto`, `dia` (1 a 4), `quem` (opcional), `fotos` (array opcional de `{url, fileId}`, uma ou mais fotos), `createdAt`.

O Painel não tem coleção própria — as métricas são calculadas na hora, em cima dessas três.

## Observações

- **Sem servidor "oficial" e sem login**: é um app de uso pessoal, então não há Firebase Auth — as regras do Firestore validam só o formato dos dados, não quem está escrevendo. Trade-off aceitável pra um app pessoal sem dado sensível.
- **Tempo real**: qualquer mudança feita em um aparelho (ex: celular na trilha) aparece nos outros (ex: notebook em casa) quase na hora, assim que ambos tiverem internet.
- **As datas do TOP 1650 (10 a 13/09) estão fixas no `app.js`** (constante `DIAS`) — se o retiro mudar de data no futuro, é só editar essa lista.
