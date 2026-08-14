import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Trophy, Medal, Zap, Hash } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Leaderboard() {
  const { user } = useAuth();
  const { data: board, isLoading } = trpc.leaderboard.list.useQuery();
  const { data: mine } = trpc.leaderboard.my.useQuery(undefined, { enabled: !!user });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-[#e2e8f4] font-mono text-lg flex items-center gap-2">
          <Trophy className="h-5 w-5 text-[#ffd479]" />
          Leaderboard
        </h1>
        <p className="text-[9px] font-mono text-[#7684a0] tracking-wider mt-1">
          RANQUEAMENTO DE COLABORADORES — XP POR CONTRIBUIÇÕES NA COMUNIDADE
        </p>
      </div>

      {user && mine && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-[rgba(3,5,14,0.8)] border border-[#c9b8ff]/20 p-4">
            <p className="text-[9px] font-mono text-[#7684a0] tracking-wider">SEU XP TOTAL</p>
            <p className="text-2xl font-mono text-[#c9b8ff] mt-1">{mine.totalXp.toLocaleString("pt-BR")}</p>
          </div>
          <div className="bg-[rgba(3,5,14,0.8)] border border-[#7cf3ff]/20 p-4">
            <p className="text-[9px] font-mono text-[#7684a0] tracking-wider">CONTRIBUIÇÕES</p>
            <p className="text-2xl font-mono text-[#7cf3ff] mt-1">{mine.contributions}</p>
          </div>
          <div className="bg-[rgba(3,5,14,0.8)] border border-[#ffd479]/20 p-4">
            <p className="text-[9px] font-mono text-[#7684a0] tracking-wider">SUA POSIÇÃO</p>
            <p className="text-2xl font-mono text-[#ffd479] mt-1">#{mine.rank}</p>
          </div>
        </div>
      )}

      <div className="bg-[rgba(3,5,14,0.8)] border border-[rgba(150,175,220,0.12)]">
        <div className="p-4 border-b border-[rgba(150,175,220,0.08)]">
          <p className="text-[9px] font-mono text-[#7684a0] tracking-wider">TOP 20 — PONTOS DE EXPERIÊNCIA</p>
        </div>
        <div className="divide-y divide-[rgba(150,175,220,0.06)]">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-3 flex items-center gap-3">
                <Skeleton className="h-4 w-4 bg-[#2a3350]" />
                <Skeleton className="h-4 w-40 bg-[#2a3350]" />
                <Skeleton className="h-4 w-16 ml-auto bg-[#2a3350]" />
              </div>
            ))
          ) : !board || board.length === 0 ? (
            <p className="p-6 text-[10px] font-mono text-[#5a6580] text-center">
              Ainda não há colaboradores ranqueados. Publique plugins, faça reviews e conclua missões para ganhar XP!
            </p>
          ) : (
            board.map(entry => {
              const isMe = !!user && entry.userId === user.id;
              return (
                <div
                  key={entry.userId}
                  className={`p-3 flex items-center gap-3 transition-colors ${isMe ? "bg-[#c9b8ff]/5" : "hover:bg-[rgba(60,80,140,0.06)]"}`}
                >
                  <div className={`w-8 h-8 flex items-center justify-center rounded font-mono text-[11px] border ${
                    entry.rank === 1
                      ? "bg-[#ffd479]/10 text-[#ffd479] border-[#ffd479]/30"
                      : entry.rank === 2
                        ? "bg-[#c0c9dd]/10 text-[#c0c9dd] border-[#c0c9dd]/30"
                        : entry.rank === 3
                          ? "bg-[#d4a373]/10 text-[#d4a373] border-[#d4a373]/30"
                          : "bg-[rgba(3,5,14,0.6)] text-[#7684a0] border-[rgba(150,175,220,0.1)]"
                  }`}>
                    {entry.rank <= 3 ? (entry.rank === 1 ? <Trophy className="h-3.5 w-3.5" /> : entry.rank === 2 ? <Medal className="h-3.5 w-3.5" /> : <Medal className="h-3.5 w-3.5" />) : `#${entry.rank}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-mono text-[#e2e8f4] truncate">
                      {entry.name ? `${entry.name}${isMe ? " (você)" : ""}` : `Usuário #${entry.userId}`}
                    </p>
                    <p className="text-[8px] font-mono text-[#5a6580]">
                      <Hash className="h-2.5 w-2.5 inline" /> {entry.contributions} contribuiç{entry.contributions === 1 ? "ão" : "ões"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#c9b8ff]">
                    <Zap className="h-3 w-3" />
                    {entry.totalXp.toLocaleString("pt-BR")} XP
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[
          { label: "PLUGIN PUBLICADO", xp: 50 },
          { label: "MISSÃO CONCLUÍDA", xp: 20 },
          { label: "REVIEW", xp: 10 },
          { label: "COLABORAÇÃO ACEITA", xp: 5 },
        ].map(rule => (
          <div key={rule.label} className="bg-[rgba(3,5,14,0.8)] border border-[rgba(150,175,220,0.08)] p-3">
            <p className="text-[8px] font-mono text-[#7684a0] tracking-wider">{rule.label}</p>
            <p className="text-sm font-mono text-[#7cf3ff] mt-1 flex items-center gap-1">
              <Zap className="h-3 w-3" /> +{rule.xp} XP
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
