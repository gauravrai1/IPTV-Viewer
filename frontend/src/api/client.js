const BASE = '/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  movies: {
    list: () => req('/movies'),
    get: (id) => req(`/movies/${id}`),
    categories: () => req('/movies/categories'),
    refresh: () => req('/movies/refresh', { method: 'POST' }),
  },
  series: {
    list: () => req('/series'),
    get: (id) => req(`/series/${id}`),
    categories: () => req('/series/categories'),
    refresh: () => req('/series/refresh', { method: 'POST' }),
  },
  downloads: {
    list: () => req('/downloads'),
    create: (data) => req('/downloads', { method: 'POST', body: JSON.stringify(data) }),
    remove: (id) => req(`/downloads/${id}`, { method: 'DELETE' }),
    retry: (id) => req(`/downloads/${id}/retry`, { method: 'POST' }),
    clear: (status) => req(`/downloads${status ? `?status=${status}` : ''}`, { method: 'DELETE' }),
  },
  settings: {
    get: () => req('/settings'),
    update: (data) => req('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  },
  status: {
    get: () => req('/status'),
  },
  watchlist: {
    list: () => req('/watchlist'),
    add: (data) => req('/watchlist', { method: 'POST', body: JSON.stringify(data) }),
    remove: (type, contentId) => req(`/watchlist/by/${type}/${contentId}`, { method: 'DELETE' }),
  },
};
