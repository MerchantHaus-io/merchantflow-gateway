import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface LeadReferrer {
  id: string;
  name: string;
  institution: string | null;
  is_active: boolean;
}

export const formatReferrerLabel = (r: { name: string; institution?: string | null }) =>
  r.institution && r.institution.trim() ? `${r.name} — ${r.institution}` : r.name;

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function LeadReferrerSelect({
  value,
  onChange,
  placeholder = "Select a referrer (optional)",
  className,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);

  const { data: referrers = [] } = useQuery<LeadReferrer[]>({
    queryKey: ["lead-referrers-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_referrers" as any)
        .select("id,name,institution,is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LeadReferrer[];
    },
  });

  const selected = useMemo(() => referrers.find((r) => r.id === value) ?? null, [referrers, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate">{selected ? formatReferrerLabel(selected) : placeholder}</span>
          <div className="flex items-center gap-1 shrink-0">
            {selected && (
              <X
                className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
              />
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command>
          <CommandInput placeholder="Search referrers…" />
          <CommandList>
            <CommandEmpty>No referrers found.</CommandEmpty>
            <CommandGroup>
              {referrers.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`${r.name} ${r.institution ?? ""}`}
                  onSelect={() => {
                    onChange(r.id === value ? null : r.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === r.id ? "opacity-100" : "opacity-0")} />
                  <span>{formatReferrerLabel(r)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
