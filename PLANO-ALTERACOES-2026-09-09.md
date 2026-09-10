# Plano de alterações — Track Bravos do Norte

Data: 09/09/2026
Para: desenvolvedor que vai implementar
Repositório: https://github.com/pampfelp/track-bravos-do-norte (branch `main`)
Site publicado: https://pampfelp.github.io/track-bravos-do-norte/

Este plano cobre sete mudanças pedidas pelo Felipe mais os ajustes que elas
obrigam. Cada parte diz qual arquivo mexer, o que tirar, o que pôr e o que
testar. As partes 1 e 2 vêm primeiro porque as outras dependem delas.

---

## Contexto da stack (leia antes)

- Frontend puro, sem build. `index.html` carrega `style.css` e `app.js`
  (que é `type="module"` e importa `firebase-init.js`). Não existe npm nem
  bundler. Para editar, é só abrir os arquivos.
- Banco: Cloud Firestore, falado direto do navegador via SDK do CDN
  (`gstatic.com`). Três coleções: `itens` (checklist), `atividades`,
  `ensinamentos`. Sem Cloud Functions. Sem Firebase Auth (app pessoal).
- Tempo real: um `onSnapshot` por coleção, aberto no boot em
  `iniciarListeners()`. Toda mudança de dado dispara a re-renderização da
  view inteira. Não faça merge incremental por `docChanges`, reprocessa a
  coleção toda mesmo (é barato nessa escala e menos sujeito a erro).
- `STATE` é um objeto global. Cada mudança de estado chama uma função
  `renderX()` na mão. Não tem framework reativo.
- Fotos: hoje o `app.js` usa **Firebase Storage** (`enviarFoto` com
  `uploadString`). Isso é diferente do que o `Code.gs` (Apps Script pro
  Drive) documenta, e o `Code.gs` virou código morto. Ver a seção "Pontos
  fora deste plano" no fim. Para este plano, mantenha o Storage como está.
- HTML gerado por `template string` + `innerHTML`. Todo dado de usuário
  passa por `esc()` antes de entrar na string. Mantenha isso em todo
  trecho novo.

### Versionamento de assets (`?v=`)

Não tem build, então o navegador serve o arquivo antigo do cache sem avisar
depois de uma mudança. Regra do projeto: todo `<link href>` e
`<script src>` local leva `?v=` no fim, e esse número sobe a cada entrega.

Hoje está tudo em `?v=1`:
- `index.html`: `style.css?v=1` e `app.js?v=1`
- `app.js` linha 10: `import { db, storage } from "./firebase-init.js?v=1"`

Ao terminar, troque **os três** para o mesmo valor novo (ex.: `?v=2`).
Nunca troque um e esqueça o outro: se `index.html` pede `app.js?v=2` mas
`app.js` continua importando `firebase-init.js?v=1`, o navegador carrega o
módulo de inicialização duas vezes e o `initializeFirestore` roda em dobro
(foi exatamente o bug do commit `db1090b`).

Suba também o `CACHE_NAME` do `service-worker.js` (`tbn-v1` → `tbn-v2`).

### Regras do Firestore

**Nenhuma mudança em `firestore.rules` é necessária.** Todos os campos novos
deste plano (`observacoes`, `horario` no formato novo, `dia` em ensinamentos)
são opcionais e as regras de `update` só checam o tipo de `titulo` e de
`concluida`/`texto`, que continuam presentes. As regras de `create` usam
`hasAll` (não `hasOnly`), então campo extra passa. O Felipe não precisa
publicar nada no console para essa parte.

### Padrão de interface da casa (as regras que importam aqui)

1. Nada de formulário fixo na tela. "+ Adicionar" abre modal.
2. O card/linha de um registro que já existe **abre visualizando**. Editar
   é uma ação explícita atrás de um ícone de lápis, dentro do modal.
3. Ação de uso frequente (marcar item do checklist como levado) fica
   **fora** do modal, direto na linha.
4. No computador o modal é central. No celular ele ocupa a tela inteira
   (formulário comprido rende mais com a tela toda). A exceção é o diálogo
   de confirmação, que fica pequeno e centralizado nos dois tamanhos.
5. Toda tela que lista coisas mostra um KPI próprio no topo.
6. Ícone é SVG de linha fina (estilo feather), nunca emoji. O app já tem
   alguns SVG (a sidebar) e ainda tem muito emoji no resto. Nos trechos
   novos, use SVG. Kit sugerido na Parte 9.
7. Clicar numa linha expande/abre; clicar no lápis ou na lixeira **não**
   pode também disparar o "abrir". Sempre checar
   `e.target.closest('input, button')` antes de tratar o clique da linha.

---

## Parte 1 — Separar o diálogo de confirmação do modal genérico

**Por que primeiro:** hoje `confirmar()` (em `app.js`, linha ~163) reaproveita
o mesmo `#modal-overlay` que os "+ Adicionar" usam, chamando `abrirModal()`.
Enquanto o botão de excluir mora na linha da lista, isso funciona. A partir
da Parte 3, o botão de excluir vai morar **dentro** de um modal aberto.
Se `confirmar()` chamar `abrirModal()` nesse momento, ele sobrescreve o
conteúdo do modal que está aberto e o registro em edição some.

A mesma coisa vale para a foto ampliada (`abrirModal("Foto", <img>)`).

**O que fazer:**

### 1.1 `index.html`

Depois do bloco `<div class="modal-overlay" id="modal-overlay">` e antes do
`<div class="toast" ...>`, adicione dois elementos próprios:

```html
<!-- confirmação: sempre por cima do modal genérico, sempre compacto -->
<div class="confirm-overlay hidden" id="confirm-overlay">
  <div class="confirm-caixa">
    <div class="confirm-msg" id="confirm-msg"></div>
    <div class="confirm-acoes">
      <button type="button" class="btn" id="confirm-cancelar">Cancelar</button>
      <button type="button" class="btn btn-primary" id="confirm-ok">Confirmar</button>
    </div>
  </div>
</div>

<!-- foto ampliada -->
<div class="lightbox hidden" id="lightbox">
  <img id="lightbox-img" alt="Foto ampliada">
</div>
```

