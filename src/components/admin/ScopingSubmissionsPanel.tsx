import { useEffect, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { SCOPING_SECTIONS, scopingLink } from "@/config/scopingFields";

type ScopingRow = Record<string, unknown> & {
  id: string;
  created_at: string;
  status: string | null;
  legal_business_name: string | null;
  dba_name: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  monthly_volume: string | null;
  acknowledgement_name: string | null;
  acknowledgement_title: string | null;
  disclosures_accepted: boolean | null;
  opportunity_id: string | null;
};

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Blank answers are shown explicitly — the gaps are what we chase on the call. */
function AnswerItem({ label, value }: { label: string; value: unknown }) {
  const text = displayValue(value).trim();
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={text ? "text-sm font-medium text-foreground break-words" : "text-sm italic text-amber-600"}>
        {text || "Not answered"}
      </dd>
    </div>
  );
}

export function ScopingSubmissionsPanel() {
  const [rows, setRows] = useState<ScopingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<ScopingRow | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("scoping_submissions" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) toast.error("Failed to load scoping submissions");
      setRows((data as unknown as ScopingRow[]) || []);
      setIsLoading(false);
    })();
  }, []);

  const copyLink = async () => {
    await navigator.clipboard.writeText(scopingLink());
    toast.success("Scoping link copied");
  };

  const answeredCount = (row: ScopingRow) => {
    const fields = SCOPING_SECTIONS.flatMap(s => s.fields);
    const answered = fields.filter(f => displayValue(row[f.key]).trim().length > 0).length;
    return `${answered}/${fields.length}`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Scoping Forms</CardTitle>
        <Button size="sm" variant="outline" onClick={copyLink}>
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          Copy scoping link
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center p-8 text-muted-foreground">No scoping forms received yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-right pr-2">#</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Monthly volume</TableHead>
                <TableHead>Answered</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow key={row.id}>
                  <TableCell className="text-[11px] text-muted-foreground tabular-nums text-right pr-2">{idx + 1}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium">{row.legal_business_name || row.dba_name || "—"}</TableCell>
                  <TableCell className="text-xs">
                    <div>{[row.contact_first_name, row.contact_last_name].filter(Boolean).join(" ")}</div>
                    <div className="text-muted-foreground">{row.contact_email}</div>
                  </TableCell>
                  <TableCell className="text-xs">{row.monthly_volume || "—"}</TableCell>
                  <TableCell className="text-xs tabular-nums">{answeredCount(row)}</TableCell>
                  <TableCell><Badge variant="outline">{row.status || "new"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setSelected(row)}>View</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Scoping Form — {selected?.legal_business_name || "Details"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <ScrollArea className="max-h-[70vh] pr-4">
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{selected.status || "new"}</Badge>
                  <span className="text-xs text-muted-foreground">
                    Submitted {new Date(selected.created_at).toLocaleString()}
                  </span>
                </div>

                {SCOPING_SECTIONS.map(section => (
                  <div key={section.key} className="space-y-3">
                    <Separator />
                    <h3 className="text-sm font-semibold text-foreground">{section.label}</h3>
                    <dl className="grid gap-3 sm:grid-cols-2">
                      {section.fields.map(field => (
                        <AnswerItem key={field.key} label={field.label} value={selected[field.key]} />
                      ))}
                    </dl>
                  </div>
                ))}

                <Separator />
                <h3 className="text-sm font-semibold text-foreground">Acknowledgement</h3>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <AnswerItem label="Printed name" value={selected.acknowledgement_name} />
                  <AnswerItem label="Title" value={selected.acknowledgement_title} />
                  <AnswerItem label="Disclosures accepted" value={selected.disclosures_accepted} />
                  <AnswerItem label="Linked opportunity" value={selected.opportunity_id} />
                </dl>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
