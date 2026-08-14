import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Folder, Plus, Trash2, Share2, Users, X, Send, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

interface CollabMessage {
  id: number;
  projectId: number;
  userId: number;
  userName: string | null;
  content: string;
  createdAt: Date;
  timestamp?: number;
}

interface LiveCollabMsg {
  projectId: number;
  id: number;
  userId: number;
  userName: string | null;
  content: string;
  timestamp: number;
}

export default function Projetos() {
  const { data: projects, refetch } = trpc.projects.list.useQuery();
  const { data: sharedProjects } = trpc.projects.sharedWithMe.useQuery();
  const { data: pendingInvites, refetch: refetchInvites } = trpc.projects.pendingInvites.useQuery(undefined, { refetchInterval: 10000 });
  const utils = trpc.useUtils();

  const createMutation = trpc.projects.create.useMutation({ onSuccess: () => refetch() });
  const updateMutation = trpc.projects.update.useMutation({ onSuccess: () => refetch() });
  const deleteMutation = trpc.projects.delete.useMutation({ onSuccess: () => refetch() });
  const shareMutation = trpc.projects.share.useMutation({
    onSuccess: () => { toast.success("Projeto compartilhado com sucesso!"); setSharingId(null); setShareQuery(""); }
  });
  const inviteMutation = trpc.projects.inviteCollaborator.useMutation({
    onSuccess: () => { toast.success("Convite enviado! O usuário pode aceitar nas Notificações."); setCollabOpen(null); setCollabQuery(""); }
  });
  const respondMutation = trpc.projects.respondInvite.useMutation({
    onMutate: (vars) => ({ accept: vars.accept }),
    onSuccess: (data, __, ctx) => { refetchInvites(); toast.success(ctx?.accept ? "Convite aceito! Você agora é colaborador do projeto." : "Convite recusado."); }
  });
  const sendMessageMutation = trpc.projects.sendCollabMessage.useMutation();
  const removeCollabMutation = trpc.projects.removeCollaborator.useMutation({
    onSuccess: () => { toast.success("Colaborador removido."); utils.projects.collaborations.invalidate(); }
  });

  const [creating, setCreating] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", description: "" });
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [shareQuery, setShareQuery] = useState("");
  const { data: searchUsers } = trpc.projects.findUsers.useQuery(
    { query: shareQuery }, { enabled: shareQuery.length >= 2 }
  );

  // Collaboration state
  const [collabOpen, setCollabOpen] = useState<number | null>(null);
  const [collabQuery, setCollabQuery] = useState("");
  const { data: collabUsers } = trpc.projects.findUsers.useQuery(
    { query: collabQuery }, { enabled: collabQuery.length >= 2 }
  );
  const { data: collaborators } = trpc.projects.collaborations.useQuery(
    { projectId: collabOpen ?? -1 }, { enabled: collabOpen !== null && collabOpen > 0 }
  );
  const { data: collabMessages, refetch: refetchMessages } = trpc.projects.collabMessages.useQuery(
    { projectId: collabOpen ?? -1 }, { enabled: collabOpen !== null && collabOpen > 0 }
  );
  const [liveMsgs, setLiveMsgs] = useState<LiveCollabMsg[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const { data: user } = trpc.auth.me.useQuery();

  // Socket: join the open project's room and receive live messages
  useEffect(() => {
    if (!user?.id || collabOpen === null) return;
    const socket = io(window.location.origin, {
      path: "/socket.io/",
      query: { userId: String(user.id) },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    socket.connect();

    socket.on("connect", () => {
      socket.emit("project:join", { projectId: collabOpen });
    });
    socket.on("project:message", (data: LiveCollabMsg) => {
      setLiveMsgs(prev => [...prev, data]);
    });
    socket.on("project:missionUpdate", () => {
      // Collaborators see mission progress live
      refetch();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, collabOpen, refetch]);

  const mergedMessages = useMemo<CollabMessage[]>(() => {
    const history = (collabMessages ?? []) as CollabMessage[];
    const live = liveMsgs.map(m => ({ ...m, createdAt: new Date(m.timestamp) }));
    return [...history, ...live];
  }, [collabMessages, liveMsgs]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [mergedMessages.length]);

  const handleCreate = async () => {
    if (!newProject.name.trim()) return;
    await createMutation.mutateAsync(newProject);
    setCreating(false);
    setNewProject({ name: "", description: "" });
  };

  const handleShare = async (projectId: number, targetUserId: number) => {
    await shareMutation.mutateAsync({ projectId, sharedUserId: targetUserId, permission: "edit" });
  };

  const handleInvite = async (projectId: number, targetUserId: number) => {
    try {
      await inviteMutation.mutateAsync({ projectId, invitedUserId: targetUserId });
    } catch (e) {
      toast.error(String(e).includes("Já existe") ? "Este usuário já foi convidado ou é colaborador." : String(e));
    }
  };

  const handleSendMessage = async () => {
    if (!msgInput.trim() || collabOpen === null) return;
    const content = msgInput.trim();
    setMsgInput("");
    try {
      await sendMessageMutation.mutateAsync({ projectId: collabOpen, content });
      refetchMessages();
    } catch (e) {
      toast.error("Erro ao enviar mensagem: " + String(e));
      setMsgInput(content);
    }
  };

  const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
    active: { color: "#3fe7b0", icon: () => null, label: "ATIVO" },
    paused: { color: "#ffd479", icon: () => null, label: "PAUSADO" },
    completed: { color: "#7cf3ff", icon: () => null, label: "CONCLUÍDO" },
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

      {/* Pending collaboration invites */}
      {pendingInvites && pendingInvites.length > 0 && (
        <div className="nexus-card p-4 border-l-2 border-[#ffd479]/50">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-3 w-3 text-[#ffd479]" />
            <span className="text-[9px] font-mono text-[#ffd479] tracking-wider">CONVITES DE COLABORAÇÃO PENDENTES</span>
          </div>
          <div className="space-y-2">
            {pendingInvites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between gap-3 bg-[#0a0f1e]/50 border border-[rgba(150,175,220,0.08)] p-3">
                <div>
                  <p className="text-xs font-mono text-[#e2e8f4]">{inv.projectName ?? "Projeto"}</p>
                  <p className="text-[9px] font-mono text-[#7684a0]">De: {inv.inviterName ?? "um usuário"} · papel: {inv.role}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => respondMutation.mutate({ collabId: inv.id, accept: true })}
                    className="nexus-chip text-[#3fe7b0] border-[#3fe7b0]/40 hover:bg-[#3fe7b0]/10 px-2 py-1 text-[9px] font-mono"
                  >ACEITAR</button>
                  <button
                    onClick={() => respondMutation.mutate({ collabId: inv.id, accept: false })}
                    className="nexus-chip text-[#ff6b6b] border-[#ff6b6b]/40 hover:bg-[#ff6b6b]/10 px-2 py-1 text-[9px] font-mono"
                  >RECUSAR</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {creating && (
        <div className="nexus-card p-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div><label className="text-[9px] font-mono text-[#7684a0] block mb-1">NOME</label><input value={newProject.name} onChange={e => setNewProject(p => ({...p, name: e.target.value}))} className="nexus-card px-3 py-2 text-xs text-[#e2e8f4] font-mono bg-transparent focus:outline-none focus:border-[#9fd8ff]/30" placeholder="Nome do projeto" /></div>
            <div><label className="text-[9px] font-mono text-[#7684a0] block mb-1">DESCRIÇÃO</label><input value={newProject.description} onChange={e => setNewProject(p => ({...p, description: e.target.value}))} className="nexus-card px-3 py-2 text-xs text-[#e2e8f4] font-mono bg-transparent focus:outline-none focus:border-[#9fd8ff]/30" placeholder="Descrição" /></div>
            <button onClick={handleCreate} className="nexus-card px-4 py-2 text-[#3fe7b0] hover:bg-[#3fe7b0]/10 text-xs font-mono">CRIAR</button>
          </div>
        </div>
      )}

      {/* Shared Projects Section */}
      {sharedProjects && sharedProjects.length > 0 && (
        <div className="space-y-2">
          <p className="text-[9px] font-mono text-[#c9b8ff] tracking-wider uppercase flex items-center gap-2">
            <Users className="h-3 w-3" /> COMPARTILHADOS COM VOCÊ
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sharedProjects.map((sp: any) => (
              <div key={sp.id} className="nexus-card p-4 border-l-2 border-[#c9b8ff]/40">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-[#e2e8f4]">{sp.name}</p>
                  <span className="nexus-chip text-[#c9b8ff] border-[#c9b8ff]/40">COMPARTILHADO</span>
                </div>
                {sp.description && <p className="text-[10px] font-mono text-[#7684a0] mb-2 line-clamp-2">{sp.description}</p>}
                <p className="text-[8px] font-mono text-[#7684a0]">Permissão: {sp.shares?.[0]?.permission || "view"}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Projects */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {projects?.map(project => {
          const cfg = statusConfig[project.status] || statusConfig.active;
          const isOpen = collabOpen === project.id;
          const collabCount = collaborators?.filter(c => c.status === "accepted").length ?? 0;
          return (
            <div key={project.id} className="nexus-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-[#e2e8f4]">{project.name}</p>
                <div className="flex items-center gap-2">
                  <span className="nexus-chip" style={{ color: cfg.color, borderColor: cfg.color + "40" }}>{cfg.label}</span>
                  {collabCount > 0 && (
                    <span className="nexus-chip text-[#c9b8ff] border-[#c9b8ff]/40 flex items-center gap-1">
                      <Users className="h-2.5 w-2.5" />{collabCount}
                    </span>
                  )}
                  <button
                    onClick={() => { setCollabOpen(isOpen ? null : project.id); refetchMessages(); }}
                    className="text-[#c9b8ff]/50 hover:text-[#c9b8ff] transition-colors"
                    title="Colaboração em tempo real"
                  >
                    <Users className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setSharingId(sharingId === project.id ? null : project.id)}
                    className="text-[#c9b8ff]/50 hover:text-[#c9b8ff] transition-colors"
                    title="Compartilhar"
                  >
                    <Share2 className="h-3 w-3" />
                  </button>
                  <button onClick={() => deleteMutation.mutate({ projectId: project.id })} className="text-[#ff6b6b]/50 hover:text-[#ff6b6b]"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
              {project.description && <p className="text-[10px] font-mono text-[#7684a0] mb-3 line-clamp-3">{project.description}</p>}
              <p className="text-[9px] font-mono text-[#7684a0]">Criado em {new Date(project.createdAt).toLocaleDateString()}</p>

              {/* Collaboration panel */}
              {isOpen && (
                <div className="mt-3 pt-3 border-t border-[rgba(150,175,220,0.08)] space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-3 w-3 text-[#c9b8ff]" />
                    <span className="text-[9px] font-mono text-[#c9b8ff]">COLABORAÇÃO EM TEMPO REAL</span>
                  </div>

                  {/* Invite a collaborator */}
                  <div className="flex items-center gap-2">
                    <input
                      value={collabQuery}
                      onChange={e => setCollabQuery(e.target.value)}
                      placeholder="Buscar usuário por email ou nome..."
                      className="flex-1 nexus-card px-3 py-2 text-xs text-[#e2e8f4] font-mono bg-transparent focus:outline-none focus:border-[#c9b8ff]/30"
                    />
                  </div>
                  {collabQuery.length >= 2 && collabUsers && collabUsers.length > 0 && (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {collabUsers.map(u => (
                        <button
                          key={u.id}
                          onClick={() => handleInvite(project.id, u.id)}
                          className="w-full text-left px-3 py-2 nexus-card hover:bg-[#c9b8ff]/10 text-xs font-mono text-[#e2e8f4] flex items-center gap-2"
                        >
                          <UserPlus className="h-3 w-3 text-[#c9b8ff]" />
                          <span className="text-[#c9b8ff]">{u.name || u.email}</span>
                          {u.email && u.name && <span className="text-[#7684a0]">({u.email})</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Current collaborators */}
                  {collaborators && collaborators.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[8px] font-mono text-[#7684a0]">COLABORADORES</p>
                      {collaborators.map(c => (
                        <div key={c.id} className="flex items-center justify-between bg-[#0a0f1e]/50 border border-[rgba(150,175,220,0.08)] px-3 py-2">
                          <div>
                            <p className="text-[10px] font-mono text-[#e2e8f4]">{c.collaboratorName ?? c.invitedUserId}</p>
                            <p className="text-[8px] font-mono text-[#7684a0]">{c.role} · {c.status}</p>
                          </div>
                          {c.status === "accepted" && (
                            <button onClick={() => removeCollabMutation.mutate({ projectId: project.id, targetUserId: c.invitedUserId })} className="text-[#ff6b6b]/50 hover:text-[#ff6b6b]">
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {collaborators && collaborators.length === 0 && (
                    <p className="text-[8px] font-mono text-[#7684a0]">Nenhum colaborador ainda. Convide alguém acima.</p>
                  )}

                  {/* Live chat */}
                  <div>
                    <p className="text-[8px] font-mono text-[#7684a0] mb-1">CHAT DO PROJETO</p>
                    <div ref={chatRef} className="max-h-40 overflow-y-auto space-y-1 mb-2">
                      {mergedMessages.length === 0 && (
                        <p className="text-[8px] font-mono text-[#7684a0] px-2">As mensagens dos colaboradores aparecem aqui em tempo real.</p>
                      )}
                      {mergedMessages.map(m => (
                        <div key={`${m.id}-${m.timestamp ?? m.createdAt.getTime()}`} className="px-2 py-1">
                          <span className="text-[9px] font-mono text-[#c9b8ff]">{m.userName ?? "Usuário"}:</span>{" "}
                          <span className="text-[9px] font-mono text-[#e2e8f4]">{m.content}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={msgInput}
                        onChange={e => setMsgInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleSendMessage(); }}
                        placeholder="Enviar mensagem..."
                        className="flex-1 nexus-card px-3 py-2 text-xs text-[#e2e8f4] font-mono bg-transparent focus:outline-none focus:border-[#c9b8ff]/30"
                      />
                      <button onClick={handleSendMessage} className="nexus-card px-3 py-2 text-[#3fe7b0] hover:bg-[#3fe7b0]/10" disabled={sendMessageMutation.isPending}>
                        <Send className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Share panel */}
              {sharingId === project.id && (
                <div className="mt-3 pt-3 border-t border-[rgba(150,175,220,0.08)]">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-3 w-3 text-[#c9b8ff]" />
                    <span className="text-[9px] font-mono text-[#c9b8ff]">COMPARTILHAR PROJETO</span>
                  </div>
                  <input
                    type="text"
                    value={shareQuery}
                    onChange={e => setShareQuery(e.target.value)}
                    placeholder="Buscar por email ou nome..."
                    className="w-full nexus-card px-3 py-2 text-xs text-[#e2e8f4] font-mono bg-transparent focus:outline-none focus:border-[#c9b8ff]/30"
                  />
                  {searchUsers && searchUsers.length > 0 && (
                    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                      {searchUsers.map(u => (
                        <button
                          key={u.id}
                          onClick={() => handleShare(project.id, u.id)}
                          className="w-full text-left px-3 py-2 nexus-card hover:bg-[#c9b8ff]/10 text-xs font-mono text-[#e2e8f4]"
                        >
                          <span className="text-[#c9b8ff]">{u.name || u.email}</span>
                          {u.email && u.name && <span className="text-[#7684a0] ml-2">({u.email})</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {shareQuery.length >= 2 && searchUsers && searchUsers.length === 0 && (
                    <p className="text-[8px] font-mono text-[#7684a0] mt-1">Nenhum usuário encontrado.</p>
                  )}
                  <p className="text-[8px] font-mono text-[#7684a0] mt-1">Selecione um usuário para compartilhar com permissão de edição.</p>
                </div>
              )}
            </div>
          );
        })}
        {(!projects || projects.length === 0) && <div className="nexus-card p-8 text-center"><p className="text-[10px] font-mono text-[#7684a0]">Nenhum projeto criado.</p></div>}
      </div>
    </div>
  );
}
