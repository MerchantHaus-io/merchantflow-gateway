import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { OrgRole } from "@/integrations/supabase/types";

interface MemberRow {
  user_id: string;
  role: OrgRole;
  created_at: string;
}
interface InviteRow {
  id: string;
  email: string;
  role: OrgRole;
  accepted_at: string | null;
  expires_at: string;
}

export default function MembersPage() {
  const { org, role } = useTenant();
  const isAdmin = role === "owner" || role === "admin";
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("underwriter");

  const load = useCallback(async () => {
    if (!org) return;
    const [{ data: m }, { data: i }] = await Promise.all([
      supabase.from("org_members").select("user_id, role, created_at").eq("org_id", org.id),
      supabase.from("org_invites").select("id, email, role, accepted_at, expires_at").eq("org_id", org.id),
    ]);
    setMembers((m as MemberRow[]) ?? []);
    setInvites((i as InviteRow[]) ?? []);
  }, [org]);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async () => {
    if (!org || !email.trim()) return;
    // Token generation + email delivery is finished in Phase 1 (edge function).
    // Here we persist the pending invite so the record + accept flow exist.
    const token = crypto.randomUUID().replace(/-/g, "");
    const expires = new Date(Date.now() + 7 * 864e5).toISOString();
    const { error } = await supabase.from("org_invites").insert({
      org_id: org.id,
      email: email.trim(),
      role: inviteRole,
      token,
      expires_at: expires,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setEmail("");
    toast.success(`Invite created. Share: ${window.location.origin}/accept-invite?token=${token}`);
    await load();
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold">Members</h1>
        <nav className="flex gap-3 text-sm text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Settings</Link>
          <Link to="/settings/billing" className="hover:text-foreground">Billing</Link>
        </nav>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-md border">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="truncate text-muted-foreground">{m.user_id}</span>
                <Badge variant="secondary">{m.role}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite a teammate</CardTitle>
            <CardDescription>Creates a shareable invite link. Email delivery lands in Phase 1.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" type="email" />
              </div>
              <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as OrgRole)} className="max-w-[10rem]">
                <option value="admin">Admin</option>
                <option value="underwriter">Underwriter</option>
                <option value="viewer">Viewer</option>
              </Select>
              <Button onClick={invite} disabled={!email.trim()}>Invite</Button>
            </div>
            {invites.length > 0 && (
              <ul className="divide-y rounded-md border">
                {invites.map((iv) => (
                  <li key={iv.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="truncate">{iv.email}</span>
                    <Badge variant={iv.accepted_at ? "secondary" : "outline"}>
                      {iv.accepted_at ? "Joined" : "Pending"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
