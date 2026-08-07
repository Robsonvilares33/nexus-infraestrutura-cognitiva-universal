import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Plug, Plus, Wifi, WifiOff, Cpu, Server, Radio } from "lucide-react";

const CATEGORY_ICONS = { model: Cpu, infra: Server, device: Radio };
const CATEGORY_COLORS = { model: "#7cf3ff", infra: "#c9b8ff", device: "#ffd479" };
const CATEGORY_LABELS = { model: "Modelos de IA", infra: "Infraestrutura", device: "Dispositivos" };

export default function Plugins() {
  const { data: plugins, refetch } = trpc.plugins.list.useQuery();
  const connectMutation = trpc.plugins.connect.useMutation({ onSuccess: () => refetch() });
  const disconnectMutation = trpc.plugins.disconnect.useMutation({ onSuccess: () => refetch() });
  const addMutation = trpc.plugins.add.useMutation({ onSuccess: () => refetch() });
  const [adding, setAdding] = useState(false);
  const [newPlugin, setNewPlugin] = useState({ name: "", category: "model" as "model"|"infra"|"device", version: "" });

  const grouped = plugins?.reduce<Record<string, typeof plugins>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {}) || {};

  const handleAdd = async () => {
    if (!newPlugin.name.trim()) return;
    await addMutation.mutateAsync(newPlugin);
    setAdding(false);
    setNewPlugin({ name: "", category: "model", version: "" });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2">
            <Plug className="h-5 w-5 text-[#7cf3ff]" />
            Central de Plugins
          </h2>
          <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">Conecte modelos de IA, infraestrutura e dispositivos ao ecossistema</p>
        </div>
        <button onClick={() => setAdding(!adding)} className="nexus-card px-3 py-2 text-[#7cf3ff] hover:bg-[#7cf3ff]/10 text-xs font-mono flex items-center gap-2">
          <Plus className="h-3 w-3" /> ADICIONAR
        </button>
      </div>

      {adding && (
        <div className="nexus-card p-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div><label className="text-[9px] font-mono text-[#7684a0] block mb-1">NOME</label><input value={newPlugin.name} onChange={e => setNewPlugin(p => ({...p, name: e.target.value}))} className="nexus-card px-3 py-2 text-xs text-[#e2e8f4] font-mono bg-transparent focus:outline-none focus:border-[#7cf3ff]/30" placeholder="Ex: Claude" /></div>
            <div><label className="text-[9px] font-mono text-[#7684a0] block mb-1">CATEGORIA</label><select value={newPlugin.category} onChange={e => setNewPlugin(p => ({...p, category: e.target.value as any}))} className="nexus-card px-3 py-2 text-xs text-[#e2e8f4] font-mono bg-transparent focus:outline-none"><option value="model">Modelo</option><option value="infra">Infra</option><option value="device">Device</option></select></div>
            <div><label className="text-[9px] font-mono text-[#7684a0] block mb-1">VERSÃO</label><input value={newPlugin.version} onChange={e => setNewPlugin(p => ({...p, version: e.target.value}))} className="nexus-card px-3 py-2 text-xs text-[#e2e8f4] font-mono bg-transparent focus:outline-none focus:border-[#7cf3ff]/30" placeholder="1.0" /></div>
            <button onClick={handleAdd} className="nexus-card px-4 py-2 text-[#3fe7b0] hover:bg-[#3fe7b0]/10 text-xs font-mono">SALVAR</button>
          </div>
        </div>
      )}

      {(["model","infra","device"] as const).map(cat => {
        const items = grouped[cat] || [];
        const Icon = CATEGORY_ICONS[cat];
        const color = CATEGORY_COLORS[cat];
        return (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <Icon className="h-4 w-4" style={{ color }} />
              <span className="text-xs font-mono text-[#7684a0] tracking-wider">{CATEGORY_LABELS[cat].toUpperCase()}</span>
              <span className="nexus-chip">{items.filter(p => p.connected).length}/{items.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(plugin => (
                <div key={plugin.id} className="nexus-card p-4 flex items-center justify-between">
                  <div><p className="text-sm font-medium text-[#e2e8f4]">{plugin.name}</p><p className="text-[9px] font-mono text-[#7684a0]">v{plugin.version||"-"}</p></div>
                  <button onClick={() => plugin.connected ? disconnectMutation.mutate({ name: plugin.name }) : connectMutation.mutate({ name: plugin.name })} className={`flex items-center gap-1 px-3 py-1.5 rounded text-[9px] font-mono ${plugin.connected ? "text-[#3fe7b0] border border-[rgba(63,231,176,0.2)] bg-[rgba(63,231,176,0.05)]" : "text-[#7684a0] border border-[rgba(118,132,160,0.15)]"}`}>
                    {plugin.connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    {plugin.connected ? "CONECTADO" : "CONECTAR"}
                  </button>
                </div>
              ))}
              {items.length === 0 && <div className="nexus-card p-4 text-center"><p className="text-[10px] font-mono text-[#7684a0]">Nenhum plugin nesta categoria</p></div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
