// Track Bravos do Norte — lógica do app. Três coleções no Firestore: itens
// (checklist da mochila), atividades (o que foi feito por dia) e
// ensinamentos (anotações por dia). O Painel é só leitura, calculado em
// cima das outras três — não tem coleção própria.
//
// Padrão de UI: nada de formulário fixo na tela. "+ Adicionar" abre um
// modal; nas listas, clicar na linha só expande o conteúdo (leitura), e só
// o ícone de lápis libera a edição dos campos.

import { db, storage } from "./firebase-init.js?v=2";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, writeBatch,
  onSnapshot, query, orderBy, serverTimestamp, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { ref, uploadString, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";

async function enviarFoto(file, nomeArquivo) {
  const base64 = await redimensionarImagem(file);
  const storageRef = ref(storage, "fotos/" + nomeArquivo);
  const snapshot = await uploadString(storageRef, base64, 'data_url');
  const url = await getDownloadURL(snapshot.ref);
  return { url, fileId: nomeArquivo };
}

const SVG = {
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  pencil: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  chevronRight:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
};

const DIAS = [
  { numero: 1, label: "Dia 1 · 10/09" },
  { numero: 2, label: "Dia 2 · 11/09" },
  { numero: 3, label: "Dia 3 · 12/09" },
  { numero: 4, label: "Dia 4 · 13/09" }
];

const CATEGORIAS = ["Roupas", "Calçado", "Para dormir", "Utensílios", "Higiene pessoal", "Outros artigos úteis", "Mochila", "Documentos"];
const CATEGORIA_ICONE = {
  "Roupas": "👕", "Calçado": "👟", "Para dormir": "💤", "Utensílios": "🍴",
  "Higiene pessoal": "🧼", "Outros artigos úteis": "🧰", "Mochila": "🎒", "Documentos": "🪪"
};

const ITENS_PADRAO = [
  { nome: "Calça para caminhada ou atividade esportiva (não jeans)", categoria: "Roupas", obrigatorio: true },
  { nome: "Camiseta de manga longa", categoria: "Roupas", obrigatorio: true },
  { nome: "Boné ou chapéu", categoria: "Roupas", obrigatorio: true },
  { nome: "Jaqueta impermeável (corta-vento)", categoria: "Roupas", obrigatorio: true },
  { nome: "Par de luvas para trekking", categoria: "Roupas", obrigatorio: true },
  { nome: "Meias esportivas para caminhada", categoria: "Roupas", obrigatorio: true },
  { nome: "Tênis ou bota para selva", categoria: "Calçado", obrigatorio: true },
  { nome: "Barraca para dormir (a mochila é individual)", categoria: "Para dormir", obrigatorio: true },
  { nome: "Saco de dormir", categoria: "Para dormir", obrigatorio: false },
  { nome: "Isolante térmico (diferente da manta térmica)", categoria: "Para dormir", obrigatorio: false },
  { nome: "Lona para isolar o chão / cobrir a barraca (5x4m)", categoria: "Para dormir", obrigatorio: true },
  { nome: "Manta/cobertor térmico", categoria: "Para dormir", obrigatorio: true },
  { nome: "Jarra ou copo de alumínio", categoria: "Utensílios", obrigatorio: true },
  { nome: "Colher (plástico)", categoria: "Utensílios", obrigatorio: true },
  { nome: "Garrafa de água reutilizável ou equipamento de hidratação", categoria: "Utensílios", obrigatorio: true },
  { nome: "1 litro de água", categoria: "Utensílios", obrigatorio: true },
  { nome: "Toalha", categoria: "Higiene pessoal", obrigatorio: true },
  { nome: "Papel higiênico ou lenço umedecido", categoria: "Higiene pessoal", obrigatorio: true },
  { nome: "Band-aid ou similar", categoria: "Higiene pessoal", obrigatorio: true },
  { nome: "Vaselina, talco ou pomada para assaduras", categoria: "Higiene pessoal", obrigatorio: true },
  { nome: "Repelente", categoria: "Higiene pessoal", obrigatorio: true },
  { nome: "Protetor/bloqueador solar", categoria: "Higiene pessoal", obrigatorio: true },
  { nome: "Capa de chuva", categoria: "Outros artigos úteis", obrigatorio: true },
  { nome: "Lanterna de cabeça", categoria: "Outros artigos úteis", obrigatorio: true },
  { nome: "Pilhas extras ou baterias", categoria: "Outros artigos úteis", obrigatorio: true },
  { nome: "Bíblia (em embalagem à prova d'água)", categoria: "Outros artigos úteis", obrigatorio: true },
  { nome: "Bastão para caminhada", categoria: "Outros artigos úteis", obrigatorio: false },
  { nome: "5 sacos tipo ziplock", categoria: "Outros artigos úteis", obrigatorio: true },
  { nome: "250 gramas de cal", categoria: "Outros artigos úteis", obrigatorio: true },
  { nome: "Mochila de no máximo 60 litros", categoria: "Mochila", obrigatorio: true },
  { nome: "Capa impermeável para a mochila", categoria: "Mochila", obrigatorio: true },
  { nome: "Documento de identificação com foto (RG, CNH ou passaporte)", categoria: "Documentos", obrigatorio: true },
  { nome: "Contato de emergência anotado", categoria: "Documentos", obrigatorio: true }
];

const STATE = {
  itens: [],
  atividades: [],
  ensinamentos: [],
  diaAtivoAtividades: 1,
  diaFiltroEnsinamentos: "todos",
  arquivosAtividade: [],
  arquivosEnsinamento: [],
  filtroChecklistStatus: "todos",
  filtroChecklistCategoria: "todas",
  filtroChecklistObrigatorio: "todos",
  filtroChecklistBusca: "",
  itemEditandoId: null,
  atividadeEditandoId: null,
  ensinamentoEditandoId: null,
  atividadesExpandidas: new Set(),
  ensinamentosExpandidos: new Set()
};

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function fmtData(millisOrTimestamp) {
  if (!millisOrTimestamp) return "—";
  const d = millisOrTimestamp.toDate ? millisOrTimestamp.toDate() : new Date(millisOrTimestamp);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function mostrarErro(msg) {
  const el = document.getElementById("toast-erro");
  document.getElementById("toast-msg").textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(mostrarErro._t);
  mostrarErro._t = setTimeout(() => el.classList.add("hidden"), 7000);
}

function opcoesCategorias(selecionada) {
  return CATEGORIAS.map((c) => (
    `<option value="${esc(c)}" ${c === selecionada ? "selected" : ""}>${CATEGORIA_ICONE[c] || "📦"} ${esc(c)}</option>`
  )).join("");
}

/* ══════════════ NAVEGAÇÃO ══════════════ */

document.querySelectorAll(".sidebar a[data-view]").forEach((a) => {
  a.addEventListener("click", () => {
    document.querySelectorAll(".sidebar a[data-view]").forEach((x) => x.classList.remove("active"));
    a.classList.add("active");
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById("view-" + a.dataset.view).classList.add("active");
    fecharMenuMobile();
  });
});

function fecharMenuMobile() {
  document.getElementById("sidebar").classList.remove("mobile-open");
  document.getElementById("sidebar-backdrop").classList.remove("active");
}
document.getElementById("btn-abrir-menu").addEventListener("click", () => {
  document.getElementById("sidebar").classList.add("mobile-open");
  document.getElementById("sidebar-backdrop").classList.add("active");
});
document.getElementById("sidebar-backdrop").addEventListener("click", fecharMenuMobile);

/* ══════════════ MODAL genérico (usado pelos 3 "+ Adicionar") ══════════════ */

function abrirModal(titulo, corpoHtml) {
  document.getElementById("modal-titulo").textContent = titulo;
  document.getElementById("modal-corpo").innerHTML = corpoHtml;
  document.getElementById("modal-overlay").classList.remove("hidden");
  const primeiroCampo = document.querySelector("#modal-corpo input, #modal-corpo select, #modal-corpo textarea");
  if (primeiroCampo) primeiroCampo.focus();
}

function fecharModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  document.getElementById("modal-corpo").innerHTML = "";
}

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

function abrirLightbox(url) {
  document.getElementById("lightbox-img").src = url;
  document.getElementById("lightbox").classList.remove("hidden");
}
document.getElementById("lightbox").addEventListener("click", () => {
  document.getElementById("lightbox").classList.add("hidden");
  document.getElementById("lightbox-img").src = "";
});

document.getElementById("btn-fechar-modal").addEventListener("click", fecharModal);
document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "modal-overlay") fecharModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!document.getElementById("lightbox").classList.contains("hidden")) {
      document.getElementById("lightbox").classList.add("hidden");
      return;
    }
    if (!document.getElementById("confirm-overlay").classList.contains("hidden")) {
      return; // handler in confirmar() deals with it
    }
    fecharModal();
  }
});

