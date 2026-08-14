const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';

export async function ollamaStatus() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = (data.models || []).map((model) => model.name);
    return {
      available: true,
      host: OLLAMA_HOST,
      preferredModel: OLLAMA_MODEL,
      models,
      hasPreferredModel: models.some((name) => name === OLLAMA_MODEL || name.startsWith(`${OLLAMA_MODEL}:`))
    };
  } catch (error) {
    return {
      available: false,
      host: OLLAMA_HOST,
      preferredModel: OLLAMA_MODEL,
      models: [],
      error: error.message
    };
  }
}

export function offlinePlan(text) {
  const normalized = text.toLowerCase();
  const specialties = [
    normalized.includes('código') || normalized.includes('software') || normalized.includes('app') ? 'Engenharia de Software' : null,
    normalized.includes('design') || normalized.includes('interface') ? 'Design de Produto' : null,
    normalized.includes('pesquisa') || normalized.includes('estudo') ? 'Pesquisa' : null,
    normalized.includes('negócio') || normalized.includes('empresa') ? 'Estratégia' : null,
    normalized.includes('ia') || normalized.includes('agente') ? 'IA Local' : null
  ].filter(Boolean);
  const finalSpecialties = specialties.length ? specialties : ['Planejamento', 'Pesquisa', 'Execução'];

  return {
    mode: 'offline',
    summary: `Plano local estruturado para: ${text}`,
    stages: [
      { name: 'Interpretar', action: 'Definir objetivo, restrições e resultado esperado.' },
      { name: 'Planejar', action: 'Quebrar a missão em tarefas pequenas e verificáveis.' },
      { name: 'Executar', action: 'Rodar ferramentas locais e registrar evidências.' },
      { name: 'Memorizar', action: 'Salvar aprendizados, decisões e próximos passos.' }
    ],
    agents: finalSpecialties.map((name, index) => ({
      name: `Agente ${index + 1}`,
      specialty: name,
      responsibility: `Cuidar da etapa de ${name.toLowerCase()} da missão.`
    })),
    nextActions: [
      'Conectar Ollama para substituir este plano offline por geração local.',
      'Registrar arquivos, comandos e decisões relevantes na memória.',
      'Transformar o resultado em projeto reutilizável.'
    ],
    confidence: 0.62
  };
}

export async function generateMissionPlan(text) {
  const status = await ollamaStatus();
  if (!status.available || !status.hasPreferredModel) {
    return {
      model: status.available ? 'offline-planner:model-not-pulled' : 'offline-planner:ollama-offline',
      status,
      plan: offlinePlan(text)
    };
  }

  const prompt = [
    'Você é o planejador local do NEXUS.',
    'Responda somente JSON válido, sem markdown.',
    'Crie um plano de missão com os campos: summary, stages, agents, nextActions, confidence.',
    'stages deve ter objetos {name, action}. agents deve ter {name, specialty, responsibility}.',
    `Missão do usuário: ${text}`
  ].join('\n');

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.2, num_ctx: 4096 }
      }),
      signal: AbortSignal.timeout(120000)
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json();
    const raw = (data.response || '').trim();
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    return { model: OLLAMA_MODEL, status, plan: { mode: 'ollama', ...parsed } };
  } catch (error) {
    return {
      model: 'offline-planner:ollama-error',
      status: { ...status, generationError: error.message },
      plan: offlinePlan(text)
    };
  }
}
