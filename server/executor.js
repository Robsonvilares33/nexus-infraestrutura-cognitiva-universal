import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const workspaceRoot = resolve(process.cwd());
const artifactsRoot = resolve(process.env.NEXUS_ARTIFACTS || './data/artifacts');
const generatedRoot = resolve(process.env.NEXUS_GENERATED || './data/generated');
const ignoredDirs = new Set(['node_modules', 'dist', '.git', 'data']);
const maxReadBytes = 120000;

function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'mission';
}

function insideWorkspace(path) {
  const resolved = resolve(path);
  return resolved === workspaceRoot || resolved.startsWith(`${workspaceRoot}\\`) || resolved.startsWith(`${workspaceRoot}/`);
}

function toRelative(path) {
  return relative(workspaceRoot, path).replaceAll('\\', '/');
}

function isIgnoredPath(path) {
  return toRelative(path).split('/').some((part) => ignoredDirs.has(part));
}

function safeWorkspacePath(path) {
  const resolved = resolve(workspaceRoot, String(path || ''));
  if (!insideWorkspace(resolved)) throw new Error('Path escaped workspace.');
  if (isIgnoredPath(resolved)) throw new Error('Path is in an ignored directory.');
  return resolved;
}

function listProjectFiles() {
  const files = [];

  function walk(dir, depth = 0) {
    if (depth > 3 || files.length >= 80) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (ignoredDirs.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        const size = statSync(full).size;
        files.push({ path: toRelative(full), size });
      }
    }
  }

  walk(workspaceRoot);
  return files;
}

export const tools = [
  {
    name: 'workspace.summary',
    real: true,
    description: 'Lista arquivos importantes do projeto NEXUS local, sem ler dados pessoais.'
  },
  {
    name: 'artifact.create',
    real: true,
    description: 'Cria um pacote markdown/json dentro de data/artifacts para uma missao.'
  },
  {
    name: 'workspace.search',
    real: true,
    description: 'Busca texto em arquivos do projeto, ignorando dados locais e dependencias.'
  },
  {
    name: 'file.read',
    real: true,
    description: 'Le um arquivo especifico do projeto, com limite de tamanho e sem acessar dados locais.'
  },
  {
    name: 'document.create',
    real: true,
    description: 'Cria um documento markdown em data/generated/docs.'
  },
  {
    name: 'project.scaffold',
    real: true,
    description: 'Cria uma estrutura inicial de projeto em data/generated/projects.'
  }
];

export function runTool(name, input = {}) {
  if (name === 'workspace.summary') {
    return {
      tool: name,
      ok: true,
      workspace: basename(workspaceRoot),
      files: listProjectFiles()
    };
  }

  if (name === 'artifact.create') {
    return createMissionArtifact(input);
  }

  if (name === 'workspace.search') {
    return searchWorkspace(input);
  }

  if (name === 'file.read') {
    return readWorkspaceFile(input);
  }

  if (name === 'document.create') {
    return createDocument(input);
  }

  if (name === 'project.scaffold') {
    return scaffoldProject(input);
  }

  return { tool: name, ok: false, error: 'Tool is not allowed in this local runtime.' };
}

export function searchWorkspace({ query, maxResults = 30 }) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle || needle.length < 2) return { tool: 'workspace.search', ok: false, error: 'Query must have at least 2 characters.' };
  const results = [];
  const files = listProjectFiles();

  for (const file of files) {
    if (results.length >= Number(maxResults)) break;
    const full = safeWorkspacePath(file.path);
    if (file.size > maxReadBytes) continue;
    const text = readFileSync(full, 'utf8');
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].toLowerCase().includes(needle)) {
        results.push({
          path: file.path,
          line: index + 1,
          preview: lines[index].trim().slice(0, 240)
        });
        if (results.length >= Number(maxResults)) break;
      }
    }
  }

  return { tool: 'workspace.search', ok: true, query, count: results.length, results };
}

export function readWorkspaceFile({ path }) {
  const full = safeWorkspacePath(path);
  const stat = statSync(full);
  if (!stat.isFile()) return { tool: 'file.read', ok: false, error: 'Path is not a file.' };
  if (stat.size > maxReadBytes) return { tool: 'file.read', ok: false, error: `File is too large (${stat.size} bytes).` };
  return {
    tool: 'file.read',
    ok: true,
    path: toRelative(full),
    size: stat.size,
    content: readFileSync(full, 'utf8')
  };
}

export function createDocument({ title = 'Documento NEXUS', content = '', kind = 'note' }) {
  const slug = slugify(title);
  const dir = resolve(generatedRoot, 'docs');
  if (!insideWorkspace(dir)) throw new Error('Generated path escaped workspace.');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${new Date().toISOString().slice(0, 10)}-${slug}.md`);
  const body = [
    `# ${title}`,
    '',
    `**Kind:** ${kind}`,
    `**Created:** ${new Date().toISOString()}`,
    '',
    content || 'Documento criado pelo executor local do NEXUS.',
    ''
  ].join('\n');
  writeFileSync(file, body, 'utf8');
  return {
    tool: 'document.create',
    ok: true,
    title,
    path: toRelative(file),
    summary: `Document created at ${toRelative(file)}.`
  };
}

