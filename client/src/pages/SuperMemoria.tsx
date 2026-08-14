import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  NotebookPen, Search, Plus, FolderOpen, Trash2, PencilLine, Loader2, Brain, FileText,
} from "lucide-react";

/** Pré-visualização no grid com links [[nota]] clicáveis */
function GridPreview({ content, onOpen }: { content: string | null; onOpen: (title: string) => void }) {
  const parts = String(content ?? "").split(/\[\[([^\]]{1,60})\]\]/g);
  if (parts.length === 1) return <span>{content}</span>;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 0 ? (
          <span key={i}>{part}</span>
        ) : (
          <button
            key={i}
            type="button"
            className="inline text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
            onClick={() => onOpen(part)}
          >
            {part}
          </button>
        ),
      )}
    </>
  );
}

type Note = {
  id: number;
  title: string;
  content: string;
  folder: string;
  tags: string | null;
  links: string | null;
  source: "user" | "agent";
  missionId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export default function SuperMemoria() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string>("Todas");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [folder, setFolder] = useState("Geral");
  const [tags, setTags] = useState("");

  const { data: notes, isLoading } = trpc.superNotes.list.useQuery(
    selectedFolder === "Todas" ? undefined : { folder: selectedFolder }
  );
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  // Links [[nota]] disparam o evento global ao serem clicados no leitor de nota
  useEffect(() => {
    const handler = (e: Event) => openNoteByTitle((e as CustomEvent<string>).detail);
    window.addEventListener("nexus-open-note", handler);
    return () => window.removeEventListener("nexus-open-note", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);
  const { data: folders } = trpc.superNotes.folders.useQuery();
  const searchResult = trpc.superNotes.search.useQuery(
    { query },
    { enabled: query.trim().length > 1 }
  );

  const invalidate = () => {
    utils.superNotes.list.invalidate();
    utils.superNotes.folders.invalidate();
    if (query.trim().length > 1) utils.superNotes.search.invalidate();
  };

  const createMutation = trpc.superNotes.create.useMutation({
    onSuccess: () => { toast.success("Nota salva na Super Memória"); invalidate(); setDialogOpen(false); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.superNotes.update.useMutation({
    onSuccess: () => { toast.success("Nota atualizada"); invalidate(); setDialogOpen(false); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const removeMutation = trpc.superNotes.remove.useMutation({
    onSuccess: () => { toast.success("Nota removida"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() { setEditing(null); setTitle(""); setContent(""); setFolder("Geral"); setTags(""); }

  function openNew() { resetForm(); setDialogOpen(true); }
  function openEdit(note: Note) {
    setEditing(note);
    setTitle(note.title);
    setContent(note.content);
    setFolder(note.folder);
    try { setTags(JSON.parse(note.tags ?? "[]").join(", ")); } catch { setTags(""); }
    setSelectedNote(null);
    setDialogOpen(true);
  }

  function openNote(note: Note) { setSelectedNote(note); }

  function openNoteByTitle(rawTitle: string) {
    const title = String(rawTitle ?? "").trim();
    const target = [...(notes ?? [])].find((n) => n.title.toLowerCase() === title.toLowerCase()) ?? null;
    if (target) { setSelectedNote(target); } else { toast.info(`Nota "${title}" ainda não existe — crie-a para completar o link.`); }
  }

  function submit() {
    if (!title.trim() || !content.trim()) { toast.error("Título e conteúdo são obrigatórios"); return; }
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (editing) {
      updateMutation.mutate({ id: editing.id, title, content, folder, tags: tagList });
    } else {
      createMutation.mutate({ title, content, folder, tags: tagList });
    }
  }

  const displayed = query.trim().length > 1 ? (searchResult.data ?? []) : (notes ?? []);
  const pending = isLoading || (query.trim().length > 1 && searchResult.isLoading);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-2">
        <Brain className="h-8 w-8 text-cyan-400" />
        <h1 className="text-3xl font-bold">Super Memória</h1>
        <Badge variant="outline" className="border-cyan-400/50 text-cyan-300">estilo Obsidian</Badge>
      </div>
      <p className="text-muted-foreground mb-6">
        Sua memória permanente e ilimitada. Tudo que você anotar — e tudo que o agente descobrir nas missões — fica salvo aqui para sempre, organizado em pastas, tags e links entre notas.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar na memória..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={selectedFolder} onValueChange={(v) => { setSelectedFolder(v); setQuery(""); setSelectedNote(null); }}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todas">Todas as pastas</SelectItem>
            {(folders ?? []).map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="bg-cyan-600 hover:bg-cyan-500">
              <Plus className="h-4 w-4 mr-1" /> Nova nota
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar nota" : "Nova nota na Super Memória"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Textarea
                placeholder="Conteúdo em Markdown — escreva livremente como no Obsidian. Use [[nome da nota]] para linkar outras notas."
                className="min-h-64 font-mono"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <div className="flex gap-3">
                <Input className="flex-1" placeholder="Pasta (ex.: Projetos)" value={folder} onChange={(e) => setFolder(e.target.value)} />
                <Input className="flex-1" placeholder="Tags (separadas por vírgula)" value={tags} onChange={(e) => setTags(e.target.value)} />
              </div>
              <Button className="w-full bg-cyan-600 hover:bg-cyan-500" onClick={submit} disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? "Salvar alterações" : "Salvar na memória"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {pending ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 mr-2 animate-spin" /> Buscando na memória...
        </div>
      ) : (displayed ?? []).length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <NotebookPen className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">
            {query.trim().length > 1
              ? "Nada encontrado com essa busca. Tente outra palavra."
              : "Sua Super Memória está vazia. Crie a primeira nota ou execute uma missão no Modo Agente — as descobertas do agente são salvas aqui automaticamente."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {(displayed as Note[]).map((note) => (
            <Card key={note.id} className="p-5 hover:border-cyan-400/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate">{note.title}</h3>
                    <Badge variant={note.source === "agent" ? "default" : "secondary"} className="text-xs">
                      {note.source === "agent" ? "Agente" : "Usuário"}
                    </Badge>
                    <Badge variant="outline" className="text-xs border-muted-foreground/40">
                      <FolderOpen className="h-3 w-3 mr-1" />{note.folder}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap line-clamp-4 font-mono bg-background/60 p-2 rounded">
                    <GridPreview content={note.content} onOpen={(t) => {
                      const all = notes ?? [];
                      const target = [...all].find((n) => n.title.toLowerCase() === String(t).trim().toLowerCase()) ?? null;
                      if (target) openNote(target);
                      else toast.info(`Nota "${t}" ainda não existe — crie-a para completar o link.`);
                    }} />
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {note.tags?.replace(/[\[\]"]/g, "").split(",").filter(Boolean).map((t) => (
                      <span key={t} className="text-xs text-cyan-300">#{t.trim()}</span>
                    ))}
                    <span className="text-xs text-muted-foreground">
                      atualizada em {new Date(note.updatedAt).toLocaleString()}
                    </span>
                    {(note.content ?? "").includes("[[") && (
                      <button
                        type="button"
                        className="text-xs text-cyan-400 hover:text-cyan-300 underline-offset-2 hover:underline"
                        onClick={() => openNote(note)}
                      >
                        abrir nota (links [[ ]])
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openNote(note)} title="Abrir nota">
                    <FileText className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(note)} title="Editar">
                    <PencilLine className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
                    if (window.confirm("Remover esta nota da memória?")) removeMutation.mutate({ id: note.id });
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Leitor de nota — resolve links [[nota]] clicando nelas */}
      {selectedNote && (
        <Card className="fixed inset-x-4 bottom-4 md:inset-x-auto md:right-4 md:w-[520px] p-5 border-cyan-400/50 shadow-2xl max-h-[60vh] overflow-y-auto z-40 bg-[#0a0f1c]">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h2 className="font-semibold text-lg">{selectedNote.title}</h2>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setSelectedNote(null)}>✕</Button>
          </div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Badge variant="outline" className="text-xs border-muted-foreground/40"><FolderOpen className="h-3 w-3 mr-1" />{selectedNote.folder}</Badge>
            {selectedNote.tags?.replace(/[\[\]"]/g, "").split(",").filter(Boolean).map((t) => (
              <span key={t} className="text-xs text-cyan-300">#{t.trim()}</span>
            ))}
          </div>
          <pre className="whitespace-pre-wrap font-mono text-sm bg-background/60 p-3 rounded leading-relaxed">
            {renderWithLinks(selectedNote.content)}
          </pre>
          <div className="mt-3 text-xs text-muted-foreground">
            atualizada em {new Date(selectedNote.updatedAt).toLocaleString()}
          </div>
        </Card>
      )}
    </div>
  );
}

/** Renderiza o conteúdo com links [[Nota]] resolvidos em botões clicáveis que navegam para a nota alvo. */
function renderWithLinks(content: string) {
  const parts = String(content ?? "").split(/\[\[([^\]]{1,60})\]\]/g);
  if (parts.length === 1) return content;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 0 ? (
          <span key={i}>{part}</span>
        ) : (
          <button
            key={i}
            type="button"
            className="inline text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
            onClick={() => window.dispatchEvent(new CustomEvent("nexus-open-note", { detail: part }))}
          >
            {part}
          </button>
        ),
      )}
    </>
  );
}
