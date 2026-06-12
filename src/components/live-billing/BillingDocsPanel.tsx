import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Receipt as ReceiptIcon, Plus, Download } from "lucide-react";
import { BillingDocDialog } from "./BillingDocDialog";
import { format } from "date-fns";
import { toast } from "sonner";

interface Props {
  accountId: string;
  accountName: string;
}

export const BillingDocsPanel = ({ accountId, accountName }: Props) => {
  const [open, setOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<"invoice" | "receipt">("invoice");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["billing-docs", accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_documents")
        .select("*")
        .eq("account_id", accountId)
        .order("issued_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const handleDownload = async (path: string | null, docNumber: string) => {
    if (!path) return;
    const { data, error } = await supabase.storage.from("opportunity-documents").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Could not load PDF");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" /> Invoices & Receipts
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setDefaultType("invoice"); setOpen(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Invoice
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setDefaultType("receipt"); setOpen(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Receipt
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <p className="text-xs text-muted-foreground py-4">Loading…</p>
          ) : !data?.length ? (
            <p className="text-xs text-muted-foreground py-4">No billing documents yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.doc_number}</TableCell>
                    <TableCell>
                      {d.doc_type === "invoice" ? (
                        <Badge variant="outline" className="gap-1"><FileText className="h-3 w-3" />Invoice</Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                          <ReceiptIcon className="h-3 w-3" />Receipt
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{format(new Date(d.issued_date), "MMM dd, yyyy")}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      ${Number(d.total).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize text-[10px]">{d.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {d.pdf_path && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDownload(d.pdf_path, d.doc_number)}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <BillingDocDialog
        open={open}
        onOpenChange={setOpen}
        accountId={accountId}
        accountName={accountName}
        defaultType={defaultType}
        onCreated={() => qc.invalidateQueries({ queryKey: ["billing-docs", accountId] })}
      />
    </>
  );
};
