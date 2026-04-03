import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';

const exec = promisify(execFile);

export interface GitAuthor {
  name: string;
  email: string;
}

export interface GitLogEntry {
  hash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
}

export interface GitDiffEntry {
  status: 'A' | 'M' | 'D' | 'R';
  path: string;
}

/**
 * Wrapper around the git CLI. Each instance is bound to a specific repo directory.
 */
export class GitService {
  private defaultEnv: Record<string, string> = {};

  constructor(private repoDir: string) {}

  /** Set environment variables that will be included in all git commands. */
  setEnv(env: Record<string, string>): void {
    Object.assign(this.defaultEnv, env);
  }

  private async git(args: string[], env?: Record<string, string>): Promise<string> {
    const { stdout } = await exec('git', args, {
      cwd: this.repoDir,
      env: { ...process.env, ...this.defaultEnv, ...env },
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    return stdout;
  }

  /** Initialize a new git repo at the configured directory. */
  async init(): Promise<void> {
    await exec('git', ['init', this.repoDir]);
  }

  /** Clone a remote repo into the configured directory. */
  async clone(remoteUrl: string): Promise<void> {
    await exec('git', ['clone', remoteUrl, this.repoDir]);
  }

  /** Check if the directory is a git repo. */
  async isRepo(): Promise<boolean> {
    try {
      await access(join(this.repoDir, '.git'), constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /** Set a git config value (local to this repo). */
  async setConfig(key: string, value: string): Promise<void> {
    await this.git(['config', key, value]);
  }

  /** Add a remote. */
  async addRemote(name: string, url: string): Promise<void> {
    await this.git(['remote', 'add', name, url]);
  }

  /** List all files tracked by git (relative paths). */
  async listFiles(path?: string): Promise<string[]> {
    const args = ['ls-files'];
    if (path) args.push(path);
    const output = await this.git(args);
    return output.trim().split('\n').filter(Boolean);
  }

  /** Read a file's contents at a given ref (defaults to HEAD). */
  async readFile(filePath: string, ref = 'HEAD'): Promise<string> {
    return this.git(['show', `${ref}:${filePath}`]);
  }

  /** Read a file from the working tree (not from git objects). */
  async readWorkingFile(filePath: string): Promise<string> {
    const { readFile } = await import('node:fs/promises');
    return readFile(join(this.repoDir, filePath), 'utf-8');
  }

  /** Write a text file to the working tree. */
  async writeFile(filePath: string, content: string): Promise<void> {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    const fullPath = join(this.repoDir, filePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
  }

  /** Write a binary file to the working tree. */
  async writeBinaryFile(filePath: string, data: Buffer): Promise<void> {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    const fullPath = join(this.repoDir, filePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }

  /** Get the absolute path for a file in the working tree. */
  getFilePath(filePath: string): string {
    return join(this.repoDir, filePath);
  }

  /** Delete a file from the working tree and stage the deletion. */
  async deleteFile(filePath: string): Promise<void> {
    await this.git(['rm', filePath]);
  }

  /** Stage a file (or all changes). */
  async add(filePath?: string): Promise<void> {
    await this.git(['add', filePath ?? '.']);
  }

  /** Commit staged changes with author identity. */
  async commit(message: string, author: GitAuthor): Promise<string> {
    const output = await this.git(['commit', '-m', message], {
      GIT_AUTHOR_NAME: author.name,
      GIT_AUTHOR_EMAIL: author.email,
      GIT_COMMITTER_NAME: 'HangarWiki',
      GIT_COMMITTER_EMAIL: 'wiki@hangarwiki.local',
    });
    // Extract commit hash from output like "[main abc1234] message" or "[main (root-commit) abc1234] message"
    const match = output.match(/\[[\w/.-]+(?: \([^)]+\))? ([a-f0-9]+)\]/);
    return match?.[1] ?? '';
  }

  /** Push to a remote. Returns true if successful, false if rejected (conflict). */
  async push(remote = 'origin', branch = 'main'): Promise<boolean> {
    try {
      await this.git(['push', remote, branch]);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('rejected') || message.includes('non-fast-forward')) {
        return false;
      }
      throw err;
    }
  }

  /** Pull from a remote. Returns true if clean, false if conflicts. */
  async pull(remote = 'origin', branch = 'main'): Promise<boolean> {
    try {
      await this.git(['pull', remote, branch]);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('CONFLICT')) {
        return false;
      }
      throw err;
    }
  }

  /** Fetch from a remote without merging. */
  async fetch(remote = 'origin'): Promise<void> {
    await this.git(['fetch', remote]);
  }

  /** Get the log for a specific file (or the whole repo). */
  async log(filePath?: string, limit = 50): Promise<GitLogEntry[]> {
    const format = '%H%n%an%n%ae%n%aI%n%s';
    const args = ['log', `--format=${format}`, `-n`, String(limit)];
    if (filePath) args.push('--', filePath);

    const output = await this.git(args);
    if (!output.trim()) return [];

    const lines = output.trim().split('\n');
    const entries: GitLogEntry[] = [];

    for (let i = 0; i + 4 < lines.length; i += 5) {
      entries.push({
        hash: lines[i],
        authorName: lines[i + 1],
        authorEmail: lines[i + 2],
        date: lines[i + 3],
        message: lines[i + 4],
      });
    }

    return entries;
  }

  /** Get the diff of a specific commit. */
  async diff(commitHash: string): Promise<string> {
    return this.git(['diff', `${commitHash}~1`, commitHash]);
  }

  /** Get the diff of a specific file at a specific commit. */
  async diffFile(commitHash: string, filePath: string): Promise<string> {
    try {
      return await this.git(['diff', `${commitHash}~1`, commitHash, '--', filePath]);
    } catch {
      // First commit has no parent — show entire file as added
      return this.git(['show', `${commitHash}:${filePath}`]).then(
        (content) => content.split('\n').map((l) => `+${l}`).join('\n'),
      );
    }
  }

  /** Get the list of files changed in a specific commit. */
  async diffNameStatus(commitHash: string): Promise<GitDiffEntry[]> {
    const output = await this.git(['diff', '--name-status', `${commitHash}~1`, commitHash]);
    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [status, path] = line.split('\t');
        return { status: status as GitDiffEntry['status'], path };
      });
  }

  /** Check if the working tree has uncommitted changes. */
  async hasChanges(): Promise<boolean> {
    const output = await this.git(['status', '--porcelain']);
    return output.trim().length > 0;
  }

  /** Get the current branch name. */
  async currentBranch(): Promise<string> {
    const output = await this.git(['branch', '--show-current']);
    return output.trim();
  }

  /** Get the current HEAD commit hash. */
  async head(): Promise<string> {
    const output = await this.git(['rev-parse', 'HEAD']);
    return output.trim();
  }
}