export function scaffoldProject({ name = 'nexus-projeto', type = 'generic', description = '' }) {
  const slug = slugify(name);
  const dir = resolve(generatedRoot, 'projects', slug);
  if (!insideWorkspace(dir)) throw new Error('Generated path escaped workspace.');
  mkdirSync(join(dir, 'docs'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });

  const readme = [
    `# ${name}`,
    '',
    description || 'Projeto criado pelo executor local do NEXUS.',
    '',
    `**Type:** ${type}`,
    `**Created:** ${new Date().toISOString()}`,
    '',
    '## Next Steps',
    '',
    '- [ ] Definir objetivo final',
    '- [ ] Listar entradas e saidas',
    '- [ ] Criar primeiro prototipo',
    '- [ ] Registrar decisoes na memoria do NEXUS',
    ''
  ].join('\n');

  const spec = [
    `# Especificacao - ${name}`,
    '',
    '## Objetivo',
    '',
    description || 'A definir.',
    '',
    '## Requisitos',
    '',
    '- Local-first',
    '- Sem dependencia obrigatoria de API paga',
    '- Facil de executar em computador modesto',
    ''
  ].join('\n');

  writeFileSync(join(dir, 'README.md'), readme, 'utf8');
  writeFileSync(join(dir, 'docs', 'SPEC.md'), spec, 'utf8');
  writeFileSync(join(dir, 'src', '.gitkeep'), '', 'utf8');

  return {
    tool: 'project.scaffold',
    ok: true,
    title: name,
    path: toRelative(dir),
    files: [
      toRelative(join(dir, 'README.md')),
      toRelative(join(dir, 'docs', 'SPEC.md')),
      toRelative(join(dir, 'src', '.gitkeep'))
    ],
    summary: `Project scaffold created at ${toRelative(dir)}.`
  };
}

export function createMissionArtifact({ mission, plan }) {
  const missionId = mission?.id || 'draft';
  const title = mission?.text || 'Missao local';
  const slug = slugify(title);
  const dir = resolve(artifactsRoot, `${String(missionId).padStart(4, '0')}-${slug}`);
  if (!insideWorkspace(dir)) throw new Error('Artifact path escaped workspace.');

  mkdirSync(dir, { recursive: true });
  const files = listProjectFiles();
  const createdAt = new Date().toISOString();
  const stages = Array.isArray(plan?.stages) ? plan.stages : [];
  const agents = Array.isArray(plan?.agents) ? plan.agents : [];
  const actions = Array.isArray(plan?.nextActions) ? plan.nextActions : [];

  const readme = [
    `# NEXUS Mission ${missionId}`,
    '',
    `**Created:** ${createdAt}`,
    `**Mission:** ${title}`,
    `**Mode:** ${plan?.mode || 'unknown'}`,
    '',
    '## Summary',
    '',
    plan?.summary || 'No summary generated.',
    '',
    '## Execution Stages',
    '',
    ...stages.map((stage, index) => `${index + 1}. **${stage.name || 'Stage'}** - ${stage.action || 'No action.'}`),
    '',
    '## Agents',
    '',
    ...agents.map((agent, index) => `- **${agent.name || `Agent ${index + 1}`}** (${agent.specialty || 'general'}): ${agent.responsibility || 'No responsibility.'}`),
    '',
    '## Next Actions',
    '',
    ...actions.map((action) => `- ${action}`),
    '',
    '## Workspace Snapshot',
    '',
    ...files.slice(0, 40).map((file) => `- ${file.path} (${file.size} bytes)`),
    ''
  ].join('\n');

  const todo = [
    `# TODO - Mission ${missionId}`,
    '',
    ...actions.map((action, index) => `- [ ] ${index + 1}. ${action}`),
    ''
  ].join('\n');

  const planJson = JSON.stringify({ mission, plan, files, createdAt }, null, 2);
  const readmePath = join(dir, 'README.md');
  const todoPath = join(dir, 'TODO.md');
  const planPath = join(dir, 'plan.json');
  writeFileSync(readmePath, readme, 'utf8');
  writeFileSync(todoPath, todo, 'utf8');
  writeFileSync(planPath, planJson, 'utf8');

  return {
    tool: 'artifact.create',
    ok: true,
    title: `Mission ${missionId} artifact`,
    directory: toRelative(dir),
    files: [readmePath, todoPath, planPath].map((path) => toRelative(path)),
    summary: `Created mission artifact with ${stages.length} stages, ${agents.length} agents and ${actions.length} next actions.`
  };
}
