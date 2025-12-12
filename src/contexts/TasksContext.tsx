import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Task, TaskInput } from "@/types/task";

interface TasksContextValue {
  tasks: Task[];
  addTask: (input: TaskInput) => Task;
  updateTask: (taskId: string, update: Partial<Task>) => void;
  updateTaskStatus: (taskId: string, status: Task["status"]) => void;
  ensureSlaTask: (input: TaskInput & { relatedOpportunityId: string }) => Task | undefined;
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
  const [tasks, setTasks] = useState<Task[]>([]);

  const refreshTasks = useCallback(async () => {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, description, assignee, created_by, created_at, status, due_at, related_opportunity_id, related_contact_id, comments, source")
      .order("created_at", { ascending: false });

    if (data) {
      setTasks(
        data.map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description || undefined,
          assignee: task.assignee,
          createdBy: task.created_by || undefined,
          createdAt: task.created_at,
          status: task.status,
          dueAt: task.due_at || undefined,
          relatedOpportunityId: task.related_opportunity_id || undefined,
          relatedContactId: task.related_contact_id || undefined,
          comments: task.comments || undefined,
          source: task.source || undefined,
        })),
      );
    }
  }, []);

  useEffect(() => {
    refreshTasks();

    const channel = supabase
      .channel("tasks-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        (payload) => {
          const task = payload.new || payload.old;
          if (!task) return;

          if (payload.eventType === "DELETE") {
            setTasks((prev) => prev.filter((t) => t.id !== task.id));
            return;
          }

          setTasks((prev) => {
            const mapped: Task = {
              id: task.id,
              title: task.title,
              description: task.description || undefined,
              assignee: task.assignee,
              createdBy: task.created_by || undefined,
              createdAt: task.created_at,
              status: task.status,
              dueAt: task.due_at || undefined,
              relatedOpportunityId: task.related_opportunity_id || undefined,
              relatedContactId: task.related_contact_id || undefined,
              comments: task.comments || undefined,
              source: task.source || undefined,
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
  }, [refreshTasks]);

  const addTask = useCallback((input: TaskInput) => {
    const newTask: Task = {
      id: generateId(),
      status: "open",
      createdAt: new Date().toISOString(),
      ...input,
    };

    setTasks((prev) => [newTask, ...prev]);
    supabase.from("tasks").upsert({
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
    return newTask;
  }, []);

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
    (input: TaskInput & { relatedOpportunityId: string }) => {
      const alreadyExists = tasks.some(
        (task) =>
          task.relatedOpportunityId === input.relatedOpportunityId &&
          task.source === "sla" &&
          task.status !== "done",
      );

      if (alreadyExists) return undefined;
      return addTask({ ...input, source: "sla" });
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
