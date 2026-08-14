import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Trophy, Lock, CheckCircle2, Rocket, Target, Crown, Plug, Star, Award, MessageSquare, Database, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ReactNode> = {
  rocket: <Rocket className="h-5 w-5" />,
  target: <Target className="h-5 w-5" />,
  crown: <Crown className="h-5 w-5" />,
  plug: <Plug className="h-5 w-5" />,
  star: <Star className="h-5 w-5" />,
  award: <Award className="h-5 w-5" />,
  "message-square": <MessageSquare className="h-5 w-5" />,
  database: <Database className="h-5 w-5" />,
};

type BadgeDef = {
  key: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress: number;
};

export function Achievements() {
  const { user } = useAuth();
  const [hasMarkedSeen, setHasMarkedSeen] = useState(false);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.achievements.list.useQuery(undefined, { enabled: !!user });
  const listDefs = (data?.definitions ?? []) as BadgeDef[];

  // Newly unlocked = unlocked but not yet seen by the user.
  const newKeys = (data?.unlocked ?? []).filter(u => !u.seenAt).map(u => u.badgeKey);

  const markSeenMut = trpc.achievements.markSeen.useMutation({
    onSuccess: () => {
      setHasMarkedSeen(true);
      utils.achievements.list.invalidate();
    },
    onError: (err) => {
      console.error("[Achievements] markSeen failed", err);
      toast.error("Falha ao registrar conquistas como vistas. Recarregue a página para tentar novamente.");
    },
  });

  useEffect(() => {
    if (!user || isLoading || hasMarkedSeen) return;
    if (newKeys.length > 0) {
      for (const key of newKeys) {
        const def = listDefs.find(d => d.key === key);
        toast.success(`Conquista desbloqueada: ${def?.name ?? key}`, {
          description: def?.description,
        });
      }
      markSeenMut.mutate({ badgeKeys: newKeys });
    } else {
      setHasMarkedSeen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading, newKeys.length]);

  const defs = listDefs;
  const unlockedCount = defs.filter(d => d.unlocked).length;
  const totalCount = defs.length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-2">
          <Trophy className="h-6 w-6 text-[#ffd479]" />
          <h1 className="text-2xl font-bold text-foreground">Conquistas</h1>
        </div>
        <p className="font-mono text-[10px] text-[#7684a0] tracking-wider uppercase mb-6">
          {unlockedCount}/{totalCount} desbloqueadas — progresso do ecossistema
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#7cf3ff]" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {defs.map(def => {
              const isNew = newKeys.includes(def.key);
              return (
              <div
                key={def.key}
                className={cn(
                  "nexus-card p-4 flex items-start gap-3 transition-all duration-200",
                  def.unlocked ? "border border-[#ffd479]/40 bg-[#14192e]" : "opacity-60",
                  isNew && "ring-2 ring-[#ffd479] animate-pulse",
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    def.unlocked
                      ? "bg-[#ffd479]/15 text-[#ffd479]"
                      : "bg-[#1b2238] text-[#55648a]",
                  )}
                >
                  {iconMap[def.icon] ?? <Trophy className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm text-foreground">{def.name}</p>
                    {def.unlocked ? (
                      <CheckCircle2 className="h-4 w-4 text-[#3fe7b0]" />
                    ) : (
                      <Lock className="h-3.5 w-3.5 text-[#55648a]" />
                    )}
                    {isNew && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#ffd479] text-[#14192e]">
                        Nova
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-[#7684a0] mt-1">{def.description}</p>
                  {!def.unlocked && def.progress !== undefined && def.progress > 0 && (
                    <div className="mt-2 h-1.5 rounded-full bg-[#1b2238] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#7cf3ff] transition-all duration-500"
                        style={{ width: `${Math.round(def.progress * 100)}%` }}
                      />
                    </div>
                  )}
                  {def.unlocked && (
                    <p className="text-[10px] font-mono text-[#ffd479]/80 mt-2">
                      Desbloqueada em{" "}
                      {new Date(data?.unlocked.find(u => u.badgeKey === def.key)?.unlockedAt ?? "").toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
  );
}
