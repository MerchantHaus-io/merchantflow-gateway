import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { CadenceWorkspace } from "@/components/outreach/CadenceWorkspace";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";

export default function OutreachDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate("/outreach"));

  const { data: campaign, isError } = useQuery({
    queryKey: ["outreach-campaign", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("outreach_campaigns").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // CadenceWorkspace invalidates ["outreach-contacts", campaignId] after enrolment / CSV import.
  const { data: contacts = [] } = useQuery({
    queryKey: ["outreach-contacts", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("outreach_contacts").select("*").eq("campaign_id", id!).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isError) {
    return (
      <AppLayout>
        <div className="p-6 space-y-3">
          <p className="text-sm text-muted-foreground">This sequence could not be found. It may have been deleted.</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/outreach")} className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />All sequences
          </Button>
        </div>
      </AppLayout>
    );
  }

  if (!campaign) return <AppLayout><div className="p-6 text-muted-foreground text-sm">Loading sequence…</div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        {/* ── Header ── */}
        <div className="shrink-0 border-b border-border/60 px-4 sm:px-6 py-4 bg-background">
          <div className="flex items-start gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" aria-label="Back to sequences" onClick={goBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-foreground break-words">{campaign.name}</h1>
              <p className="text-xs text-muted-foreground">
                12-touch sequence · {contacts.length} contact{contacts.length === 1 ? "" : "s"} · created {format(new Date(campaign.created_at), "MMM d, yyyy")}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 pt-5 pb-6">
            <CadenceWorkspace campaignId={campaign.id} contacts={contacts} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