/* ══════════════ FOTO (Apps Script + Drive) ══════════════ */

async function redimensionarImagem(file, maxLado = 1280, qualidade = 0.75) {
  if (window.createImageBitmap) {
    try {
      const bmp = await createImageBitmap(file);
      let { width, height } = bmp;
      if (width > height && width > maxLado) { height = Math.round(height * (maxLado / width)); width = maxLado; }
      else if (height > maxLado) { width = Math.round(width * (maxLado / height)); height = maxLado; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(bmp, 0, 0, width, height);
      bmp.close();
      return canvas.toDataURL("image/jpeg", qualidade);
    } catch (e) {
      console.warn("createImageBitmap falhou, usando fallback", e);
    }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxLado) { height = Math.round(height * (maxLado / width)); width = maxLado; }
        else if (height > maxLado) { width = Math.round(width * (maxLado / height)); height = maxLado; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", qualidade));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Removed duplicate enviarFoto

// Seletor de MÚLTIPLAS fotos: cada seleção soma ao array em STATE (em vez
// de substituir), pra dar pra escolher fotos em momentos diferentes antes
// de enviar. Mostra um "chip" removível por arquivo escolhido.
function configurarSeletorFotos(inputId, chipsContainerId, chaveState) {
  document.getElementById(inputId).addEventListener("change", (e) => {
    STATE[chaveState].push(...Array.from(e.target.files || []));
    e.target.value = "";
    renderChipsFotos(chipsContainerId, chaveState);
  });
}

function renderChipsFotos(containerId, chaveState) {
  document.getElementById(containerId).innerHTML = STATE[chaveState].map((f, i) => (
    `<span class="chip-foto">📷 ${esc(f.name)}<button type="button" data-i="${i}" data-chave="${chaveState}">✕</button></span>`
  )).join("");
  document.querySelectorAll(`#${containerId} button`).forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE[btn.dataset.chave].splice(Number(btn.dataset.i), 1);
      renderChipsFotos(containerId, btn.dataset.chave);
    });
  });
}

