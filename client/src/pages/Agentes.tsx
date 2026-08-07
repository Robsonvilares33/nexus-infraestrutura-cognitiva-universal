import { trpc } from "@/lib/trpc";
import { Bot, Cpu, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";

export default function Agentes() {
  const { data: agents, refetch } = trpc.agents.list.useQuery();
  const { data: models } = trpc.models.list.useQuery();
  const assignMutation = trpc.agents.assignModel.useMutation({ onSuccess: () => refetch() });
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("");

  const agentInfo: Record<string, { desc: string; color: string }> = {
    Sincronia: { desc: "Coordenação e sincronização entre agentes", color: "#7cf3ff" },
    Pesquisa: { desc: "Busca e análise de informação", color: "#c9b8ff" },
    "Memória": { desc: "Gestão de memória cognitiva", color: "#3fe7b0" },
    Código: { desc: "Geração e análise de código", color: "#9fd8ff" },
    Planejamento: { desc: "Planejamento estratégico", color: "#ffd479" },
    Crítica: { desc: "Análise crítica e validação", color: "#ff6b6b" },
    Síntese: { desc: "Consolidação de resultados", color: "#aab4d6" },
    Execução: { desc: "Execução e entrega", color: "#7cf3ff" },
    Comunicação: { desc: "Interface com o usuário", color: "#c9b8ff" },
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2">
          <Bot className="h-5 w-5 text-[#7cf3ff]" />
          Agentes Especializados
        </h2>
        <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">9 agentes em grafo completo (K9) — 36 conexões ativas</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {agents?.map(agent => {
          const info = agentInfo[agent.name] || { desc: "Agente do ecossistema", color: "#7cf3ff" };
          return (
            <div key={agent.id} className="nexus-card p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: `${info.color}10`, border: `1px solid ${info.color}30` }}>
                  <Bot className="h-5 w-5" style={{ color: info.color }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#e2e8f4]">{agent.name}</p>
                  <p className="text-[9px] font-mono text-[#7684a0]">{info.desc}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className={`nexus-chip ${agent.status === 'online' ? 'nexus-chip-online' : agent.status === 'busy' ? 'nexus-chip-pending' : 'nexus-chip-offline'}`}>{agent.status.toUpperCase()}</span>
                {agent.currentModel && <span className="text-[9px] font-mono text-[#c9b8ff]">Modelo: {agent.currentModel}</span>}
              </div>
              <div className="flex gap-2">
                <select value={selectedAgent === agent.name ? selectedModel : ""} onChange={e => { setSelectedAgent(agent.name); setSelectedModel(e.target.value); }} className="flex-1 nexus-card px-2 py-1.5 text-[9px] font-mono text-[#e2e8f4] bg-transparent focus:outline-none">
                  <option value="">Atribuir modelo...</option>
                  {models?.filter(m => m.connected).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
                <button onClick={() => { if (selectedAgent === agent.name && selectedModel) { assignMutation.mutate({ agentName: agent.name, modelName: selectedModel }); setSelectedAgent(null); } }} className="nexus-card px-3 py-1.5 text-[9px] font-mono text-[#3fe7b0] hover:bg-[#3fe7b0]/10">ATRIBUIR</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
