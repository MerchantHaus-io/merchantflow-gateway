import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Task, TaskInput } from "@/types/task";
import { useAuth } from "@/contexts/AuthContext";
interface TasksContextValue {
  tasks: Task[];
  addTask: (input: TaskInput) => Promise<Task>;
  updateTask: (taskId: string, update: Partial<Task>) => void;
  updateTaskStatus: (taskId: string, status: Task["status"]) => void;
  ensureSlaTask: (input: TaskInput & { relatedOpportunityId: string }) => Promise<Task | undefined>;
  getTasksForOpportunity: (opportunityId: string) => Task[];
  refreshTasks: () => Promise<void>;
}

const TasksContext = createContext<TasksContextValue | null>(null);

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `task-${Math.random().toString(36).slice(2, 10)}`;
};

export const TasksProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);

  const refreshTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select(`
        id, title, description, assignee, created_by, created_at, status, due_at, 
        related_opportunity_id, related_contact_id, comments, source,
        opportunities:related_opportunity_id (
          account_id,
          accounts:account_id ( name )
        ),
        contacts:related_contact_id ( first_name, last_name )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error('Error fetching tasks:', error);
      return;
    }

    if (data) {
      setTasks(
        data.map((task: any) => {
          const accountName = task.opportunities?.accounts?.name;
          const contact = task.contacts;
          const contactName = contact 
            ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() 
            : undefined;

          return {
            id: task.id,
            title: task.title,
            description: task.description || undefined,
            assignee: task.assignee || "",
            createdBy: task.created_by || undefined,
            createdAt: task.created_at,
            status: task.status as Task["status"],
            dueAt: task.due_at || undefined,
            relatedOpportunityId: task.related_opportunity_id || undefined,
            relatedContactId: task.related_contact_id || undefined,
            comments: task.comments || undefined,
            source: (task.source as Task["source"]) || undefined,
            accountName,
            contactName,
          };
        }),
      );
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setTasks([]);
      return;
    }

    refreshTasks();

    const channel = supabase
      .channel("tasks-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        (payload) => {
          const task = (payload.new || payload.old) as Record<string, unknown> | null;
          if (!task) return;

          if (payload.eventType === "DELETE") {
            setTasks((prev) => prev.filter((t) => t.id !== task.id));
            return;
          }

          setTasks((prev) => {
            const mapped: Task = {
              id: task.id as string,
              title: task.title as string,
              description: (task.description as string) || undefined,
              assignee: (task.assignee as string) || undefined,
              createdBy: (task.created_by as string) || undefined,
              createdAt: task.created_at as string,
              status: task.status as Task["status"],
              dueAt: (task.due_at as string) || undefined,
              relatedOpportunityId: (task.related_opportunity_id as string) || undefined,
              relatedContactId: (task.related_contact_id as string) || undefined,
              comments: (task.comments as string) || undefined,
              source: (task.source as Task["source"]) || undefined,
            };

            const exists = prev.some((t) => t.id === mapped.id);
            if (exists) {
              return prev.map((t) => (t.id === mapped.id ? mapped : t));
            }
            return [mapped, ...prev];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refreshTasks]);

  const addTask = useCallback(async (input: TaskInput) => {
    const newTask: Task = {
      id: generateId(),
      status: "open",
      createdAt: new Date().toISOString(),
      ...input,
    };

    // Optimistically add task to state
    setTasks((prev) => [newTask, ...prev]);

    const { error } = await supabase.from("tasks").insert({
      id: newTask.id,
      title: newTask.title,
      description: newTask.description,
      assignee: newTask.assignee,
      created_by: newTask.createdBy,
      created_at: newTask.createdAt,
      status: newTask.status,
      due_at: newTask.dueAt,
      related_opportunity_id: newTask.relatedOpportunityId,
      related_contact_id: newTask.relatedContactId,
      comments: newTask.comments,
      source: newTask.source || "manual",
    });

    if (error) {
      console.error('Error adding task:', error);
      // Remove optimistically added task on error
      setTasks((prev) => prev.filter((t) => t.id !== newTask.id));
    } else {
      // Refresh to get account/contact names
      refreshTasks();
    }

    return newTask;
  }, [refreshTasks]);

  const updateTask = useCallback((taskId: string, update: Partial<Task>) => {
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, ...update } : task)));

    supabase
      .from("tasks")
      .update({
        title: update.title,
        description: update.description,
        assignee: update.assignee,
        created_by: update.createdBy,
        status: update.status,
        due_at: update.dueAt,
        related_opportunity_id: update.relatedOpportunityId,
        related_contact_id: update.relatedContactId,
        comments: update.comments,
        source: update.source,
      })
      .eq("id", taskId);
  }, []);

  const updateTaskStatus = useCallback(
    (taskId: string, status: Task["status"]) => {
      updateTask(taskId, { status });
    },
    [updateTask],
  );

  const ensureSlaTask = useCallback(
    async (input: TaskInput & { relatedOpportunityId: string }) => {
      const alreadyExists = tasks.some(
        (task) =>
          task.relatedOpportunityId === input.relatedOpportunityId &&
          task.source === "sla" &&
          task.status !== "done",
      );

      if (alreadyExists) return undefined;
      return await addTask({ ...input, source: "sla" });
    },
    [addTask, tasks],
  );

  const getTasksForOpportunity = useCallback(
    (opportunityId: string) => tasks.filter((task) => task.relatedOpportunityId === opportunityId),
    [tasks],
  );

  const value = useMemo(
    () => ({ tasks, addTask, updateTaskStatus, ensureSlaTask, getTasksForOpportunity, updateTask, refreshTasks }),
    [addTask, ensureSlaTask, getTasksForOpportunity, refreshTasks, tasks, updateTask, updateTaskStatus],
  );

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
};

export const useTasks = () => {
  const context = useContext(TasksContext);
  if (!context) {
    throw new Error("useTasks must be used within a TasksProvider");
  }
  return context;
};