### 1.2 `style.css`

Escala de z-index do projeto passa a ser: toast 900 > confirmação 850 >
foto ampliada 800 > modal genérico 500 > sidebar mobile 130.

```css
.confirm-overlay{position:fixed;inset:0;background:rgba(20,10,35,.55);
  display:flex;align-items:center;justify-content:center;z-index:850;padding:20px;}
.confirm-overlay.hidden{display:none!important;}
.confirm-caixa{background:var(--panel);border-radius:var(--radius);padding:22px;
  max-width:380px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,.28);}
.confirm-msg{font-size:14px;color:var(--ink);margin-bottom:18px;line-height:1.5;}
.confirm-acoes{display:flex;justify-content:flex-end;gap:8px;}

.lightbox{position:fixed;inset:0;background:rgba(10,5,20,.88);
  display:flex;align-items:center;justify-content:center;z-index:800;padding:24px;cursor:zoom-out;}
.lightbox.hidden{display:none!important;}
.lightbox img{max-width:100%;max-height:100%;border-radius:10px;}
```

O `.confirm-caixa` **não** vira tela cheia no celular (é a exceção da
Parte 2). Fica sempre pequeno e centralizado.

### 1.3 `app.js`

Reescreva `confirmar()` para usar o `#confirm-overlay` em vez de
`abrirModal()`:

```js
function confirmar(msg) {
  return new Promise((resolve) => {
    const ov = document.getElementById("confirm-overlay");
    document.getElementById("confirm-msg").textContent = msg;
    ov.classList.remove("hidden");

    const limpar = () => {
      ov.classList.add("hidden");
      okBtn.removeEventListener("click", aoOk);
      cancelBtn.removeEventListener("click", aoCancelar);
      document.removeEventListener("keydown", aoEsc);
    };
    const aoOk = () => { limpar(); resolve(true); };
    const aoCancelar = () => { limpar(); resolve(false); };
    const aoEsc = (e) => { if (e.key === "Escape") { e.stopPropagation(); limpar(); resolve(false); } };

    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancelar");
    okBtn.addEventListener("click", aoOk);
    cancelBtn.addEventListener("click", aoCancelar);
    document.addEventListener("keydown", aoEsc);
    ov.onclick = (e) => { if (e.target === ov) aoCancelar(); };
  });
}
```

Apague o `resolveConfirmacaoAtual` e o trecho dentro de `fecharModal()` que
resolvia essa promise (não é mais responsabilidade do modal genérico).

Crie um helper de foto ampliada e troque as duas chamadas
`abrirModal("Foto", ...)` (dentro de `renderAtividades` e `renderEnsinamentos`)
por ele:

```js
function abrirLightbox(url) {
  document.getElementById("lightbox-img").src = url;
  document.getElementById("lightbox").classList.remove("hidden");
}
document.getElementById("lightbox").addEventListener("click", () => {
  document.getElementById("lightbox").classList.add("hidden");
  document.getElementById("lightbox-img").src = "";
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.getElementById("lightbox").classList.add("hidden");
});
```

Ajuste o handler global de `Escape` que hoje só fecha o `#modal-overlay`:
ele deve fechar **o de cima primeiro** (lightbox, depois confirmação,
depois modal). Ordem simples: no `keydown`, se o lightbox não estiver
`hidden`, fecha só ele e `return`; senão se confirmação aberta, o handler
dela já trata; senão fecha o modal.

**Testar:** abrir "+ Adicionar item", apertar Esc, fecha. Abrir um item
(Parte 3), clicar na lixeira, aparece a confirmação por cima, cancelar
volta pro modal do item com o conteúdo intacto. Abrir foto ampliada de
uma atividade, Esc fecha só a foto.

---

## Parte 2 — Modal em tela cheia no celular

Hoje `.modal-caixa` é sempre um cartão de 520px centralizado. No celular,
um formulário com dia, título, horário, observação e fotos fica apertado.

**`style.css`**, dentro do `@media(max-width:900px)` que já existe (é o
mesmo ponto de corte onde a sidebar vira drawer):

```css
@media(max-width:900px){
  .modal-overlay{padding:0;align-items:stretch;}
  .modal-caixa{max-width:none;width:100%;max-height:none;height:100dvh;
    border-radius:0;display:flex;flex-direction:column;padding:0;}
  .modal-topo{padding:16px 18px;border-bottom:1px solid var(--line);margin-bottom:0;
    position:sticky;top:0;background:var(--panel);z-index:1;}
  #modal-corpo{flex:1;overflow-y:auto;padding:18px;}
  .modal-acoes{position:sticky;bottom:0;background:var(--panel);
    border-top:1px solid var(--line);padding:14px 18px;margin:0;}
}
```

Você vai precisar mover `.modal-acoes` para fora do `#modal-corpo` no HTML
gerado, ou dar a ela `position:sticky` funcionando dentro do scroll. O mais
simples: manter `.modal-acoes` como último filho de cada `<form>` e deixar
o `#modal-corpo` inteiro rolar. `position:sticky;bottom:0` no
`.modal-acoes` já resolve sem reestruturar.

Confirme que `100dvh` cobre o caso do teclado do celular abrindo (usar
`dvh`, não `vh`, evita o form ficar cortado atrás do teclado).

O `.confirm-caixa` e o `.lightbox` **não** entram nessa regra. Confirmação
continua cartão pequeno; foto continua com fundo escuro cobrindo tudo.

**Testar no celular:** abrir cada um dos "+ Adicionar", ver o form ocupando
a tela, o botão de salvar fixo embaixo, o topo com título e X fixo em cima,
o meio rolando.

---

