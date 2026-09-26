import { extractBooks, getActiveLibrary } from "./keys.js";
import { favoriteId, getFavorites, isFavorite, toggleFavorite } from "./favorites.js";

let pdfjsLib;

let BOOKS_URL = getActiveLibrary();
const PLACEHOLDER_COVER = "img/book-placeholder.jpg";
const OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json";
const COVER_BASE_URL = "https://covers.openlibrary.org/b/id";

const BOOKS_PER_PAGE = 20;
const coverCache = new Map();

let books = [];
let currentPage = 0;
let loadGeneration = 0;

const searchInput = document.getElementById("bookSearch");
const categoryFilter = document.getElementById("categoryFilter");
const clearFiltersButton = document.getElementById("clearFilters");
const favoritesOnlyButton = document.getElementById("favoritesOnly");

let filteredBooks = [];
const container = document.getElementById("books");
const message = document.getElementById("catalogMessage");
const count = document.getElementById("bookCount");
const loadMoreButton = document.getElementById("loadMore");
const coverObserver = new IntersectionObserver(
  (entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;

      observer.unobserve(entry.target);
      loadCoverInBackground(entry.target.dataset.book, entry.target);
    }
  },
  { rootMargin: "300px 0px" },
);

function escapeForSearch(value) {
  return String(value).replace(/"/g, '\\"');
}

async function fetchOpenLibraryCover(title, author) {
  const query = `title:"${escapeForSearch(title)}" author:"${escapeForSearch(author)}"`;

  const url =
    `${OPEN_LIBRARY_SEARCH}?q=${encodeURIComponent(query)}` +
    `&limit=8&fields=cover_i`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      return PLACEHOLDER_COVER;
    }

    const data = await response.json();

    const match = data.docs?.find((book) => book.cover_i);

    return match?.cover_i
      ? `${COVER_BASE_URL}/${match.cover_i}-L.jpg`
      : PLACEHOLDER_COVER;
  } catch (error) {
    console.warn("Não foi possível buscar a capa de:", title, error);

    return PLACEHOLDER_COVER;
  }
}

function getBookPdfUrl(book) {
  const source = String(book.pdf || book.path || "").trim();

  if (!source) {
    return null;
  }

  if (/^https?:\/\//i.test(source)) {
    return source;
  }

  const normalizedPath = source.replace(/^\.\//, "");

  return normalizedPath.endsWith(".pdf")
    ? normalizedPath
    : `${normalizedPath}.pdf`;
}

function getBookUrl(book) {
  const pdfUrl = getBookPdfUrl(book);

  return pdfUrl ? `read/?book=${encodeURIComponent(pdfUrl)}` : null;
}

function formatBookCount(bookCount) {
  return `${bookCount} ${bookCount === 1 ? "livro" : "livros"}`;
}

function createBookCard(book) {
  const article = document.createElement("article");
  article.className = "book-card";

  const bookUrl = getBookUrl(book);

  const coverLink = document.createElement("a");
  coverLink.className = "book-cover-link";
  coverLink.href = bookUrl ?? "#";
  coverLink.setAttribute("aria-label", `Abrir ${book.title}`);

  const image = document.createElement("img");

  image.className = "book-cover";
  image.src = book.image || PLACEHOLDER_COVER;
  image.alt = `Capa de ${book.title}`;
  image.loading = "lazy";
  image.decoding = "async";
  if (!book.image) image.classList.add("skeleton");
  if (book.image) image.onload = () => image.classList.remove("skeleton");

  image.onerror = () => {
    image.onerror = null;
    image.src = PLACEHOLDER_COVER;
    image.classList.remove("skeleton");
  };

  coverLink.appendChild(image);

  const info = document.createElement("div");
  info.className = "book-info";

  const title = document.createElement("h2");
  title.className = "book-title";
  title.textContent = book.title;

  const author = document.createElement("p");
  author.className = "book-author";
  author.textContent = book.author || "Autor desconhecido";

  const meta = document.createElement("div");
  meta.className = "book-meta";

  const price = document.createElement("span");
  price.className = "book-price";
  price.textContent = book.price || "Grátis";

  const readLink = document.createElement("a");
  readLink.className = "read-link";
  readLink.href = coverLink.href;
  readLink.textContent = "Ler";
  readLink.setAttribute("aria-label", `Ler ${book.title}`);

  const favoriteButton = document.createElement("button");
  favoriteButton.className = "favorite-toggle";
  favoriteButton.type = "button";
  favoriteButton.dataset.favoriteId = favoriteId(book);
  favoriteButton.setAttribute("aria-pressed", String(isFavorite(book)));
  favoriteButton.textContent = isFavorite(book) ? "★" : "☆";
  favoriteButton.setAttribute("aria-label", isFavorite(book) ? "Remover dos favoritos" : "Adicionar aos favoritos");
  favoriteButton.addEventListener("click", () => {
    const favorite = toggleFavorite(book);
    favoriteButton.setAttribute("aria-pressed", String(favorite));
    favoriteButton.textContent = favorite ? "★" : "☆";
    favoriteButton.setAttribute("aria-label", favorite ? "Remover dos favoritos" : "Adicionar aos favoritos");
    updateFavoritesButton();
    if (
      favoritesOnlyButton.getAttribute("aria-pressed") === "true" &&
      !favorite
    )
      applyFilters();
  });

  meta.append(price, readLink, favoriteButton);

  info.append(title, author, meta);

  article.append(coverLink, info);

  /*

* A capa é carregada depois que o card já apareceu.
* Isso evita que a página fique esperando todas as capas.
  */
  if (!book.image) {
    image.dataset.book = JSON.stringify(book);
    coverObserver.observe(image);
  }

  return article;
}

async function loadCoverInBackground(book, image) {
  try {
    book = typeof book === "string" ? JSON.parse(book) : book;
    const coverUrl = await getBookCover(book);

    if (image.isConnected && coverUrl) {
      image.onload = () => image.classList.remove("skeleton");
      image.src = coverUrl;
    }
  } catch (error) {
    console.warn("Não foi possível carregar a capa:", book.title, error);
  }
}

async function loadPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib =
      await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  }

  return pdfjsLib;
}