// Envia uma lista de arquivos, um de cada vez (o Apps Script processa uma
// chamada por vez). Se algum falhar, avisa mas não derruba os outros nem
// impede salvar o restante.
async function enviarFotos(arquivos, prefixo) {
  const resultados = [];
  for (const arquivo of arquivos) {
    try {
      const nomeArquivo = `${prefixo}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
      resultados.push(await enviarFoto(arquivo, nomeArquivo));
    } catch (err) {
      mostrarErro(`Uma foto não foi enviada (${err.message}).`);
    }
  }
  return resultados;
}

// Grade de miniaturas (a "tabela de fotos"). Clicar numa miniatura abre a
// foto ampliada no modal genérico.
function renderGradeFotos(fotos) {
  if (!fotos || !fotos.length) return "";
  return `<div class="grade-fotos">${fotos.map((f, i) => (
    `<div class="miniatura" data-url="${esc(f.url)}"><img src="${esc(f.url)}" alt="Foto ${i + 1}" loading="lazy"></div>`
  )).join("")}</div>`;
}

function renderGradeFotosEdicao(colecao, id, fotos) {
  const grade = (fotos || []).map((f) => (
    `<div class="miniatura" data-url="${esc(f.url)}"><img src="${esc(f.url)}" alt="Foto">
      <button type="button" class="btn-remover-foto" data-colecao="${colecao}" data-id="${id}" data-url="${esc(f.url)}" data-fileid="${esc(f.fileId || "")}">✕</button>
    </div>`
  )).join("");
  return `
    <div class="grade-fotos">${grade}</div>
    <label class="btn btn-foto btn-pequeno" style="margin-top:6px;">📷 Adicionar foto
      <input type="file" accept="image/*" multiple class="hidden input-add-foto-edicao" data-colecao="${colecao}" data-id="${id}">
    </label>
  `;
}

function ligarAcoesFotoEdicao(escopoSeletor, prefixoNome) {
  document.querySelectorAll(`${escopoSeletor} .btn-remover-foto`).forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!(await confirmar("Remover esta foto?"))) return;
      try {
        const fileId = btn.dataset.fileid;
        await updateDoc(doc(db, btn.dataset.colecao, btn.dataset.id), {
          fotos: arrayRemove({ url: btn.dataset.url, fileId: fileId || null })
        });
        if (fileId) {
          try {
            await deleteObject(ref(storage, "fotos/" + fileId));
          } catch (e) {
            console.warn("Erro ao excluir foto do Storage", e);
          }
        }
      } catch (err) {
        mostrarErro("Não foi possível remover a foto: " + err.message);
      }
    });
  });
  document.querySelectorAll(`${escopoSeletor} .input-add-foto-edicao`).forEach((input) => {
    input.addEventListener("change", async (e) => {
      const arquivos = Array.from(e.target.files || []);
      e.target.value = "";
      if (!arquivos.length) return;
      const novasFotos = await enviarFotos(arquivos, prefixoNome);
      if (!novasFotos.length) return;
      try {
        await updateDoc(doc(db, input.dataset.colecao, input.dataset.id), { fotos: arrayUnion(...novasFotos) });
      } catch (err) {
        mostrarErro("Não foi possível salvar as fotos: " + err.message);
      }
    });
  });
}

/* ══════════════ CHECKLIST (itens) ══════════════ */

const FILTROS_STATUS_CHECKLIST = [
  { valor: "todos", label: "Todos" },
  { valor: "naofeitos", label: "Não feitos" },
  { valor: "feitos", label: "Feitos" }
];

function renderFiltroStatusChecklist() {
  document.getElementById("checklist-filtro-status").innerHTML = FILTROS_STATUS_CHECKLIST.map((f) => (
    `<button class="aba-dia ${f.valor === STATE.filtroChecklistStatus ? "active" : ""}" data-status="${f.valor}">${esc(f.label)}</button>`
  )).join("");
  document.querySelectorAll("#checklist-filtro-status .aba-dia").forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE.filtroChecklistStatus = btn.dataset.status;
      renderFiltroStatusChecklist();
      renderChecklist();
    });
  });
}

function popularFiltroCategoriaChecklist() {
  document.getElementById("filtro-checklist-categoria").innerHTML =
    `<option value="todas">Todas as categorias</option>` + opcoesCategorias(null);
}

function aplicarFiltrosChecklist(lista) {
  const busca = STATE.filtroChecklistBusca.toLowerCase();
  return lista.filter((it) => {
    if (STATE.filtroChecklistStatus === "feitos" && !it.marcado) return false;
    if (STATE.filtroChecklistStatus === "naofeitos" && it.marcado) return false;
    if (STATE.filtroChecklistCategoria !== "todas" && (it.categoria || "Outros artigos úteis") !== STATE.filtroChecklistCategoria) return false;
    if (STATE.filtroChecklistObrigatorio === "obrigatorio" && !it.obrigatorio) return false;
    if (STATE.filtroChecklistObrigatorio === "opcional" && it.obrigatorio) return false;
    if (busca && !it.nome.toLowerCase().includes(busca)) return false;
    return true;
  });
}

document.getElementById("filtro-checklist-busca").addEventListener("input", (e) => {
  STATE.filtroChecklistBusca = e.target.value.trim();
  renderChecklist();
});
document.getElementById("filtro-checklist-categoria").addEventListener("change", (e) => {
  STATE.filtroChecklistCategoria = e.target.value;
  renderChecklist();
});
document.getElementById("filtro-checklist-obrigatorio").addEventListener("change", (e) => {
  STATE.filtroChecklistObrigatorio = e.target.value;
  renderChecklist();
});
document.getElementById("btn-limpar-filtros-checklist").addEventListener("click", () => {
  STATE.filtroChecklistStatus = "todos";
  STATE.filtroChecklistCategoria = "todas";
  STATE.filtroChecklistObrigatorio = "todos";
  STATE.filtroChecklistBusca = "";
  document.getElementById("filtro-checklist-busca").value = "";
  document.getElementById("filtro-checklist-categoria").value = "todas";
  document.getElementById("filtro-checklist-obrigatorio").value = "todos";
  renderFiltroStatusChecklist();
  renderChecklist();
});

document.getElementById("btn-abrir-novo-item").addEventListener("click", () => {
  abrirModal("Adicionar item", `
    <form class="modal-form" id="form-novo-item">
      <input type="text" id="input-item-nome" placeholder="Nome do item" required maxlength="150">
      <select id="input-item-categoria">${opcoesCategorias("Roupas")}</select>
      <label class="check-inline"><input type="checkbox" id="input-item-obrigatorio" checked> obrigatório</label>
      <div class="modal-acoes"><button type="submit" class="btn btn-primary">Adicionar</button></div>
    </form>
  `);
  document.getElementById("form-novo-item").addEventListener("submit", submitNovoItem);
});

async function submitNovoItem(e) {
  e.preventDefault();
  const nome = document.getElementById("input-item-nome").value.trim();
  if (!nome) return;
  const categoria = document.getElementById("input-item-categoria").value;
  const obrigatorio = document.getElementById("input-item-obrigatorio").checked;
  try {
    await addDoc(collection(db, "itens"), { nome, categoria, obrigatorio, marcado: false, createdAt: serverTimestamp() });
    fecharModal();
  } catch (err) {
    mostrarErro("Não foi possível adicionar o item: " + err.message);
  }
}

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

function abrirModalItem(it) {
  abrirModal("Item da mochila", modalItemView(it));
  ligarAcoesModalItem(it);
}

function modalItemView(it) {
  return `
    <div class="modal-view">
      <div class="mv-linha"><span class="mv-rotulo">Item</span><span class="mv-valor">${esc(it.nome)}</span></div>
      <div class="mv-linha"><span class="mv-rotulo">Categoria</span>
        <span class="mv-valor">${CATEGORIA_ICONE[it.categoria] || "📦"} ${esc(it.categoria || "Outros artigos úteis")}</span></div>
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

function renderChecklist() {
  const total = STATE.itens.length;
  const marcados = STATE.itens.filter((it) => it.marcado).length;
  const pct = total ? Math.round((marcados / total) * 100) : 0;
  document.getElementById("checklist-resumo").textContent = `${marcados}/${total} itens (${pct}%)`;
  document.getElementById("checklist-barra").style.width = pct + "%";

  const itensFiltrados = aplicarFiltrosChecklist(STATE.itens);
  document.getElementById("checklist-filtro-contagem").textContent = `${itensFiltrados.length} de ${total} ${total === 1 ? "item" : "itens"}`;

  const porCategoria = {};
  itensFiltrados.forEach((it) => {
    const cat = it.categoria || "Outros artigos úteis";
    (porCategoria[cat] = porCategoria[cat] || []).push(it);
  });
  const categoriasComItens = [...CATEGORIAS.filter((c) => porCategoria[c]), ...Object.keys(porCategoria).filter((c) => !CATEGORIAS.includes(c))];

  document.getElementById("checklist-categorias").innerHTML = categoriasComItens.map((cat) => {
    const lista = porCategoria[cat];
    const okCat = lista.filter((it) => it.marcado).length;
    const pctCat = lista.length ? Math.round((okCat / lista.length) * 100) : 0;
    return `
      <div class="categoria-bloco">
        <div class="categoria-header">
          <div>
            <span class="cat-nome">${CATEGORIA_ICONE[cat] || "📦"} ${esc(cat)}</span>
            <div class="barra-progresso-mini"><div class="barra-progresso-mini-fill" style="width:${pctCat}%"></div></div>
          </div>
          <span class="cat-contagem">${okCat}/${lista.length}</span>
        </div>
        ${lista.map(renderLinhaItem).join("")}
      </div>
    `;
  }).join("") || (total === 0
    ? `<div class="cartao">Nenhum item ainda. Toque em "+ Adicionar item" acima.</div>`
    : `<div class="cartao">Nenhum item bate com esses filtros. <button class="btn" id="btn-limpar-filtros-checklist-vazio" style="margin-left:8px;">Limpar filtros</button></div>`);

  const btnLimparVazio = document.getElementById("btn-limpar-filtros-checklist-vazio");
  if (btnLimparVazio) btnLimparVazio.addEventListener("click", () => document.getElementById("btn-limpar-filtros-checklist").click());

  document.querySelectorAll("#checklist-categorias .item-checkbox").forEach((chk) => {
    chk.addEventListener("change", async () => {
      try {
        await updateDoc(doc(db, "itens", chk.dataset.id), { marcado: chk.checked });
      } catch (err) {
        mostrarErro("Não foi possível salvar: " + err.message);
      }
    });
  });

  document.querySelectorAll("#checklist-categorias .item-linha[data-acao='abrir']").forEach((linha) => {
    linha.addEventListener("click", (e) => {
      if (e.target.closest("input, button")) return; // clicou no checkbox
      const it = STATE.itens.find((x) => x.id === linha.dataset.id);
      if (it) abrirModalItem(it);
    });
  });
}

let seedTentado = false;
async function seedItensPadraoSeVazio() {
  if (seedTentado) return;
  seedTentado = true;
  if (STATE.itens.length > 0) return;
  if (localStorage.getItem("tbn_seed_ok") === "1") return;
  try {
    const batch = writeBatch(db);
    ITENS_PADRAO.forEach((it) => {
      const ref = doc(collection(db, "itens"));
      batch.set(ref, { ...it, marcado: false, createdAt: serverTimestamp() });
    });
    await batch.commit();
    localStorage.setItem("tbn_seed_ok", "1");
  } catch (err) {
    mostrarErro("Não foi possível carregar a lista padrão: " + err.message);
  }
}

function kpiCard(pares) {
  return pares.map(([rotulo, valor]) => `
    <div class="kpi"><div class="kpi-valor">${esc(String(valor))}</div><div class="kpi-rotulo">${esc(rotulo)}</div></div>
  `).join("");
}

function diaPadrao() {
  const hoje = new Date();
  const mapa = { "9-10": 1, "9-11": 2, "9-12": 3, "9-13": 4 }; // mês 9 = setembro (0-index: 8)
  const chave = (hoje.getMonth() + 1) + "-" + hoje.getDate();
  return mapa[chave] || 1;
}

const HORARIOS = Array.from({ length: 18 }, (_, i) => `${String(i + 6).padStart(2, "0")}h00`); // "06h00" ... "23h00"

function selectHorario(id, valorAtual) {
  const opcoes = [`<option value="">Sem horário</option>`];
  if (valorAtual && !HORARIOS.includes(valorAtual)) {
    opcoes.push(`<option value="${esc(valorAtual)}" selected>${esc(valorAtual)} (formato antigo)</option>`);
  }
  HORARIOS.forEach((h) => {
    opcoes.push(`<option value="${h}" ${h === valorAtual ? "selected" : ""}>${h}</option>`);
  });
  return `<select id="${id}">${opcoes.join("")}</select>`;
}

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

function fecharMenusFoto() {
  document.querySelectorAll(".menu-foto").forEach((m) => m.remove());
}

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

/* ══════════════ ATIVIDADES ══════════════ */

document.getElementById("btn-abrir-nova-atividade").addEventListener("click", () => {
  abrirModal("Adicionar atividade", `
    <form class="modal-form" id="form-nova-atividade">
      <label class="mv-rotulo">Dia *</label>
      <select id="input-atividade-dia">${DIAS.map((d) => `<option value="${d.numero}" ${d.numero === diaPadrao() ? "selected" : ""}>${esc(d.label)}</option>`).join("")}</select>
      <label class="mv-rotulo">Nome da atividade *</label>
      <input type="text" id="input-atividade-titulo" maxlength="200" required>
      <label class="mv-rotulo">Horário</label>
      ${selectHorario("input-atividade-horario", null)}
      <label class="mv-rotulo">Observações</label>
      <textarea id="input-atividade-obs" maxlength="2000" rows="3" placeholder="Anotação livre sobre a atividade"></textarea>
      <label class="mv-rotulo">Fotos</label>
      ${seletorFotos("atividade")}
      <div class="modal-acoes"><button type="submit" class="btn btn-primary">Registrar</button></div>
    </form>
  `);
  STATE.arquivosAtividade = [];
  configurarSeletorFotos("input-atividade-camera", "chips-atividade-foto", "arquivosAtividade");
  configurarSeletorFotos("input-atividade-galeria", "chips-atividade-foto", "arquivosAtividade");
  document.querySelector(`.foto-add[data-prefixo="atividade"]`).addEventListener("click", (e) => abrirMenuFoto(e.currentTarget, "atividade"));
  document.getElementById("form-nova-atividade").addEventListener("submit", submitNovaAtividade);
});

async function submitNovaAtividade(e) {
  e.preventDefault();
  const titulo = document.getElementById("input-atividade-titulo").value.trim();
  if (!titulo) return;
  const dia = Number(document.getElementById("input-atividade-dia").value);
  const dados = { titulo, dia, concluida: false, createdAt: serverTimestamp() };
  const horario = document.getElementById("input-atividade-horario").value;
  if (horario) dados.horario = horario;
  const obs = document.getElementById("input-atividade-obs").value.trim();
  if (obs) dados.observacoes = obs;

  if (STATE.arquivosAtividade.length) {
    const fotos = await enviarFotos(STATE.arquivosAtividade, "atividade");
    if (fotos.length) dados.fotos = fotos;
  }
  try {
    await addDoc(collection(db, "atividades"), dados);
    STATE.arquivosAtividade = [];
    fecharModal();
  } catch (err) {
    mostrarErro("Não foi possível registrar a atividade: " + err.message);
  }
}

function ordenarPorHorario(a, b) {
  const ha = a.horario || "99h99";
  const hb = b.horario || "99h99";
  if (ha !== hb) return ha < hb ? -1 : 1;
  const ta = a.createdAt?.toMillis?.() || 0;
  const tb = b.createdAt?.toMillis?.() || 0;
  return ta - tb;
}

function renderCartaoAtividade(a) {
  if (STATE.atividadeEditandoId === a.id) {
    return `
      <div class="cartao">
        <div class="linha-edicao">
          <input type="text" class="edicao-atividade-titulo" value="${esc(a.titulo)}" maxlength="200" style="flex:2;">
          ${selectHorario("edit-atividade-horario", a.horario)}
          <textarea class="edicao-atividade-obs" rows="2" placeholder="Observações" style="width:100%; margin-top:8px;">${esc(a.observacoes || "")}</textarea>
          <div style="width:100%; display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
            <button class="btn btn-primary btn-pequeno btn-salvar-atividade" data-id="${a.id}">Salvar</button>
            <button class="btn btn-pequeno btn-cancelar-atividade" data-id="${a.id}">Cancelar</button>
          </div>
        </div>
        ${renderGradeFotosEdicao("atividades", a.id, a.fotos)}
      </div>
    `;
  }
  const expandido = STATE.atividadesExpandidas.has(a.id);
  const temExtra = !!((a.fotos && a.fotos.length) || a.observacoes);
  return `
    <div class="cartao ${temExtra ? "linha-clicavel" : ""}" data-id="${a.id}" ${temExtra ? 'data-acao="expandir"' : ""}>
      <div class="cartao-header atividade-linha">
        <input type="checkbox" class="item-checkbox" data-id="${a.id}" ${a.concluida ? "checked" : ""}>
        <span class="cartao-titulo" style="flex:1">${esc(a.titulo)}</span>
        ${a.horario ? `<span class="cartao-meta">${esc(a.horario)}</span>` : ""}
        ${temExtra ? `<span class="cartao-meta">${a.fotos ? a.fotos.length : 0} foto${(a.fotos?.length) !== 1 ? "s" : ""}</span><span class="indicador-expandir ${expandido ? "aberto" : ""}">${SVG.chevronRight}</span>` : ""}
        <button class="btn-icone" data-id="${a.id}" data-acao="editar" title="Editar">${SVG.pencil}</button>
        <button class="btn-excluir-x" data-id="${a.id}" title="Excluir">${SVG.trash}</button>
      </div>
      ${expandido && temExtra ? `<div class="cartao-conteudo-expandido">
        ${a.observacoes ? `<div style="margin-bottom:8px; font-size:13px; color:var(--ink-soft);">${esc(a.observacoes)}</div>` : ""}
        ${renderGradeFotos(a.fotos)}
      </div>` : ""}
    </div>
  `;
}

function ligarHandlersAtividades() {
  document.querySelectorAll("#atividades-lista .item-checkbox").forEach((chk) => {
    chk.addEventListener("change", async () => {
      try {
        await updateDoc(doc(db, "atividades", chk.dataset.id), { concluida: chk.checked });
      } catch (err) { mostrarErro("Não foi possível salvar: " + err.message); }
    });
  });
  document.querySelectorAll("#atividades-lista .btn-excluir-x").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!(await confirmar("Excluir esta atividade?"))) return;
      try { await deleteDoc(doc(db, "atividades", btn.dataset.id)); } catch (err) { mostrarErro("Não foi possível excluir: " + err.message); }
    });
  });
  document.querySelectorAll("#atividades-lista .btn-icone[data-acao='editar']").forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE.atividadeEditandoId = btn.dataset.id;
      renderAtividades();
    });
  });
  document.querySelectorAll("#atividades-lista .btn-cancelar-atividade").forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE.atividadeEditandoId = null;
      renderAtividades();
    });
  });
  document.querySelectorAll("#atividades-lista .btn-salvar-atividade").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const linha = btn.closest(".cartao");
      const titulo = linha.querySelector(".edicao-atividade-titulo").value.trim();
      if (!titulo) { mostrarErro("O título não pode ficar vazio."); return; }
      const horario = linha.querySelector("#edit-atividade-horario").value;
      const observacoes = linha.querySelector(".edicao-atividade-obs").value.trim();
      const dados = { titulo };
      if (horario) dados.horario = horario; else dados.horario = null;
      if (observacoes) dados.observacoes = observacoes; else dados.observacoes = null;
      try {
        await updateDoc(doc(db, "atividades", btn.dataset.id), dados);
        STATE.atividadeEditandoId = null;
      } catch (err) { mostrarErro("Não foi possível salvar: " + err.message); }
    });
  });
  document.querySelectorAll("#atividades-lista .cartao[data-acao='expandir']").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("input, button, select, textarea, .miniatura")) return;
      const id = card.dataset.id;
      if (STATE.atividadesExpandidas.has(id)) STATE.atividadesExpandidas.delete(id);
      else STATE.atividadesExpandidas.add(id);
      renderAtividades();
    });
  });
  document.querySelectorAll("#atividades-lista .miniatura").forEach((mini) => {
    mini.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target.closest("button")) return;
      abrirLightbox(mini.dataset.url);
    });
  });
  ligarAcoesFotoEdicao("#atividades-lista", "atividade");
}

