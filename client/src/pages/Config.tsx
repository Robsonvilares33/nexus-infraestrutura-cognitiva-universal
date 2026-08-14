import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Settings, Save, User, Calendar, RefreshCw, KeyRound, Terminal, Globe, Cpu } from "lucide-react";

const PROVIDERS = [
  { value: "forge", label: "APIForge (Manus — padrão hospedado)", hint: "Funciona automaticamente na versão hospedada. Em execução local exige chave." },
  { value: "openai", label: "OpenAI", hint: "Chave começando com sk-...; modelos: gpt-5-mini, gpt-5, gpt-4.1, o3, o4-mini." },
  { value: "anthropic", label: "Anthropic", hint: "Chave começando com sk-ant-...; modelos: claude-sonnet-4.5, claude-3.5-haiku." },
  { value: "google", label: "Google Gemini", hint: "Chave AIza...; modelos: gemini-2.5-pro, gemini-2.5-flash." },
  { value: "groq", label: "Groq (rápido)", hint: "Chave gsk_...; modelos: llama-3.3-70b, mixtral-8x7b." },
  { value: "openrouter", label: "OpenRouter (todos os modelos)", hint: "Chave sk-or-...; base https://openrouter.ai/api/v1; qualquer modelo público." },
  { value: "ollama", label: "Ollama (modelo local)", hint: "Sem chave necessária. Base padrão http://localhost:11434/api. Modelos: llama3.1, qwen2.5, mistral..." },
  { value: "qwen", label: "QwenCloud (Alibaba)", hint: "Chave sk-ws-...; base padrão DashScope Intl; modelos: qwen3.8-max, qwen3-max, qwen-plus, qwen-turbo, qwen-coder-plus." },
  { value: "custom", label: "Compatível com OpenAI (custom)", hint: "Qualquer servidor compatível (vLLM, LM Studio, Together...). Defina base + chave." },
];

const DEFAULT_BASE_URLS: Record<string, string> = {
  ollama: "http://localhost:11434/api",
  openrouter: "https://openrouter.ai/api/v1",
  qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  custom: "",
};

