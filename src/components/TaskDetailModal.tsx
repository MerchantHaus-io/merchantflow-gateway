import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Task, TaskPriority } from "@/types/task";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { resolveDisplayName } from "@/types/opportunity";
import {
  Building2,
  User,
  Mail,
  Phone,
  CalendarClock,
  Clock,
  CircleDot,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Minus,
  Flag,
  UserRound,
  FileText,
  AlertTriangle,
  Link2,
  Printer,
} from "lucide-react";
import { format, isPast, isToday, startOfDay, differenceInDays } from "date-fns";

interface ContactInfo {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  fax: string | null;
}

interface AccountInfo {
  name: string;
  website: string | null;
  city: string | null;
  state: string | null;
  status: string | null;
}

interface TaskDetailModalProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const priorityConfig: Record<TaskPriority, { label: string; color: string; icon: typeof ArrowUp }> = {
  high: { label: "High", color: "text-red-500 border-red-500/30 bg-red-500/10", icon: ArrowUp },
  medium: { label: "Medium", color: "text-amber-500 border-amber-500/30 bg-amber-500/10", icon: Minus },
  low: { label: "Low", color: "text-blue-500 border-blue-500/30 bg-blue-500/10", icon: ArrowDown },
};

const statusConfig: Record<Task["status"], { label: string; icon: typeof CircleDot; color: string }> = {
  open: { label: "Open", icon: CircleDot, color: "text-blue-500 border-blue-500/30 bg-blue-500/10" },
  in_progress: { label: "In Progress", icon: Clock, color: "text-amber-500 border-amber-500/30 bg-amber-500/10" },
  done: { label: "Done", icon: CheckCircle2, color: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10" },
};

export function TaskDetailModal({ task, open, onOpenChange }: TaskDetailModalProps) {
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!task || !open) {
      setContact(null);
      setAccount(null);
      return;
    }

    const fetchRelatedData = async () => {
      setLoading(true);

      // Fetch contact if linked
      if (task.relatedContactId) {
        const { data } = await supabase
          .from("contacts")
          .select("first_name, last_name, email, phone, fax, account_id")
          .eq("id", task.relatedContactId)
          .maybeSingle();

        if (data) {
          setContact(data);
          // Also fetch the account from this contact
          if (data.account_id) {
            const { data: acct } = await supabase
              .from("accounts")
              .select("name, website, city, state, status")
              .eq("id", data.account_id)
              .maybeSingle();
            if (acct) setAccount(acct);
          }
        }
      }

      // If no contact but has opportunity, fetch account from opportunity
      if (!task.relatedContactId && task.relatedOpportunityId) {
        const { data: opp } = await supabase
          .from("opportunities")
          .select("account_id, contact_id")
          .eq("id", task.relatedOpportunityId)
          .maybeSingle();

        if (opp) {
          if (opp.contact_id) {
            const { data: contactData } = await supabase
              .from("contacts")
              .select("first_name, last_name, email, phone, fax")
              .eq("id", opp.contact_id)
              .maybeSingle();
            if (contactData) setContact(contactData);
          }
          if (opp.account_id) {
            const { data: acct } = await supabase
              .from("accounts")
              .select("name, website, city, state, status")
              .eq("id", opp.account_id)
              .maybeSingle();
            if (acct) setAccount(acct);
          }
        }
      }

      setLoading(false);
    };

    fetchRelatedData();
  }, [task, open]);

  if (!task) return null;

  const priority = task.priority || "medium";
  const pConfig = priorityConfig[priority];
  const PriorityIcon = pConfig.icon;
  const sConfig = statusConfig[task.status];
  const StatusIcon = sConfig.icon;

  const getDueStatus = () => {
    if (!task.dueAt || task.status === "done") return null;
    const dueDate = startOfDay(new Date(task.dueAt));
    if (isPast(dueDate) && !isToday(new Date(task.dueAt))) return "overdue";
    if (isToday(new Date(task.dueAt))) return "due-today";
    return null;
  };

  const dueStatus = getDueStatus();
  const contactName = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unnamed"
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg leading-tight">{task.title}</DialogTitle>
              {task.source === "sla" && (
                <Badge variant="destructive" className="mt-1.5 text-xs">24h SLA Task</Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Status & Priority row */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={cn("gap-1.5", sConfig.color)}>
              <StatusIcon className="h-3.5 w-3.5" />
              {sConfig.label}
            </Badge>
            <Badge variant="outline" className={cn("gap-1.5", pConfig.color)}>
              <PriorityIcon className="h-3.5 w-3.5" />
              {pConfig.label} Priority
            </Badge>
          </div>

          {/* Description / Instructions */}
          {(task.description || task.comments) && (
            <div className="space-y-1.5">
              <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Instructions
              </h4>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {task.description || task.comments}
                </p>
              </div>
            </div>
          )}

          <Separator />

          {/* Assignment Details */}
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailRow icon={UserRound} label="Assigned to" value={resolveDisplayName(task.assignee)} />
            <DetailRow icon={User} label="Created by" value={resolveDisplayName(task.createdBy)} />
            <DetailRow
              icon={CalendarClock}
              label="Created"
              value={format(new Date(task.createdAt), "MMM d, yyyy 'at' h:mm a")}
            />
            <DetailRow
              icon={CalendarClock}
              label="Due date"
              value={task.dueAt ? format(new Date(task.dueAt), "MMM d, yyyy") : "No due date"}
              valueClassName={cn(
                dueStatus === "overdue" && "text-red-500 font-medium",
                dueStatus === "due-today" && "text-orange-500 font-medium"
              )}
              extra={dueStatus === "overdue" ? (
                <span className="text-xs text-red-500 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {differenceInDays(new Date(), new Date(task.dueAt!))}d overdue
                </span>
              ) : undefined}
            />
          </div>

          {/* Account Info */}
          {(account || task.accountName) && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Account
                </h4>
                <div className="rounded-lg border p-3 space-y-1.5">
                  <p className="font-medium text-sm">{account?.name || task.accountName}</p>
                  {account?.city && account?.state && (
                    <p className="text-xs text-muted-foreground">{account.city}, {account.state}</p>
                  )}
                  {account?.website && (
                    <p className="text-xs text-muted-foreground">{account.website}</p>
                  )}
                  {account?.status && (
                    <Badge variant="outline" className="text-xs mt-1">{account.status}</Badge>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Contact Info */}
          {contact && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Contact
                </h4>
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="font-medium text-sm">{contactName}</p>
                  {contact.email && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                      <a href={`mailto:${contact.email}`} className="hover:text-primary transition-colors underline-offset-2 hover:underline">
                        {contact.email}
                      </a>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                      <a href={`tel:${contact.phone}`} className="hover:text-primary transition-colors">
                        {contact.phone}
                      </a>
                    </div>
                  )}
                  {contact.fax && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Printer className="h-3.5 w-3.5 flex-shrink-0" />
                      {contact.fax}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Linked opportunity */}
          {task.relatedOpportunityId && (
            <>
              <Separator />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Link2 className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Linked to opportunity</span>
                <Badge variant="secondary" className="text-xs font-mono">
                  {task.relatedOpportunityId.slice(0, 8)}…
                </Badge>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  valueClassName,
  extra,
}: {
  icon: typeof User;
  label: string;
  value: string;
  valueClassName?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className={cn("text-sm font-medium", valueClassName)}>{value}</p>
      {extra}
    </div>
  );
}