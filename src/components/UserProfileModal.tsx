import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { isHiddenUser } from "@/lib/hidden-users";
import { useAuth } from "@/contexts/AuthContext";

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  phone: string | null;
  last_seen: string | null;
}

interface UserProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string;
  email?: string;
}

const formatLastSeen = (lastSeen: string | null): string => {
  if (!lastSeen) return "Never";
  const now = new Date();
  const date = new Date(lastSeen);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 2) return "Online now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
};

export function UserProfileModal({ open, onOpenChange, userId, email }: UserProfileModalProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || (!userId && !email)) return;

    const fetchProfile = async () => {
      setLoading(true);
      let query = supabase.from("profiles").select("id, full_name, email, avatar_url, phone, last_seen");
      if (userId) {
        query = query.eq("id", userId);
      } else if (email) {
        query = query.eq("email", email);
      }
      const { data } = await query.maybeSingle();
      setProfile(data as UserProfile | null);
      setLoading(false);
    };

    fetchProfile();
  }, [open, userId, email]);

  const displayName = profile?.full_name || profile?.email?.split("@")[0] || "User";
  const initials = displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const lastSeenText = formatLastSeen(profile?.last_seen ?? null);
  const isOnline = lastSeenText === "Online now";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="sr-only">User Profile</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : profile ? (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={profile.avatar_url || undefined} alt={displayName} />
                <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span
                className={cn(
                  "absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-background",
                  isOnline ? "bg-emerald-500" : "bg-gray-400"
                )}
              />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-semibold">{displayName}</h3>
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {lastSeenText}
              </Badge>
            </div>

            <div className="w-full space-y-3 pt-2">
              {profile.email && (
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-muted/50">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm truncate">{profile.email}</p>
                  </div>
                </div>
              )}
              {profile.phone && (
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-muted/50">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <a href={`tel:${profile.phone}`} className="text-sm text-primary hover:underline">
                      {profile.phone}
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">Profile not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
