import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const workspaceRoot = resolve(process.cwd());
const artifactsRoot = resolve(process.env.NEXUS_ARTIFACTS || './data/artifacts');

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

function listProjectFiles() {
  const ignored = new Set(['node_modules', 'dist', '.git', 'data']);
  const files = [];

  function walk(dir, depth = 0) {
    if (depth > 3 || files.length >= 80) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        const size = statSync(full).size;
        files.push({ path: relative(workspaceRoot, full).replaceAll('\\', '/'), size });
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

  return { tool: name, ok: false, error: 'Tool is not allowed in this local runtime.' };
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
    directory: relative(workspaceRoot, dir).replaceAll('\\', '/'),
    files: [readmePath, todoPath, planPath].map((path) => relative(workspaceRoot, path).replaceAll('\\', '/')),
    summary: `Created mission artifact with ${stages.length} stages, ${agents.length} agents and ${actions.length} next actions.`
  };
}
