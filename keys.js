export const DEFAULT_LIBRARY_URL =
  "https://raw.githubusercontent.com/kauanmezavila/peloponeso-library/main/books.json";

const COOKIE = "peloponeso_libraries";
const ACTIVE_COOKIE = "peloponeso_active_library";
const NAMES_COOKIE = "peloponeso_library_names";

export function encodeKey(url) {
  return btoa(
    new TextEncoder()
      .encode(url)
      .reduce((value, byte) => value + String.fromCharCode(byte), ""),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function decodeKey(key) {
  const base64 = key.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return new TextDecoder().decode(
    Uint8Array.from(binary, (char) => char.charCodeAt(0)),
  );
}

export async function decodeLibraryKey(key) {
  try {
    return normalizeLibraryUrl(decodeKey(key));
  } catch {
    if (!("DecompressionStream" in window))
      throw new Error("Este navegador não consegue decodificar essa chave.");
    const base64 = key.trim().replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    return normalizeLibraryUrl(await new Response(stream).text());
  }
}

export function normalizeLibraryUrl(value) {
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Use um endereço HTTP ou HTTPS.");
  return url.href;
}

export function extractBooks(data) {
  let books;
  if (Array.isArray(data)) books = data;
  const collection =
    data?.books ?? data?.items ?? data?.results ?? data?.library;
  if (!books && Array.isArray(collection)) books = collection;
  if (!books && collection && typeof collection === "object")
    books = Object.entries(collection).map(([title, book]) => ({
      ...(book && typeof book === "object" ? book : {}),
      title:
        book && typeof book === "object"
          ? book.title || book.name || title
          : undefined,
    }));
  if (!books && data && typeof data === "object") {
    const entries = Object.entries(data).filter(
      ([, book]) => book && typeof book === "object",
    );
    if (
      entries.length &&
      entries.every(([, book]) => book.title || book.name)
    ) {
      books = entries.map(([title, book]) => ({
        ...book,
        title: book.title || book.name || title,
      }));
    }
  }
  return (
    books?.map((entry) => {
      const book = entry && typeof entry === "object" ? entry : {};
      return {
        ...book,
        title: book.title || book.name,
        author: book.author || book.creator || "",
        pdf: book.pdf || book.path || book.file || book.url || "",
      };
    }) ?? null
  );
}

export async function validateLibrary(url) {
  let response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Não foi possível acessar esse JSON. Confira o link e se o servidor permite acesso pelo navegador.",
    );
  }
  if (!response.ok)
    throw new Error(`O servidor respondeu com erro ${response.status}.`);

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("O link não retornou um JSON válido.");
  }

  const books = extractBooks(data);
  if (
    !books ||
    books.some(
      (book) => !book || typeof book !== "object" || !(book.title || book.name),
    )
  ) {
    throw new Error(
      "O JSON não tem um catálogo reconhecido. Cada livro precisa ter title ou name.",
    );
  }
  return books;
}

function readCookie(name) {
  return document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function getLibraries() {
  try {
    return [
      DEFAULT_LIBRARY_URL,
      ...JSON.parse(decodeURIComponent(readCookie(COOKIE) || "%5B%5D")),
    ].filter((url, index, all) => all.indexOf(url) === index);
  } catch {
    return [DEFAULT_LIBRARY_URL];
  }
}

export function getLibraryNames() {
  try {
    return JSON.parse(decodeURIComponent(readCookie(NAMES_COOKIE) || "%7B%7D"));
  } catch {
    return {};
  }
}

export function saveLibraries(
  urls,
  active = urls[0],
  names = getLibraryNames(),
) {
  const custom = urls.filter((url) => url !== DEFAULT_LIBRARY_URL);
  const value = encodeURIComponent(JSON.stringify(custom));
  const namesValue = encodeURIComponent(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(names).filter(([url]) => custom.includes(url)),
      ),
    ),
  );
  if (value.length + namesValue.length > 3800)
    throw new Error("Limite de bibliotecas salvas no cookie atingido.");
  document.cookie = `${COOKIE}=${value}; max-age=31536000; path=/; samesite=lax`;
  document.cookie = `${NAMES_COOKIE}=${namesValue}; max-age=31536000; path=/; samesite=lax`;
  document.cookie = `${ACTIVE_COOKIE}=${encodeURIComponent(active)}; max-age=31536000; path=/; samesite=lax`;
}

export function getActiveLibrary() {
  const key = new URLSearchParams(location.search).get("key");
  if (key) {
    try {
      const url = normalizeLibraryUrl(decodeKey(key));
      saveLibraries([...getLibraries(), url], url);
      return url;
    } catch {
      // Invalid shared key: fall back to the saved or default library.
    }
  }
  try {
    const active = normalizeLibraryUrl(
      decodeURIComponent(readCookie(ACTIVE_COOKIE) || ""),
    );
    return getLibraries().includes(active) ? active : DEFAULT_LIBRARY_URL;
  } catch {
    saveLibraries(getLibraries(), DEFAULT_LIBRARY_URL);
    return DEFAULT_LIBRARY_URL;
  }
}