function renderAtividades() {
  const total = STATE.atividades.length;
  const feitas = STATE.atividades.filter((a) => a.concluida).length;
  const comFoto = STATE.atividades.filter((a) => a.fotos && a.fotos.length).length;
  const diasComReg = new Set(STATE.atividades.map((a) => a.dia)).size;
  
  document.getElementById("atividades-kpi").innerHTML = kpiCard([
    ["Total", total], ["Concluídas", feitas], ["Com foto", comFoto], ["Dias com registro", `${diasComReg}/4`]
  ]);

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

  ligarHandlersAtividades();
}

/* ══════════════ ENSINAMENTOS ══════════════ */

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
      b.addEventListener("mousedown", (e) => { e.preventDefault(); input.value = b.textContent; lista.classList.add("hidden"); });
    });
  };
  input.addEventListener("focus", render);
  input.addEventListener("input", render);
  input.addEventListener("blur", () => setTimeout(() => lista.classList.add("hidden"), 120));
}

document.getElementById("btn-abrir-novo-ensinamento").addEventListener("click", () => {
  abrirModal("Adicionar ensinamento", `
    <form class="modal-form" id="form-novo-ensinamento">
      <div class="linha-dupla">
        <div>
          <label class="mv-rotulo">Dia *</label>
          <select id="input-ensinamento-dia">${DIAS.map((d) => `<option value="${d.numero}" ${d.numero === diaPadrao() ? "selected" : ""}>${esc(d.label)}</option>`).join("")}</select>
        </div>
        <div>
          <label class="mv-rotulo">Quem ensinou *</label>
          ${comboPreletor("input-ensinamento-quem", "")}
        </div>
      </div>
      <label class="mv-rotulo">Título / tema *</label>
      <input type="text" id="input-ensinamento-titulo" required maxlength="200">
      <label class="mv-rotulo">O que você aprendeu *</label>
      <textarea id="input-ensinamento-texto" required maxlength="8000" rows="4"></textarea>
      <label class="mv-rotulo">Fotos</label>
      ${seletorFotos("ensinamento")}
      <div class="modal-acoes"><button type="submit" class="btn btn-primary">Salvar ensinamento</button></div>
    </form>
  `);
  STATE.arquivosEnsinamento = [];
  configurarSeletorFotos("input-ensinamento-camera", "chips-ensinamento-foto", "arquivosEnsinamento");
  configurarSeletorFotos("input-ensinamento-galeria", "chips-ensinamento-foto", "arquivosEnsinamento");
  document.querySelector(`.foto-add[data-prefixo="ensinamento"]`).addEventListener("click", (e) => abrirMenuFoto(e.currentTarget, "ensinamento"));
  ligarComboPreletor("input-ensinamento-quem");
  document.getElementById("form-novo-ensinamento").addEventListener("submit", submitNovoEnsinamento);
});

