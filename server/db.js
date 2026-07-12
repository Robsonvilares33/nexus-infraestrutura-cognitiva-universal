import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dbPath = resolve(process.env.NEXUS_DB || './data/nexus.db');
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    user_name TEXT NOT NULL DEFAULT 'Você',
    provider TEXT NOT NULL DEFAULT 'local',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    model TEXT,
    plan_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'mission',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    importance INTEGER NOT NULL DEFAULT 50,
    source TEXT NOT NULL DEFAULT 'local',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS plugins (
    name TEXT PRIMARY KEY,
    category TEXT NOT NULL DEFAULT 'custom',
    connected INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id INTEGER,
    kind TEXT NOT NULL DEFAULT 'markdown',
    title TEXT NOT NULL,
    path TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE SET NULL
  );
`);

db.prepare(`
  INSERT INTO sessions (id, user_name, provider)
  VALUES (1, 'Você', 'local')
  ON CONFLICT(id) DO NOTHING
`).run();

export function getSession() {
  return db.prepare('SELECT * FROM sessions WHERE id = 1').get();
}

export function updateSession({ userName = 'Você', provider = 'local' }) {
  db.prepare(`
    UPDATE sessions
    SET user_name = ?, provider = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(userName, provider);
  return getSession();
}

export function saveMission({ text, model, plan }) {
  const planJson = JSON.stringify(plan);
  const info = db.prepare(`
    INSERT INTO missions (text, model, plan_json)
    VALUES (?, ?, ?)
  `).run(text, model || 'offline-planner', planJson);
  return getMission(info.lastInsertRowid);
}

export function getMission(id) {
  const mission = db.prepare('SELECT * FROM missions WHERE id = ?').get(id);
  if (!mission) return null;
  return { ...mission, plan: JSON.parse(mission.plan_json) };
}

export function listMissions() {
  return db.prepare('SELECT * FROM missions ORDER BY id DESC LIMIT 50').all()
    .map((mission) => ({ ...mission, plan: JSON.parse(mission.plan_json) }));
}

export function saveMemory({ kind = 'mission', title, content, importance = 50, source = 'local' }) {
  const info = db.prepare(`
    INSERT INTO memories (kind, title, content, importance, source)
    VALUES (?, ?, ?, ?, ?)
  `).run(kind, title, content, importance, source);
  return db.prepare('SELECT * FROM memories WHERE id = ?').get(info.lastInsertRowid);
}

export function listMemories() {
  return db.prepare('SELECT * FROM memories ORDER BY importance DESC, id DESC LIMIT 100').all();
}

export function saveArtifact({ missionId = null, kind = 'markdown', title, path, summary = '' }) {
  const info = db.prepare(`
    INSERT INTO artifacts (mission_id, kind, title, path, summary)
    VALUES (?, ?, ?, ?, ?)
  `).run(missionId, kind, title, path, summary);
  return db.prepare('SELECT * FROM artifacts WHERE id = ?').get(info.lastInsertRowid);
}

export function listArtifacts() {
  return db.prepare('SELECT * FROM artifacts ORDER BY id DESC LIMIT 100').all();
}

export function setPlugin(name, category = 'custom', connected = true) {
  db.prepare(`
    INSERT INTO plugins (name, category, connected, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(name) DO UPDATE SET
      category = excluded.category,
      connected = excluded.connected,
      updated_at = CURRENT_TIMESTAMP
  `).run(name, category, connected ? 1 : 0);
  return db.prepare('SELECT * FROM plugins WHERE name = ?').get(name);
}

export function listPlugins() {
  return db.prepare('SELECT * FROM plugins ORDER BY category, name').all();
}

export function saveEvent(type, payload) {
  db.prepare('INSERT INTO events (type, payload_json) VALUES (?, ?)').run(type, JSON.stringify(payload));
}

export function stats() {
  const one = (sql) => db.prepare(sql).get().count;
  return {
    missions: one('SELECT COUNT(*) AS count FROM missions'),
    memories: one('SELECT COUNT(*) AS count FROM memories'),
    artifacts: one('SELECT COUNT(*) AS count FROM artifacts'),
    pluginsConnected: one('SELECT COUNT(*) AS count FROM plugins WHERE connected = 1'),
    events: one('SELECT COUNT(*) AS count FROM events')
  };
}
