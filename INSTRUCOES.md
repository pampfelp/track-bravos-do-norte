# Track Bravos do Norte — Como colocar no ar

Este pacote tem estes arquivos:
- `firebase-init.js` → liga o sistema ao seu banco de dados (Firestore)
- `index.html`, `style.css`, `app.js` → o app que você vai usar no navegador/celular
- `firestore.rules` → regras de segurança, cola no console do Firebase
- `Code.gs` → guarda as fotos de atividades/ensinamentos no seu Google Drive
- `planilha.html` → uma página separada pra você editar ou apagar dados direto, como se fosse uma planilha (veja o Passo 4 abaixo)
- `manifest.json`, `service-worker.js`, ícones (.png) → deixam o app instalável no celular e funcionando offline. **Precisam ficar na mesma pasta que o `index.html`** quando for hospedar — não são opcionais.

## Passo 1 — Criar o banco de dados (Firebase)

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e crie um projeto novo (gratuito).
2. Ative o **Firestore Database** (modo produção).
3. Em **Regras**, cole o conteúdo de `firestore.rules` e publique.
4. Registre um "app Web" nas configurações do projeto e copie a configuração (`firebaseConfig`).
5. Abra `firebase-init.js` num editor de texto simples e cole essa configuração no lugar dos valores de exemplo.

## Passo 2 — Guardar as fotos das atividades/ensinamentos

1. Crie uma planilha Google Sheets em branco.
2. **Extensões → Apps Script**, cole o conteúdo de `Code.gs`.
3. Rode a função `getUploadsFolder` uma vez (▶) e autorize.
4. **Implantar → Nova implantação → Aplicativo da Web** → Executar como "Eu" → Acesso "Qualquer pessoa" → Implantar. Copie a URL.
5. Cole essa URL no `app.js`, na constante `PHOTO_UPLOAD_URL` (bem no topo do arquivo).

Se pular esse passo, o app funciona igual — só não vai conseguir anexar fotos.

## Passo 3 — Colocar no ar

Este sistema **não funciona só abrindo o `index.html` no computador** (é
uma limitação de segurança do navegador). Ele precisa estar hospedado num
site com HTTPS. A forma mais simples e gratuita é o **GitHub Pages**:

1. Crie uma conta gratuita em [github.com](https://github.com), se ainda não tiver.
2. Crie um repositório novo.
3. Arraste todos os arquivos deste pacote pra dentro dele (soltos, sem pastas — não suba os arquivos `pdf_extract.txt` e `pdf_extract2.txt`, são só rascunho).
4. Nas configurações do repositório, ative o **GitHub Pages** apontando pra branch principal.
5. Em alguns minutos, o link aparece — abra ele no celular e toque em "Adicionar à tela inicial" pra instalar como app.

## Passo 4 — Editar dados direto, como numa planilha

Se você quiser corrigir um dado, apagar um registro de teste, ou colar uma
lista inteira de uma vez, **não precisa entrar no site do Firebase**. Abra
o link do seu site com `/planilha.html` no final (ex:
`https://seusite.github.io/planilha.html`). Essa página pede uma senha e
depois funciona como uma planilha: abas por tipo de dado, você edita a
célula e ela salva sozinha, seleciona várias linhas e apaga de uma vez, e
tem botões pra exportar em CSV/Excel ou importar um arquivo CSV/Excel de
uma vez.

**Senha combinada: `bravosdonorte1650`**. Guarde o link e a senha dessa
página em um lugar seguro — quem tiver os dois consegue editar ou apagar
qualquer dado do app.

## Sobre funcionar offline no mato

O app guarda tudo que você marcar/anotar direto no aparelho, mesmo sem
sinal — e sincroniza sozinho quando a internet voltar. A única coisa que
precisa de internet na hora é **enviar uma foto** (fica salva a atividade
ou o ensinamento mesmo assim, só sem a foto — você pode voltar lá depois e
adicionar quando tiver sinal, editando pela `planilha.html`).

## Sempre que atualizar o Code.gs

Depois de editar `Code.gs` no futuro, é preciso criar uma **nova
implantação** (ou "Gerenciar implantações → editar → nova versão") pra as
mudanças valerem.

## Estrutura de dados criada no Firestore

- **itens**: checklist da mochila (nome, categoria, se é obrigatório, se já foi marcado)
- **atividades**: o que foi feito em cada dia (título, dia, horário, se concluiu, foto opcional)
- **ensinamentos**: o que você anotou em cada dia (título, texto, quem ensinou, foto opcional)