async function submitNovoEnsinamento(e) {
  e.preventDefault();
  const titulo = document.getElementById("input-ensinamento-titulo").value.trim();
  const texto = document.getElementById("input-ensinamento-texto").value.trim();
  if (!titulo || !texto) return;
  const dia = Number(document.getElementById("input-ensinamento-dia").value);
  
  let quem = document.getElementById("input-ensinamento-quem").value.trim().replace(/\s+/g, " ");
  if (!quem) { mostrarErro("Preencha quem ensinou."); return; }
  const igual = nomesPreletoresConhecidos().find((n) => n.toLowerCase() === quem.toLowerCase());
  if (igual) quem = igual;

  const dados = { titulo, texto, dia, quem, createdAt: serverTimestamp() };

  if (STATE.arquivosEnsinamento.length) {
    const fotos = await enviarFotos(STATE.arquivosEnsinamento, "ensinamento");
    if (fotos.length) dados.fotos = fotos;
  }
  try {
    await addDoc(collection(db, "ensinamentos"), dados);
    STATE.arquivosEnsinamento = [];
    fecharModal();
  } catch (err) {
    mostrarErro("Não foi possível salvar o ensinamento: " + err.message);
  }
}

function renderCartaoEnsinamento(e) {
  if (STATE.ensinamentoEditandoId === e.id) {
    return `
      <div class="cartao">
        <div class="linha-dupla" style="margin-bottom:8px;">
          <div><select class="edicao-ensinamento-dia" style="width:100%;">${DIAS.map((d) => `<option value="${d.numero}" ${d.numero === e.dia ? "selected" : ""}>${esc(d.label)}</option>`).join("")}</select></div>
          <div style="flex:1;">${comboPreletor("edit-ensinamento-quem-" + e.id, e.quem || "")}</div>
        </div>
        <input type="text" class="edicao-ensinamento-titulo" value="${esc(e.titulo)}" maxlength="200" style="width:100%;margin-bottom:8px;">
        <textarea class="edicao-ensinamento-texto" maxlength="8000" rows="4" style="width:100%;">${esc(e.texto)}</textarea>
        <div class="modal-acoes" style="margin-top:8px;">
          <button class="btn btn-primary btn-pequeno btn-salvar-ensinamento" data-id="${e.id}">Salvar</button>
          <button class="btn btn-pequeno btn-cancelar-ensinamento" data-id="${e.id}">Cancelar</button>
        </div>
        ${renderGradeFotosEdicao("ensinamentos", e.id, e.fotos)}
      </div>
    `;
  }
  const expandido = STATE.ensinamentosExpandidos.has(e.id);
  const temFotos = !!(e.fotos && e.fotos.length);
  return `
    <div class="cartao linha-clicavel" data-id="${e.id}" data-acao="expandir">
      <div class="cartao-header">
        <span class="indicador-expandir ${expandido ? "aberto" : ""}">${SVG.chevronRight}</span>
        <span class="cartao-titulo" style="flex:1;">${esc(e.titulo)}</span>
        ${temFotos ? `<span class="cartao-meta">${e.fotos.length} foto${e.fotos.length > 1 ? "s" : ""}</span>` : ""}
        <button class="btn-icone" data-id="${e.id}" data-acao="editar" title="Editar">${SVG.pencil}</button>
        <button class="btn-excluir-x" data-id="${e.id}" title="Excluir">${SVG.trash}</button>
      </div>
      ${expandido ? `
        <div class="cartao-conteudo-expandido">
          <div class="cartao-meta" style="margin-bottom:6px;">${e.quem ? "✍️ " + esc(e.quem) + " · " : ""}${fmtData(e.createdAt)}</div>
          <div class="cartao-texto">${esc(e.texto)}</div>
          ${renderGradeFotos(e.fotos)}
        </div>
      ` : ""}
    </div>
  `;
}

