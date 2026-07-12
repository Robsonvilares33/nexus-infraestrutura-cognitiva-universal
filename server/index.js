import express from 'express';
import cors from 'cors';
import {
  getSession,
  updateSession,
  saveMission,
  listMissions,
  saveMemory,
  listMemories,
  saveArtifact,
  listArtifacts,
  setPlugin,
  listPlugins,
  saveEvent,
  stats
} from './db.js';
import { generateMissionPlan, ollamaStatus } from './ollama.js';
import { catalog } from './registry.js';
import { runTool, tools } from './executor.js';

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors({
  origin(origin, callback) {
    if (!origin || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return callback(null, true);
    return callback(null, false);
  }
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  const ollama = await ollamaStatus();
  res.json({
    ok: true,
    service: 'nexus-local-api',
    mode: ollama.available && ollama.hasPreferredModel ? 'local-ai' : 'offline',
    ollama,
    stats: stats()
  });
});

app.get('/api/session', (_req, res) => {
  res.json(getSession());
});

app.post('/api/session', (req, res) => {
  const session = updateSession({
    userName: req.body.userName || req.body.name || 'Você',
    provider: req.body.provider || 'local'
  });
  saveEvent('session.updated', session);
  res.json(session);
});

app.get('/api/agents/status', async (_req, res) => {
  const ollama = await ollamaStatus();
  const currentStats = stats();
  res.json({
    runtime: ollama.available ? 'ollama' : 'offline-planner',
    model: ollama.preferredModel,
    ready: ollama.available && ollama.hasPreferredModel,
    agents: [
      { name: 'Planejador', status: 'ready', real: true },
      { name: 'Memória', status: 'ready', real: true },
      { name: 'Executor Local', status: 'interface-ready', real: false },
      { name: 'Comunicações', status: 'waiting-connectors', real: false }
    ],
    stats: currentStats,
    ollama
  });
});

app.get('/api/catalog', (_req, res) => {
  res.json(catalog);
});

app.get('/api/tools', (_req, res) => {
  res.json(tools);
});

app.post('/api/tools/run', (req, res) => {
  const result = runTool(req.body.name, req.body.input || {});
  saveEvent('tool.run', result);
  res.status(result.ok ? 200 : 400).json(result);
});

app.get('/api/plugins', (_req, res) => {
  res.json(listPlugins());
});

app.post('/api/plugins/:name/connect', (req, res) => {
  const plugin = setPlugin(req.params.name, req.body.category || 'custom', req.body.connected !== false);
  saveEvent('plugin.updated', plugin);
  res.json(plugin);
});

app.get('/api/memory', (_req, res) => {
  res.json(listMemories());
});

app.get('/api/artifacts', (_req, res) => {
  res.json(listArtifacts());
});

app.post('/api/memory', (req, res) => {
  const memory = saveMemory({
    kind: req.body.kind || 'note',
    title: req.body.title || 'Memória sem título',
    content: req.body.content || '',
    importance: Number(req.body.importance || 50),
    source: req.body.source || 'api'
  });
  saveEvent('memory.created', memory);
  res.status(201).json(memory);
});

app.get('/api/missions', (_req, res) => {
  res.json(listMissions());
});

app.post('/api/missions', async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Mission text is required.' });

  const generated = await generateMissionPlan(text);
  const mission = saveMission({ text, model: generated.model, plan: generated.plan });
  const artifactResult = runTool('artifact.create', { mission, plan: generated.plan });
  const artifact = artifactResult.ok ? saveArtifact({
    missionId: mission.id,
    kind: 'mission-artifact',
    title: artifactResult.title,
    path: artifactResult.directory,
    summary: artifactResult.summary
  }) : null;
  const memory = saveMemory({
    kind: 'mission',
    title: text.slice(0, 80),
    content: JSON.stringify({ plan: generated.plan, artifact: artifactResult }, null, 2),
    importance: generated.plan.mode === 'ollama' ? 75 : 55,
    source: generated.model
  });
  saveEvent('mission.completed', { missionId: mission.id, memoryId: memory.id, artifactId: artifact?.id, model: generated.model });
  res.status(201).json({ mission, memory, artifact, artifactResult, ollama: generated.status });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'NEXUS endpoint not found.' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`NEXUS local API listening on http://127.0.0.1:${port}`);
});
