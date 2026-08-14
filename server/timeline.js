import { listExecutionSteps, saveExecutionStep } from './db.js';

export function recordStep(missionId, timeline, step) {
  const stepIndex = timeline.length + 1;
  const saved = saveExecutionStep({
    missionId,
    stepIndex,
    name: step.name,
    status: step.status || 'completed',
    tool: step.tool || null,
    summary: step.summary || '',
    payload: step.payload || {}
  });
  const normalized = {
    id: saved.id,
    missionId,
    stepIndex,
    name: saved.name,
    status: saved.status,
    tool: saved.tool,
    summary: saved.summary,
    payload: JSON.parse(saved.payload_json),
    createdAt: saved.created_at
  };
  timeline.push(normalized);
  return normalized;
}

export function getTimeline(missionId) {
  return listExecutionSteps(missionId).map((step) => ({
    id: step.id,
    missionId: step.mission_id,
    stepIndex: step.step_index,
    name: step.name,
    status: step.status,
    tool: step.tool,
    summary: step.summary,
    payload: step.payload,
    createdAt: step.created_at
  }));
}
