const localHostnames = new Set(['localhost', '127.0.0.1']);
const apiBase = localStorage.getItem('nexusApiBase')
  || (localHostnames.has(location.hostname) ? 'http://127.0.0.1:8787/api' : '');

function time() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function feed(message, cls = 'tool') {
  const node = document.getElementById('feed');
  if (!node) return;
  const div = document.createElement('div');
  div.className = `feed-line ${cls}`;
  div.innerHTML = `<span class="ft">${time()}</span><span class="fx">${message}</span>`;
  node.appendChild(div);
  node.scrollTop = node.scrollHeight;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

async function api(path, options = {}) {
  if (!apiBase) throw new Error('Backend local indisponível nesta origem.');
  const res = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

function injectLocalStatusCard() {
  const statusView = document.getElementById('view-status');
  if (!statusView || document.getElementById('local-runtime-card')) return;
  const card = document.createElement('div');
  card.id = 'local-runtime-card';
  card.className = 'card';
  card.style.marginTop = '14px';
  card.innerHTML = `
    <div class="card-top">
      <div class="card-name">Runtime Local</div>
      <span class="chip" id="local-runtime-chip">verificando</span>
    </div>
    <div style="font-size:11px; color:var(--ink-dim); line-height:1.7">
      API: <b id="local-api-state">—</b><br>
      Ollama: <b id="local-ollama-state">—</b><br>
      Modelo: <b id="local-model-state">—</b><br>
      Missões salvas: <b id="local-missions-state">0</b> · Memórias: <b id="local-memory-state">0</b><br>
      Artefatos reais: <b id="local-artifacts-state">0</b>
    </div>
  `;
  statusView.appendChild(card);
}

async function refreshHealth() {
  injectLocalStatusCard();
  if (!apiBase) {
    setText('local-api-state', 'GitHub Pages / modo estático');
    setText('local-ollama-state', 'não aplicável');
    return;
  }
  try {
    const health = await api('/health');
    const ready = health.ollama.available && health.ollama.hasPreferredModel;
    setText('local-api-state', 'conectada');
    setText('local-ollama-state', ready ? 'modelo local pronto' : (health.ollama.available ? 'Ollama ligado, modelo não baixado' : 'offline'));
    setText('local-model-state', health.ollama.preferredModel);
    setText('local-missions-state', health.stats.missions);
    setText('local-memory-state', health.stats.memories);
    setText('local-artifacts-state', health.stats.artifacts || 0);
    const chip = document.getElementById('local-runtime-chip');
    if (chip) {
      chip.textContent = ready ? 'Executando real' : 'Fallback offline';
      chip.classList.toggle('online', ready);
    }
    const topStatus = document.querySelector('.tb-status-ok');
    if (topStatus) topStatus.textContent = ready ? 'Executando IA local' : 'Operacional local';
  } catch (error) {
    setText('local-api-state', 'desconectada');
    setText('local-ollama-state', 'aguardando npm run api');
  }
}

async function submitMissionToLocalApi() {
  const input = document.getElementById('missionInput');
  const text = (input?.value || '').trim();
  if (!text || !apiBase) return;
  feed('Backend local recebeu a missão e está criando plano persistente...', 'tool');
  try {
    const result = await api('/missions', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    const mode = result.mission.plan.mode === 'ollama' ? 'IA local via Ollama' : 'planejador offline';
    feed(`Missão #${result.mission.id} salva com ${mode}. Memória #${result.memory.id} criada.`, 'mem');
    if (Array.isArray(result.timeline)) {
      result.timeline.forEach((step) => {
        feed(`Timeline ${step.stepIndex}: ${step.name} - ${step.summary}`, step.status === 'failed' ? 'tool' : 'mem');
      });
    }
    if (result.artifact) {
      feed(`Executor local criou artefato #${result.artifact.id}: ${result.artifact.path}`, 'tool');
    }
    if (result.mission.plan.summary) feed(`Resumo local: ${result.mission.plan.summary}`, 'hyp');
    await refreshHealth();
  } catch (error) {
    feed(`Backend local não respondeu: ${error.message}`, 'tool');
  }
}

async function syncPluginButton(button) {
  if (!apiBase || button.dataset.act !== 'connect') return;
  try {
    await api(`/plugins/${encodeURIComponent(button.dataset.plugin)}/connect`, {
      method: 'POST',
      body: JSON.stringify({ connected: true, category: 'ui' })
    });
    await refreshHealth();
  } catch {
    // UI stays usable even without the local API.
  }
}

window.addEventListener('DOMContentLoaded', () => {
  refreshHealth();
  setInterval(refreshHealth, 15000);

  document.getElementById('missionSend')?.addEventListener('click', () => {
    setTimeout(submitMissionToLocalApi, 150);
  });

  document.getElementById('content-area')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-act]');
    if (button) syncPluginButton(button);
  });

  document.querySelectorAll('.authbtn[data-provider]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!apiBase) return;
      const provider = button.dataset.provider || 'local';
      const email = document.getElementById('emailInput')?.value?.trim();
      const userName = email || provider;
      try {
        await api('/session', {
          method: 'POST',
          body: JSON.stringify({ userName, provider })
        });
      } catch {
        // Login visual remains local if API is absent.
      }
    });
  });
});
