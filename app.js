// Track Bravos do Norte — lógica do app. Três coleções no Firestore: itens
// (checklist da mochila), atividades (o que foi feito por dia) e
// ensinamentos (anotações por dia). O Painel é só leitura, calculado em
// cima das outras três — não tem coleção própria.

import { db } from "./firebase-init.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, writeBatch,
  onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

// Cole aqui a URL "/exec" do Apps Script (Code.gs) depois de implantá-lo —
// veja o README. Enquanto não configurar, o app funciona normalmente, só
// não consegue anexar fotos.
const PHOTO_UPLOAD_URL = "https://script.google.com/macros/s/AKfycbxmuw_jNzxvyorAqN52-_wwOlcte8hvvyOkAH3FF7TyAgKuBMS9q-TPVCpDLRa1B4Ur/exec";

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
  arquivoAtividade: null,
  arquivoEnsinamento: null,
  filtroChecklistStatus: "todos",
  filtroChecklistCategoria: "todas",
  filtroChecklistObrigatorio: "todos",
  filtroChecklistBusca: ""
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

/* ══════════════ FOTO (Apps Script + Drive) ══════════════ */

function redimensionarImagem(file, maxLado = 1280, qualidade = 0.75) {
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

async function enviarFoto(file, nomeArquivo) {
  if (!PHOTO_UPLOAD_URL || PHOTO_UPLOAD_URL.includes("COLE_AQUI")) {
    throw new Error("Upload de foto ainda não configurado no app.js (PHOTO_UPLOAD_URL).");
  }
  const base64 = await redimensionarImagem(file);
  const resp = await fetch(PHOTO_UPLOAD_URL, {
    method: "POST",
    body: JSON.stringify({ action: "uploadPhoto", base64, nomeArquivo })
  }).then((r) => r.json());
  if (!resp.ok) throw new Error(resp.erro || "Falha ao enviar a foto.");
  return { url: resp.url, fileId: resp.fileId };
}

function configurarSeletorFoto(inputId, labelSpanId, chaveState) {
  document.getElementById(inputId).addEventListener("change", (e) => {
    const arquivo = e.target.files[0] || null;
    STATE[chaveState] = arquivo;
    document.getElementById(labelSpanId).textContent = arquivo ? arquivo.name : "";
  });
}
configurarSeletorFoto("input-atividade-foto", "nome-arquivo-atividade", "arquivoAtividade");
configurarSeletorFoto("input-ensinamento-foto", "nome-arquivo-ensinamento", "arquivoEnsinamento");

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
    `<option value="todas">Todas as categorias</option>` +
    CATEGORIAS.map((c) => `<option value="${esc(c)}">${CATEGORIA_ICONE[c] || "📦"} ${esc(c)}</option>`).join("");
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
        ${lista.map((it) => `
          <div class="item-linha ${it.marcado ? "marcado" : ""}">
            <input type="checkbox" class="item-checkbox" data-id="${it.id}" ${it.marcado ? "checked" : ""}>
            <span class="item-nome">${esc(it.nome)}</span>
            ${it.obrigatorio ? '<span class="badge-obrigatorio">obrigatório</span>' : ""}
            <button class="btn-excluir-x" data-id="${it.id}" title="Excluir item">✕</button>
          </div>
        `).join("")}
      </div>
    `;
  }).join("") || (total === 0
    ? `<div class="cartao">Nenhum item ainda. Adicione acima.</div>`
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
  document.querySelectorAll("#checklist-categorias .btn-excluir-x").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir este item da lista?")) return;
      try {
        await deleteDoc(doc(db, "itens", btn.dataset.id));
      } catch (err) {
        mostrarErro("Não foi possível excluir: " + err.message);
      }
    });
  });
}

document.getElementById("form-novo-item").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = document.getElementById("input-item-nome").value.trim();
  if (!nome) return;
  const categoria = document.getElementById("input-item-categoria").value;
  const obrigatorio = document.getElementById("input-item-obrigatorio").checked;
  try {
    await addDoc(collection(db, "itens"), { nome, categoria, obrigatorio, marcado: false, createdAt: serverTimestamp() });
    e.target.reset();
    document.getElementById("input-item-obrigatorio").checked = true;
  } catch (err) {
    mostrarErro("Não foi possível adicionar o item: " + err.message);
  }
});

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

/* ══════════════ ATIVIDADES ══════════════ */

function renderAbasDiasAtividades() {
  document.getElementById("atividades-abas-dias").innerHTML = DIAS.map((d) => (
    `<button class="aba-dia ${d.numero === STATE.diaAtivoAtividades ? "active" : ""}" data-dia="${d.numero}">${esc(d.label)}</button>`
  )).join("");
  document.querySelectorAll("#atividades-abas-dias .aba-dia").forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE.diaAtivoAtividades = Number(btn.dataset.dia);
      renderAbasDiasAtividades();
      renderAtividades();
    });
  });
}

function renderAtividades() {
  const lista = STATE.atividades.filter((a) => a.dia === STATE.diaAtivoAtividades);
  document.getElementById("atividades-lista").innerHTML = lista.map((a) => `
    <div class="cartao">
      <div class="cartao-header atividade-linha">
        <input type="checkbox" class="item-checkbox" data-id="${a.id}" ${a.concluida ? "checked" : ""}>
        <span class="cartao-titulo" style="flex:1">${esc(a.titulo)}</span>
        ${a.horario ? `<span class="cartao-meta">${esc(a.horario)}</span>` : ""}
        <button class="btn-excluir-x" data-id="${a.id}" title="Excluir">✕</button>
      </div>
      ${a.fotoUrl ? `<img class="cartao-foto" src="${esc(a.fotoUrl)}" alt="Foto da atividade">` : ""}
    </div>
  `).join("") || `<div class="cartao">Nenhuma atividade registrada neste dia ainda.</div>`;

  document.querySelectorAll("#atividades-lista .item-checkbox").forEach((chk) => {
    chk.addEventListener("change", async () => {
      try {
        await updateDoc(doc(db, "atividades", chk.dataset.id), { concluida: chk.checked });
      } catch (err) {
        mostrarErro("Não foi possível salvar: " + err.message);
      }
    });
  });
  document.querySelectorAll("#atividades-lista .btn-excluir-x").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir esta atividade?")) return;
      try {
        await deleteDoc(doc(db, "atividades", btn.dataset.id));
      } catch (err) {
        mostrarErro("Não foi possível excluir: " + err.message);
      }
    });
  });
}

document.getElementById("form-nova-atividade").addEventListener("submit", async (e) => {
  e.preventDefault();
  const titulo = document.getElementById("input-atividade-titulo").value.trim();
  if (!titulo) return;
  const horario = document.getElementById("input-atividade-horario").value.trim();
  const dados = { titulo, dia: STATE.diaAtivoAtividades, concluida: false, createdAt: serverTimestamp() };
  if (horario) dados.horario = horario;

  const arquivo = STATE.arquivoAtividade;
  if (arquivo) {
    try {
      const { url, fileId } = await enviarFoto(arquivo, `atividade_${Date.now()}.jpg`);
      dados.fotoUrl = url;
      dados.fotoFileId = fileId;
    } catch (err) {
      mostrarErro("A foto não foi enviada (" + err.message + "), mas a atividade foi salva sem ela.");
    }
  }
  try {
    await addDoc(collection(db, "atividades"), dados);
    e.target.reset();
    STATE.arquivoAtividade = null;
    document.getElementById("nome-arquivo-atividade").textContent = "";
  } catch (err) {
    mostrarErro("Não foi possível registrar a atividade: " + err.message);
  }
});

/* ══════════════ ENSINAMENTOS ══════════════ */

function preencherSelectDiaEnsinamento() {
  document.getElementById("input-ensinamento-dia").innerHTML = DIAS.map((d) => (
    `<option value="${d.numero}">${esc(d.label)}</option>`
  )).join("");
}

function renderAbasDiasEnsinamentos() {
  const abas = [{ numero: "todos", label: "Todos" }, ...DIAS];
  document.getElementById("ensinamentos-abas-dias").innerHTML = abas.map((d) => (
    `<button class="aba-dia ${String(d.numero) === String(STATE.diaFiltroEnsinamentos) ? "active" : ""}" data-dia="${d.numero}">${esc(d.label)}</button>`
  )).join("");
  document.querySelectorAll("#ensinamentos-abas-dias .aba-dia").forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE.diaFiltroEnsinamentos = btn.dataset.dia === "todos" ? "todos" : Number(btn.dataset.dia);
      renderAbasDiasEnsinamentos();
      renderEnsinamentos();
    });
  });
}

function renderEnsinamentos() {
  const lista = STATE.ensinamentos.filter((e) => STATE.diaFiltroEnsinamentos === "todos" || e.dia === STATE.diaFiltroEnsinamentos);
  document.getElementById("ensinamentos-lista").innerHTML = lista.map((e) => {
    const diaInfo = DIAS.find((d) => d.numero === e.dia);
    return `
      <div class="cartao">
        <div class="cartao-header">
          <span class="cartao-titulo">${esc(e.titulo)}</span>
          <span class="cartao-meta">${diaInfo ? esc(diaInfo.label) : ""} · ${fmtData(e.createdAt)}</span>
        </div>
        ${e.quem ? `<div class="cartao-meta" style="margin-bottom:6px;">✍️ ${esc(e.quem)}</div>` : ""}
        <div class="cartao-texto">${esc(e.texto)}</div>
        ${e.fotoUrl ? `<img class="cartao-foto" src="${esc(e.fotoUrl)}" alt="Foto do ensinamento">` : ""}
        <div class="cartao-acoes"><button class="btn-excluir-x" data-id="${e.id}" title="Excluir">✕ excluir</button></div>
      </div>
    `;
  }).join("") || `<div class="cartao">Nenhum ensinamento anotado ainda.</div>`;

  document.querySelectorAll("#ensinamentos-lista .btn-excluir-x").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir este ensinamento?")) return;
      try {
        await deleteDoc(doc(db, "ensinamentos", btn.dataset.id));
      } catch (err) {
        mostrarErro("Não foi possível excluir: " + err.message);
      }
    });
  });
}

document.getElementById("form-novo-ensinamento").addEventListener("submit", async (e) => {
  e.preventDefault();
  const titulo = document.getElementById("input-ensinamento-titulo").value.trim();
  const texto = document.getElementById("input-ensinamento-texto").value.trim();
  if (!titulo || !texto) return;
  const dia = Number(document.getElementById("input-ensinamento-dia").value);
  const quem = document.getElementById("input-ensinamento-quem").value.trim();
  const dados = { titulo, texto, dia, createdAt: serverTimestamp() };
  if (quem) dados.quem = quem;

  const arquivo = STATE.arquivoEnsinamento;
  if (arquivo) {
    try {
      const { url, fileId } = await enviarFoto(arquivo, `ensinamento_${Date.now()}.jpg`);
      dados.fotoUrl = url;
      dados.fotoFileId = fileId;
    } catch (err) {
      mostrarErro("A foto não foi enviada (" + err.message + "), mas o ensinamento foi salvo sem ela.");
    }
  }
  try {
    await addDoc(collection(db, "ensinamentos"), dados);
    e.target.reset();
    preencherSelectDiaEnsinamento();
    STATE.arquivoEnsinamento = null;
    document.getElementById("nome-arquivo-ensinamento").textContent = "";
  } catch (err) {
    mostrarErro("Não foi possível salvar o ensinamento: " + err.message);
  }
});

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
renderAbasDiasAtividades();
preencherSelectDiaEnsinamento();
renderAbasDiasEnsinamentos();
iniciarListeners();
