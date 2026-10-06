import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Upload, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type DocRow = Database["public"]["Tables"]["documents"]["Row"];

const BUCKET = "case-documents";
const MAX_MB = 10;

const DOC_TYPES = [
  "Articles of Organization",
  "EIN",
  "Voided Check / Bank Confirmation Letter",
  "Bank Statement",
  "Transaction History",
  "Passport/Drivers License",
  "VAR/Tear Sheet",
  "Other",
];

export function DocumentUpload({ orgId, caseId }: { orgId: string; caseId: string }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("documents")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });
    setDocs((data as DocRow[]) ?? []);
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onFile = async (file: File) => {
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`File exceeds ${MAX_MB} MB`);
      return;
    }
    setBusy(true);
    // Org-prefixed path IS the tenant boundary enforced by storage RLS (0003).
    const path = `${orgId}/${caseId}/${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
    if (upErr) {
      setBusy(false);
      toast.error(upErr.message);
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const { error: insErr } = await supabase.from("documents").insert({
      org_id: orgId,
      case_id: caseId,
      file_name: file.name,
      storage_path: path,
      document_type: docType,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: userData.user?.id ?? null,
    });
    setBusy(false);
    if (insErr) {
      toast.error(insErr.message);
      return;
    }
    toast.success("Document uploaded");
    await load();
  };

  const remove = async (doc: DocRow) => {
    await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    await supabase.from("documents").delete().eq("id", doc.id);
    await load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" /> Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={docType} onChange={(e) => setDocType(e.target.value)} className="max-w-xs">
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            Upload
          </Button>
        </div>

        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{d.file_name}</span>
                  <span className="text-muted-foreground"> · {d.document_type}</span>
                </span>
                <Button variant="ghost" size="icon" onClick={() => void remove(d)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
