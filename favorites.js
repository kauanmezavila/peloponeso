const STORAGE_KEY = "peloponeso_favorites";

export function favoriteId(book) {
  return String(book.pdf || book.path || book.url || book.title || "");
}

export function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function toggleFavorite(book) {
  const id = favoriteId(book);
  const favorites = getFavorites();
  const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("favoriteschange"));
  return next.includes(id);
}

export function isFavorite(book) {
  return getFavorites().includes(favoriteId(book));
}