## Parte 3 — Checklist: linha clicável abre um modal

Pedido do Felipe: as linhas do checklist devem funcionar como as "regras
que regem o segundo cérebro", que é a regra 2 do padrão de interface acima
(o registro abre visualizando, o lápis libera edição). Motivo concreto:
item com nome longo empurra os botões de editar e excluir pra fora da tela
(dá pra ver nos prints). Movendo editar e excluir pra dentro de um modal,
a linha só precisa de caixa de marcar, nome e uma seta.

O checkbox de "levei esse item" **continua na linha**, fora do modal (é a
ação de uso frequente).

### 3.1 `renderLinhaItem(it)` em `app.js`

Apague o branch de edição inline inteiro (o `if (STATE.itemEditandoId === it.id)`).
A edição não acontece mais na linha.

A linha nova:

```js
function renderLinhaItem(it) {
  return `
    <div class="item-linha ${it.marcado ? "marcado" : ""} linha-clicavel" data-id="${it.id}" data-acao="abrir">
      <input type="checkbox" class="item-checkbox" data-id="${it.id}" ${it.marcado ? "checked" : ""}>
      <span class="item-nome">${esc(it.nome)}</span>
      ${it.obrigatorio ? '<span class="badge-obrigatorio">obrigatório</span>' : ""}
      <span class="ico-chevron">${SVG.chevronRight}</span>
    </div>
  `;
}
```

`SVG.chevronRight` vem do kit da Parte 9. Estilo: `.ico-chevron{color:var(--ink-faint);flex:none;}`
e no `.item-linha` deixe `cursor:pointer` (a classe `linha-clicavel` já faz isso).

### 3.2 Handlers em `renderChecklist()`

Tire os handlers de `.btn-icone[data-acao='editar']`, `.btn-cancelar-item`
e `.btn-salvar-item` (sumiram da linha). O handler do `.item-checkbox`
continua igual. Adicione:

```js
document.querySelectorAll("#checklist-categorias .item-linha[data-acao='abrir']").forEach((linha) => {
  linha.addEventListener("click", (e) => {
    if (e.target.closest("input, button")) return; // clicou no checkbox
    const it = STATE.itens.find((x) => x.id === linha.dataset.id);
    if (it) abrirModalItem(it);
  });
});
```

Pode remover `STATE.itemEditandoId` do `STATE` (não é mais usado).

### 3.3 Nova função `abrirModalItem(it)`

Abre o modal genérico em modo visualização. Dentro dele, lápis entra em
edição, lixeira confirma e exclui.

```js
function abrirModalItem(it) {
  abrirModal("Item da mochila", modalItemView(it));
  ligarAcoesModalItem(it);
}

function modalItemView(it) {
  return `
    <div class="modal-view">
      <div class="mv-linha"><span class="mv-rotulo">Item</span><span class="mv-valor">${esc(it.nome)}</span></div>
      <div class="mv-linha"><span class="mv-rotulo">Categoria</span>
        <span class="mv-valor">${CATEGORIA_ICONE_SVG[it.categoria] || ""} ${esc(it.categoria || "Outros artigos úteis")}</span></div>
      <div class="mv-linha"><span class="mv-rotulo">Tipo</span>
        <span class="mv-valor">${it.obrigatorio ? "Obrigatório" : "Opcional"}</span></div>
      <div class="mv-linha"><span class="mv-rotulo">Status</span>
        <span class="mv-valor">${it.marcado ? "Já está na mochila" : "Ainda falta"}</span></div>
    </div>
    <div class="modal-acoes">
      <button type="button" class="btn btn-icone-txt" id="mv-excluir">${SVG.trash} Excluir</button>
      <button type="button" class="btn btn-primary btn-icone-txt" id="mv-editar">${SVG.pencil} Editar</button>
    </div>
  `;
}

function modalItemEdit(it) {
  return `
    <form class="modal-form" id="form-editar-item">
      <label class="mv-rotulo">Nome</label>
      <input type="text" id="edit-item-nome" value="${esc(it.nome)}" maxlength="150" required>
      <label class="mv-rotulo">Categoria</label>
      <select id="edit-item-categoria">${opcoesCategorias(it.categoria)}</select>
      <label class="check-inline"><input type="checkbox" id="edit-item-obrigatorio" ${it.obrigatorio ? "checked" : ""}> Item obrigatório</label>
      <div class="modal-acoes">
        <button type="button" class="btn" id="edit-item-cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>
  `;
}

function ligarAcoesModalItem(it) {
  document.getElementById("mv-editar").addEventListener("click", () => {
    document.getElementById("modal-corpo").innerHTML = modalItemEdit(it);
    document.getElementById("edit-item-cancelar").addEventListener("click", () => {
      document.getElementById("modal-corpo").innerHTML = modalItemView(it);
      ligarAcoesModalItem(it);
    });
    document.getElementById("form-editar-item").addEventListener("submit", async (e) => {
      e.preventDefault();
      const nome = document.getElementById("edit-item-nome").value.trim();
      if (!nome) { mostrarErro("O nome não pode ficar vazio."); return; }
      const categoria = document.getElementById("edit-item-categoria").value;
      const obrigatorio = document.getElementById("edit-item-obrigatorio").checked;
      try {
        await updateDoc(doc(db, "itens", it.id), { nome, categoria, obrigatorio });
        fecharModal();
      } catch (err) { mostrarErro("Não foi possível salvar: " + err.message); }
    });
  });
  document.getElementById("mv-excluir").addEventListener("click", async () => {
    if (!(await confirmar("Excluir este item da lista?"))) return;
    try {
      await deleteDoc(doc(db, "itens", it.id));
      fecharModal();
    } catch (err) { mostrarErro("Não foi possível excluir: " + err.message); }
  });
}
```

Observações:
- `updateDoc` em `itens` precisa que o documento resultante ainda tenha
  `nome` (string, < 200) e `marcado` (bool). Como só mexemos em
  `nome`/`categoria`/`obrigatorio`, `marcado` continua lá e a regra passa.
