import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Task, TaskInput } from "@/types/task";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
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
      // Log activity if related to an opportunity
      if (newTask.relatedOpportunityId) {
        await supabase.from('activities').insert({
          opportunity_id: newTask.relatedOpportunityId,
          type: 'task_created',
          description: `Task created: ${newTask.title}`,
          user_id: user?.id,
          user_email: user?.email,
        });
      }
      // Refresh to get account/contact names
      refreshTasks();
    }

    return newTask;
  }, [refreshTasks, user]);

  const updateTask = useCallback(async (taskId: string, update: Partial<Task>) => {
    // Get current task for activity logging
    const currentTask = tasks.find(t => t.id === taskId);
    
    // Optimistically update local state first
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, ...update } : task)));

    // Build database update object with only the fields that are being updated
    const dbUpdate: Record<string, unknown> = {};
    if (update.title !== undefined) dbUpdate.title = update.title;
    if (update.description !== undefined) dbUpdate.description = update.description;
    if (update.assignee !== undefined) dbUpdate.assignee = update.assignee;
    if (update.createdBy !== undefined) dbUpdate.created_by = update.createdBy;
    if (update.status !== undefined) dbUpdate.status = update.status;
    if (update.dueAt !== undefined) dbUpdate.due_at = update.dueAt;
    if (update.relatedOpportunityId !== undefined) dbUpdate.related_opportunity_id = update.relatedOpportunityId;
    if (update.relatedContactId !== undefined) dbUpdate.related_contact_id = update.relatedContactId;
    if (update.comments !== undefined) dbUpdate.comments = update.comments;
    if (update.source !== undefined) dbUpdate.source = update.source;

    try {
      const { error } = await supabase
        .from("tasks")
        .update(dbUpdate)
        .eq("id", taskId);

      if (error) throw error;
      
      // Log activity for task completion
      if (update.status === 'done' && currentTask?.status !== 'done' && currentTask?.relatedOpportunityId) {
        await supabase.from('activities').insert({
          opportunity_id: currentTask.relatedOpportunityId,
          type: 'task_completed',
          description: `Task completed: ${currentTask.title}`,
          user_id: user?.id,
          user_email: user?.email,
        });
      }
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Failed to update task');
      // Refresh tasks to revert to the actual database state
      refreshTasks();
    }
  }, [refreshTasks, tasks, user]);

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
