import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const canvas = document.getElementById("pdfCanvas");
const context = canvas.getContext("2d");

const pdfUrlInput = document.getElementById("pdfUrl");
const loadButton = document.getElementById("loadButton");
const previousButton = document.getElementById("previousButton");
const nextButton = document.getElementById("nextButton");
const currentPageInput = document.getElementById("currentPage");
const totalPages = document.getElementById("totalPages");
const zoomOutButton = document.getElementById("zoomOut");
const zoomInButton = document.getElementById("zoomIn");
const zoomText = document.getElementById("zoomText");
const fitButton = document.getElementById("fitButton");
const fullscreenButton = document.getElementById("fullscreenButton");
const readerContainer = document.getElementById("readerContainer");
const readerShell = document.getElementById("readerShell");
const message = document.getElementById("message");
const progress = document.getElementById("progress");

let pdf = null;
let pageNumber = 1;
let scale = 1.2;
let isRendering = false;
let pendingPage = null;
let readingCookie = "";

function getSavedPage() {
  const page = Number.parseInt(
    document.cookie.split("; ").find((cookie) => cookie.startsWith(`${readingCookie}=`))?.split("=")[1],
    10,
  );
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function savePage(page) {
  document.cookie = `${readingCookie}=${page}; max-age=31536000; path=/; samesite=lax`;
}

function setMessage(text) {
  message.textContent = text;
  message.hidden = false;
  canvas.style.display = "none";
}

function hideMessage() {
  message.hidden = true;
  canvas.style.display = "block";
}

function updateControls() {
  const hasPdf = Boolean(pdf);
  previousButton.disabled = !hasPdf || pageNumber <= 1;
  nextButton.disabled = !hasPdf || pageNumber >= pdf?.numPages;
  currentPageInput.disabled = !hasPdf;
  zoomOutButton.disabled = !hasPdf || scale <= 0.4;
  zoomInButton.disabled = !hasPdf || scale >= 3;
  fitButton.disabled = !hasPdf;
  fullscreenButton.disabled = !hasPdf;

  zoomText.textContent = `${Math.round(scale * 100)}%`;
}

async function renderPage(nextPage) {
  if (!pdf) return;

  if (isRendering) {
    pendingPage = nextPage;
    return;
  }

  isRendering = true;
  updateControls();

  try {
    const page = await pdf.getPage(nextPage);
    const viewport = page.getViewport({ scale });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    hideMessage();

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    pageNumber = nextPage;
    currentPageInput.value = String(nextPage);
    savePage(nextPage);
  } catch (error) {
    console.error("Error rendering page:", error);
    setMessage("Não foi possível exibir esta página. Tente novamente.");
  } finally {
    isRendering = false;
    updateControls();

    if (pendingPage !== null) {
      const queuedPage = pendingPage;
      pendingPage = null;
      renderPage(queuedPage);
    }
  }
}

async function loadPdf(url) {
  const trimmedUrl = url.trim();

  if (!trimmedUrl) {
    setMessage("Insira o endereço de um PDF para começar a ler.");
    return;
  }

  setMessage("Carregando o livro…");
  readingCookie = `reading_${Array.from(new TextEncoder().encode(trimmedUrl), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  progress.style.width = "0%";
  loadButton.disabled = true;
  pdf = null;
  updateControls();

  try {
    const loadingTask = pdfjsLib.getDocument({ url: trimmedUrl });

    loadingTask.onProgress = ({ loaded, total }) => {
      if (total) {
        progress.style.width = `${Math.min((loaded / total) * 100, 100)}%`;
      }
    };

    pdf = await loadingTask.promise;
    totalPages.textContent = String(pdf.numPages);
    pageNumber = Math.min(getSavedPage(), pdf.numPages);
    currentPageInput.min = "1";
    currentPageInput.max = String(pdf.numPages);
    currentPageInput.value = String(pageNumber);
    progress.style.width = "100%";

    await renderPage(pageNumber);
  } catch (error) {
    console.error("Error loading PDF:", error);
    pdf = null;
    totalPages.textContent = "0";
    progress.style.width = "0%";
    setMessage("Não foi possível abrir este PDF. Confira o endereço e tente novamente.");
  } finally {
    loadButton.disabled = false;
    updateControls();
  }
}

function getBookFromQuery() {
  const bookPath = new URLSearchParams(window.location.search).get("book");

  if (!bookPath) return null;

  if (/^https?:\/\//i.test(bookPath)) {
    return bookPath;
  }

  const normalizedPath = bookPath.endsWith(".pdf") ? bookPath : `${bookPath}.pdf`;
  return `../${normalizedPath.replace(/^\.\//, "")}`;
}

loadButton.addEventListener("click", () => loadPdf(pdfUrlInput.value));

pdfUrlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loadPdf(pdfUrlInput.value);
  }
});

previousButton.addEventListener("click", () => {
  if (pdf && pageNumber > 1) {
    renderPage(pageNumber - 1);
  }
});

nextButton.addEventListener("click", () => {
  if (pdf && pageNumber < pdf.numPages) {
    renderPage(pageNumber + 1);
  }
});

currentPageInput.addEventListener("change", () => {
  if (!pdf) return;

  const requestedPage = Math.min(
    Math.max(Number.parseInt(currentPageInput.value, 10) || 1, 1),
    pdf.numPages,
  );

  currentPageInput.value = String(requestedPage);
  renderPage(requestedPage);
});

zoomInButton.addEventListener("click", () => {
  scale = Math.min(scale + 0.2, 3);
  renderPage(pageNumber);
});

zoomOutButton.addEventListener("click", () => {
  scale = Math.max(scale - 0.2, 0.4);
  renderPage(pageNumber);
});

fitButton.addEventListener("click", async () => {
  if (!pdf) return;

  try {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(readerContainer.clientWidth - 40, 240);
    scale = Math.min(availableWidth / viewport.width, 3);
    renderPage(pageNumber);
  } catch (error) {
    console.error("Unable to fit page to width:", error);
  }
});

fullscreenButton.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      await readerShell.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    console.error("Fullscreen error:", error);
  }
});

const initialBook = getBookFromQuery();

if (initialBook) {
  pdfUrlInput.value = initialBook;
  loadPdf(initialBook);
} else {
  setMessage("Insira o endereço de um PDF para começar a ler.");
}

updateControls();
