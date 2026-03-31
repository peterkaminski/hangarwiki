import { config } from '../config.js';

interface ForgeServerInfo {
  flavor: 'forgejo' | 'gitea' | 'unknown';
  version: string;
  apiVersion: string;
}

interface ForgeRepo {
  id: number;
  name: string;
  full_name: string;
  ssh_url: string;
  clone_url: string;
  html_url: string;
}

interface ForgeKey {
  id: number;
  title: string;
  key: string;
}

interface ForgeWebhook {
  id: number;
  type: string;
  url: string;
  active: boolean;
}

/**
 * API client for Forgejo/Gitea. Targets the Gitea-compatible API as baseline,
 * with feature-gated Forgejo-specific endpoints.
 */
export class ForgeClient {
  private baseUrl: string;
  private token: string;
  private serverInfo: ForgeServerInfo | null = null;

  constructor(baseUrl?: string, token?: string) {
    this.baseUrl = (baseUrl ?? config.forgeUrl).replace(/\/$/, '');
    this.token = token ?? config.forgeApiToken;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const headers: Record<string, string> = {
      'Authorization': `token ${this.token}`,
      'Content-Type': 'application/json',
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Forge API error: ${res.status} ${res.statusText} — ${text}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  /** Detect server flavor and version. Call once on startup. */
  async detectServer(): Promise<ForgeServerInfo> {
    if (this.serverInfo) return this.serverInfo;

    const version = await this.request<{ version: string }>('GET', '/version');

    // Forgejo includes "forgejo" in the version string or has a Forgejo header
    let flavor: ForgeServerInfo['flavor'] = 'unknown';
    if (version.version.toLowerCase().includes('forgejo')) {
      flavor = 'forgejo';
    } else if (version.version.match(/^\d+\.\d+/)) {
      // Plain semver is typical Gitea
      flavor = 'gitea';
    }

    this.serverInfo = {
      flavor,
      version: version.version,
      apiVersion: 'v1',
    };

    return this.serverInfo;
  }

  /** Check if a Forgejo-specific feature is available. */
  isForgejo(): boolean {
    return this.serverInfo?.flavor === 'forgejo';
  }

  // ── Repository operations ──

  async createRepo(name: string, options?: { description?: string; private?: boolean }): Promise<ForgeRepo> {
    return this.request<ForgeRepo>('POST', '/user/repos', {
      name,
      description: options?.description ?? '',
      private: options?.private ?? false,
      auto_init: true,
      default_branch: 'main',
    });
  }

  async deleteRepo(owner: string, repo: string): Promise<void> {
    await this.request('DELETE', `/repos/${owner}/${repo}`);
  }

  async getRepo(owner: string, repo: string): Promise<ForgeRepo> {
    return this.request<ForgeRepo>('GET', `/repos/${owner}/${repo}`);
  }

  // ── Deploy keys (for server access to repos) ──

  async addDeployKey(owner: string, repo: string, title: string, publicKey: string, readOnly = false): Promise<ForgeKey> {
    return this.request<ForgeKey>('POST', `/repos/${owner}/${repo}/keys`, {
      title,
      key: publicKey,
      read_only: readOnly,
    });
  }

  async listDeployKeys(owner: string, repo: string): Promise<ForgeKey[]> {
    return this.request<ForgeKey[]>('GET', `/repos/${owner}/${repo}/keys`);
  }

  async deleteDeployKey(owner: string, repo: string, keyId: number): Promise<void> {
    await this.request('DELETE', `/repos/${owner}/${repo}/keys/${keyId}`);
  }

  // ── User SSH keys ──

  async addUserKey(title: string, publicKey: string): Promise<ForgeKey> {
    return this.request<ForgeKey>('POST', '/user/keys', {
      title,
      key: publicKey,
    });
  }

  async listUserKeys(): Promise<ForgeKey[]> {
    return this.request<ForgeKey[]>('GET', '/user/keys');
  }

  async deleteUserKey(keyId: number): Promise<void> {
    await this.request('DELETE', `/user/keys/${keyId}`);
  }

  // ── Webhooks ──

  async createWebhook(owner: string, repo: string, targetUrl: string, secret: string): Promise<ForgeWebhook> {
    return this.request<ForgeWebhook>('POST', `/repos/${owner}/${repo}/hooks`, {
      type: 'forgejo', // Falls back gracefully — Gitea accepts 'gitea' type
      config: {
        url: targetUrl,
        content_type: 'json',
        secret,
      },
      events: ['push'],
      active: true,
    });
  }

  async listWebhooks(owner: string, repo: string): Promise<ForgeWebhook[]> {
    return this.request<ForgeWebhook[]>('GET', `/repos/${owner}/${repo}/hooks`);
  }

  async deleteWebhook(owner: string, repo: string, hookId: number): Promise<void> {
    await this.request('DELETE', `/repos/${owner}/${repo}/hooks/${hookId}`);
  }

  // ── Current user ──

  async getCurrentUser(): Promise<{ login: string; email: string; id: number }> {
    return this.request('GET', '/user');
  }
}
