import { useState, useMemo } from "react";
import { Task } from "@/types/task";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Clock, AlertTriangle, User, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isPast, isToday, addDays } from "date-fns";
import { useTasks } from "@/contexts/TasksContext";
import { useAuth } from "@/contexts/AuthContext";
import { TEAM_MEMBERS } from "@/types/opportunity";

interface OpportunityTasksProps {
  opportunityId: string;
  tasks: Task[];
}

export const OpportunityTasks = ({ opportunityId, tasks }: OpportunityTasksProps) => {
  const { user } = useAuth();
  const { addTask, updateTaskStatus } = useTasks();
  const [isAdding, setIsAdding] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    assignee: user?.email || "Unassigned",
    dueDate: "",
    description: "",
  });

  const assigneeOptions = useMemo(() => {
    const options = ["Unassigned", ...TEAM_MEMBERS];
    if (user?.email && !options.includes(user.email)) {
      options.push(user.email);
    }
    return options;
  }, [user?.email]);

  const handleAddTask = () => {
    if (!newTask.title.trim()) return;

    addTask({
      title: newTask.title,
      assignee: newTask.assignee,
      description: newTask.description,
      dueAt: newTask.dueDate ? new Date(newTask.dueDate).toISOString() : undefined,
      relatedOpportunityId: opportunityId,
      createdBy: user?.email || "System",
      source: "manual",
    });

    setNewTask({
      title: "",
      assignee: user?.email || "Unassigned",
      dueDate: "",
      description: "",
    });
    setIsAdding(false);
  };

  const handleToggleTask = (task: Task) => {
    const newStatus = task.status === "done" ? "open" : "done";
    updateTaskStatus(task.id, newStatus);
  };

  const getTaskPriority = (task: Task): "overdue" | "today" | "upcoming" | "none" => {
    if (!task.dueAt) return "none";
    const dueDate = new Date(task.dueAt);
    if (isPast(dueDate) && task.status !== "done") return "overdue";
    if (isToday(dueDate)) return "today";
    return "upcoming";
  };

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      // Completed tasks at bottom
      if (a.status === "done" && b.status !== "done") return 1;
      if (a.status !== "done" && b.status === "done") return -1;
      
      // Then by due date
      if (a.dueAt && b.dueAt) {
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      }
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      
      return 0;
    });
  }, [tasks]);

  const openTasks = tasks.filter(t => t.status !== "done");
  const hasOverdueTasks = openTasks.some(t => t.dueAt && isPast(new Date(t.dueAt)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Tasks
          </h3>
          <Badge variant={hasOverdueTasks ? "destructive" : "secondary"} className="text-xs">
            {openTasks.length} open
          </Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Task
        </Button>
      </div>

      {/* Add task form */}
      {isAdding && (
        <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
          <div className="space-y-2">
            <Label className="text-xs">Task (clear action, not "follow up")</Label>
            <Input
              placeholder="e.g., Request missing EIN document"
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Owner</Label>
              <Select
                value={newTask.assignee}
                onValueChange={(value) => setNewTask({ ...newTask, assignee: value })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assigneeOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Due Date</Label>
              <Input
                type="date"
                value={newTask.dueDate}
                onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                className="h-8 text-xs"
                min={format(new Date(), "yyyy-MM-dd")}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              placeholder="Additional context..."
              value={newTask.description}
              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
              className="min-h-[60px] text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddTask} disabled={!newTask.title.trim()}>
              Create Task
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Task list */}
      {sortedTasks.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No tasks yet</p>
          <p className="text-xs mt-1">Every opportunity should have at least one open task</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedTasks.map((task) => {
            const priority = getTaskPriority(task);
            const isDone = task.status === "done";
            
            return (
              <div
                key={task.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                  isDone && "bg-muted/30 opacity-60",
                  priority === "overdue" && !isDone && "border-destructive/50 bg-destructive/5",
                  priority === "today" && !isDone && "border-amber-500/50 bg-amber-500/5"
                )}
              >
                <Checkbox
                  checked={isDone}
                  onCheckedChange={() => handleToggleTask(task)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium", isDone && "line-through")}>
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {task.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    {task.assignee && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {task.assignee}
                      </span>
                    )}
                    {task.dueAt && (
                      <span className={cn(
                        "flex items-center gap-1",
                        priority === "overdue" && "text-destructive",
                        priority === "today" && "text-amber-600"
                      )}>
                        <CalendarDays className="h-3 w-3" />
                        {format(new Date(task.dueAt), "MMM d")}
                        {priority === "overdue" && " (overdue)"}
                        {priority === "today" && " (today)"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