- `CATEGORIA_ICONE_SVG` é opcional. Se não quiser desenhar oito ícones de
  categoria agora, mostre só o texto da categoria e deixe o mapa de emoji
  (`CATEGORIA_ICONE`) só onde ele já aparece hoje, ou tire o emoji também
  (ver Parte 9).

### 3.4 CSS de apoio

```css
.modal-view{display:flex;flex-direction:column;gap:2px;margin-bottom:8px;}
.mv-linha{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--line);}
.mv-linha:last-child{border-bottom:none;}
.mv-rotulo{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-faint);font-weight:700;flex:none;}
.mv-valor{font-size:13.5px;color:var(--ink);text-align:right;font-weight:600;}
.btn-icone-txt{display:inline-flex;align-items:center;gap:6px;}
.btn-icone-txt svg{width:15px;height:15px;}
```

**Testar:** clicar numa linha de item longo abre o modal com o nome
inteiro legível. Lápis troca pros campos, cancelar volta pra visualização
sem fechar. Salvar fecha e a lista atualiza. Lixeira pede confirmação por
cima, confirmar exclui. O checkbox da linha continua marcando sem abrir
o modal.

---

## Parte 4 — Atividades: uma lista só, agrupada por dia

Tirar as abas de dia. A tela vira uma lista contínua com um cabeçalho por
dia, e cada atividade aparece embaixo do dia dela. Ao adicionar uma
atividade, ela cai no grupo do dia escolhido no formulário.

### 4.1 `index.html`

Na `<section id="view-atividades">`:
- Apague `<div class="abas-dias" id="atividades-abas-dias"></div>`.
- Antes de `<div id="atividades-lista">`, adicione a faixa de KPI:
  `<div class="grid-kpi" id="atividades-kpi"></div>`

### 4.2 `app.js`

Apague `renderAbasDiasAtividades()` e a chamada dela no boot.

Tire de `STATE`: `diaAtivoAtividades`. Adicione nada (o dia agora vem do
formulário e do agrupamento).

`renderAtividades()` reescrito:

```js
function renderAtividades() {
  // KPI (sempre sobre o total real, sem filtro)
  const total = STATE.atividades.length;
  const feitas = STATE.atividades.filter((a) => a.concluida).length;
  const comFoto = STATE.atividades.filter((a) => a.fotos && a.fotos.length).length;
  const diasComReg = new Set(STATE.atividades.map((a) => a.dia)).size;
  document.getElementById("atividades-kpi").innerHTML = kpiCard([
    ["Total", total], ["Concluídas", feitas], ["Com foto", comFoto], ["Dias com registro", `${diasComReg}/4`]
  ]);

  // lista agrupada
  const alvo = document.getElementById("atividades-lista");
  if (!total) {
    alvo.innerHTML = `<div class="cartao vazio">Nenhuma atividade registrada ainda. Toque em "+ Adicionar atividade".</div>`;
    return;
  }
  const diasComAtividade = DIAS.filter((d) => STATE.atividades.some((a) => a.dia === d.numero));
  alvo.innerHTML = diasComAtividade.map((d) => {
    const doDia = STATE.atividades
      .filter((a) => a.dia === d.numero)
      .sort((a, b) => ordenarPorHorario(a, b));
    return `
      <div class="grupo-dia">
        <div class="grupo-dia-titulo">${esc(d.label)} <span class="grupo-dia-contagem">${doDia.length}</span></div>
        <div class="cartoes">${doDia.map(renderCartaoAtividade).join("")}</div>
      </div>
    `;
  }).join("");

  ligarHandlersAtividades(); // o que hoje está solto no fim de renderAtividades
}

function ordenarPorHorario(a, b) {
  const ha = a.horario || "99h99";
  const hb = b.horario || "99h99";
  if (ha !== hb) return ha < hb ? -1 : 1;
  // desempata por ordem de criação
  const ta = a.createdAt?.toMillis?.() || 0;
  const tb = b.createdAt?.toMillis?.() || 0;
  return ta - tb;
}
```

`kpiCard` é um helper novo, reusado em Atividades e Ensinamentos:

```js
function kpiCard(pares) {
  return pares.map(([rotulo, valor]) => `
    <div class="kpi"><div class="kpi-valor">${esc(String(valor))}</div><div class="kpi-rotulo">${esc(rotulo)}</div></div>
  `).join("");
}
```

CSS:

```css
.grid-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px;}
.kpi{background:var(--panel);border:1.5px solid var(--line);border-radius:12px;padding:12px 14px;}
.kpi-valor{font-family:var(--display);font-weight:800;font-size:20px;color:var(--roxo);}
.kpi-rotulo{font-size:11px;color:var(--ink-soft);font-weight:700;margin-top:2px;}
@media(max-width:560px){ .grid-kpi{grid-template-columns:1fr 1fr;} }

.grupo-dia{margin-bottom:22px;}
.grupo-dia-titulo{font-family:var(--display);font-weight:800;font-size:15px;color:var(--ink);
  margin-bottom:10px;display:flex;align-items:center;gap:8px;}
.grupo-dia-contagem{font-size:11px;font-weight:700;color:var(--ink-faint);
  background:var(--accent-soft);padding:2px 8px;border-radius:99px;}
```

### 4.3 Modal de "+ Adicionar atividade" ganha seletor de dia

O botão não sabe mais qual dia é o "ativo". Ponha um `<select>` de dia no
formulário, pré-selecionando o dia de hoje se hoje estiver dentro do
retiro (10 a 13/09), senão Dia 1.

```js
function diaPadrao() {
  const hoje = new Date();
  const mapa = { "9-10": 1, "9-11": 2, "9-12": 3, "9-13": 4 }; // mês 9 = setembro (0-index: 8)
  const chave = (hoje.getMonth() + 1) + "-" + hoje.getDate();
  return mapa[chave] || 1;
}
```

