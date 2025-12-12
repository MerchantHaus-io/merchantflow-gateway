import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Task, TaskInput } from "@/types/task";

interface TasksContextValue {
  tasks: Task[];
  addTask: (input: TaskInput) => Task;
  updateTaskStatus: (taskId: string, status: Task["status"]) => void;
  ensureSlaTask: (input: TaskInput & { relatedOpportunityId: string }) => Task | undefined;
  getTasksForOpportunity: (opportunityId: string) => Task[];
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

  const addTask = useCallback((input: TaskInput) => {
    const newTask: Task = {
      id: generateId(),
      status: "open",
      createdAt: new Date().toISOString(),
      ...input,
    };

    setTasks((prev) => [newTask, ...prev]);
    return newTask;
  }, []);

  const updateTaskStatus = useCallback((taskId: string, status: Task["status"]) => {
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, status } : task)));
  }, []);

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
    () => ({ tasks, addTask, updateTaskStatus, ensureSlaTask, getTasksForOpportunity }),
    [addTask, ensureSlaTask, getTasksForOpportunity, tasks, updateTaskStatus],
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
