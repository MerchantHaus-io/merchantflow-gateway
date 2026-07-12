import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isEmailAllowed } from "@/types/opportunity";
import { isHiddenUser } from "@/lib/hidden-users";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Shield, ShieldOff, Users } from "lucide-react";
import { toast } from "sonner";

interface ProfileWithRole {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  isAdmin: boolean;
}

export const UserRoleManager = () => {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<ProfileWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchData = async () => {
    const [{ data: profileData }, { data: roleData }, { data: referrerData }] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name, avatar_url"),
      supabase.from("user_roles").select("user_id, role").eq("role", "admin"),
      supabase.from("referrers").select("auth_user_id, email"),
    ]);

    // Referral partners are external users — they own a profiles row (and an
    // auth account) but must never appear in the ops-terminal team list.
    const referrerAuthIds = new Set(
      (referrerData || []).map((r) => r.auth_user_id).filter(Boolean) as string[],
    );
    const referrerEmails = new Set(
      (referrerData || []).map((r) => (r.email || "").toLowerCase()),
    );

    const adminIds = new Set((roleData || []).map((r) => r.user_id));
    const merged = (profileData || [])
      .filter((p) => {
        // Internal staff only: email must pass the staff allowlist...
        if (!isEmailAllowed(p.email)) return false;
        // ...and must not belong to a referral partner account.
        if (referrerAuthIds.has(p.id)) return false;
        if (p.email && referrerEmails.has(p.email.toLowerCase())) return false;
        return true;
      })
      .map((p) => ({
        ...p,
        email: p.email || "",
        isAdmin: adminIds.has(p.id),
      }));
    merged.sort((a, b) => (a.isAdmin === b.isAdmin ? 0 : a.isAdmin ? -1 : 1));
    setProfiles(merged);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("user-roles-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => fetchData())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const toggleAdmin = async (profile: ProfileWithRole) => {
    setToggling(profile.id);
    try {
      if (profile.isAdmin) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", profile.id)
          .eq("role", "admin");
        if (error) throw error;
        toast.success(`Revoked admin from ${profile.full_name || profile.email}`);
      } else {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: profile.id, role: "admin" } as any);
        if (error) throw error;
        toast.success(`Granted admin to ${profile.full_name || profile.email}`);
      }
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update role");
    } finally {
      setToggling(null);
    }
  };

  const initials = (p: ProfileWithRole) => {
    if (p.full_name) return p.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    return p.email.charAt(0).toUpperCase();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Team &amp; Roles
        </CardTitle>
        <CardDescription>Internal staff only — manage administrator privileges. Referral partners are managed under Affiliates.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
        ) : profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No team members found</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => {
                  const isSelf = p.id === user?.id;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={p.avatar_url || undefined} />
                          <AvatarFallback className="text-[10px]">{initials(p)}</AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium">{p.full_name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.email}</TableCell>
                      <TableCell>
                        {p.isAdmin ? (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">Admin</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Member</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={p.isAdmin ? "outline" : "default"}
                          disabled={isSelf || toggling === p.id}
                          onClick={() => toggleAdmin(p)}
                          className="text-xs gap-1.5"
                        >
                          {p.isAdmin ? (
                            <>
                              <ShieldOff className="h-3 w-3" />
                              Revoke Admin
                            </>
                          ) : (
                            <>
                              <Shield className="h-3 w-3" />
                              Grant Admin
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
