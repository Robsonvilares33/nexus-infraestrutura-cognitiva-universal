import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Folder, Plus, Trash2, Edit, CheckCircle2, Pause, Play } from "lucide-react";

export default function Projetos() {
  const { data: projects, refetch } = trpc.projects.list.useQuery();
  const createMutation = trpc.projects.create.useMutation({ onSuccess: () => refetch() });
  const updateMutation = trpc.projects.update.useMutation({ onSuccess: () => refetch() });
  const deleteMutation = trpc.projects.delete.useMutation({ onSuccess: () => refetch() });
  const [creating, setCreating] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", description: "" });

  const handleCreate = async () => {
    if (!newProject.name.trim()) return;
    await createMutation.mutateAsync(newProject);
    setCreating(false);
    setNewProject({ name: "", description: "" });
  };

  const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
    active: { color: "#3fe7b0", icon: Play, label: "ATIVO" },
    paused: { color: "#ffd479", icon: Pause, label: "PAUSADO" },
    completed: { color: "#7cf3ff", icon: CheckCircle2, label: "CONCLUÍDO" },
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2">
            <Folder className="h-5 w-5 text-[#9fd8ff]" />
            Projetos
          </h2>
          <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">Gerencie projetos dentro do ecossistema cognitivo</p>
        </div>
        <button onClick={() => setCreating(!creating)} className="nexus-card px-3 py-2 text-[#9fd8ff] hover:bg-[#9fd8ff]/10 text-xs font-mono flex items-center gap-2">
          <Plus className="h-3 w-3" /> NOVO PROJETO
        </button>
      </div>

      {creating && (
        <div className="nexus-card p-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div><label className="text-[9px] font-mono text-[#7684a0] block mb-1">NOME</label><input value={newProject.name} onChange={e => setNewProject(p => ({...p, name: e.target.value}))} className="nexus-card px-3 py-2 text-xs text-[#e2e8f4] font-mono bg-transparent focus:outline-none focus:border-[#9fd8ff]/30" placeholder="Nome do projeto" /></div>
            <div><label className="text-[9px] font-mono text-[#7684a0] block mb-1">DESCRIÇÃO</label><input value={newProject.description} onChange={e => setNewProject(p => ({...p, description: e.target.value}))} className="nexus-card px-3 py-2 text-xs text-[#e2e8f4] font-mono bg-transparent focus:outline-none focus:border-[#9fd8ff]/30" placeholder="Descrição" /></div>
            <button onClick={handleCreate} className="nexus-card px-4 py-2 text-[#3fe7b0] hover:bg-[#3fe7b0]/10 text-xs font-mono">CRIAR</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {projects?.map(project => {
          const cfg = statusConfig[project.status] || statusConfig.active;
          return (
            <div key={project.id} className="nexus-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-[#e2e8f4]">{project.name}</p>
                <div className="flex items-center gap-2">
                  <span className={`nexus-chip`} style={{ color: cfg.color, borderColor: cfg.color + "40" }}>{cfg.label}</span>
                  <button onClick={() => deleteMutation.mutate({ projectId: project.id })} className="text-[#ff6b6b]/50 hover:text-[#ff6b6b]"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
              {project.description && <p className="text-[10px] font-mono text-[#7684a0] mb-3 line-clamp-3">{project.description}</p>}
              <p className="text-[9px] font-mono text-[#7684a0]">Criado em {new Date(project.createdAt).toLocaleDateString()}</p>
            </div>
          );
        })}
        {(!projects || projects.length === 0) && <div className="nexus-card p-8 text-center"><p className="text-[10px] font-mono text-[#7684a0]">Nenhum projeto criado.</p></div>}
      </div>
    </div>
  );
}
