import { execFileSync } from 'node:child_process';
import { totalmem, cpus } from 'node:os';
import { ollamaStatus } from './ollama.js';

function run(command, args = []) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return error.stderr?.toString().trim() || error.message;
  }
}

function runNpmVersion() {
  if (process.platform === 'win32') return run('cmd.exe', ['/d', '/s', '/c', 'npm --version']);
  return run('npm', ['--version']);
}

const ramGb = totalmem() / 1024 / 1024 / 1024;
const cpu = cpus()[0]?.model || 'CPU desconhecida';
const ollama = await ollamaStatus();

const recommendation = ramGb < 8
  ? ['llama3.2:1b', 'qwen3.5:0.8b']
  : ramGb < 16
    ? ['llama3.2:3b', 'qwen3.5:2b', 'gemma3:4b']
    : ['qwen3.5:4b', 'llama3.1:8b', 'mistral:7b'];

console.log(JSON.stringify({
  node: run('node', ['--version']),
  npm: runNpmVersion(),
  cpu,
  ramGb: Number(ramGb.toFixed(1)),
  ollama,
  recommendation,
  commands: {
    installOllamaModel: `ollama pull ${recommendation[0]}`,
    runFullStack: 'npm run dev:full',
    apiHealth: 'http://127.0.0.1:8787/api/health'
  }
}, null, 2));
