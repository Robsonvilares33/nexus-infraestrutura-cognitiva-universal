import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  Globe, Brain, Plug, Database, Bot, Cpu, Folder, Activity, ArrowRight, Zap, Shield, Radar
} from "lucide-react";

export default function Home() {
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: feed } = trpc.feed.list.useQuery({ limit: 10 });

  const statCards = [
    { label: "MISSÕES", value: stats?.missions ?? 0, icon: Zap, color: "#7cf3ff" },
    { label: "PLUGINS", value: `${stats?.connectedPlugins ?? 0}/${stats?.plugins ?? 0}`, icon: Plug, color: "#c9b8ff" },
    { label: "MODELOS", value: `${stats?.connectedModels ?? 0}/${stats?.models ?? 0}`, icon: Cpu, color: "#ffd479" },
    { label: "AGENTES", value: `${stats?.onlineAgents ?? 0}/${stats?.agents ?? 0}`, icon: Bot, color: "#3fe7b0" },
    { label: "PROJETOS", value: stats?.projects ?? 0, icon: Folder, color: "#9fd8ff" },
    { label: "MEMÓRIA", value: stats?.memoryItems ?? 0, icon: Database, color: "#aab4d6" },
    { label: "EXECUTANDO", value: stats?.executingMissions ?? 0, icon: Activity, color: "#ffd479" },
    { label: "ECOSSISTEMA", value: "ATIVO", icon: Shield, color: "#3fe7b0" },
  ];

  const sections = [
    { path: "/universo", label: "UNIVERSO", icon: Globe, desc: "Visualização 3D do campo cognitivo", color: "#7cf3ff" },
    { path: "/minha-ia", label: "MINHA IA", icon: Brain, desc: "Monitor cognitivo e missões", color: "#c9b8ff" },
    { path: "/plugins", label: "PLUGINS", icon: Plug, desc: "Central de conexões e extensões", color: "#ffd479" },
    { path: "/memoria", label: "MEMÓRIA", icon: Database, desc: "4 camadas de conhecimento", color: "#3fe7b0" },
    { path: "/agentes", label: "AGENTES", icon: Bot, desc: "9 agentes especializados", color: "#9fd8ff" },
    { path: "/modelos", label: "MODELOS", icon: Cpu, desc: "Gerenciamento de IA", color: "#aab4d6" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Radar className="h-5 w-5 text-[#7cf3ff] animate-pulse" />
          <h2 className="text-lg font-semibold text-[#e2e8f4]">Bem-vindo ao NEXUS</h2>
        </div>
        <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">
          Infraestrutura Cognitiva Universal — Ecossistema de Inteligência Distribuída
        </p>
      </div>

      {/* Hero Banner */}
      <div className="nexus-card p-5 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-0 w-32 h-32 bg-[#7cf3ff] rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-40 h-40 bg-[#c9b8ff] rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 w-24 h-24 bg-[#ffd479] rounded-full blur-3xl" />
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <span className="nexus-chip nexus-chip-online">ONLINE</span>
            <span className="nexus-chip">v1.0.0</span>
          </div>
          <p className="text-sm text-[#aab4d6] leading-relaxed max-w-2xl">
            O NEXUS é uma infraestrutura cognitiva universal que integra agentes de IA especializados, 
            modelos de linguagem, plugins extensíveis e memória distribuída em um ecossistema vivo 
            de inteligência artificial.
          </p>
          <div className="flex gap-4 mt-4">
            <Link href="/minha-ia">
              <button className="nexus-card px-4 py-2 text-[#7cf3ff] hover:bg-[#7cf3ff]/10 text-xs font-mono flex items-center gap-2 border border-[#7cf3ff]/20">
                <Zap className="h-3 w-3" /> EXECUTAR MISSÃO
              </button>
            </Link>
            <Link href="/universo">
              <button className="nexus-card px-4 py-2 text-[#c9b8ff] hover:bg-[#c9b8ff]/10 text-xs font-mono flex items-center gap-2 border border-[#c9b8ff]/20">
                <Globe className="h-3 w-3" /> UNIVERSO 3D
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div>
        <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-3">MÉTRICAS DO ECOSISTEMA</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statCards.map((s) => (
            <div key={s.label} className="nexus-card p-4 transition-all hover:border-[rgba(124,243,255,0.15)]">
              <div className="flex items-center gap-2 mb-2">
                <s.icon className="h-3.5 w-3.5" style={{ color: s.color }} />
                <span className="text-[9px] font-mono text-[#7684a0] tracking-wider">{s.label}</span>
              </div>
              <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Access */}
      <div>
        <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-3">ACESSO RÁPIDO</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {sections.map(s => (
            <Link key={s.path} href={s.path}>
              <button className="nexus-card p-4 text-left w-full group hover:border-[rgba(124,243,255,0.2)] transition-all">
                <s.icon className="h-5 w-5 mb-2" style={{ color: s.color }} />
                <p className="text-xs font-medium text-[#e2e8f4]">{s.label}</p>
                <p className="text-[9px] font-mono text-[#7684a0] mt-1">{s.desc}</p>
                <ArrowRight className="h-3 w-3 mt-2 text-[#7684a0] group-hover:text-[#7cf3ff] transition-colors" />
              </button>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Feed */}
      {feed && feed.length > 0 && (
        <div>
          <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-3">FEED COGNITIVO RECENTE</p>
          <div className="space-y-2">
            {feed.slice(0, 5).map(event => (
              <div key={event.id} className="nexus-card px-4 py-3 flex items-start gap-3">
                <span className="text-[9px] font-mono text-[#7684a0] mt-0.5 shrink-0">
                  {new Date(event.createdAt).toLocaleTimeString()}
                </span>
                <span className={`nexus-chip shrink-0 ${
                  event.eventType === 'mission' ? 'nexus-chip-pending' :
                  event.eventType === 'agent' ? 'nexus-chip-online' :
                  event.eventType === 'result' ? 'nexus-chip-online' : ''
                }`}>{event.eventType.toUpperCase()}</span>
                <p className="text-xs text-[#aab4d6] font-mono">{event.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
