import { extractBooks, getActiveLibrary } from "./keys.js";
import { favoriteId, getFavorites } from "./favorites.js";

const shelf = document.getElementById("home-books");
const placeholder = "img/book-placeholder.jpg";
let pdfjsLib;
let currentBooks = [];

async function loadCover(book) {
  try {
    pdfjsLib ??=
      await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
    const pdf = await pdfjsLib.getDocument({ url: book.pdf }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const scale = 240 / viewport.width;
    const thumb = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(thumb.width);
    canvas.height = Math.ceil(thumb.height);
    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport: thumb,
    }).promise;
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    try {
      const query = encodeURIComponent(
        `title:"${book.title}" author:"${book.author || ""}"`,
      );
      const response = await fetch(
        `https://openlibrary.org/search.json?q=${query}&limit=8&fields=cover_i`,
      );
      const cover = (await response.json()).docs?.find(
        (item) => item.cover_i,
      )?.cover_i;
      return cover
        ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg`
        : placeholder;
    } catch {
      return placeholder;
    }
  }
}

function readerPdfUrl(book) {
  const source = String(
    book.pdf || book.path || book.file || book.url || "",
  ).trim();
  if (/^https?:\/\//i.test(source)) return source;
  const path = source.replace(/^\.\//, "");
  return `../${path.endsWith(".pdf") ? path : `${path}.pdf`}`;
}

function savedPage(book) {
  const hexUrl = Array.from(
    new TextEncoder().encode(readerPdfUrl(book)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const name = `reading_${hexUrl}=`;
  const value = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(name))
    ?.slice(name.length);
  const page = Number.parseInt(value, 10);
  return page > 1 ? page : 0;
}

function createShelfCard(book, note = "") {
  const link = document.createElement("a");
  link.className = "shelf-book";
  link.href = `read/?book=${encodeURIComponent(book.pdf || book.path || book.file || book.url || "")}`;
  const image = document.createElement("img");
  image.src = book.image || placeholder;
  image.alt = `Capa de ${book.title}`;
  image.loading = "lazy";
  image.onerror = () => {
    image.onerror = null;
    image.src = placeholder;
    image.classList.remove("skeleton");
  };
  if (book.image) image.onload = () => image.classList.remove("skeleton");
  else {
    image.classList.add("skeleton");
    loadCover(book).then((cover) => {
      image.onload = () => image.classList.remove("skeleton");
      image.src = cover;
    });
  }
  const title = document.createElement("strong");
  title.textContent = book.title;
  const author = document.createElement("span");
  author.textContent = note || book.author || "Autor desconhecido";
  link.append(image, title, author);
  return link;
}

function renderPersonalShelves() {
  const reading = currentBooks
    .map((book) => ({ book, page: savedPage(book) }))
    .filter(({ page }) => page)
    .slice(0, 4);
  const continueSection = document.getElementById("continueSection");
  continueSection.hidden = !reading.length;
  document
    .getElementById("continue-reading")
    .replaceChildren(
      ...reading.map(({ book, page }) =>
        createShelfCard(book, `Página ${page}`),
      ),
    );

  const favorites = new Set(getFavorites());
  const favoriteBooks = currentBooks
    .filter((book) => favorites.has(favoriteId(book)))
    .slice(0, 4);
  const favoritesSection = document.getElementById("favoritesSection");
  favoritesSection.hidden = !favoriteBooks.length;
  document
    .getElementById("home-favorites")
    .replaceChildren(...favoriteBooks.map((book) => createShelfCard(book)));
}

function loadShelf() {
  return fetch(getActiveLibrary())
    .then((response) => {
      if (!response.ok) throw new Error("Falha ao carregar o acervo");
      return response.json();
    })
    .then((data) => {
      const books = extractBooks(data);
      if (!books) throw new Error("Formato de catálogo inválido");
      currentBooks = books;
      const fragment = document.createDocumentFragment();
      const featured = books
        .slice(0, 10)
        .sort(() => Math.random() - 0.5)
        .slice(0, 4);

      for (const book of featured) {
        fragment.append(createShelfCard(book));
      }

      if (!books.length) {
        const empty = document.createElement("p");
        empty.className = "shelf-empty";
        empty.textContent = "O acervo está sendo preparado. Volte em breve.";
        fragment.append(empty);
      }

      shelf.replaceChildren(fragment);
      renderPersonalShelves();
    })
    .catch(() => {
      shelf.innerHTML =
        '<p class="shelf-empty">Não foi possível carregar o acervo agora.</p>';
    });
}

loadShelf();
window.addEventListener("librarychange", loadShelf);
window.addEventListener("favoriteschange", renderPersonalShelves);
window.addEventListener("readingprogresschange", renderPersonalShelves);