No corpo do modal (troque o form atual):

```html
<form class="modal-form" id="form-nova-atividade">
  <label class="mv-rotulo">Dia *</label>
  <select id="input-atividade-dia">${DIAS.map((d) => `<option value="${d.numero}" ${d.numero === diaPadrao() ? "selected" : ""}>${esc(d.label)}</option>`).join("")}</select>

  <label class="mv-rotulo">Nome da atividade *</label>
  <input type="text" id="input-atividade-titulo" maxlength="200" required>

  <label class="mv-rotulo">Horário</label>
  ${selectHorario("input-atividade-horario", null)}   <!-- Parte 5 -->

  <label class="mv-rotulo">Observações</label>
  <textarea id="input-atividade-obs" maxlength="2000" rows="3" placeholder="Anotação livre sobre a atividade"></textarea>

  <label class="mv-rotulo">Fotos</label>
  ${seletorFotos("atividade")}   <!-- Parte 7 -->

  <div class="modal-acoes"><button type="submit" class="btn btn-primary">Registrar</button></div>
</form>
```

`submitNovaAtividade` lê o dia do `<select>`, não mais de `STATE`:

```js
const dia = Number(document.getElementById("input-atividade-dia").value);
const dados = { titulo, dia, concluida: false, createdAt: serverTimestamp() };
const horario = document.getElementById("input-atividade-horario").value;
if (horario) dados.horario = horario;
const obs = document.getElementById("input-atividade-obs").value.trim();
if (obs) dados.observacoes = obs;
// fotos: igual ao fluxo atual (enviarFotos + dados.fotos)
```

Campo obrigatório: **Dia** e **Nome** levam `*` no rótulo e são validados
antes de salvar (o `required` do HTML já cobre o Nome; o Dia sempre tem
valor). Se o Felipe quiser outros campos obrigatórios, confirmar com ele.

**Testar:** adicionar três atividades em dias diferentes, ver os três
grupos aparecerem na ordem dos dias, cada atividade no grupo certo,
ordenadas por horário. KPI batendo com o total.

---

## Parte 5 — Horário como menu suspenso de hora em hora (6h às 23h)

O Felipe pediu dropdown, não texto livre. Isso diverge da preferência
geral dele de usar um campo único `datetime-local`, mas aqui o dia já é
escolhido à parte e a hora cheia basta pro retiro. Divergência combinada,
está ok.

### 5.1 Helper em `app.js`

```js
const HORARIOS = Array.from({ length: 18 }, (_, i) => `${String(i + 6).padStart(2, "0")}h00`); // "06h00" ... "23h00"

function selectHorario(id, valorAtual) {
  const opcoes = [`<option value="">Sem horário</option>`];
  // se o valor salvo não está na lista (dado antigo em texto livre), mantém como opção
  if (valorAtual && !HORARIOS.includes(valorAtual)) {
    opcoes.push(`<option value="${esc(valorAtual)}" selected>${esc(valorAtual)} (formato antigo)</option>`);
  }
  HORARIOS.forEach((h) => {
    opcoes.push(`<option value="${h}" ${h === valorAtual ? "selected" : ""}>${h}</option>`);
  });
  return `<select id="${id}">${opcoes.join("")}</select>`;
}
```

O trecho do "formato antigo" é obrigatório. Sem ele, abrir para editar uma
atividade cujo `horario` foi digitado à mão antes (ex.: "8h", "manhã")
perde a seleção em silêncio, e salvar grava vazio por cima. Isso é um erro
que já aconteceu em outro projeto do Felipe (dropdown sem a opção do valor
salvo).

### 5.2 Onde usar

- No modal de "+ Adicionar atividade" (Parte 4): `selectHorario("input-atividade-horario", null)`.
- No modo edição de atividade (Parte 8 fala do modal de edição): `selectHorario("edit-atividade-horario", a.horario)`.
- Se o Felipe confirmar horário em ensinamentos também, mesma coisa lá.

Opcional e bem-vindo: no formulário de criação, pré-selecionar a hora atual
arredondada (`${String(Math.min(23, Math.max(6, new Date().getHours()))).padStart(2,"0")}h00`),
já que o Felipe gosta de campo de hora vindo preenchido com "agora". Deixe
"Sem horário" como opção, não como padrão.

---

## Parte 6 — Campo de observações na atividade

Campo `observacoes` (string, opcional, `maxlength` 2000).

- **Criar:** textarea no modal de "+ Adicionar atividade" (já está no HTML
  da Parte 4). Só grava `dados.observacoes` se não estiver vazio.
- **Editar:** textarea no modal de edição da atividade.
- **Mostrar:** no modal de detalhe da atividade (Parte 8). Na linha da
  lista, se quiser, um resuminho de uma linha com `text-overflow:ellipsis`,
  mas não é obrigatório.
- **Registro antigo:** atividade criada antes dessa mudança não tem o
  campo. Mostre nada nesse caso, nunca "0" nem "vazio". `${a.observacoes ? ... : ""}`.
- **Regras do Firestore:** não mudam (campo extra passa).

---

## Parte 7 — Seletor de foto: quadradinho com "+" e menu (tirar ou escolher)

Hoje o seletor de foto é um `<label>` com texto "Adicionar fotos" e um
`<input type="file" multiple>` escondido. Trocar por um quadrado com um "+"
no meio que, ao tocar, abre um menu com duas opções.

### 7.1 Componente

```js
function seletorFotos(prefixo) {
  return `
    <div class="foto-picker" data-prefixo="${prefixo}">
      <div class="chips-fotos" id="chips-${prefixo}-foto"></div>
      <button type="button" class="foto-add" data-prefixo="${prefixo}" aria-label="Adicionar foto">${SVG.plus}</button>
      <input type="file" accept="image/*" capture="environment" class="hidden" id="input-${prefixo}-camera">
      <input type="file" accept="image/*" multiple class="hidden" id="input-${prefixo}-galeria">
    </div>
  `;
}
```

