const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      if (typeof window !== 'undefined') localStorage.setItem('token', token);
    } else {
      if (typeof window !== 'undefined') localStorage.removeItem('token');
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
      return this.token;
    }
    return null;
  }

  // Get current i18n language for sending to backend.
  // The backend's langMiddleware reads ?lang= (highest priority) > Accept-Language > 'en'.
  // We pass it as ?lang= because it works for every HTTP client and is the most reliable
  // way to tell the backend what language to return API responses in.
  private getCurrentLang(): string {
    if (typeof window === 'undefined') return 'en';
    try {
      // i18next stores selected language under 'i18nextLng' in localStorage
      const stored = window.localStorage.getItem('i18nextLng');
      if (stored) return stored.split('-')[0]; // normalize 'hi-IN' -> 'hi'
    } catch {
      // ignore
    }
    return (window.navigator?.language || 'en').split('-')[0];
  }

  private buildUrl(endpoint: string): string {
    const lang = this.getCurrentLang();
    const sep = endpoint.includes('?') ? '&' : '?';
    return `${API_URL}${endpoint}${sep}lang=${encodeURIComponent(lang)}`;
  }

  private async request(endpoint: string, options: RequestOptions = {}): Promise<any> {
    const { method = 'GET', body, headers = {} } = options;
    const token = this.getToken();

    const config: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };

    const url = this.buildUrl(endpoint);
    let res: Response;
    try {
      res = await fetch(url, config);
    } catch (networkErr: any) {
      throw new Error(networkErr?.message || 'Network error');
    }

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      // Auto-recover from auth failures: a stale JWT (e.g. secret rotated, or
      // token issued by an older deployment) should never leave the user stuck
      // staring at a cryptic "Invalid token" toast. Wipe credentials and bounce
      // to /login so they can re-authenticate cleanly.
      // But don't redirect for "wrong password" errors - those should be shown to the user.
      const isWrongPasswordError = data?.error?.toLowerCase()?.includes('current password') ||
        data?.error?.toLowerCase()?.includes('incorrect');
      if (res.status === 401 && typeof window !== 'undefined' && !isWrongPasswordError) {
        const hadToken = !!this.getToken();
        this.setToken(null);
        try {
          window.localStorage.removeItem('user');
        } catch {
          /* ignore storage errors (private mode etc.) */
        }
        if (hadToken && !window.location.pathname.startsWith('/login')) {
          const next = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.assign(`/login?next=${next}`);
        }
      }
      const err: any = new Error(data?.error || `Request failed with status ${res.status}`);
      err.status = res.status;
      throw err;
    }

    return data;
  }

  get(endpoint: string) { return this.request(endpoint); }
  post(endpoint: string, body?: unknown) { return this.request(endpoint, { method: 'POST', body }); }
  put(endpoint: string, body?: unknown) { return this.request(endpoint, { method: 'PUT', body }); }
  patch(endpoint: string, body?: unknown) { return this.request(endpoint, { method: 'PATCH', body }); }
  delete(endpoint: string, body?: unknown) { return this.request(endpoint, { method: 'DELETE', body }); }
}

export const api = new ApiClient();
export default api;