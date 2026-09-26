import { DEFAULT_LIBRARY_URL, decodeLibraryKey, encodeKey, getActiveLibrary, getLibraries, getLibraryNames, normalizeLibraryUrl, saveLibraries, validateLibrary } from "./keys.js";

const menu = document.querySelector(".library-menu");
const input = document.getElementById("libraryUrl");
const nameInput = document.getElementById("libraryName");
const select = document.getElementById("librarySelect");
const message = document.getElementById("libraryMessage");
const deleteButton = document.getElementById("deleteLibrary");
const savedLibraries = document.getElementById("savedLibraries");
let active = getActiveLibrary();

function updateActiveLibraryLabel() {
  const label = document.getElementById("activeLibrary");
  if (label) label.textContent = `Biblioteca em uso: ${active === DEFAULT_LIBRARY_URL ? "Peloponeso" : getLibraryNames()[active] || new URL(active).host + new URL(active).pathname}`;
}

function renderOptions() {
  select.replaceChildren(...getLibraries().map((url) => {
    const option = document.createElement("option");
    option.value = url;
    option.textContent = url === DEFAULT_LIBRARY_URL ? "Peloponeso (padrão)" : getLibraryNames()[url] || `${new URL(url).host}${new URL(url).pathname}`;
    option.selected = url === active;
    return option;
  }));
  savedLibraries.replaceChildren(...getLibraries().filter((url) => url !== DEFAULT_LIBRARY_URL && url !== active).map((url) => {
    const row = document.createElement("div");
    row.className = "saved-library-row";
    const label = document.createElement("span");
    label.textContent = getLibraryNames()[url] || `${new URL(url).host}${new URL(url).pathname}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remover";
    remove.setAttribute("aria-label", `Remover ${label.textContent} das bibliotecas salvas`);
    remove.addEventListener("click", () => {
      if (!confirm(`Remover “${label.textContent}” das bibliotecas salvas?`)) return;
      saveLibraries(getLibraries().filter((item) => item !== url), active);
      renderOptions();
      message.textContent = "Biblioteca removida das salvas.";
    });
    row.append(label, remove);
    return row;
  }));
}

renderOptions();
deleteButton.disabled = active === DEFAULT_LIBRARY_URL;
updateActiveLibraryLabel();

function clearSharedKey() {
  const url = new URL(location.href);
  url.searchParams.delete("key");
  history.replaceState(null, "", url);
}

document.getElementById("addLibrary").addEventListener("click", async () => {
  try {
    const url = await decodeLibraryKey(input.value);
    const books = await validateLibrary(url);
    const names = getLibraryNames();
    names[url] = nameInput.value.trim() || `${new URL(url).host}${new URL(url).pathname}`;
    saveLibraries([...getLibraries(), url], url, names);
    active = url;
    clearSharedKey();
    input.value = "";
    nameInput.value = "";
    renderOptions();
    deleteButton.disabled = false;
    updateActiveLibraryLabel();
    message.textContent = `Biblioteca validada e salva (${books.length} ${books.length === 1 ? "livro" : "livros"}).`;
    window.dispatchEvent(new CustomEvent("librarychange", { detail: { url: active } }));
  } catch (error) {
    message.textContent = error.message;
  }
});

select.addEventListener("change", () => {
  active = select.value;
  saveLibraries(getLibraries(), active);
  deleteButton.disabled = active === DEFAULT_LIBRARY_URL;
  updateActiveLibraryLabel();
  renderOptions();
  clearSharedKey();
  message.textContent = "Biblioteca selecionada.";
  window.dispatchEvent(new CustomEvent("librarychange", { detail: { url: active } }));
});

deleteButton.addEventListener("click", () => {
  if (active === DEFAULT_LIBRARY_URL) return;
  if (!confirm("Excluir esta biblioteca salva? Essa ação não pode ser desfeita.")) return;

  const libraries = getLibraries().filter((url) => url !== active);
  active = DEFAULT_LIBRARY_URL;
  saveLibraries(libraries, active);
  clearSharedKey();
  renderOptions();
  deleteButton.disabled = true;
  updateActiveLibraryLabel();
  message.textContent = "Biblioteca excluída. Voltando à biblioteca Peloponeso.";
  window.dispatchEvent(new CustomEvent("librarychange", { detail: { url: active } }));
});

document.getElementById("shareLibrary").addEventListener("click", async () => {
  const key = encodeKey(active);
  try {
    await navigator.clipboard.writeText(key);
    message.textContent = "Chave copiada.";
  } catch {
    message.textContent = key;
  }
});

document.getElementById("clearReadingProgress").addEventListener("click", () => {
  if (!confirm("Apagar todo o progresso de leitura salvo neste navegador?")) return;
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=", 1)[0];
    if (name.startsWith("reading_")) {
      document.cookie = `${name}=; max-age=0; path=/; samesite=lax`;
    }
  }
  message.textContent = "Progresso de leitura apagado.";
  window.dispatchEvent(new Event("readingprogresschange"));
});

const keyUrl = document.getElementById("keyUrl");
const generatedKey = document.getElementById("generatedKey");
const copyGeneratedKey = document.getElementById("copyGeneratedKey");

document.getElementById("convertKey").addEventListener("click", () => {
  try {
    generatedKey.value = encodeKey(normalizeLibraryUrl(keyUrl.value));
    copyGeneratedKey.disabled = false;
    message.textContent = "Chave gerada.";
  } catch (error) {
    generatedKey.value = "";
    copyGeneratedKey.disabled = true;
    message.textContent = error.message;
  }
});

copyGeneratedKey.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(generatedKey.value);
    message.textContent = "Chave copiada.";
  } catch {
    generatedKey.select();
    message.textContent = "Selecione e copie a chave.";
  }
});

menu.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    menu.open = false;
    menu.querySelector("summary").focus();
  }
});
