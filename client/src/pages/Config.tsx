import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { Settings, Save, User, Calendar, RefreshCw } from "lucide-react";

export default function Config() {
  const { user } = useAuth();
  const { data: universeSettings, refetch } = trpc.universe.settings.useQuery();
  const saveMutation = trpc.universe.saveSettings.useMutation({ onSuccess: () => refetch() });
  const seedMutation = trpc.universe.seed.useMutation({ onSuccess: () => refetch() });
  const [displayName, setDisplayName] = useState(universeSettings?.displayName || "");
  const [foundingDate, setFoundingDate] = useState(universeSettings?.foundingDate ? new Date(universeSettings.foundingDate).toISOString().slice(0, 10) : "");

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2"><Settings className="h-5 w-5 text-[#aab4d6]" />Configurações</h2>
        <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">Configuração do universo cognitivo</p>
      </div>
      <div className="nexus-card p-4">
        <div className="flex items-center gap-3 mb-3"><User className="h-4 w-4 text-[#7cf3ff]" /><span className="text-xs font-medium text-[#e2e8f4]">Perfil</span></div>
        <div className="space-y-2">
          {[["ID", String(user?.id || "")], ["NOME", user?.name || "Não definido"], ["EMAIL", user?.email || "Não definido"], ["MÉTODO", user?.loginMethod || "Não definido"], ["ROLE", user?.role?.toUpperCase() || "USER"]].map(([k,v]) => (
            <div key={k} className="flex justify-between"><span className="text-[9px] font-mono text-[#7684a0]">{k}</span><span className={`text-[9px] font-mono ${k==="ROLE"?"text-[#7cf3ff]":"text-[#e2e8f4]"}`}>{v}</span></div>
          ))}
        </div>
      </div>
      <div className="nexus-card p-4">
        <div className="flex items-center gap-3 mb-3"><Calendar className="h-4 w-4 text-[#c9b8ff]" /><span className="text-xs font-medium text-[#e2e8f4]">Universo</span></div>
        <div className="space-y-3">
          <div><label className="text-[9px] font-mono text-[#7684a0] tracking-wider block mb-1">NOME DO UNIVERSO</label><input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Meu Ecossistema Cognitivo" className="w-full nexus-card px-3 py-2 text-sm text-[#e2e8f4] placeholder:text-[#7684a0]/50 focus:outline-none focus:border-[#7cf3ff]/30 font-mono bg-transparent" /></div>
          <div><label className="text-[9px] font-mono text-[#7684a0] tracking-wider block mb-1">DATA DE FUNDAÇÃO</label><input type="date" value={foundingDate} onChange={e => setFoundingDate(e.target.value)} className="w-full nexus-card px-3 py-2 text-sm text-[#e2e8f4] focus:outline-none focus:border-[#7cf3ff]/30 bg-[rgba(3,5,14,0.8)]" /></div>
          <button onClick={() => saveMutation.mutate({ displayName: displayName || null, foundingDate: foundingDate || null })} disabled={saveMutation.isPending} className="nexus-card px-4 py-2 text-[#7cf3ff] hover:bg-[#7cf3ff]/10 disabled:opacity-30 text-xs font-mono flex items-center gap-2"><Save className="h-3 w-3" />SALVAR</button>
        </div>
      </div>
      <div className="nexus-card p-4">
        <div className="flex items-center gap-3 mb-3"><RefreshCw className="h-4 w-4 text-[#ffd479]" /><span className="text-xs font-medium text-[#e2e8f4]">Inicializar Ecossistema</span></div>
        <p className="text-xs text-[#7684a0] leading-relaxed mb-3">Cria plugins padrão, modelos e agentes no seu ecossistema.</p>
        <button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} className="nexus-card px-4 py-2 text-[#ffd479] hover:bg-[#ffd479]/10 disabled:opacity-30 text-xs font-mono flex items-center gap-2"><RefreshCw className={`h-3 w-3 ${seedMutation.isPending ? "animate-spin" : ""}`} />{seedMutation.isPending ? "INICIALIZANDO..." : "INICIALIZAR"}</button>
      </div>
    </div>
  );
}
