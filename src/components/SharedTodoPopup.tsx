import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ListTodo, Plus, Trash2, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface SharedTodo {
  id: string;
  title: string;
  created_by_email: string | null;
  created_at: string;
  completed_at: string | null;
  completed_by_email: string | null;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MINIMIZED_KEY = "shared-todo-popup-minimized";

export function SharedTodoPopup() {
  const { user } = useAuth();
  const [todos, setTodos] = useState<SharedTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [minimized, setMinimized] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem(MINIMIZED_KEY) === "1",
  );

  const fetchTodos = async () => {
    const { data, error } = await supabase
      .from("shared_todos")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[SharedTodoPopup] fetch error", error);
      setLoading(false);
      return;
    }
    setTodos((data || []) as SharedTodo[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchTodos();
    const channel = supabase
      .channel("shared-todos-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shared_todos" },
        () => fetchTodos(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-purge completed items older than 7 days (any signed-in user can do it).
  useEffect(() => {
    if (!user || todos.length === 0) return;
    const cutoff = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    const stale = todos.filter(
      (t) => t.completed_at && t.completed_at < cutoff,
    );
    if (stale.length === 0) return;
    supabase
      .from("shared_todos")
      .delete()
      .in("id", stale.map((t) => t.id))
      .then(({ error }) => {
        if (error) console.error("[SharedTodoPopup] purge error", error);
      });
  }, [todos, user]);

  const visibleTodos = useMemo(() => {
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    return todos.filter(
      (t) => !t.completed_at || new Date(t.completed_at).getTime() > cutoff,
    );
  }, [todos]);

  const openItems = visibleTodos.filter((t) => !t.completed_at);
  const doneItems = visibleTodos.filter((t) => !!t.completed_at);

  const allDone = !loading && openItems.length === 0;

  const toggleDone = async (todo: SharedTodo, done: boolean) => {
    const { error } = await supabase
      .from("shared_todos")
      .update({
        completed_at: done ? new Date().toISOString() : null,
        completed_by_email: done ? user?.email || null : null,
      })
      .eq("id", todo.id);
    if (error) toast.error(error.message);
  };

  const addTodo = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    const { error } = await supabase.from("shared_todos").insert({
      title,
      created_by_email: user?.email || null,
    });
    setAdding(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewTitle("");
  };

  const deleteTodo = async (id: string) => {
    const { error } = await supabase.from("shared_todos").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  // Hide entirely if no user or fully cleared
  if (!user) return null;
  if (allDone && doneItems.length === 0) return null;

  const handleMinimize = () => {
    sessionStorage.setItem(MINIMIZED_KEY, "1");
    setMinimized(true);
  };
  const handleRestore = () => {
    sessionStorage.removeItem(MINIMIZED_KEY);
    setMinimized(false);
  };

  if (minimized) {
    return (
      <button
        onClick={handleRestore}
        className="fixed bottom-24 right-4 z-[60] flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 shadow-lg hover:opacity-90 transition"
      >
        <ListTodo className="h-4 w-4" />
        <span className="text-sm font-medium">
          Team To-Dos · {openItems.length}
        </span>
      </button>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) handleMinimize(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="h-5 w-5" />
              Team To-Do List
              <Badge variant="outline" className="ml-1 text-[10px]">
                {openItems.length} open
              </Badge>
            </DialogTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleMinimize} aria-label="Minimize">
              <Minus className="h-4 w-4" />
            </Button>
          </div>
          <DialogDescription>
            Shared across the team. Completed items auto-clear after 7 days.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 space-y-1.5">
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : visibleTodos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No items yet</p>
          ) : (
            <>
              {openItems.map((t) => (
                <TodoRow key={t.id} todo={t} onToggle={toggleDone} onDelete={deleteTodo} />
              ))}
              {doneItems.length > 0 && (
                <>
                  <div className="pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Recently completed
                  </div>
                  {doneItems.map((t) => (
                    <TodoRow key={t.id} todo={t} onToggle={toggleDone} onDelete={deleteTodo} />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        <div className="border-t border-border pt-3 flex items-center gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTodo();
              }
            }}
            placeholder="Add a new to-do…"
            maxLength={300}
          />
          <Button onClick={addTodo} disabled={!newTitle.trim() || adding} size="sm" className="gap-1.5 shrink-0">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TodoRow({
  todo,
  onToggle,
  onDelete,
}: {
  todo: SharedTodo;
  onToggle: (t: SharedTodo, done: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const isDone = !!todo.completed_at;
  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-md border border-border/60 px-3 py-2 transition-colors",
        isDone ? "bg-muted/30" : "bg-background hover:bg-muted/40",
      )}
    >
      <Checkbox
        checked={isDone}
        onCheckedChange={(v) => onToggle(todo, !!v)}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm leading-snug",
            isDone && "line-through text-muted-foreground",
          )}
        >
          {todo.title}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {isDone && todo.completed_at
            ? `Done ${formatDistanceToNow(new Date(todo.completed_at), { addSuffix: true })}${todo.completed_by_email ? ` · ${todo.completed_by_email.split("@")[0]}` : ""} · clears in ${Math.max(
                0,
                7 - Math.floor((Date.now() - new Date(todo.completed_at).getTime()) / (24 * 60 * 60 * 1000)),
              )}d`
            : `Added ${formatDistanceToNow(new Date(todo.created_at), { addSuffix: true })}${todo.created_by_email ? ` · ${todo.created_by_email.split("@")[0]}` : ""}`}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(todo.id)}
        aria-label="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
