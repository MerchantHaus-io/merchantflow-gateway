import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Task } from "@/types/task";
import { STAGE_CONFIG, OUTCOME_CONFIG, OpportunityStage, OutcomeStatus, resolveDisplayName } from "@/types/opportunity";

interface OpportunityData {
  id: string;
  stage: OpportunityStage;
  assigned_to: string | null;
  created_at: string;
  status: string | null;
  outcome_status?: string | null;
  outcome_reason?: string | null;
  account?: { name: string } | null;
  contact?: { first_name: string | null; last_name: string | null } | null;
}

interface ReportDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  type: "opportunities" | "tasks";
  opportunities?: OpportunityData[];
  tasks?: Task[];
}

const ReportDetailModal = ({
  open,
  onOpenChange,
  title,
  description,
  type,
  opportunities = [],
  tasks = [],
}: ReportDetailModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-primary">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto">
          {type === "opportunities" && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opportunities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No opportunities found
                    </TableCell>
                  </TableRow>
                ) : (
                  opportunities.map((opp) => {
                    const outcomeKey = opp.outcome_status as OutcomeStatus | undefined;
                    const outcomeConf = outcomeKey ? OUTCOME_CONFIG[outcomeKey] : null;
                    return (
                      <TableRow key={opp.id}>
                        <TableCell className="font-medium">
                          {opp.account?.name || "—"}
                        </TableCell>
                        <TableCell>
                          {opp.contact
                            ? `${opp.contact.first_name || ""} ${opp.contact.last_name || ""}`.trim() || "—"
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {STAGE_CONFIG[opp.stage]?.label || opp.stage}
                          </Badge>
                        </TableCell>
                        <TableCell>{opp.assigned_to || "Unassigned"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(opp.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          {outcomeConf ? (
                            <div className="space-y-0.5">
                              <Badge className={`text-xs ${outcomeConf.bgClass} ${outcomeConf.textClass} border-0`}>
                                {outcomeConf.icon} {outcomeConf.label}
                              </Badge>
                              {opp.outcome_reason && (
                                <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                                  {opp.outcome_reason}
                                </p>
                              )}
                            </div>
                          ) : (
                            <Badge
                              variant={opp.status === "dead" ? "destructive" : "default"}
                              className="text-xs"
                            >
                              {opp.status || "active"}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
          {type === "tasks" && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No tasks found
                    </TableCell>
                  </TableRow>
                ) : (
                  tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.title}</TableCell>
                      <TableCell>{task.assignee || "Unassigned"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            task.status === "done"
                              ? "default"
                              : task.status === "in_progress"
                              ? "secondary"
                              : "outline"
                          }
                          className="text-xs"
                        >
                          {task.status === "in_progress"
                            ? "In Progress"
                            : task.status === "done"
                            ? "Done"
                            : "Open"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {task.dueAt ? format(new Date(task.dueAt), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(task.createdAt), "MMM d, yyyy")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReportDetailModal;