async function renderPdfCover(pdfUrl) {
  try {
    const pdfjs = await loadPdfJs();
    const pdf = await pdfjs.getDocument({
      url: pdfUrl,
    }).promise;

    const page = await pdf.getPage(1);

    const baseViewport = page.getViewport({
      scale: 1,
    });

    const targetWidth = 420;

    const scale = targetWidth / baseViewport.width;

    const viewport = page.getViewport({
      scale,
    });

    const canvas = document.createElement("canvas");

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const context = canvas.getContext("2d");

    if (!context) {
      return PLACEHOLDER_COVER;
    }

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    return canvas.toDataURL("image/jpeg", 0.9);
  } catch (error) {
    console.warn(
      "Não foi possível renderizar a primeira página do PDF como capa:",
      pdfUrl,
      error,
    );

    return PLACEHOLDER_COVER;
  }
}

async function getBookCover(book) {
  if (book.image) {
    return book.image;
  }

  const key = getBookPdfUrl(book) || `${book.title}|${book.author}`;
  if (!coverCache.has(key)) {
    coverCache.set(
      key,
      (async () => {
        const pdfUrl = getBookPdfUrl(book);
        if (pdfUrl) {
          const pdfCover = await renderPdfCover(pdfUrl);
          if (pdfCover !== PLACEHOLDER_COVER) return pdfCover;
        }
        return fetchOpenLibraryCover(book.title, book.author);
      })(),
    );
  }
  return coverCache.get(key);
}

async function renderNextPage() {
  const start = currentPage * BOOKS_PER_PAGE;

  const end = start + BOOKS_PER_PAGE;

  const pageBooks = filteredBooks.slice(start, end);

  if (pageBooks.length === 0) {
    loadMoreButton.hidden = true;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const book of pageBooks) {
    const card = createBookCard(book);

    fragment.appendChild(card);
  }

  container.appendChild(fragment);

  currentPage++;

  const hasMore = currentPage * BOOKS_PER_PAGE < filteredBooks.length;

  loadMoreButton.hidden = !hasMore;
}

