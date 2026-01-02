import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTasks } from "@/contexts/TasksContext";
import { Task } from "@/types/task";
import { cn } from "@/lib/utils";
import { Loader2, Plus } from "lucide-react";

interface LightweightOpportunity {
  id: string;
  account?: {
    name?: string | null;
  } | null;
  contact?: {
    first_name?: string | null;
    last_name?: string | null;
  } | null;
}

interface LightweightContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

const statusCopy: Record<Task["status"], string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
};

const teamOptions = ["Unassigned", "Onboarding", "Operations", "Support"];

const MyTasks = () => {
  const { user } = useAuth();
  const displayName = user?.email?.split("@")[0] || "Me";
  const { tasks, addTask, updateTaskStatus } = useTasks();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string>(displayName);
  const [comments, setComments] = useState("");
  const [relatedOpportunityId, setRelatedOpportunityId] = useState<string>("");
  const [relatedContactId, setRelatedContactId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<LightweightOpportunity[]>([]);
  const [contacts, setContacts] = useState<LightweightContact[]>([]);

  useEffect(() => {
    const fetchOptions = async () => {
      setLoading(true);
      const { data: opps } = await supabase
        .from("opportunities")
        .select("id, account:accounts(name), contact:contacts(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(20);

      const { data: contactsData } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, email")
        .order("created_at", { ascending: false })
        .limit(30);

      setOpportunities(opps || []);
      setContacts(contactsData || []);
      setLoading(false);
    };

    fetchOptions();
  }, []);

  const myTasks = useMemo(
    () => tasks.filter((task) => task.assignee === displayName || task.assignee === user?.email),
    [displayName, tasks, user?.email],
  );

  const submitTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    addTask({
      title,
      assignee,
      comments,
      description: comments,
      relatedOpportunityId: relatedOpportunityId || undefined,
      relatedContactId: relatedContactId || undefined,
      createdBy: displayName,
      source: "manual",
    });

    setTitle("");
    setComments("");
    setRelatedOpportunityId("");
    setRelatedContactId("");
    setSaving(false);
  };

  const getOpportunityLabel = (opp: LightweightOpportunity) => {
    const accountName = opp.account?.name;
    const contactName = [opp.contact?.first_name, opp.contact?.last_name].filter(Boolean).join(" ");
    if (accountName && contactName) return `${accountName} • ${contactName}`;
    return accountName || contactName || opp.id;
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col min-h-0">
          <header className="flex h-16 items-center gap-2 border-b px-4 flex-shrink-0">
            <SidebarTrigger className="md:hidden" />
            <div>
              <p className="text-sm text-muted-foreground">Personal workspace</p>
              <h1 className="text-xl font-semibold">My Tasks</h1>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
            <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <Card className="xl:col-span-2">
                <CardHeader>
                  <CardTitle>Tasks assigned to you</CardTitle>
                  <CardDescription>Tasks created by teammates or the system that mention you.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {myTasks.length === 0 && (
                    <div className="text-sm text-muted-foreground">No tasks yet. Create one to get started.</div>
                  )}
                  {myTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium leading-none">{task.title}</p>
                          {task.source === "sla" && <Badge variant="outline">24h SLA</Badge>}
                        </div>
                        {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>Assignee: {task.assignee}</span>
                          {task.relatedOpportunityId && <Badge variant="secondary">Application: {task.relatedOpportunityId}</Badge>}
                          {task.relatedContactId && <Badge variant="secondary">Contact: {task.relatedContactId}</Badge>}
                        </div>
                      </div>
                      <Select value={task.status} onValueChange={(value) => updateTaskStatus(task.id, value as Task["status"])}>
                        <SelectTrigger className="w-full md:w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(statusCopy).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>New Task</CardTitle>
                  <CardDescription>Create reminders for yourself or teammates with helpful context.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={submitTask}>
                    <div className="space-y-2">
                      <Label htmlFor="title">Title</Label>
                      <Input
                        id="title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Follow up on submitted application"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="assignee">Assign to</Label>
                      <Select value={assignee} onValueChange={setAssignee}>
                        <SelectTrigger id="assignee">
                          <SelectValue placeholder="Pick a teammate" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={displayName}>{displayName} (you)</SelectItem>
                          <SelectItem value={user?.email || displayName}>Email: {user?.email || "your email"}</SelectItem>
                          {teamOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="comments">Comments</Label>
                      <Textarea
                        id="comments"
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        placeholder="Add handoff notes or expectations"
                      />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label>Attach to application</Label>
                      {loading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading applications…
                        </div>
                      ) : (
                        <Select
                          value={relatedOpportunityId}
                          onValueChange={setRelatedOpportunityId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Optional: link to an application" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No application</SelectItem>
                            {opportunities.map((opp) => (
                              <SelectItem key={opp.id} value={opp.id}>
                                {getOpportunityLabel(opp)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Attach to contact</Label>
                      {loading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading contacts…
                        </div>
                      ) : (
                        <Select value={relatedContactId} onValueChange={setRelatedContactId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Optional: link to a contact" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No contact</SelectItem>
                            {contacts.map((contact) => (
                              <SelectItem key={contact.id} value={contact.id}>
                                {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || contact.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <Button type="submit" className="w-full" disabled={saving}>
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Plus className="mr-2 h-4 w-4" />
                      Create Task
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </section>

            <section>
              <Card>
                <CardHeader>
                  <CardTitle>All tasks</CardTitle>
                  <CardDescription>Everything assigned by you or teammates, including SLA triggers.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {tasks.map((task) => (
                    <div key={task.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium leading-tight">{task.title}</p>
                          <p className="text-xs text-muted-foreground">Created by {task.createdBy || "System"}</p>
                        </div>
                        <Badge
                          variant={task.status === "done" ? "secondary" : "outline"}
                          className={cn({ "bg-emerald-50 text-emerald-700": task.status === "done" })}
                        >
                          {statusCopy[task.status]}
                        </Badge>
                      </div>
                      {task.comments && <p className="text-sm text-muted-foreground">{task.comments}</p>}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">Assignee: {task.assignee}</Badge>
                        {task.relatedOpportunityId && <Badge variant="secondary">Application {task.relatedOpportunityId}</Badge>}
                        {task.relatedContactId && <Badge variant="secondary">Contact {task.relatedContactId}</Badge>}
                        {task.source === "sla" && <Badge variant="destructive">24h SLA</Badge>}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default MyTasks;