function renderEnsinamentos() {
  const total = STATE.ensinamentos.length;
  const preletoresUnicos = nomesPreletoresConhecidos().length;
  const diasComReg = new Set(STATE.ensinamentos.map((e) => e.dia)).size;
  const comFoto = STATE.ensinamentos.filter((e) => e.fotos && e.fotos.length).length;

  document.getElementById("ensinamentos-kpi").innerHTML = kpiCard([
    ["Total", total], ["Preletores", preletoresUnicos], ["Dias c/ ensinamento", `${diasComReg}/4`], ["Com foto", comFoto]
  ]);

  const alvo = document.getElementById("ensinamentos-lista");
  if (!total) {
    alvo.innerHTML = `<div class="cartao vazio">Nenhum ensinamento anotado ainda. Toque em "+ Adicionar ensinamento".</div>`;
    return;
  }

  const diasComEns = DIAS.filter((d) => STATE.ensinamentos.some((e) => e.dia === d.numero));
  alvo.innerHTML = diasComEns.map((d) => {
    const doDia = STATE.ensinamentos
      .filter((e) => e.dia === d.numero)
      .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
    return `
      <div class="grupo-dia">
        <div class="grupo-dia-titulo">${esc(d.label)} <span class="grupo-dia-contagem">${doDia.length}</span></div>
        <div class="cartoes">${doDia.map(renderCartaoEnsinamento).join("")}</div>
      </div>
    `;
  }).join("");

  // Initialize combos for editing lines
  STATE.ensinamentos.forEach((e) => {
    if (STATE.ensinamentoEditandoId === e.id) {
      ligarComboPreletor("edit-ensinamento-quem-" + e.id);
    }
  });

  document.querySelectorAll("#ensinamentos-lista .btn-excluir-x").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!(await confirmar("Excluir este ensinamento?"))) return;
      try {
        await deleteDoc(doc(db, "ensinamentos", btn.dataset.id));
      } catch (err) {
        mostrarErro("Não foi possível excluir: " + err.message);
      }
    });
  });
  document.querySelectorAll("#ensinamentos-lista .btn-icone[data-acao='editar']").forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE.ensinamentoEditandoId = btn.dataset.id;
      renderEnsinamentos();
    });
  });
  document.querySelectorAll("#ensinamentos-lista .btn-cancelar-ensinamento").forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE.ensinamentoEditandoId = null;
      renderEnsinamentos();
    });
  });
  document.querySelectorAll("#ensinamentos-lista .btn-salvar-ensinamento").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const linha = btn.closest(".cartao");
      const titulo = linha.querySelector(".edicao-ensinamento-titulo").value.trim();
      const texto = linha.querySelector(".edicao-ensinamento-texto").value.trim();
      if (!titulo || !texto) { mostrarErro("Título e texto não podem ficar vazios."); return; }
      const dia = Number(linha.querySelector(".edicao-ensinamento-dia").value);
      
      const inputQuem = linha.querySelector(".combo input");
      let quem = inputQuem.value.trim().replace(/\s+/g, " ");
      if (!quem) { mostrarErro("Preencha quem ensinou."); return; }
      const igual = nomesPreletoresConhecidos().find((n) => n.toLowerCase() === quem.toLowerCase());
      if (igual) quem = igual;

      try {
        await updateDoc(doc(db, "ensinamentos", btn.dataset.id), { titulo, texto, dia, quem });
        STATE.ensinamentoEditandoId = null;
      } catch (err) {
        mostrarErro("Não foi possível salvar: " + err.message);
      }
    });
  });
  document.querySelectorAll("#ensinamentos-lista .cartao[data-acao='expandir']").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("input, button, select, textarea, .miniatura")) return;
      const id = card.dataset.id;
      if (STATE.ensinamentosExpandidos.has(id)) STATE.ensinamentosExpandidos.delete(id);
      else STATE.ensinamentosExpandidos.add(id);
      renderEnsinamentos();
    });
  });
  document.querySelectorAll("#ensinamentos-lista .miniatura").forEach((mini) => {
    mini.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target.closest("button")) return;
      abrirLightbox(mini.dataset.url);
    });
  });
  ligarAcoesFotoEdicao("#ensinamentos-lista", "ensinamento");
}