CSS:

```css
.foto-picker{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.foto-add{width:64px;height:64px;border:2px dashed var(--line);border-radius:10px;
  background:var(--bg);color:var(--ink-faint);display:flex;align-items:center;justify-content:center;
  cursor:pointer;flex:none;}
.foto-add svg{width:22px;height:22px;}
.foto-add:hover{border-color:var(--roxo);color:var(--roxo);}
```

### 7.2 Menu ao clicar no "+"

Um menuzinho de duas opções, ancorado no botão. Reuse o padrão de menu
suspenso do projeto se existir; se não, um menu simples:

```js
function abrirMenuFoto(botao, prefixo) {
  fecharMenusFoto();
  const menu = document.createElement("div");
  menu.className = "menu-foto";
  menu.innerHTML = `
    <button type="button" data-op="camera">${SVG.camera} Tirar foto</button>
    <button type="button" data-op="galeria">${SVG.image} Escolher da galeria</button>
  `;
  botao.parentElement.appendChild(menu);
  menu.querySelector('[data-op="camera"]').addEventListener("click", () => {
    document.getElementById(`input-${prefixo}-camera`).click();
    fecharMenusFoto();
  });
  menu.querySelector('[data-op="galeria"]').addEventListener("click", () => {
    document.getElementById(`input-${prefixo}-galeria`).click();
    fecharMenusFoto();
  });
  setTimeout(() => document.addEventListener("click", fecharMenusFoto, { once: true }), 0);
}
function fecharMenusFoto() {
  document.querySelectorAll(".menu-foto").forEach((m) => m.remove());
}
```

CSS:

```css
.foto-picker{position:relative;}
.menu-foto{position:absolute;left:0;top:72px;background:var(--panel);border:1.5px solid var(--line);
  border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.15);z-index:250;overflow:hidden;min-width:190px;}
.menu-foto button{display:flex;align-items:center;gap:10px;width:100%;padding:11px 14px;
  background:none;border:none;text-align:left;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;}
.menu-foto button:hover{background:var(--bg);}
.menu-foto button + button{border-top:1px solid var(--line);}
.menu-foto svg{width:16px;height:16px;color:var(--ink-soft);}
```

### 7.3 Ligar os dois inputs ao fluxo que já existe

Os dois `<input>` (camera e galeria) chamam o mesmo acumulador de fotos que
o projeto já tem (`configurarSeletorFotos` empilha em `STATE.arquivosX`).
Aponte os dois para a mesma chave:

```js
// depois de injetar o form no modal:
configurarSeletorFotos(`input-${prefixo}-camera`, `chips-${prefixo}-foto`, `arquivos${Prefixo}`);
configurarSeletorFotos(`input-${prefixo}-galeria`, `chips-${prefixo}-foto`, `arquivos${Prefixo}`);
document.querySelector(`.foto-add[data-prefixo="${prefixo}"]`)
  .addEventListener("click", (e) => abrirMenuFoto(e.currentTarget, prefixo));
```

O resto (compressão, chips removíveis, envio sequencial, grade de
miniaturas, remover foto no modo edição) já está pronto e não muda.

### 7.4 Compressão: trocar para `createImageBitmap`

`redimensionarImagem()` hoje usa `FileReader` + `new Image()`. Foto de
celular moderno tem 12 megapixels ou mais, e decodificar isso em resolução
cheia trava aparelho fraco por alguns segundos. Trocar o miolo por
`createImageBitmap` (que decodifica sem montar um `<img>` na resolução
total), mantendo o método atual como reserva:

```js
async function redimensionarImagem(file, maxLado = 1280, qualidade = 0.75) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { return redimensionarImagemLegado(file, maxLado, qualidade); } // o código de hoje
  let { width, height } = bitmap;
  if (width > height && width > maxLado) { height = Math.round(height * maxLado / width); width = maxLado; }
  else if (height > maxLado) { width = Math.round(width * maxLado / height); height = maxLado; }
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", qualidade);
}
```

### 7.5 Sobre "tirar na hora salva na galeria do celular"

Isso não é controlável pelo site em todo aparelho:

- **Android** (é o que aparece nos prints do Felipe): usar
  `capture="environment"` abre o app de câmera do sistema, e a maioria dos
  apps de câmera Android salva a foto em DCIM/Câmera como efeito colateral.
  Costuma funcionar, mas depende do fabricante.
- **iPhone (Safari):** a foto tirada por `capture` **não** vai pro Rolo da
  Câmera. Não existe API web pra gravar na galeria do iOS. Se algum
  participante do retiro usar iPhone e isso for importante, a única saída
  é empacotar como app nativo, o que está fora deste projeto.

Não prometa "salva na galeria" na interface. O botão "Tirar foto" abre a
câmera e usa a foto no app; no Android ela normalmente também fica salva,
no iPhone não.

---

## Parte 8 — Ensinamentos: mesma lista agrupada, e preletor com autocomplete

### 8.1 Lista agrupada por dia

Igual à Parte 4, aplicada em `renderEnsinamentos()`:
- Tirar `<div class="abas-dias" id="ensinamentos-abas-dias">` do HTML e a
  função `renderAbasDiasEnsinamentos()` do JS.
- Tirar `diaFiltroEnsinamentos` do `STATE`.
- Faixa de KPI: `<div class="grid-kpi" id="ensinamentos-kpi"></div>`.
  Sugestão de KPIs: Total de ensinamentos, Preletores distintos, Dias com
  ensinamento (`x/4`), Com foto.
- Agrupar por `dia`, cabeçalho `Dia N`, ordenar dentro do dia por
  `createdAt` (ou por horário, se o Felipe pedir horário aqui também).

O modal de "+ Adicionar ensinamento" já tem `<select>` de dia. Só ajuste o
padrão pra `diaPadrao()` em vez do valor do filtro antigo.

