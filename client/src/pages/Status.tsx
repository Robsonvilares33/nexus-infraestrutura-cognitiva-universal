import { useState, useEffect } from "react";
import { Activity, Server, Cpu, Zap, Brain, Database, Shield, Network, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const MODULES = [
  { name: "Frontend", icon: Network, category: "Interface" },
  { name: "Engine 3D", icon: Cpu, category: "Visualização" },
  { name: "Agentes de IA", icon: Brain, category: "Inteligência" },
  { name: "Sistema de Missões", icon: Zap, category: "Execução" },
  { name: "Central de Plugins", icon: Shield, category: "Extensões" },
  { name: "Memória Vetorial", icon: Database, category: "Armazenamento" },
  { name: "Gerenciamento de Projetos", icon: Server, category: "Organização" },
  { name: "APIs e Integrações", icon: Activity, category: "Conectividade" },
];

interface ModuleStatus { name: string; status: string; uptime: number; responseTime: number; errors: number; }

export default function Status() {
  const [statuses, setStatuses] = useState<ModuleStatus[]>(() => MODULES.map(m => ({ name: m.name, status: "online", uptime: 98 + Math.random() * 1.99, responseTime: 5 + Math.random() * 50, errors: 0 })));
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setStatuses(MODULES.map(m => ({ name: m.name, status: Math.random() > 0.92 ? "degraded" : "online", uptime: 98 + Math.random() * 1.99, responseTime: 5 + Math.random() * 50, errors: Math.random() > 0.8 ? Math.floor(Math.random() * 3) : 0 })));
      setLastUpdate(new Date());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const overallUptime = statuses.reduce((a, s) => a + s.uptime, 0) / statuses.length;
  const degraded = statuses.filter(s => s.status === "degraded").length;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2"><Shield className="h-5 w-5 text-[#7cf3ff]" />Status da Arquitetura</h2>
        <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">Monitoramento em tempo real</p>
        <div className="flex items-center gap-2">
          <span className={`nexus-chip ${degraded === 0 ? "nexus-chip-online" : "nexus-chip-pending"}`}>{degraded === 0 ? "TODOS OPERACIONAIS" : `${degraded} DEGRADADO(S)`}</span>
          <span className="nexus-chip">UPTIME: {overallUptime.toFixed(1)}%</span>
          <span className="text-[9px] font-mono text-[#7684a0]">{lastUpdate.toLocaleTimeString()}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="nexus-card p-4"><p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase">MÓDULOS</p><p className="text-2xl font-bold text-[#e2e8f4] mt-1">{MODULES.length}</p></div>
        <div className="nexus-card p-4"><p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase">ONLINE</p><p className="text-2xl font-bold text-[#3fe7b0] mt-1">{statuses.filter(s => s.status === "online").length}</p></div>
        <div className="nexus-card p-4"><p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase">DEGRADADOS</p><p className="text-2xl font-bold text-[#ffd479] mt-1">{degraded}</p></div>
        <div className="nexus-card p-4"><p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase">ERROS</p><p className="text-2xl font-bold text-[#ff6b6b] mt-1">{statuses.reduce((a, s) => a + s.errors, 0)}</p></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {statuses.map(s => {
          const module = MODULES.find(m => m.name === s.name)!;
          return (
            <div key={s.name} className="nexus-card p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg bg-[rgba(255,255,255,0.03)] flex items-center justify-center"><module.icon className="h-5 w-5 text-[#aab4d6]" /></div>
                <div><p className="text-sm font-medium text-[#e2e8f4]">{module.name}</p><p className="text-[9px] font-mono text-[#7684a0]">{module.category}</p></div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-[9px] font-mono text-[#7684a0]">STATUS</span><div className="flex items-center gap-1">{s.status === "online" ? <CheckCircle2 className="h-3 w-3 text-[#3fe7b0]" /> : <AlertTriangle className="h-3 w-3 text-[#ffd479]" />}<span className={`text-[9px] font-mono ${s.status === "online" ? "text-[#3fe7b0]" : "text-[#ffd479]"}`}>{s.status.toUpperCase()}</span></div></div>
                <div className="flex justify-between"><span className="text-[9px] font-mono text-[#7684a0]">UPTIME</span><span className="text-[9px] font-mono text-[#7cf3ff]">{s.uptime.toFixed(2)}%</span></div>
                <div className="flex justify-between"><span className="text-[9px] font-mono text-[#7684a0]">LATÊNCIA</span><span className="text-[9px] font-mono text-[#c9b8ff]">{s.responseTime.toFixed(1)}ms</span></div>
                <div className="flex justify-between"><span className="text-[9px] font-mono text-[#7684a0]">ERROS</span><span className="text-[9px] font-mono text-[#e2e8f4]">{s.errors}</span></div>
              </div>
              <div className="mt-3 h-1 bg-[rgba(150,175,220,0.08)] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${s.uptime}%`, backgroundColor: s.status === "online" ? "#3fe7b0" : "#ffd479" }} /></div>
            </div>
          );
        })}
      </div>

      <div className="nexus-card p-4">
        <div className="flex items-center gap-2 mb-3"><Network className="h-4 w-4 text-[#7cf3ff]" /><span className="text-xs font-mono text-[#7684a0] tracking-wider">TOPOLOGIA</span></div>
        <div className="p-4 font-mono text-[10px] text-[#7684a0] space-y-1 leading-relaxed bg-[rgba(3,5,14,0.5)] rounded">
          <p><span className="text-[#7cf3ff]">USUÁRIO</span> → <span className="text-[#c9b8ff]">FRONTEND</span> → <span className="text-[#7cf3ff]">tRPC</span></p>
          <p>  ↓</p>
          <p><span className="text-[#7cf3ff]">ORQUESTRADOR</span> → <span className="text-[#ffd479]">LLM</span></p>
          <p>  ↓</p>
          <p><span className="text-[#c9b8ff]">9 AGENTES</span> → <span className="text-[#3fe7b0]">EXECUÇÃO PARALELA</span></p>
          <p>  ↓</p>
          <p><span className="text-[#9fd8ff]">SÍNTESE</span> → <span className="text-[#7cf3ff]">RESULTADO</span></p>
          <p>  ↓</p>
          <p><span className="text-[#3fe7b0]">MEMÓRIA</span> ← <span className="text-[#c9b8ff]">APRENDIZADO</span></p>
        </div>
      </div>
    </div>
  );
}
