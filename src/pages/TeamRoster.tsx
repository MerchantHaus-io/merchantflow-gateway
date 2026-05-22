import { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { hydrateTeamRosterFromDb } from "@/config/team";
import { useUserRole } from "@/hooks/useUserRole";
import { CalendarDays, Eye, EyeOff, Users, UserMinus } from "lucide-react";

interface Row {
  id: string;
  email: string;
  display_name: string;
  title: string | null;
  active: boolean;
  is_external: boolean;
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

  const update = (id: string, patch: Partial<Row>) =>
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));

  const save = async (row: Row) => {
    setSaving(row.id);
    const { error } = await supabase
      .from("team_roster")
      .update({
        email: row.email,
        display_name: row.display_name,
        title: row.title,
        active: row.active,
        is_external: row.is_external,
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

  // Live preview: who will appear as a column in Calendar "By User"
  const calendarColumns = useMemo(() => {
    const seen = new Map<string, Row>();
    rows
      .filter(r => r.active && !r.is_external)
      .forEach(r => {
        const key = r.email.toLowerCase();
        if (!seen.has(key)) seen.set(key, r);
      });
    return Array.from(seen.values()).sort((a, b) =>
      a.display_name.localeCompare(b.display_name)
    );
  }, [rows]);

  const hidden = useMemo(
    () => rows.filter(r => !r.active || r.is_external),
    [rows],
  );

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Team Roster</h1>
          <p className="text-muted-foreground mt-1">
            Manage display names, active status, and which teammates appear as
            columns on the calendar's <strong>By User</strong> view. Changes
            propagate everywhere — pipeline cards, dropdowns, badges, SOP, AI
            assistant, and historical assignments.
          </p>
        </div>

        {!isAdmin && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            Read-only — only admins can edit the roster.
          </div>
        )}

        {/* LIVE CALENDAR PREVIEW */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Calendar "By User" preview</h2>
            <Badge variant="secondary" className="ml-auto">
              {calendarColumns.length} {calendarColumns.length === 1 ? "column" : "columns"}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {calendarColumns.map(r => (
              <div
                key={r.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-background text-sm"
              >
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{r.display_name}</span>
                <span className="text-xs text-muted-foreground">{r.email}</span>
              </div>
            ))}
            {calendarColumns.length === 0 && (
              <p className="text-sm text-muted-foreground">No active internal members.</p>
            )}
          </div>
          {hidden.length > 0 && (
            <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <EyeOff className="h-3 w-3" /> Hidden from calendar:
              </span>
              {hidden.map(r => (
                <Badge key={r.id} variant="outline" className="font-normal">
                  {r.display_name}
                  <span className="ml-1 text-[10px] opacity-70">
                    {!r.active ? "inactive" : "external"}
                  </span>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* ROSTER ROWS */}
        <div className="border rounded-lg divide-y">
          {/* header */}
          <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/30">
            <div className="col-span-3">Display name</div>
            <div className="col-span-3">Primary email</div>
            <div className="col-span-2">Title</div>
            <div className="col-span-1 text-center">Active</div>
            <div className="col-span-1 text-center">External</div>
            <div className="col-span-2 text-right">Action</div>
          </div>

          {rows.map((row) => {
            const showsOnCalendar = row.active && !row.is_external;
            return (
              <div
                key={row.id}
                className="p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
              >
                <div className="md:col-span-3 space-y-1">
                  <Input
                    placeholder="Display name (Name Surname)"
                    value={row.display_name}
                    onChange={(e) => update(row.id, { display_name: e.target.value })}
                    disabled={!isAdmin}
                  />
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {showsOnCalendar ? (
                      <><Eye className="h-3 w-3" /> Visible on calendar</>
                    ) : (
                      <><EyeOff className="h-3 w-3" /> Hidden from calendar</>
                    )}
                  </div>
                </div>
                <Input
                  className="md:col-span-3"
                  placeholder="Primary email"
                  value={row.email}
                  onChange={(e) => update(row.id, { email: e.target.value })}
                  disabled={!isAdmin}
                />
                <Input
                  className="md:col-span-2"
                  placeholder="Title"
                  value={row.title ?? ""}
                  onChange={(e) => update(row.id, { title: e.target.value })}
                  disabled={!isAdmin}
                />
                <div className="md:col-span-1 flex md:justify-center items-center gap-2">
                  <Switch
                    checked={row.active}
                    onCheckedChange={(v) => update(row.id, { active: v })}
                    disabled={!isAdmin}
                  />
                  <span className="md:hidden text-xs text-muted-foreground">
                    {row.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="md:col-span-1 flex md:justify-center items-center gap-2">
                  <Switch
                    checked={row.is_external}
                    onCheckedChange={(v) => update(row.id, { is_external: v })}
                    disabled={!isAdmin}
                  />
                  <span className="md:hidden text-xs text-muted-foreground flex items-center gap-1">
                    <UserMinus className="h-3 w-3" />
                    {row.is_external ? "External contact" : "Internal teammate"}
                  </span>
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button
                    onClick={() => save(row)}
                    disabled={!isAdmin || saving === row.id}
                  >
                    {saving === row.id ? "Saving…" : "Save"}
                  </Button>
                </div>
                {(row.legacy_names?.length ?? 0) > 0 && (
                  <div className="md:col-span-12 text-xs text-muted-foreground">
                    Legacy names auto-mapped: {row.legacy_names!.join(", ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="text-xs text-muted-foreground">
          <strong>External contact:</strong> use this for partners or liaisons
          (e.g., NMI support reps) who shouldn't appear as a column on the
          calendar's By User view but whose emails may still surface in shared
          threads. They stay searchable elsewhere — just hidden from team-only
          dashboards.
        </div>
      </div>
    </AppLayout>
  );
}