/* ══════════════ PAINEL (métricas, só leitura) ══════════════ */

function renderPainel() {
  const totalItens = STATE.itens.length;
  const itensMarcados = STATE.itens.filter((it) => it.marcado).length;
  const totalAtividades = STATE.atividades.length;
  const atividadesFeitas = STATE.atividades.filter((a) => a.concluida).length;
  const totalEnsinamentos = STATE.ensinamentos.length;
  const diasComRegistro = new Set([
    ...STATE.atividades.filter((a) => a.concluida).map((a) => a.dia),
    ...STATE.ensinamentos.map((e) => e.dia)
  ]).size;

  document.getElementById("painel-cards").innerHTML = `
    <div class="metrica-card"><div class="metrica-valor">${totalItens ? Math.round((itensMarcados / totalItens) * 100) : 0}%</div><div class="metrica-label">Checklist pronto (${itensMarcados}/${totalItens})</div></div>
    <div class="metrica-card"><div class="metrica-valor">${atividadesFeitas}/${totalAtividades}</div><div class="metrica-label">Atividades concluídas</div></div>
    <div class="metrica-card"><div class="metrica-valor">${totalEnsinamentos}</div><div class="metrica-label">Ensinamentos anotados</div></div>
    <div class="metrica-card"><div class="metrica-valor">${diasComRegistro}/${DIAS.length}</div><div class="metrica-label">Dias com registro</div></div>
  `;

  document.getElementById("painel-dias").innerHTML = DIAS.map((d) => {
    const atsDia = STATE.atividades.filter((a) => a.dia === d.numero);
    const atsFeitas = atsDia.filter((a) => a.concluida).length;
    const pctAt = atsDia.length ? Math.round((atsFeitas / atsDia.length) * 100) : 0;
    const ensDia = STATE.ensinamentos.filter((e) => e.dia === d.numero).length;
    return `
      <div class="painel-dia-linha">
        <div class="painel-dia-topo"><span>${esc(d.label)}</span><span>${ensDia} ensinamento(s)</span></div>
        <div class="painel-dia-barras">
          <div>
            <div class="painel-dia-barra-label"><span>Atividades concluídas</span><span>${atsFeitas}/${atsDia.length}</span></div>
            <div class="barra-progresso-mini"><div class="barra-progresso-mini-fill" style="width:${pctAt}%"></div></div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

/* ══════════════ LISTENERS EM TEMPO REAL ══════════════ */

function iniciarListeners() {
  onSnapshot(
    query(collection(db, "itens"), orderBy("createdAt", "asc")),
    (snap) => {
      STATE.itens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderChecklist();
      renderPainel();
      seedItensPadraoSeVazio();
    },
    (err) => mostrarErro("Erro de conexão com o banco (itens): " + err.message)
  );

  onSnapshot(
    query(collection(db, "atividades"), orderBy("createdAt", "asc")),
    (snap) => {
      STATE.atividades = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAtividades();
      renderPainel();
    },
    (err) => mostrarErro("Erro de conexão com o banco (atividades): " + err.message)
  );

  onSnapshot(
    query(collection(db, "ensinamentos"), orderBy("createdAt", "desc")),
    (snap) => {
      STATE.ensinamentos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderEnsinamentos();
      renderPainel();
    },
    (err) => mostrarErro("Erro de conexão com o banco (ensinamentos): " + err.message)
  );
}

renderFiltroStatusChecklist();
popularFiltroCategoriaChecklist();
iniciarListeners();
