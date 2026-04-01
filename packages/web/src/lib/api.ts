const API_BASE = '/api';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error ?? `API error: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Auth
export const auth = {
  login: (email: string) => request<{ ok: boolean; message: string }>('POST', '/auth/login', { email }),
  me: () => request<{ user: User }>('GET', '/auth/me'),
  logout: () => request<{ ok: boolean }>('POST', '/auth/logout'),
  exportKey: () => request<{ privateKey: string }>('GET', '/auth/export-key'),
  updateProfile: (updates: { displayName?: string }) =>
    request<{ user: User }>('PATCH', '/auth/me', updates),
};

// Wikis
export const wikis = {
  list: () => request<{ wikis: Wiki[] }>('GET', '/wikis'),
  get: (slug: string) => request<{ wiki: Wiki }>('GET', `/wikis/${slug}`),
  create: (slug: string, title: string, visibility?: 'public' | 'private') =>
    request<{ wiki: Wiki }>('POST', '/wikis', { slug, title, visibility }),
  update: (slug: string, updates: Partial<Pick<Wiki, 'title' | 'visibility' | 'incipientLinkStyle'>>) =>
    request<{ wiki: Wiki }>('PATCH', `/wikis/${slug}`, updates),
};

// Pages
export const pages = {
  list: (wiki: string) => request<{ pages: PageInfo[] }>('GET', `/wikis/${wiki}/pages`),
  get: (wiki: string, urlPath: string) => request<{ page: PageContent }>('GET', `/wikis/${wiki}/pages/${urlPath}`),
  save: (wiki: string, path: string, content: string, message?: string) =>
    request<{ page: PageContent }>('PUT', `/wikis/${wiki}/pages`, { path, content, message }),
  create: (wiki: string, title: string, content: string) =>
    request<{ page: PageContent }>('PUT', `/wikis/${wiki}/pages`, { title, content }),
  delete: (wiki: string, urlPath: string) => request<{ ok: boolean }>('DELETE', `/wikis/${wiki}/pages/${urlPath}`),
  history: (wiki: string, urlPath: string) =>
    request<{ history: HistoryEntry[] }>('GET', `/wikis/${wiki}/history/${urlPath}`),
  backlinks: (wiki: string, urlPath: string) =>
    request<{ backlinks: PageInfo[] }>('GET', `/wikis/${wiki}/backlinks/${urlPath}`),
};

// Types
export interface User {
  id: string;
  email: string;
  displayName: string | null;
  publicKey: string | null;
}

export interface Wiki {
  id: string;
  slug: string;
  title: string;
  visibility: 'public' | 'private';
  incipientLinkStyle: 'create' | 'highlight';
}

export interface PageInfo {
  path: string;
  title: string;
  urlPath: string;
}

export interface PageContent {
  path: string;
  title: string;
  content: string;
  urlPath: string;
}

export interface HistoryEntry {
  hash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
}