export default function Config() {
  const { user } = useAuth();
  const { data: universeSettings, refetch } = trpc.universe.settings.useQuery();
  const saveMutation = trpc.universe.saveSettings.useMutation({ onSuccess: () => refetch() });
  const seedMutation = trpc.universe.seed.useMutation({ onSuccess: () => refetch() });
  const { data: llm, isLoading: llmLoading } = trpc.userLlm.get.useQuery() as { data: { id?: number; userId?: number; provider: string; model: string | null; apiKey: string | null; baseUrl: string | null; shellEnabled: boolean; webEnabled: boolean } | undefined; isLoading: boolean };
  const llmMutation = trpc.userLlm.update.useMutation({
    onSuccess: () => toast.success("Motor de IA atualizado — as próximas missões usarão a nova configuração."),
    onError: (e) => toast.error(e.message),
  });
  const [provider, setProvider] = useState<string>("forge");
  const [model, setModel] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [shellEnabled, setShellEnabled] = useState(false);
  const [webEnabled, setWebEnabled] = useState(true);
  useEffect(() => {
    if (llm) {
      const l = llm as { provider: string; model: string | null; apiKey: string | null; baseUrl: string | null; shellEnabled: boolean; webEnabled: boolean };
      setProvider(l.provider);
      setModel(l.model ?? "");
      setApiKey(l.apiKey === "" || (l.apiKey ?? "").includes("•••") ? "" : (l.apiKey ?? ""));
      setBaseUrl(l.baseUrl ?? DEFAULT_BASE_URLS[l.provider] ?? "");
      setShellEnabled(l.shellEnabled === true);
      setWebEnabled(l.webEnabled !== false);
    }
  }, [llm]);
  function saveLlm() {
    llmMutation.mutate({ provider: provider as any, model: model || undefined, apiKey: apiKey || undefined, baseUrl: baseUrl || undefined, shellEnabled, webEnabled });
  }
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
        <div className="flex items-center gap-3 mb-3"><Cpu className="h-4 w-4 text-[#7cf3ff]" /><span className="text-xs font-medium text-[#e2e8f4]">Motor de IA</span><span className="text-[9px] font-mono text-[#7684a0] ml-auto">Fase 14 — aberto a qualquer modelo</span></div>
        {llmLoading ? (
          <div className="flex items-center gap-2 text-xs text-[#7684a0]"><RefreshCw className="h-3 w-3 animate-spin" />Carregando configuração...</div>
        ) : (
          <div className="space-y-3">
            <p className="text-[10px] font-mono text-[#7684a0] leading-relaxed">
              Use qualquer modelo de IA, inclusive modelos locais. Quando rodando no seu computador, o NEXUS se conecta ao seu provedor preferido; na versão hospedada, o padrão é a APIForge da Manus.
            </p>
            <div>
              <label className="text-[9px] font-mono text-[#7684a0] tracking-wider block mb-1">PROVEDOR</label>
              <select value={provider} onChange={e => { setProvider(e.target.value); setBaseUrl(DEFAULT_BASE_URLS[e.target.value] ?? baseUrl); }} className="w-full nexus-card px-3 py-2 text-sm text-[#e2e8f4] bg-transparent focus:outline-none focus:border-[#7cf3ff]/30 font-mono">
                {PROVIDERS.map(p => <option key={p.value} value={p.value} className="bg-[#0a0e1c]">{p.label}</option>)}
              </select>
              <p className="text-[9px] font-mono text-[#7684a0] mt-1">{PROVIDERS.find(p => p.value === provider)?.hint}</p>
            </div>
            <div>
              <label className="text-[9px] font-mono text-[#7684a0] tracking-wider block mb-1">MODELO</label>
              <input type="text" value={model} onChange={e => setModel(e.target.value)} placeholder={provider === "forge" ? "gpt-5-mini (padrão)" : "ex.: claude-sonnet-4.5 / gemini-2.5-flash / llama3.1"} className="w-full nexus-card px-3 py-2 text-sm text-[#e2e8f4] placeholder:text-[#7684a0]/50 focus:outline-none focus:border-[#7cf3ff]/30 font-mono bg-transparent" />
            </div>
            {provider !== "ollama" && (
              <div>
                <label className="text-[9px] font-mono text-[#7684a0] tracking-wider block mb-1"><KeyRound className="h-3 w-3 inline mr-1" />CHAVE DE API</label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={provider === "forge" ? "" : "Cole sua chave (ex.: sk-...)"} disabled={provider === "forge"} className="w-full nexus-card px-3 py-2 text-sm text-[#e2e8f4] placeholder:text-[#7684a0]/50 focus:outline-none focus:border-[#7cf3ff]/30 font-mono bg-transparent disabled:opacity-50" />
                {provider === "forge" && <p className="text-[9px] font-mono text-[#7684a0] mt-1">Na versão hospedada a chave é injetada automaticamente.</p>}
              </div>
            )}
            <div>
              <label className="text-[9px] font-mono text-[#7684a0] tracking-wider block mb-1">BASE URL (opcional)</label>
              <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder={DEFAULT_BASE_URLS[provider] ?? "ex.: https://api.openai.com/v1"} className="w-full nexus-card px-3 py-2 text-sm text-[#e2e8f4] placeholder:text-[#7684a0]/50 focus:outline-none focus:border-[#7cf3ff]/30 font-mono bg-transparent" />
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={shellEnabled} onChange={e => setShellEnabled(e.target.checked)} className="accent-[#7cf3ff]" />
                <span className="text-[10px] font-mono text-[#e2e8f4] flex items-center gap-1"><Terminal className="h-3 w-3" />Ferramentas de computador (terminal, arquivos)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={webEnabled} onChange={e => setWebEnabled(e.target.checked)} className="accent-[#7cf3ff]" />
                <span className="text-[10px] font-mono text-[#e2e8f4] flex items-center gap-1"><Globe className="h-3 w-3" />Acesso à web (leitura de páginas)</span>
              </label>
            </div>
            <p className="text-[9px] font-mono text-[#ffd479] leading-relaxed">
              Atenção: ativar as ferramentas de computador permite ao agente executar comandos reais no ambiente onde o NEXUS roda. Na hospedagem Manus, os comandos rodam no sandbox do servidor com bloqueio de operações perigosas. Em execução local, os comandos rodam no seu próprio computador — ative apenas se confia no modelo escolhido.
            </p>
            <button onClick={saveLlm} disabled={llmMutation.isPending} className="nexus-card px-4 py-2 text-[#7cf3ff] hover:bg-[#7cf3ff]/10 disabled:opacity-30 text-xs font-mono flex items-center gap-2"><Save className="h-3 w-3" />{llmMutation.isPending ? "SALVANDO..." : "SALVAR MOTOR DE IA"}</button>
          </div>
        )}
      </div>
      <div className="nexus-card p-4">
        <div className="flex items-center gap-3 mb-3"><RefreshCw className="h-4 w-4 text-[#ffd479]" /><span className="text-xs font-medium text-[#e2e8f4]">Inicializar Ecossistema</span></div>
        <p className="text-xs text-[#7684a0] leading-relaxed mb-3">Cria plugins padrão, modelos e agentes no seu ecossistema.</p>
        <button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} className="nexus-card px-4 py-2 text-[#ffd479] hover:bg-[#ffd479]/10 disabled:opacity-30 text-xs font-mono flex items-center gap-2"><RefreshCw className={`h-3 w-3 ${seedMutation.isPending ? "animate-spin" : ""}`} />{seedMutation.isPending ? "INICIALIZANDO..." : "INICIALIZAR"}</button>
      </div>
    </div>
  );
}
