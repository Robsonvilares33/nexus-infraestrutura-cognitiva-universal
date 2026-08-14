import { trpc } from "@/lib/trpc";
import { Cpu, Wifi, WifiOff, Zap } from "lucide-react";

export default function Modelos() {
  const { data: models, refetch } = trpc.models.list.useQuery();
  const { data: llmModels } = trpc.models.llmModels.useQuery();
  const connectMutation = trpc.models.connect.useMutation({ onSuccess: () => refetch() });
  const disconnectMutation = trpc.models.disconnect.useMutation({ onSuccess: () => refetch() });

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2">
          <Cpu className="h-5 w-5 text-[#ffd479]" />
          Modelos de IA
        </h2>
        <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">Gerenciamento de modelos de inteligência artificial</p>
      </div>

      {llmModels && llmModels.length > 0 && (
        <div>
          <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-3">MODELOS DISPONÍVEIS NO SERVIDOR</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {llmModels.map(m => (
              <div key={m.id} className="nexus-card p-3 flex items-center justify-between">
                <div><p className="text-xs font-mono text-[#e2e8f4]">{m.id}</p><p className="text-[9px] font-mono text-[#7684a0]">{m.owned_by}</p></div>
                <Zap className="h-3 w-3 text-[#ffd479]" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-3">MODELOS DO ECOSISTEMA</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {models?.map(model => (
            <div key={model.id} className="nexus-card p-4">
              <div className="flex items-center gap-3 mb-3">
                <Cpu className="h-5 w-5 text-[#ffd479]" />
                <div><p className="text-sm font-medium text-[#e2e8f4]">{model.name}</p>
                <p className="text-[9px] font-mono text-[#7684a0]">Score: {model.competencyScore} | Tarefas: {model.tasksAssigned}</p></div>
              </div>
              <button onClick={() => model.connected ? disconnectMutation.mutate({ name: model.name }) : connectMutation.mutate({ name: model.name })} className={`w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded text-[9px] font-mono ${model.connected ? "text-[#3fe7b0] border border-[rgba(63,231,176,0.2)] bg-[rgba(63,231,176,0.05)]" : "text-[#7684a0] border border-[rgba(118,132,160,0.15)]"}`}>
                {model.connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {model.connected ? "CONECTADO" : "CONECTAR"}
              </button>
            </div>
          ))}
          {(!models || models.length === 0) && <div className="nexus-card p-4 text-center"><p className="text-[10px] font-mono text-[#7684a0]">Nenhum modelo cadastrado. Vá em Config para inicializar o ecossistema.</p></div>}
        </div>
      </div>
    </div>
  );
}
