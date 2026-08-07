import { FileText, BookOpen, ChevronRight } from "lucide-react";
import { useState } from "react";

const SECTIONS = [
  { title: "1. Leis Fundamentais", content: "O NEXUS opera sob 11 leis fundamentais invariantes:\n\n1. INVARIÂNCIA — Campo de leis inalterável\n2. ORTOGONALIDADE — Agentes independentes\n3. REVERSIBILIDADE — Toda operação revertível\n4. COMPOSIÇÃO — Agentes se combinam\n5. PERSISTÊNCIA — Dados sobrevivem a falhas\n6. ISOLAMENTO — Universo por usuário\n7. OBSERVABILIDADE — Todo processo auditável\n8. IDEMPOTÊNCIA — Missões repetidas = mesmo resultado\n9. RESILIÊNCIA — Tolerância a falhas\n10. EXTENSIBILIDADE — Novos plugins/agentes\n11. EVOLUÇÃO — Aprendizado contínuo" },
  { title: "2. Arquitetura", content: "Campo de Leis (Centro) — 11 leis invariantes\n\n9 Agentes em grafo completo (K9):\n- Sincronia, Pesquisa, Memória, Código\n- Planejamento, Crítica, Síntese, Execução\n- Comunicação\n\nMemória em 4 camadas:\n- Ativa, Relevante, Histórica, Arquivada" },
  { title: "3. Fluxo de Missão", content: "1. AUTENTICAÇÃO — OAuth ou email\n2. UNIVERSO — Acesso ao universo cognitivo\n3. MISSÃO — Entrega em linguagem natural\n4. INTERPRETAÇÃO — LLM interpreta objetivo\n5. ORQUESTRAÇÃO — Decomposição em subtarefas\n6. EXECUÇÃO — Agentes executam em paralelo\n7. RESULTADO — Síntese consolida\n8. APRENDIZADO — Memória atualizada" },
  { title: "4. Plugins", content: "Modelos: Claude, GPT-5, Gemini, DeepSeek, Qwen, Llama, Mistral\nInfra: GitHub, Docker, PostgreSQL, Redis, Telegram\nDispositivos: IoT, Raspberry Pi, Câmeras\n\nBusca automática de ferramentas open-source no GitHub." },
  { title: "5. Escalabilidade", content: "Multi-tenant com isolamento total.\nBanco vetorial para busca semântica.\nAprendizado acumulativo por missão.\nEvolução autônoma do ecossistema." },
];

export default function Docs() {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const toggle = (i: number) => setExpanded(p => ({...p, [i]: !p[i]}));

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2"><FileText className="h-5 w-5 text-[#aab4d6]" />Documentação</h2>
        <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">Documentação do ecossistema NEXUS</p>
      </div>
      <div className="space-y-3">
        {SECTIONS.map((s, i) => (
          <div key={i} className="nexus-card overflow-hidden">
            <button onClick={() => toggle(i)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-[rgba(255,255,255,0.01)]">
              <BookOpen className="h-4 w-4 text-[#7cf3ff] shrink-0" />
              <span className="text-sm font-medium text-[#e2e8f4] flex-1">{s.title}</span>
              <ChevronRight className={`h-4 w-4 text-[#7684a0] transition-transform ${expanded[i] ? "rotate-90" : ""}`} />
            </button>
            {expanded[i] && <div className="px-4 pb-4 border-t border-[rgba(150,175,220,0.06)]"><pre className="mt-3 text-xs text-[#aab4d6] leading-relaxed font-mono whitespace-pre-wrap">{s.content}</pre></div>}
          </div>
        ))}
      </div>
      <div className="nexus-card p-4">
        <span className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase block mb-3">REFERÊNCIA RÁPIDA</span>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[{l:"AGENTES",v:"9",c:"#9fd8ff"},{l:"LEIS",v:"11",c:"#7cf3ff"},{l:"MEMÓRIA",v:"4 CAMADAS",c:"#3fe7b0"},{l:"ETAPAS",v:"8",c:"#c9b8ff"}].map(r => (
            <div key={r.l} className="text-center p-2 rounded border border-[rgba(150,175,220,0.06)]">
              <p className="text-lg font-bold" style={{ color: r.c }}>{r.v}</p>
              <p className="text-[9px] font-mono text-[#7684a0]">{r.l}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
