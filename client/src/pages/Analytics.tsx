import { trpc } from "@/lib/trpc";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { BarChart3, TrendingUp, Activity, Database, Loader2, AlertCircle, FileDown } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

const COLORS = ["#7cf3ff", "#c9b8ff", "#ffd479", "#3fe7b0", "#ff6b6b", "#a78bfa", "#38bdf8", "#f472b6"];

export default function Analytics() {
  const { data: analytics, isLoading } = trpc.analytics.get.useQuery();
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: "#020308",
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 10;
      pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 20;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight - 20;
      }
      pdf.save(`nexus-relatorio-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch {
      // Fallback: use browser print
      window.print();
    } finally {
      setExporting(false);
    }
  };

  const barData = (analytics?.missionsByDay || []).map((m: any) => ({
    name: new Date(m.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    missões: m.count || 0,
  }));

  // Fill missing days with 0
  const today = new Date();
  const fullBarData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const key = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const existing = barData.find((b: { name: string; missões: number }) => b.name === key);
    return { name: key, missões: existing?.missões || 0 };
  });

  const pieData = (analytics?.agentsActivity || []).map((a: any, i: number) => ({
    name: a.agentName || `Agente ${i + 1}`,
    value: a.count || 0,
  }));

  const tierData = (analytics?.memoryByTier || []).map((m: any) => ({
    name: m.tier || "desconhecida",
    value: m.count || 0,
  }));

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#ffd479]" />
            Analytics
          </h2>
          <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase animate-pulse">
            Carregando métricas do ecossistema...
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="nexus-card p-4 h-24 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="nexus-card p-4 h-64 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#ffd479]" />
            Analytics
          </h2>
        </div>
        <div className="nexus-card p-8 flex flex-col items-center justify-center gap-3">
          <AlertCircle className="h-6 w-6 text-[#ff6b6b]" />
          <p className="text-sm font-mono text-[#aab4d6]">Não foi possível carregar as métricas.</p>
          <p className="text-[10px] font-mono text-[#7684a0]">Verifique sua conexão e tente novamente.</p>
        </div>
      </div>
    );
  }

  const hasAnyData =
    fullBarData.some(d => d.missões > 0) || pieData.length > 0 || tierData.length > 0;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#ffd479]" />
            Analytics
          </h2>
          <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">
            Métricas de uso do ecossistema cognitivo
          </p>
        </div>
        <Button
          onClick={handleExportPDF}
          disabled={exporting || isLoading}
          className="bg-[#7cf3ff]/10 text-[#7cf3ff] border border-[#7cf3ff]/20 hover:bg-[#7cf3ff]/20 font-mono text-xs"
        >
          {exporting ? (
            <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
          ) : (
            <FileDown className="h-3.5 w-3.5 mr-2" />
          )}
          {exporting ? "GERANDO PDF..." : "EXPORTAR PDF"}
        </Button>
      </div>
      <div ref={reportRef} className="space-y-5">

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="nexus-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-[#7cf3ff]" />
            <span className="text-[9px] font-mono text-[#7684a0] tracking-wider">MISSÕES (7D)</span>
          </div>
          <p className="text-2xl font-mono text-[#e2e8f4]">
            {fullBarData.reduce((acc, d) => acc + d.missões, 0)}
          </p>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-[#3fe7b0]" />
            <span className="text-[9px] font-mono text-[#7684a0] tracking-wider">CONFIANÇA MÉDIA</span>
          </div>
          <p className="text-2xl font-mono text-[#3fe7b0]">
            {analytics?.avgConfidence ? `${Math.round(analytics.avgConfidence * 100)}%` : "N/A"}
          </p>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-[#c9b8ff]" />
            <span className="text-[9px] font-mono text-[#7684a0] tracking-wider">AGENTES ATIVOS (EVENTOS DE FEED)</span>
          </div>
          <p className="text-2xl font-mono text-[#c9b8ff]">
            {analytics?.agentsActivity?.length || 0}
          </p>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-[#ffd479]" />
            <span className="text-[9px] font-mono text-[#7684a0] tracking-wider">MEMÓRIAS</span>
          </div>
          <p className="text-2xl font-mono text-[#ffd479]">
            {(analytics?.memoryByTier || []).reduce((acc: number, m: any) => acc + (m.count || 0), 0)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Missions by Day */}
        <div className="nexus-card p-4">
          <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-4">MISSÕES POR DIA (Últimos 7 dias)</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fullBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,175,220,0.06)" />
                <XAxis dataKey="name" tick={{ fill: "#7684a0", fontSize: 10 }} />
                <YAxis tick={{ fill: "#7684a0", fontSize: 10 }} />
                <Bar dataKey="missões" fill="#7cf3ff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Agent Activity */}
        <div className="nexus-card p-4">
          <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-4">AGENTES MAIS ATIVOS (EVENTOS DE FEED)</p>
          <div className="h-48">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry: { name: string; value: number }, index: number) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-[10px] font-mono text-[#7684a0]">Nenhuma atividade de agentes registrada.</p>
              </div>
            )}
          </div>
        </div>

        {/* Memory Distribution */}
        <div className="nexus-card p-4">
          <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-4">DISTRIBUIÇÃO DE MEMÓRIA POR CAMADA</p>
          <div className="h-48">
            {tierData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tierData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,175,220,0.06)" />
                  <XAxis type="number" tick={{ fill: "#7684a0", fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#7684a0", fontSize: 10 }} width={80} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {tierData.map((_: { name: string; value: number }, index: number) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-[10px] font-mono text-[#7684a0]">Nenhuma memória registrada.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
