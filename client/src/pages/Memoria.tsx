import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Database, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

const TIER_ORDER: Record<string, number> = { ativa: 0, relevante: 1, historica: 2, arquivada: 3 };
const TIER_COLORS: Record<string, string> = { ativa: "#3fe7b0", relevante: "#7cf3ff", historica: "#c9b8ff", arquivada: "#7684a0" };

export default function Memoria() {
  const { data: memory, refetch } = trpc.memory.list.useQuery();
  const addMutation = trpc.memory.add.useMutation({ onSuccess: () => refetch() });
  const reprioritizeMutation = trpc.memory.reprioritize.useMutation({ onSuccess: () => refetch() });
  const deleteMutation = trpc.memory.delete.useMutation({ onSuccess: () => refetch() });
  const [adding, setAdding] = useState(false);
  const [newMemory, setNewMemory] = useState({ content: "", tier: "ativa" as const });

  const grouped = memory?.reduce<Record<string, typeof memory>>((acc, m) => {
    if (!acc[m.tier]) acc[m.tier] = [];
    acc[m.tier].push(m);
    return acc;
  }, {}) || {};

  const handleAdd = async () => {
    if (!newMemory.content.trim()) return;
    await addMutation.mutateAsync({ content: newMemory.content, tier: newMemory.tier });
    setAdding(false);
    setNewMemory({ content: "", tier: "ativa" });
  };

  const handleReprioritize = async (id: number, currentTier: string) => {
    const tiers = Object.keys(TIER_ORDER).sort((a, b) => TIER_ORDER[a] - TIER_ORDER[b]);
    const idx = tiers.indexOf(currentTier);
    if (idx < tiers.length - 1) {
      await reprioritizeMutation.mutateAsync({ memoryId: id, tier: tiers[idx + 1] as any });
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2">
            <Database className="h-5 w-5 text-[#3fe7b0]" />
            Memória Cognitiva
          </h2>
          <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">4 camadas: Ativa, Relevante, Histórica, Arquivada</p>
        </div>
        <button onClick={() => setAdding(!adding)} className="nexus-card px-3 py-2 text-[#3fe7b0] hover:bg-[#3fe7b0]/10 text-xs font-mono flex items-center gap-2">
          <Plus className="h-3 w-3" /> ADICIONAR
        </button>
      </div>

      {adding && (
        <div className="nexus-card p-4">
          <div className="flex gap-3 items-end">
            <input value={newMemory.content} onChange={e => setNewMemory(p => ({...p, content: e.target.value}))} placeholder="Conteúdo da memória..." className="flex-1 nexus-card px-3 py-2 text-xs text-[#e2e8f4] font-mono bg-transparent focus:outline-none focus:border-[#3fe7b0]/30" />
            <select value={newMemory.tier} onChange={e => setNewMemory(p => ({...p, tier: e.target.value as any}))} className="nexus-card px-3 py-2 text-xs text-[#e2e8f4] font-mono bg-transparent focus:outline-none">
              <option value="ativa">Ativa</option><option value="relevante">Relevante</option><option value="historica">Histórica</option><option value="arquivada">Arquivada</option>
            </select>
            <button onClick={handleAdd} className="nexus-card px-4 py-2 text-[#3fe7b0] hover:bg-[#3fe7b0]/10 text-xs font-mono">SALVAR</button>
          </div>
        </div>
      )}

      {(["ativa","relevante","historica","arquivada"] as const).map(tier => {
        const items = grouped[tier] || [];
        return (
          <div key={tier}>
            <div className="flex items-center gap-2 mb-3">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TIER_COLORS[tier] }} />
              <span className="text-xs font-mono text-[#7684a0] tracking-wider">{tier.toUpperCase()} ({items.length})</span>
            </div>
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className="nexus-card p-3 flex items-center gap-3">
                  <div className="flex-1"><p className="text-xs font-mono text-[#aab4d6] line-clamp-3">{item.content}</p>
                    {item.confidence && <span className="text-[8px] font-mono text-[#3fe7b0]">{item.confidence}% confiança</span>}
                  </div>
                  <div className="flex gap-1">
                    {tier !== "arquivada" && <button onClick={() => handleReprioritize(item.id, tier)} className="nexus-card p-1.5 text-[#7cf3ff] hover:bg-[#7cf3ff]/10"><ArrowDown className="h-3 w-3" /></button>}
                    <button onClick={() => deleteMutation.mutate({ memoryId: item.id })} className="nexus-card p-1.5 text-[#ff6b6b] hover:bg-[#ff6b6b]/10"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
              ))}
              {items.length === 0 && <p className="text-[9px] font-mono text-[#7684a0] pl-2">Vazio</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
