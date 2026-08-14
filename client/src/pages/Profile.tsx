import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  UserCircle2, Loader2, Save, Brain, Plug, Package, Star, Share2, Award, Zap,
} from "lucide-react";

const ACCENT_COLORS = ["#7cf3ff", "#c9b8ff", "#ffd479", "#3fe7b0", "#ff6b6b"];

export default function Profile() {
  const { data: me } = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const { data: profile, isLoading: profileLoading } = trpc.profile.get.useQuery();
  const { data: history, isLoading: historyLoading } = trpc.profile.history.useQuery();

  const [bio, setBio] = useState(profile?.bio || "");
  const [avatar, setAvatar] = useState(profile?.avatar || "");
  const [accent, setAccent] = useState("");

  const updateMutation = trpc.profile.update.useMutation({
    onSuccess: () => {
      toast.success("Perfil atualizado!");
      utils.profile.get.invalidate();
    },
    onError: e => toast.error(e.message || "Erro ao atualizar perfil"),
  });

  const handleSave = () => {
    updateMutation.mutate({ bio: bio.trim() || undefined, avatar: avatar.trim() || undefined, accentColor: accent || undefined });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2">
          <UserCircle2 className="h-5 w-5 text-[#7cf3ff]" />
          Perfil do Usuário
        </h2>
        <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">
          Identidade digital no ecossistema NEXUS
        </p>
      </div>

      {/* Phase 11: reputation level from accumulated XP */}
      <div className="nexus-card p-4">
        <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-3 flex items-center gap-2">
          <Award className="h-3.5 w-3.5 text-[#ffd479]" /> Reputação & XP
        </p>
        <ReputationCard />
      </div>

      {/* Edit card */}
      <div className="nexus-card p-5">
        <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-4">Informações</p>
        {profileLoading ? (
          <div className="h-40 animate-pulse" />
        ) : (
          <div className="space-y-4 max-w-lg">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full border border-[rgba(124,243,255,0.3)] flex items-center justify-center bg-[rgba(124,243,255,0.05)] overflow-hidden">
                {profile?.avatar ? (
                  <img src={profile.avatar} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <UserCircle2 className="h-9 w-9 text-[#7cf3ff]" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <p className="text-sm font-mono text-[#e2e8f4]">{me?.name || "Usuário NEXUS"}</p>
                <Input
                  value={avatar}
                  onChange={e => setAvatar(e.target.value)}
                  placeholder="URL do avatar (opcional)"
                  className="bg-[rgba(3,5,14,0.8)] border-[rgba(150,175,220,0.12)] text-[#e2e8f4] text-xs font-mono"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-mono text-[#7684a0] tracking-wider">BIO</label>
              <Textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="Conte um pouco sobre você e suas missões..."
                maxLength={500}
                className="bg-[rgba(3,5,14,0.8)] border-[rgba(150,175,220,0.12)] text-[#e2e8f4] text-xs font-mono min-h-20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-mono text-[#7684a0] tracking-wider">COR DE DESTAQUE</label>
              <div className="flex gap-2">
                {ACCENT_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAccent(accent === c ? "" : c)}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${accent === c ? "border-white scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
              </div>
            </div>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="bg-[#c9b8ff]/10 text-[#c9b8ff] border border-[#c9b8ff]/20 hover:bg-[#c9b8ff]/20 font-mono text-xs"
            >
              {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-2" />}
              SALVAR PERFIL
            </Button>
          </div>
        )}
      </div>

      {/* Personal history */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="nexus-card p-4">
          <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-3 flex items-center gap-2">
            <Brain className="h-3.5 w-3.5 text-[#7cf3ff]" /> Missões ({history?.missions.length || 0})
          </p>
          {historyLoading ? (
            <div className="h-32 animate-pulse" />
          ) : !history?.missions?.length ? (
            <p className="text-[10px] font-mono text-[#7684a0]">Nenhuma missão executada ainda.</p>
          ) : (
            <div className="space-y-1.5 max-h-52 overflow-auto">
              {history.missions.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-[rgba(3,5,14,0.8)] border border-[rgba(150,175,220,0.08)] p-2">
                  <p className="text-[10px] font-mono text-[#aab4d6] truncate mr-2">{m.input}</p>
                  <span className={`text-[8px] font-mono px-1.5 py-0.5 border shrink-0 ${m.status === "completed" ? "text-[#3fe7b0] border-[rgba(63,231,176,0.25)]" : m.status === "executing" ? "text-[#ffd479] border-[rgba(255,212,121,0.25)]" : "text-[#7684a0] border-[rgba(150,175,220,0.12)]"}`}>
                    {m.status?.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="nexus-card p-4">
          <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-3 flex items-center gap-2">
            <Plug className="h-3.5 w-3.5 text-[#3fe7b0]" /> Plugins Instalados ({(history?.plugins.length || 0) + (history?.marketplaceInstalls.length || 0)})
          </p>
          {historyLoading ? (
            <div className="h-32 animate-pulse" />
          ) : (!history?.plugins?.length && !history?.marketplaceInstalls?.length) ? (
            <p className="text-[10px] font-mono text-[#7684a0]">Nenhum plugin instalado.</p>
          ) : (
            <div className="space-y-1.5 max-h-52 overflow-auto">
              {history.plugins.map(p => (
                <div key={p.id} className="flex items-center gap-2 bg-[rgba(3,5,14,0.8)] border border-[rgba(150,175,220,0.08)] p-2">
                  <Plug className="h-3 w-3 text-[#3fe7b0] shrink-0" />
                  <p className="text-[10px] font-mono text-[#aab4d6] truncate">{p.name}</p>
                  <span className="text-[8px] font-mono text-[#7684a0] shrink-0">{p.category?.toUpperCase()}</span>
                </div>
              ))}
              {history.marketplaceInstalls.map(p => (
                <div key={p.id} className="flex items-center gap-2 bg-[rgba(3,5,14,0.8)] border border-[rgba(255,212,121,0.15)] p-2">
                  <Package className="h-3 w-3 text-[#ffd479] shrink-0" />
                  <p className="text-[10px] font-mono text-[#aab4d6] truncate">{p.name} <span className="text-[#7684a0]">(marketplace)</span></p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="nexus-card p-4">
          <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-3 flex items-center gap-2">
            <Star className="h-3.5 w-3.5 text-[#ffd479]" /> Avaliações Feitas ({history?.reviews.length || 0})
          </p>
          {historyLoading ? (
            <div className="h-32 animate-pulse" />
          ) : !history?.reviews?.length ? (
            <p className="text-[10px] font-mono text-[#7684a0]">Nenhuma avaliação registrada.</p>
          ) : (
            <div className="space-y-1.5 max-h-52 overflow-auto">
              {history.reviews.map(r => (
                <div key={r.id} className="bg-[rgba(3,5,14,0.8)] border border-[rgba(150,175,220,0.08)] p-2">
                  <p className="text-[10px] font-mono text-[#aab4d6]">
                    {"★".repeat(r.rating)}<span className="text-[#3a4360]">{"★".repeat(5 - r.rating)}</span>
                    <span className="text-[#7684a0] ml-2">plugin #{r.pluginId}</span>
                  </p>
                  {r.comment ? <p className="text-[9px] font-mono text-[#7684a0] mt-1">{r.comment}</p> : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="nexus-card p-4">
          <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-3 flex items-center gap-2">
            <Share2 className="h-3.5 w-3.5 text-[#c9b8ff]" /> Projetos Compartilhados ({history?.sharedProjects.length || 0})
          </p>
          {historyLoading ? (
            <div className="h-32 animate-pulse" />
          ) : !history?.sharedProjects?.length ? (
            <p className="text-[10px] font-mono text-[#7684a0]">Nenhum compartilhamento ativo.</p>
          ) : (
            <div className="space-y-1.5 max-h-52 overflow-auto">
              {history.sharedProjects.map(s => (
                <div key={s.id} className="flex items-center gap-2 bg-[rgba(3,5,14,0.8)] border border-[rgba(150,175,220,0.08)] p-2">
                  <Share2 className="h-3 w-3 text-[#c9b8ff] shrink-0" />
                  <p className="text-[10px] font-mono text-[#aab4d6]">Projeto #{s.projectId}</p>
                  <span className="text-[8px] font-mono text-[#7684a0] shrink-0">{s.permission?.toUpperCase()} · com #{s.sharedUserId}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReputationCard() {
  const { data: rep, isLoading } = trpc.reputation.me.useQuery();
  if (isLoading) return <div className="h-16 animate-pulse" />;
  if (!rep) return <p className="text-[10px] font-mono text-[#7684a0]">Sem dados de reputação ainda.</p>;
  const level = rep.level as { name: string; icon: string; color: string };
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-xl" title={level.name}>{level.icon}</span>
          <div>
            <p className="text-sm font-semibold" style={{ color: level.color }}>{level.name}</p>
            <p className="text-[10px] font-mono text-[#7684a0]">{rep.totalXp} XP · {rep.contributions} contribuições</p>
          </div>
        </div>
        {rep.nextLevel ? (
          <div className="text-right">
            <p className="text-[10px] font-mono text-[#aab4d6]">Próximo: {(rep.nextLevel as { name: string; required: number }).name}</p>
            <p className="text-[9px] font-mono text-[#55648a]">{rep.nextLevel.required - rep.totalXp} XP restantes</p>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[#ffd479]">
            <Zap className="h-3.5 w-3.5" />
            <span className="text-[10px] font-mono">Nível máximo</span>
          </div>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-[rgba(3,5,14,0.8)] border border-[rgba(150,175,220,0.1)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.round(rep.progress * 100)}%`, backgroundColor: level.color }}
        />
      </div>
    </div>
  );
}
