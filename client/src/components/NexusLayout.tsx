import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import {
  Home, Globe, Brain, Plug, Database, Bot, Cpu, Folder, Settings, Activity, FileText,
  BarChart3, MessageSquare, Package, ShieldCheck, Bell, Trophy, Zap, Radio,
  LogIn, LogOut, User, ChevronLeft, ChevronRight, Menu, Sun, Moon, UserCircle2, AlertTriangle, TrendingUp
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";

const NAV_ITEMS = [
  { path: "/", label: "Home", icon: Home },
  { path: "/universo", label: "Universo", icon: Globe },
  { path: "/minha-ia", label: "Minha IA", icon: Brain },
  { path: "/plugins", label: "Plugins", icon: Plug },
  { path: "/memoria", label: "Memória", icon: Database },
  { path: "/agentes", label: "Agentes", icon: Bot },
  { path: "/modelos", label: "Modelos", icon: Cpu },
  { path: "/projetos", label: "Projetos", icon: Folder },
  { path: "/config", label: "Config", icon: Settings },
  { path: "/webhooks", label: "Webhooks", icon: Radio },
  { path: "/loterias", label: "Loterias", icon: TrendingUp },
  { path: "/status", label: "Status", icon: Activity },
  { path: "/docs", label: "Docs", icon: FileText },
  { path: "/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/chat", label: "Chat", icon: MessageSquare },
  { path: "/chat-multiagente", label: "Chat Multiagente", icon: Bot },
  { path: "/marketplace", label: "Marketplace", icon: Package },
  { path: "/profile", label: "Perfil", icon: UserCircle2 },
  { path: "/notificacoes", label: "Notificações", icon: Bell },
  { path: "/conquistas", label: "Conquistas", icon: Trophy },
  { path: "/leaderboard", label: "Leaderboard", icon: Zap },
];

const ADMIN_NAV_ITEMS = [
  { path: "/admin", label: "Admin", icon: ShieldCheck },
];

function ReputationLine({ collapsed, isAuthenticated }: { collapsed: boolean; isAuthenticated: boolean }) {
  const { data: rep, isLoading } = trpc.reputation.me.useQuery(undefined, {
    enabled: isAuthenticated && !collapsed,
  });
  if (isLoading || !rep) return null;
  const pct = Math.round((rep.progress ?? 0) * 100);
  return (
    <Link href="/profile" className="block mb-2">
      <div className="nexus-card px-2.5 py-1.5 flex items-center gap-2">
        <span className="text-sm leading-none shrink-0" title={rep.level.name}>{rep.level.icon}</span>
        <div className="overflow-hidden flex-1">
          <p className="text-[9px] font-mono text-[#e2e8f4] truncate">
            {rep.level.name} · <span className="text-[#7cf3ff]">{rep.totalXp} XP</span>
          </p>
          <div className="mt-1 h-1 rounded-full bg-[rgba(150,175,220,0.12)] overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#7cf3ff] to-[#ffd479]" style={{ width: `${pct}%` }} />
          </div>
          {rep.nextLevel && (
            <p className="text-[8px] font-mono text-[#7684a0] mt-0.5 truncate">
              Próximo: {rep.nextLevel.name} ({rep.nextLevel.required - rep.totalXp} XP restantes)
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

// Fase 21 — badge de cota LLM compartilhado entre páginas e layout.
// Qualquer página pode sinalizar uma falha 412 via setQuotaAlert(), que faz
// o badge âmbar aparecer no cabeçalho e levar direto a /config.
type QuotaContext = {
  visible: boolean;
  setMessage: (msg: string | null) => void;
};
export const QuotaAlertContext = {
  listeners: new Set<(ctx: QuotaContext) => void>(),
  visible: false,
  setMessage(msg: string | null) {
    this.visible = msg !== null;
    this.listeners.forEach(l => l({ visible: this.visible, setMessage: m => this.setMessage(m) }));
  },
};

export function useQuotaAlert() {
  const [visible, setVisible] = useState(false);
  const setMsg = useCallback((msg: string | null) => QuotaAlertContext.setMessage(msg), []);
  useEffect(() => {
    const listener = (ctx: QuotaContext) => setVisible(ctx.visible);
    QuotaAlertContext.listeners.add(listener);
    return () => { QuotaAlertContext.listeners.delete(listener); };
  }, []);
  return { visible, setMessage: setMsg };
}

function QuotaBadge() {
  const { visible } = useQuotaAlert();
  if (!visible) return null;
  return (
    <Link href="/config">
      <span className="flex items-center gap-1.5 nexus-chip border-[#ffd479]/40 bg-[#ffd479]/10 text-[#ffd479] cursor-pointer hover:bg-[#ffd479]/20 transition-colors" title="Limite do LLM atingido — configure outro provedor em Config">
        <AlertTriangle className="h-3 w-3" />
        <span className="text-[9px] font-mono">LLM EXAURIDO</span>
      </span>
    </Link>
  );
}

export default function NexusLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  // Phase 10: live online/offline indicator
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 15000,
  });
  const unread = (unreadCount as { count?: number } | undefined)?.count ?? 0;

  // Seed the ecosystem once when authenticated.
  // useMutation must be declared at the top level (before early returns),
  // so it is declared unconditionally and seeded via a callback ref effect.
  const seededRef = useRef(false);
  const seedMutation = trpc.universe.seed.useMutation();
  useEffect(() => {
    if (isAuthenticated && !seededRef.current) {
      seededRef.current = true;
      seedMutation.mutate();
    }
  }, [isAuthenticated]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#020308] flex items-center justify-center">
        <div className="text-center">
          <div className="nexus-logo text-3xl mb-4">NEXUS</div>
          <p className="text-[10px] font-mono text-[#7684a0] tracking-widest animate-pulse">INICIALIZANDO UNIVERSO COGNITIVO...</p>
        </div>
      </div>
    );
  }
  // Not authenticated — login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#020308] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="nexus-logo text-4xl">NEXUS</div>
          <p className="text-xs font-mono text-[#7684a0] tracking-widest">PLATAFORMA COGNITIVA UNIVERSAL</p>
          <div className="nexus-card p-6 space-y-4">
            <p className="text-sm text-[#aab4d6]">Acesse o ecossistema de inteligência distribuída.</p>
            <Button
              onClick={() => startLogin()}
              className="w-full bg-[#7cf3ff]/10 text-[#7cf3ff] border border-[#7cf3ff]/20 hover:bg-[#7cf3ff]/20 font-mono text-sm"
            >
              <LogIn className="h-4 w-4 mr-2" />
              ENTRAR NO NEXUS
            </Button>
            <p className="text-[9px] font-mono text-[#7684a0]">Autenticação OAuth segura</p>
          </div>
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-4 flex items-center gap-3">
        <div className={`nexus-logo text-xl ${collapsed ? "text-sm" : ""}`}>NEXUS</div>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const isActive = location === item.path;
          return (
            <Link key={item.path} href={item.path}>
              <button
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? "bg-[rgba(124,243,255,0.08)] text-[#7cf3ff] border border-[rgba(124,243,255,0.15)]"
                    : "text-[#7684a0] hover:text-[#aab4d6] hover:bg-[rgba(255,255,255,0.02)]"
                } ${collapsed ? "justify-center" : ""}`}
                title={item.label}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <span className="font-mono flex-1 text-left">
                    {item.label}
                    {item.path === "/notificacoes" && unread > 0 && (
                      <span className="ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ffd479]/15 px-1 text-[9px] font-bold text-[#ffd479] border border-[#ffd479]/30">
                        {unread}
                      </span>
                    )}
                  </span>
                )}
              </button>
            </Link>
          );
        })}
        {user?.role === "admin" && (
          <div className="pt-3 border-t border-[rgba(150,175,220,0.06)] mt-3">
            {ADMIN_NAV_ITEMS.map(item => {
              const isActive = location === item.path;
              return (
                <Link key={item.path} href={item.path}>
                  <button
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                      isActive
                        ? "bg-[rgba(63,231,176,0.08)] text-[#3fe7b0] border border-[rgba(63,231,176,0.15)]"
                        : "text-[#7684a0] hover:text-[#aab4d6] hover:bg-[rgba(255,255,255,0.02)]"
                    } ${collapsed ? "justify-center" : ""}`}
                    title={item.label}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="font-mono">{item.label}</span>}
                  </button>
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* User */}
      <div className={`p-3 border-t border-[rgba(150,175,220,0.06)] ${collapsed ? "text-center" : ""}`}>
        <div className="flex items-center gap-2 mb-2">
          <div className="h-7 w-7 rounded-full bg-[rgba(124,243,255,0.1)] flex items-center justify-center text-[#7cf3ff] shrink-0">
            <User className="h-3.5 w-3.5" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-[10px] font-mono text-[#e2e8f4] truncate">{user?.name || "Usuário"}</p>
              <p className="text-[9px] font-mono text-[#7684a0] truncate">{user?.email || "—"}</p>
            </div>
          )}
        </div>
        {/* Phase 11: reputation level + XP progress in sidebar */}
        <ReputationLine collapsed={collapsed} isAuthenticated={isAuthenticated} />
        <button
          onClick={() => logout()}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[9px] font-mono text-[#7684a0] hover:text-[#ff6b6b] hover:bg-[rgba(255,107,107,0.05)] transition-colors ${collapsed ? "justify-center" : ""}`}
        >
          <LogOut className="h-3 w-3" />
          {!collapsed && <span>SAIR</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#020308] flex">
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-3 left-3 z-50 nexus-card p-2"
      >
        <Menu className="h-4 w-4 text-[#7cf3ff]" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 flex flex-col border-r border-[rgba(150,175,220,0.06)] bg-[#020308] transition-all duration-200 ${
        mobileOpen ? "w-52 translate-x-0" : "w-52 -translate-x-full lg:translate-x-0"
      } ${collapsed ? "lg:!w-16" : "lg:!w-52"}`}>
        {sidebarContent}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute -right-3 top-8 h-6 w-6 items-center justify-center rounded-full bg-[#020308] border border-[rgba(150,175,220,0.12)] text-[#7684a0] hover:text-[#7cf3ff] hover:border-[rgba(124,243,255,0.2)] transition-colors"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen overflow-y-auto">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 border-b border-[rgba(150,175,220,0.06)] bg-[rgba(2,3,8,0.8)] backdrop-blur-md">
          <div className="px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 lg:pl-14">
              <h1 className="text-sm font-medium text-[#e2e8f4]">
                {NAV_ITEMS.find(n => n.path === location)?.label || "NEXUS"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {toggleTheme && (
                <button
                  onClick={toggleTheme}
                  className="flex items-center justify-center w-7 h-7 rounded-md border border-[rgba(150,175,220,0.12)] text-[#7684a0] hover:text-[#7cf3ff] hover:border-[rgba(124,243,255,0.2)] transition-colors"
                  title="Alternar tema"
                >
                  {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                </button>
              )}
              {isOnline ? (
                <span className="nexus-chip nexus-chip-online">CONECTADO</span>
              ) : (
                <span className="nexus-chip nexus-chip-offline" title="Sem conexão — missões recentes disponíveis em cache">OFFLINE</span>
              )}
              {/* Fase 21 — badge de cota LLM (leva a Config para trocar provedor) */}
              <QuotaBadge />
              <span className="hidden sm:block text-[9px] font-mono text-[#7684a0]">
                ID: {user?.id}
              </span>
            </div>
          </div>
        </header>

        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
