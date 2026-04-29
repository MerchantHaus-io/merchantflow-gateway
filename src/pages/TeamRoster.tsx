import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { hydrateTeamRosterFromDb } from "@/config/team";
import { useUserRole } from "@/hooks/useUserRole";

interface Row {
  id: string;
  email: string;
  display_name: string;
  title: string | null;
  active: boolean;
  color_token: string | null;
  legacy_names: string[] | null;
  aliases: string[] | null;
  sort_order: number;
}

export default function TeamRoster() {
  const { isAdmin } = useUserRole();
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("team_roster")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Row[]);
  };

  useEffect(() => { load(); }, []);

  const save = async (row: Row) => {
    setSaving(row.id);
    const { error } = await supabase
      .from("team_roster")
      .update({
        email: row.email,
        display_name: row.display_name,
        title: row.title,
        active: row.active,
        legacy_names: row.legacy_names ?? [],
        aliases: row.aliases ?? [],
      })
      .eq("id", row.id);
    setSaving(null);
    if (error) return toast.error(error.message);
    toast.success(`Saved — "${row.display_name}" applied across the CRM`);
    await hydrateTeamRosterFromDb();
    await load();
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Team Roster</h1>
          <p className="text-muted-foreground mt-1">
            Edit a teammate's <strong>Name Surname</strong> here and it propagates
            everywhere — pipeline cards, dropdowns, badges, SOP, AI assistant,
            quote sender, and historical assignments are auto-renamed.
          </p>
        </div>

        {!isAdmin && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            Read-only — only admins can edit the roster.
          </div>
        )}

        <div className="border rounded-lg divide-y">
          {rows.map((row) => (
            <div key={row.id} className="p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <Input
                className="md:col-span-3"
                placeholder="Display name (Name Surname)"
                value={row.display_name}
                onChange={(e) => setRows(rs => rs.map(r => r.id === row.id ? { ...r, display_name: e.target.value } : r))}
                disabled={!isAdmin}
              />
              <Input
                className="md:col-span-3"
                placeholder="Primary email"
                value={row.email}
                onChange={(e) => setRows(rs => rs.map(r => r.id === row.id ? { ...r, email: e.target.value } : r))}
                disabled={!isAdmin}
              />
              <Input
                className="md:col-span-3"
                placeholder="Title"
                value={row.title ?? ""}
                onChange={(e) => setRows(rs => rs.map(r => r.id === row.id ? { ...r, title: e.target.value } : r))}
                disabled={!isAdmin}
              />
              <div className="md:col-span-1 flex items-center gap-2">
                <Switch
                  checked={row.active}
                  onCheckedChange={(v) => setRows(rs => rs.map(r => r.id === row.id ? { ...r, active: v } : r))}
                  disabled={!isAdmin}
                />
                <span className="text-xs text-muted-foreground">{row.active ? "Active" : "Inactive"}</span>
              </div>
              <Button
                className="md:col-span-2"
                onClick={() => save(row)}
                disabled={!isAdmin || saving === row.id}
              >
                {saving === row.id ? "Saving…" : "Save"}
              </Button>
              {(row.legacy_names?.length ?? 0) > 0 && (
                <div className="md:col-span-12 text-xs text-muted-foreground">
                  Legacy names auto-mapped: {row.legacy_names!.join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
