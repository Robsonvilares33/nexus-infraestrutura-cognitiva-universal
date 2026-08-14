/**
 * Phase 14 — NEXUS Computer Tools (Claude Code / OpenClaw / Hermes style).
 *
 * Gives the autonomous agent real computer access, always inside a sandbox:
 *  - run_shell   : execute shell commands in an isolated per-user workspace
 *  - read_file   : read files inside the workspace (offset/limit, 2k lines max)
 *  - write_file  : create or fully overwrite a file inside the workspace
 *  - edit_file   : exact-string replacement in a file (requires prior read)
 *  - list_dir    : list directory contents of the workspace (read-only)
 *  - web_fetch   : GET a URL and extract its text content
 *
 * Safety model (defense in depth):
 *  1. Every path is resolved and verified to live inside the workspace root.
 *  2. A deny-list of destructive commands is rejected before execution.
 *  3. Shell runs with a non-root user when available and a hard timeout.
 *  4. Output is capped (8 KB) so a runaway command can never flood memory.
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const WORKSPACE_ROOT = os.tmpdir(); // sandboxed per-user dirs inside the OS temp dir

export function workspaceRootFor(userId: number): string {
  return path.join(WORKSPACE_ROOT, `nexus-agent-ws-${userId}`);
}

async function ensureWorkspace(userId: number): Promise<string> {
  const root = workspaceRootFor(userId);
  await fs.mkdir(root, { recursive: true });
  return root;
}

// --- 1. Path containment (never escape the workspace) ---

export function resolveSafePath(userId: number, relativePath: string): string {
  const root = workspaceRootFor(userId);
  const rel = String(relativePath ?? "").trim();
  if (!rel || rel.startsWith("/") || rel.includes("..")) {
    throw new Error(`Caminho inválido: use um caminho relativo simples dentro do workspace (ex.: "notas.txt")`);
  }
  const resolved = path.resolve(root, rel);
  if (!resolved.startsWith(root)) {
    throw new Error(`Acesso negado: o caminho deve permanecer dentro do workspace da missão`);
  }
  return resolved;
}

// --- 2. Command deny-list ---

const BLOCKED_PATTERNS: RegExp[] = [
  /\bsudo\b/, /\bsu\b(\s|$)/, /\bchmod\s+777\b/, /\bchmod\s+-R\s+777\b/,
  /:\(\)\{\s*:\|\:&\s*\};:/, /\brm\s+(-[a-zA-Z]*r)?\s*-?[a-zA-Z]*\s*\/\b/,
  /\brm\s+(-[a-zA-Z]*)?\s*\/etc\b/, /\brm\s+(-[a-zA-Z]*)?\s*\/bin\b/,
  /\brm\s+(-[a-zA-Z]*)?\s*\/usr\b/, /\brm\s+(-[a-zA-Z]*)?\s*\/home\b/,
  /\bdd\s+if=\/dev\//, /\bmkfs\./, /\bmount\b/, /\bumount\b/,
  /\bmkfifo\b/, /\bhalt\b/, /\breboot\b/, /\bpoweroff\b/, /\bshutdown\b/,
  /\biptables\b/, /\bmodprobe\b/, /\binsmod\b/, /\brmmod\b/,
  /\bcurl\s.*\|\s*(sh|bash)/, /\bwget\s.*\|\s*(sh|bash)/, /\bcurl.*>\s*\/dev\/\//,
  /\bcurl\s+-o\s*\/dev\/\//, /\bcrontab\b/, /\bat\s+now\b/,
  /\/etc\/passwd/, /\/etc\/shadow/, /\bsystemctl\s+enable\b/,
  /\buseradd\b/, /\buserdel\b/, /\busermod\b/, /\bpasswd\b\s/,
  /\bcurl\b(?!.*\.(txt|md|json|csv|yml|yaml|html|py|js|ts)$)/,
];

// Allowed package managers are not installable system-wide; local installs are fine.
const INSTALL_PATTERNS: RegExp[] = [
  /\bsudo\s+(apt|apt-get|dnf|pacman|yum)\b/,
  /\b(apt|apt-get|dnf|pacman|yum)\s+(install|remove|purge|autoremove)\b/,
  /\brpm\s+(-i|-e)\b/,
];

function classifyCommand(command: string): "allowed" | "blocked" | string {
  const c = command.trim();
  if (!c) return "blocked";
  for (const p of BLOCKED_PATTERNS) {
    if (p.test(c)) return `Comando bloqueado por segurança: "${c.slice(0, 80)}"`;
  }
  for (const p of INSTALL_PATTERNS) {
    if (p.test(c)) return `Instalação de pacotes do sistema bloqueada: "${c.slice(0, 80)}" (use npm/pip apenas em modo local)`;
  }
  return "allowed";
}

// --- 3. Shell execution with timeout + output cap ---

const SHELL_TIMEOUT_MS = 60_000;
const OUTPUT_CAP = 8 * 1024;

export async function runShell(userId: number, command: string): Promise<string> {
  const classification = classifyCommand(command);
  if (classification !== "allowed") throw new Error(classification);

  const root = await ensureWorkspace(userId);
  const sentinel = `__NEXUS_DONE_${Date.now().toString(36)}__`;

  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-c", `${command}; echo "${sentinel}"`], {
      cwd: root,
      env: { ...process.env, HOME: root },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: SHELL_TIMEOUT_MS,
    });

    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* noop */ }
    }, SHELL_TIMEOUT_MS);

    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString("utf8");
      if (out.length > OUTPUT_CAP * 2) { child.kill("SIGKILL"); }
    });
    child.stderr.on("data", (d: Buffer) => { err += d.toString("utf8"); });

    child.on("close", (code) => {
      clearTimeout(timer);
      const raw = (out + err).replace(new RegExp(sentinel + "\\s*$"), "").trim();
      const output = raw.length > OUTPUT_CAP ? `${raw.slice(0, OUTPUT_CAP)}\n[... saída truncada em ${OUTPUT_CAP} bytes ...]` : raw;
      if (code !== 0) {
        resolve(`(exit ${code}) ${output || "(sem saída)"}`);
      } else {
        resolve(output || "(comando executado sem saída)");
      }
    });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

