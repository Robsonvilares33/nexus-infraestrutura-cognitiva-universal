import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck, Rocket, Star, Mail, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const typeIcons: Record<string, React.ReactNode> = {
  mission: <Rocket className="h-4 w-4" />,
  review: <Star className="h-4 w-4" />,
};

export function Notifications() {
  const { user } = useAuth();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading, refetch } = trpc.notifications.list.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 10000,
  });
  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => refetch(),
  });
  const markAllMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => refetch(),
  });

  // Phase 11: live notification push via Socket.io — no page refresh needed
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    const socket = io(window.location.origin, {
      path: "/socket.io/",
      query: { userId: String(user.id) },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("notification:push", (payload: { type: string; title: string; content?: string }) => {
      toast(payload.title, { description: payload.content, duration: 6000 });
      refetch();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]);

  const rows = (data ?? []).filter(n => (unreadOnly ? !n.isRead : true));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Bell className="h-6 w-6 text-[#7cf3ff]" />
            <h1 className="text-2xl font-bold text-foreground">Central de Notificações</h1>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={unreadOnly ? "default" : "outline"}
              onClick={() => setUnreadOnly(v => !v)}
              className={unreadOnly ? "bg-[#7cf3ff] text-black hover:bg-[#7cf3ff]/80" : ""}
            >
              Não lidas
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
            >
              {markAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4" />
              )}
              Marcar todas
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#7cf3ff]" />
          </div>
        ) : rows.length === 0 ? (
          <div className="nexus-card p-10 text-center">
            <Bell className="h-10 w-10 mx-auto text-[#3d4a66] mb-4" />
            <p className="font-mono text-sm text-[#7684a0]">
              {unreadOnly ? "Nenhuma notificação não lida." : "Nenhuma notificação ainda. Conclua uma missão ou receba uma avaliação para começar."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map(n => {
              const icon = typeIcons[n.type] ?? <Info className="h-4 w-4" />;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => !n.isRead && markReadMutation.mutate({ id: n.id })}
                  className={cn(
                    "nexus-card w-full text-left p-4 flex items-start gap-3 transition-all duration-200",
                    !n.isRead ? "border-l-2 border-l-[#7cf3ff] bg-[#0b1020]" : "opacity-70",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      n.type === "review" ? "bg-[#ffd479]/15 text-[#ffd479]" : "bg-[#7cf3ff]/15 text-[#7cf3ff]",
                    )}
                  >
                    {icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-foreground truncate">{n.title}</p>
                    {n.content && <p className="text-xs font-mono text-[#7684a0] mt-1 break-words">{n.content}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-[10px] font-mono text-[#55648a] block">
                      {new Date(n.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {!n.isRead && <Mail className="h-3 w-3 ml-auto mt-1 text-[#7cf3ff]" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
  );
}
