import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Fire-and-forget AI document classification.
 * Calls the classify-document edge function for each document ID.
 * On success, shows a toast with the label. Failures are silently logged.
 */
export async function autoClassifyDocuments(
  documentIds: string[],
  onClassified?: (docId: string, label: string) => void,
) {
  for (const docId of documentIds) {
    try {
      const { data, error } = await supabase.functions.invoke("classify-document", {
        body: { document_id: docId },
      });

      if (error) {
        console.warn("Auto-classify failed for", docId, error);
        continue;
      }

      if (data?.label && data.label !== "Other" && data.confidence !== "low") {
        toast.success(`AI labelled document as "${data.label}"`, {
          description: data.reasoning,
          duration: 4000,
        });
        onClassified?.(docId, data.label);
      }
    } catch (err) {
      console.warn("Auto-classify error:", err);
    }
  }
}