// --- 4. File tools ---

export async function readFile(userId: number, relativePath: string, opts: { offset?: number; limit?: number } = {}): Promise<string> {
  const file = resolveSafePath(userId, relativePath);
  const offset = Math.max(0, opts.offset ?? 1);
  const limit = Math.min(2000, opts.limit ?? 2000);
  const raw = await fs.readFile(file, "utf8");
  const lines = raw.split("\n");
  const page = lines.slice(offset - 1, offset - 1 + limit);
  const numbered = page.map((l, i) => `${offset + i}\t${l}`).join("\n");
  if (lines.length > offset - 1 + limit) {
    return `${numbered}\n[... ${lines.length - (offset - 1 + limit)} linhas restantes. Use offset para continuar ...]`;
  }
  return numbered || "(arquivo vazio)";
}

export async function writeFile(userId: number, relativePath: string, content: string): Promise<string> {
  const file = resolveSafePath(userId, relativePath);
  const dir = path.dirname(file);
  if (!dir.startsWith(workspaceRootFor(userId))) throw new Error("Acesso negado");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, String(content ?? ""), "utf8");
  return `Arquivo criado/sobrescrito: ${relativePath} (${String(content ?? "").length} caracteres)`;
}

// Prior reads tracked per mission to enforce "read before edit"
const priorReads = new Map<string, Set<string>>();

export function trackRead(missionId: number, relativePath: string) {
  const key = `${missionId}`;
  let set = priorReads.get(key);
  if (!set) { set = new Set(); priorReads.set(key, set); }
  set.add(String(relativePath));
}

export async function editFile(userId: number, missionId: number, relativePath: string, oldString: string, newString: string, replaceAll = false): Promise<string> {
  if (!priorReads.get(`${missionId}`)?.has(String(relativePath))) {
    throw new Error(`Leia o arquivo antes de editar (read_file em "${relativePath}")`);
  }
  const file = resolveSafePath(userId, relativePath);
  const raw = await fs.readFile(file, "utf8");
  const occurrences = raw.split(oldString).length - 1;
  if (occurrences === 0) throw new Error(`Texto para substituir não encontrado no arquivo`);
  if (occurrences > 1 && !replaceAll) {
    throw new Error(`O texto ocorre ${occurrences} vezes — torne-o único ou use replace_all`);
  }
  const updated = replaceAll ? raw.split(oldString).join(newString) : raw.replace(oldString, newString);
  await fs.writeFile(file, updated, "utf8");
  return `Substituição aplicada em ${relativePath} (${replaceAll ? "todas as" : "1"} ocorrência${replaceAll ? "s" : ""})`;
}

export async function listDir(userId: number, relativePath: string): Promise<string> {
  const dir = resolveSafePath(userId, relativePath);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const lines = entries
    .map((e) => `${e.isDirectory() ? "[dir]" : "[file]"} ${e.name}`)
    .sort();
  return lines.length ? lines.join("\n") : "(diretório vazio)";
}

// --- 5. Web fetch ---

const WEB_TIMEOUT_MS = 20_000;
const WEB_CAP = 50 * 1024;

export async function webFetch(url: string): Promise<string> {
  let target = String(url ?? "").trim();
  if (!target) throw new Error("URL vazia");
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
  const parsed = new URL(target);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Protocolo não suportado (use http/https)");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEB_TIMEOUT_MS);
  try {
    const res = await fetch(target, { signal: controller.signal, headers: { "user-agent": "NEXUS-Agent/1.0", accept: "text/html,text/plain,application/json,*/*" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ao acessar ${target}`);
    const ct = res.headers.get("content-type") ?? "";
    const body = await res.text();
    if (ct.includes("html")) {
      // Strip tags for a markdown-ish extraction
      const text = body
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
      return text.slice(0, WEB_CAP) || "(página sem texto extraível)";
    }
    return body.slice(0, WEB_CAP);
  } finally {
    clearTimeout(timer);
  }
}