### 8.2 "Quem ensinou" vira obrigatório e com autocomplete

Regra: o primeiro ensinamento obriga digitar um nome novo; do segundo em
diante, os nomes já usados aparecem como sugestão, e ainda dá pra digitar
um novo.

**Não use `<datalist>`.** Ele se comporta mal no Chrome do Android (some,
não filtra direito). Monte um combobox: input de texto + uma lista em
`<div>` que filtra conforme digita.

```js
function nomesPreletoresConhecidos() {
  const set = new Set();
  STATE.ensinamentos.forEach((e) => { if (e.quem) set.add(e.quem.trim()); });
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function comboPreletor(id, valorAtual) {
  return `
    <div class="combo" data-combo="${id}">
      <input type="text" id="${id}" value="${esc(valorAtual || "")}" maxlength="150"
             autocomplete="off" placeholder="Nome de quem ensinou" required>
      <div class="combo-lista hidden" id="${id}-lista"></div>
    </div>
  `;
}

function ligarComboPreletor(id) {
  const input = document.getElementById(id);
  const lista = document.getElementById(id + "-lista");
  const render = () => {
    const q = input.value.trim().toLowerCase();
    const itens = nomesPreletoresConhecidos().filter((n) => !q || n.toLowerCase().includes(q));
    if (!itens.length) { lista.classList.add("hidden"); return; }
    lista.innerHTML = itens.map((n) => `<button type="button" class="combo-opt">${esc(n)}</button>`).join("");
    lista.classList.remove("hidden");
    lista.querySelectorAll(".combo-opt").forEach((b) => {
      // mousedown, não click: dispara antes do blur do input fechar a lista
      b.addEventListener("mousedown", (e) => { e.preventDefault(); input.value = b.textContent; lista.classList.add("hidden"); });
    });
  };
  input.addEventListener("focus", render);
  input.addEventListener("input", render);
  input.addEventListener("blur", () => setTimeout(() => lista.classList.add("hidden"), 120));
}
```

CSS:

```css
.combo{position:relative;}
.combo-lista{position:absolute;left:0;right:0;top:calc(100% + 4px);background:var(--panel);
  border:1.5px solid var(--line);border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.14);
  z-index:250;max-height:200px;overflow-y:auto;}
.combo-opt{display:block;width:100%;text-align:left;padding:10px 13px;background:none;border:none;
  font-size:13px;color:var(--ink);cursor:pointer;font-weight:600;}
.combo-opt:hover{background:var(--bg);}
```

**Validação e normalização ao salvar** (no `submit` do form de criar e no
salvar da edição):

```js
let quem = document.getElementById("input-ensinamento-quem").value.trim().replace(/\s+/g, " ");
if (!quem) { mostrarErro("Preencha quem ensinou."); return; }
// se já existe alguém com a mesma grafia ignorando maiúsculas, usa a grafia já cadastrada
const igual = nomesPreletoresConhecidos().find((n) => n.toLowerCase() === quem.toLowerCase());
if (igual) quem = igual;
dados.quem = quem;
```

Isso evita "João", "joão" e "JOÃO" virarem três preletores diferentes na
lista de sugestões.

Como `quem` agora é obrigatório, tire o `(opcional)` do placeholder e
ponha `*` no rótulo. As regras do Firestore não exigem `quem`, e não
precisam: o app é o único que escreve.

### 8.3 Modal de detalhe do ensinamento

Recomendado (mesma lógica da Parte 3): clicar num ensinamento abre um modal
de visualização (dia, preletor, título, texto, fotos), com lápis pra editar
e lixeira pra excluir dentro do modal. Isso substitui o "expandir inline"
atual e alinha com o resto. O modo edição reusa o form de criação trocando
os `value`. Se preferir manter o expandir inline que já existe pra
ensinamentos e atividades por enquanto, funciona, mas aí o botão de excluir
continua na linha e o Felipe pediu ele dentro do modal só pro checklist.
Decisão de escopo pro Felipe: aplicar o modal de detalhe nas três telas
(mais consistente) ou só no checklist agora.

---

## Parte 9 — Ícones SVG no lugar de emoji (nos trechos novos)

O padrão do Felipe é SVG de linha fina, nunca emoji. A sidebar já usa SVG;
o resto do app ainda tem emoji (`✏️`, `✕`, `▸`, `📷`, `📦`, `👕`...). Este
plano introduz vários elementos novos (o "+", o menu de foto, o lápis e a
lixeira dentro do modal, a seta da linha do checklist). **Use SVG em tudo
que é novo.**

Kit mínimo, defina uma vez no topo do `app.js`:

```js
const SVG = {
  plus:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  camera:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  image:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  pencil:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  trash:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  chevronRight:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  x:           `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
};
```

Regra de tamanho: `.algum-lugar svg{width:16px;height:16px;}` por contexto.
Todo SVG herda `currentColor`, então a cor vem do `color` do elemento pai.

Trocas diretas nos trechos novos: `+ Adicionar` pode manter o "+" textual
no botão grande (já está assim e funciona), mas o quadradinho de foto usa
`SVG.plus`. O `✕` de fechar modal e de remover chip pode virar `SVG.x`. A
seta `▸` de expandir vira `SVG.chevronRight` com uma classe que rotaciona
90 graus quando aberto (não troque o conteúdo do elemento por JS, só a
classe, senão o próximo render reescreve).

**Limpeza do resto do emoji (`CATEGORIA_ICONE`, `📷` dos chips, `⚠️`, `🔎`,
`☰`):** é um item à parte, não bloqueia este plano. Ver a próxima seção.

---

## Parte 10 — Fechamento

1. Suba `?v=` nos três pontos (`index.html` link do CSS, `index.html`
   script do `app.js`, `import` de `firebase-init.js` dentro do `app.js`),
   todos pro mesmo valor.
2. Suba `CACHE_NAME` no `service-worker.js` (`tbn-v1` → `tbn-v2`). De
   passagem, ponha os assets do `CORE_ASSETS` com a mesma query
   (`"./app.js?v=2"` etc.), senão o service worker pré-carrega a URL sem
   versão e o navegador nunca usa esse cache.
3. Teste local com um servidor HTTP (`python -m http.server`), nunca
   abrindo o arquivo direto (`file://` quebra os módulos ES).
