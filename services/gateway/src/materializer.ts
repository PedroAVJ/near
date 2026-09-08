import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { GatewayError } from "./errors.js";
import { GitHubRepository } from "./github-repository.js";
import { isReadableRecordPath } from "./policy.js";
import type { Tenant } from "./types.js";

const execFileAsync = promisify(execFile);

export interface MaterializedNear {
  directory: string;
  commit: string;
  allowedPaths: ReadonlySet<string>;
  dispose(): Promise<void>;
}

export class NearMaterializer {
  constructor(
    private readonly repository: GitHubRepository,
    private readonly githubToken: string,
    private readonly askPassPath = path.resolve(process.cwd(), "scripts/git-askpass.sh"),
  ) {}

  async materialize(tenant: Tenant, publicOnly: boolean): Promise<MaterializedNear> {
    return publicOnly ? this.materializePublic(tenant) : this.materializePrivate(tenant);
  }

  private async materializePrivate(tenant: Tenant): Promise<MaterializedNear> {
    const directory = await mkdtemp(path.join(tmpdir(), "near-private-"));
    const checkout = path.join(directory, "repo");
    const commit = await this.repository.headCommit(tenant);
    try {
      await execFileAsync(
        "git",
        [
          "clone",
          "--quiet",
          "--depth=1",
          "--single-branch",
          `--branch=${tenant.branch}`,
          `https://github.com/${tenant.repositoryOwner}/${tenant.repositoryName}.git`,
          checkout,
        ],
        {
          timeout: 90_000,
          maxBuffer: 1_000_000,
          env: {
            PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
            GIT_ASKPASS: this.askPassPath,
            GIT_TERMINAL_PROMPT: "0",
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_CONFIG_GLOBAL: "/dev/null",
            NEAR_GITHUB_TOKEN: this.githubToken,
          },
        },
      );
      await rm(path.join(checkout, ".git"), { recursive: true, force: true });
      const allowedPaths = new Set(await walkReadableFiles(checkout));
      return materialized(checkout, directory, commit, allowedPaths);
    } catch {
      await rm(directory, { recursive: true, force: true });
      throw new GatewayError(502, "repository_materialization_failed", "Near could not open that repository for a question.");
    }
  }

  private async materializePublic(tenant: Tenant): Promise<MaterializedNear> {
    const directory = await mkdtemp(path.join(tmpdir(), "near-public-"));
    const checkout = path.join(directory, "repo");
    await mkdir(checkout);
    try {
      const summaries = await this.repository.listFiles(tenant, true);
      if (summaries.length > 500) {
        throw new GatewayError(413, "public_tree_too_large", "That public Near is too large for one question.");
      }
      const totalBytes = summaries.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > 12_000_000) {
        throw new GatewayError(413, "public_tree_too_large", "That public Near is too large for one question.");
      }
      await mapConcurrent(summaries, 6, async (summary) => {
        const file = await this.repository.readFile(tenant, summary.path, true);
        const destination = path.join(checkout, ...summary.path.split("/"));
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, file.content, { encoding: "utf8", mode: 0o444 });
      });
      const commit = summaries[0]?.repositoryCommit ?? (await this.repository.headCommit(tenant));
      return materialized(checkout, directory, commit, new Set(summaries.map((file) => file.path)));
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
}

function materialized(
  checkout: string,
  disposableRoot: string,
  commit: string,
  allowedPaths: ReadonlySet<string>,
): MaterializedNear {
  return {
    directory: checkout,
    commit,
    allowedPaths,
    async dispose() {
      await rm(disposableRoot, { recursive: true, force: true });
    },
  };
}

export async function walkReadableFiles(root: string, relative = ""): Promise<string[]> {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.isSymbolicLink()) continue;
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await walkReadableFiles(root, child)));
    else if (entry.isFile() && isReadableRecordPath(child)) files.push(child);
  }
  return files;
}

export async function readMaterializedFile(root: string, relative: string, maxBytes = 32_000): Promise<string> {
  const content = await readFile(path.join(root, ...relative.split("/")), "utf8");
  return content.slice(0, maxBytes);
}

async function mapConcurrent<T>(items: T[], concurrency: number, action: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        if (item !== undefined) await action(item);
      }
    }),
  );
}