async function loadBooks() {
  const generation = ++loadGeneration;
  count.textContent = "Carregando…";
  container.replaceChildren();
  loadMoreButton.hidden = true;
  try {
    const response = await fetch(BOOKS_URL, {
      cache: "default",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (generation !== loadGeneration) return;

    const bookList = extractBooks(data);
    if (!Array.isArray(bookList) || bookList.some((book) => !book.title)) {
      throw new Error("O JSON não contém livros com título.");
    }

    books = bookList;

    filteredBooks = books;

    populateCategories();

    count.textContent = formatBookCount(books.length);

    container.replaceChildren();

    currentPage = 0;

    if (books.length === 0) {
      message.hidden = false;

      message.textContent = "O acervo está vazio no momento.";

      loadMoreButton.hidden = true;

      return;
    }

    message.hidden = true;

    // Renderiza apenas o primeiro lote para a página aparecer mais rápido.
    if (
      searchInput.value ||
      favoritesOnlyButton.getAttribute("aria-pressed") === "true"
    ) applyFilters();
    else await renderNextPage();
  } catch (error) {
    if (generation !== loadGeneration) return;
    console.error("Não foi possível carregar o acervo:", error);

    count.textContent = "0 livros";

    message.hidden = false;

    message.textContent = `Não foi possível carregar esta biblioteca: ${error.message}`;

    loadMoreButton.hidden = true;
  }
}

function populateCategories() {
  const categories = [
    ...new Set(books.map((book) => book.category).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  categoryFilter.replaceChildren();

  const allOption = document.createElement("option");

  allOption.value = "";
  allOption.textContent = "Todas as categorias";

  categoryFilter.appendChild(allOption);

  for (const category of categories) {
    const option = document.createElement("option");

    option.value = category;
    option.textContent = category;

    categoryFilter.appendChild(option);
  }
}

function applyFilters() {
  const search = searchInput.value.trim().toLowerCase();

  const category = categoryFilter.value;
  const favoriteIds = new Set(getFavorites());

  filteredBooks = books.filter((book) => {
    const title = String(book.title || "").toLowerCase();

    const author = String(book.author || "").toLowerCase();

    const bookCategory = String(book.category || "");

    const matchesSearch =
      !search || title.includes(search) || author.includes(search);

    const matchesCategory = !category || bookCategory === category;
    const matchesFavorite =
      favoritesOnlyButton.getAttribute("aria-pressed") !== "true" ||
      favoriteIds.has(
        String(book.pdf || book.path || book.url || book.title || ""),
      );

    return matchesSearch && matchesCategory && matchesFavorite;
  });

  currentPage = 0;

  container.replaceChildren();

  count.textContent = formatBookCount(filteredBooks.length);

  if (filteredBooks.length === 0) {
    message.hidden = false;

    message.textContent = "Nenhum livro encontrado.";

    loadMoreButton.hidden = true;

    return;
  }

  message.hidden = true;

  renderNextPage();
}

loadMoreButton.addEventListener("click", async () => {
  loadMoreButton.disabled = true;
  loadMoreButton.textContent = "Carregando...";

  await renderNextPage();

  loadMoreButton.disabled = false;

  if (!loadMoreButton.hidden) {
    loadMoreButton.textContent = "Carregar mais";
  }
});

document.getElementById("year").textContent = new Date().getFullYear();

window.addEventListener("librarychange", (event) => {
  BOOKS_URL = event.detail.url;
  loadBooks();
});

searchInput.addEventListener("input", applyFilters);

const initialSearch = new URLSearchParams(window.location.search).get("q");
if (initialSearch) searchInput.value = initialSearch;
if (new URLSearchParams(window.location.search).get("favorites") === "1") {
  favoritesOnlyButton.setAttribute("aria-pressed", "true");
}

categoryFilter.addEventListener("change", applyFilters);

clearFiltersButton.addEventListener("click", () => {
  searchInput.value = "";
  categoryFilter.value = "";
  favoritesOnlyButton.setAttribute("aria-pressed", "false");

  applyFilters();
});

function updateFavoritesButton() {
  favoritesOnlyButton.textContent = `Só favoritos (${getFavorites().length})`;
  const favorites = new Set(getFavorites());
  container.querySelectorAll(".favorite-toggle").forEach((button) => {
    const favorite = favorites.has(button.dataset.favoriteId);
    button.setAttribute("aria-pressed", String(favorite));
    button.textContent = favorite ? "★" : "☆";
    button.setAttribute("aria-label", favorite ? "Remover dos favoritos" : "Adicionar aos favoritos");
  });
}

updateFavoritesButton();
favoritesOnlyButton.addEventListener("click", () => {
  favoritesOnlyButton.setAttribute(
    "aria-pressed",
    String(favoritesOnlyButton.getAttribute("aria-pressed") !== "true"),
  );
  applyFilters();
});
window.addEventListener("favoriteschange", updateFavoritesButton);
loadBooks();
