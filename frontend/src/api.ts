export type User = {
  id: string;
  email: string;
  createdAt: string;
};

export type Monitor = {
  id: string;
  name: string;
  url: string;
  intervalSeconds: 60 | 300 | 600;
  timeoutMs: number;
  expectedStatusCode: number;
  enabled: boolean;
  state: 'UNKNOWN' | 'UP' | 'DOWN';
  lastCheckedAt?: string | null;
};

type AuthResponse = {
  accessToken: string;
  user: User;
};

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the generic error when the body is not JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  register(email: string, password: string) {
    return request<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  login(email: string, password: string) {
    return request<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  listMonitors(token: string) {
    return request<Monitor[]>('/api/v1/monitors', {}, token);
  },

  createMonitor(
    token: string,
    input: {
      name: string;
      url: string;
      intervalSeconds: 60 | 300 | 600;
      timeoutMs: number;
      expectedStatusCode: number;
      enabled: boolean;
    },
  ) {
    return request<Monitor>(
      '/api/v1/monitors',
      { method: 'POST', body: JSON.stringify(input) },
      token,
    );
  },

  deleteMonitor(token: string, id: string) {
    return request<void>(`/api/v1/monitors/${id}`, { method: 'DELETE' }, token);
  },

  createStatusPage(
    token: string,
    input: { name: string; slug: string; published: boolean; monitorIds: string[] },
  ) {
    return request<{ id: string; slug: string }>(
      '/api/v1/status-pages',
      { method: 'POST', body: JSON.stringify(input) },
      token,
    );
  },
};
