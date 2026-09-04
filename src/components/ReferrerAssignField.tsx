import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LeadReferrerSelect } from "@/components/LeadReferrerSelect";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  /** Which record the affiliate is being assigned to. */
  table: "accounts" | "opportunities";
  recordId: string;
  value: string | null;
  /** React Query keys to refresh after a successful save. */
  invalidateKeys?: string[][];
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Inline affiliate (referral) assignment control. Writes `referrer_id` on the
 * target record so a live/billing account or an opportunity can be credited to
 * an affiliate partner. Attribution-only affiliates are selectable too.
 */
export function ReferrerAssignField({
  table,
  recordId,
  value,
  invalidateKeys = [],
  className,
  disabled,
  placeholder,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState<string | null>(value);
  const queryClient = useQueryClient();

  const handleChange = async (next: string | null) => {
    const previous = local;
    setLocal(next);
    setSaving(true);
    const { error } = await supabase
      .from(table)
      .update({ referrer_id: next } as never)
      .eq("id", recordId);
    setSaving(false);

    if (error) {
      setLocal(previous);
      toast.error(error.message || "Could not save the affiliate");
      return;
    }

    toast.success(next ? "Affiliate assigned" : "Affiliate cleared");
    invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  };

  return (
    <LeadReferrerSelect
      value={local}
      onChange={handleChange}
      disabled={disabled || saving}
      placeholder={placeholder ?? "Assign affiliate"}
      className={cn("h-8 text-xs", className)}
    />
  );
}