4. Matriz de teste:
   - Checklist: linha longa abre modal legível, editar dentro do modal
     salva, excluir pede confirmação por cima e apaga, checkbox marca sem
     abrir modal.
   - Atividades: três atividades em dias diferentes aparecem agrupadas e
     ordenadas por horário; KPI bate; "+ Adicionar" com seletor de dia,
     dropdown de horário, observação e o quadradinho de foto.
   - Horário: editar uma atividade que tinha horário em texto livre mantém
     o valor (opção "formato antigo").
   - Foto: no celular, "+" abre menu, "Tirar foto" abre a câmera, "Escolher
     da galeria" abre a galeria, as duas viram chip e depois miniatura.
   - Ensinamentos: lista agrupada, preletor obrigatório, segundo ensinamento
     mostra o preletor do primeiro na sugestão, digitar um nome com outra
     caixa (maiúscula/minúscula) reaproveita a grafia já cadastrada.
   - Modal em tela cheia no celular nas três telas.
   - Offline: com a aba em modo avião, marcar item do checklist e criar uma
     atividade sem foto funciona e sincroniza quando a rede volta (o
     Firestore já cuida disso; só confira que não travou em "salvando").
   - Regressão: Painel continua com os números certos.

---

## Pontos fora deste plano, mas que o Felipe precisa saber

Nenhum destes bloqueia as sete mudanças acima. São coisas que apareceram na
análise e valem uma decisão dele.

### 1. O service worker não está registrado

`service-worker.js` existe e está bem escrito, mas o `index.html` nunca
chama `navigator.serviceWorker.register('service-worker.js')`. Ou seja, o
app **não abre offline hoje** (só o cache do próprio Firestore funciona
sem rede, que cobre os dados mas não o HTML/CSS/JS). Para um app pensado
pra funcionar no mato, isso importa. Correção é uma linha no fim do
`app.js`:

```js
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js?v=2", { updateViaCache: "none" });
}
```

### 2. As fotos usam Firebase Storage

O `app.js` foi refatorado para subir foto no Firebase Storage
(`uploadString`). O padrão dos outros projetos do Felipe evita o Storage
de propósito, porque ele passou a exigir o plano pago Blaze mesmo dentro
da cota gratuita. O comentário no topo do `firebase-init.js` ainda diz o
contrário do que o código faz, e o `Code.gs` (upload pro Drive) virou
código morto.

Para o Felipe checar, um passo de cada vez:
1. Abrir https://console.firebase.google.com e escolher o projeto
   `app-legendarios-834b3`.
2. No menu de baixo à esquerda, ver se aparece "Plano Blaze" ou "Plano
   Spark". Se for Spark, o Storage provavelmente não está funcionando.
3. Abrir o app publicado, criar uma atividade com foto, e ver se a
   miniatura carrega depois de uns segundos. Se não carregar, abrir o
   console do navegador (F12) e procurar erro com "storage" ou "403".
4. Decidir: ou assumir o Storage e ligar o Blaze com alerta de orçamento
   (o volume desse app é baixíssimo, custo perto de zero), ou voltar o
   upload pro Apps Script/Drive que o `Code.gs` já implementa.

### 3. Emoji no resto do app

`CATEGORIA_ICONE` (oito emoji), o `📷` dos chips de foto, o `⚠️` da caixa
de aviso, o `🔎` do campo de busca, o `☰` do menu. O padrão do Felipe é
SVG. Não é urgente, mas quando essa base for mexida de novo, vale trocar
tudo de uma vez em vez de item por item.

### 4. Modal de detalhe também em atividades e ensinamentos

Ver a Parte 8.3. Aplicar o mesmo modal de visualização/edição das três
telas deixa o app inteiro consistente com a regra "o registro abre
visualizando". Hoje atividades e ensinamentos usam "expandir inline" com
edição inline, que foi feito antes desse padrão ser fechado.

---

## Riscos antecipados

Tabela dos modos de falha conhecidos que este plano encosta, e o que fazer
pra não repetir:

| Situação | O que pode dar errado | O que fazer |
|---|---|---|
| Modal aberto e confirmação por cima (Parte 1, 3) | A confirmação sobrescreve o registro em edição | `#confirm-overlay` próprio, nunca reusar `#modal-overlay` |
| Dropdown de horário (Parte 5) | Valor salvo em texto livre some ao editar e grava vazio | Opção "formato antigo" quando o valor não está na lista |
| Campo `observacoes` novo (Parte 6) | Atividade antiga mostra "0" ou "vazio" | Renderizar nada quando o campo não existe |
| "Quem ensinou" texto livre (Parte 8) | "João"/"joão"/"JOÃO" viram três preletores | Normalizar no salvar, reaproveitar grafia já cadastrada |
| Foto de celular de 12+ MP (Parte 7) | Trava o aparelho ao decodificar em resolução cheia | `createImageBitmap` com o método atual como reserva |
| `capture` no iPhone (Parte 7) | Foto tirada não vai pra galeria e ninguém avisou | Não prometer "salva na galeria" na interface |
| Versionar `app.js` mas não o `import` interno (Parte 10) | `firebase-init.js` carrega duas vezes, `initializeFirestore` em dobro | Mesmo `?v=` nos três lugares |
| Tela nova de listagem (Parte 4, 8) | Nasce sem KPI, sem estado vazio tratado | Faixa de KPI no topo, estado vazio explícito |

---

Qualquer dúvida sobre uma parte específica, é só perguntar antes de
implementar aquela parte.
