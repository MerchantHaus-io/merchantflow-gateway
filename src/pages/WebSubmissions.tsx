import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Archive, CheckCircle } from "lucide-react";
import type { PublicMerchantApplication } from "@/types/application";

/**
 * WebSubmissions page fetches merchant application submissions from Supabase
 * and provides simple actions to archive or convert an application.  In
 * addition to the initial fetch, it subscribes to real‑time changes
 * on the `merchant_applications` table so the list stays up to date
 * without requiring manual refreshes.  Three dedicated realtime channels
 * (INSERT, UPDATE, DELETE) are established on mount and removed on unmount,
 * each logging the payload to the console for debugging purposes.
 */
export default function WebSubmissions() {
  const [apps, setApps] = useState<PublicMerchantApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Fetch applications on mount
  useEffect(() => {
    fetchApplications();

    // Subscribe to realtime INSERT events on the merchant_applications table
    const insertChannel = supabase
      .channel("custom-insert-channel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "merchant_applications" },
        (payload) => {
          console.log("INSERT received!", payload);
          fetchApplications();
        }
      )
      .subscribe();

    // Subscribe to realtime UPDATE events on the merchant_applications table
    const updateChannel = supabase
      .channel("custom-update-channel")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "merchant_applications" },
        (payload) => {
          console.log("UPDATE received!", payload);
          fetchApplications();
        }
      )
      .subscribe();

    // Subscribe to realtime DELETE events on the merchant_applications table
    const deleteChannel = supabase
      .channel("custom-delete-channel")
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "merchant_applications" },
        (payload) => {
          console.log("DELETE received!", payload);
          fetchApplications();
        }
      )
      .subscribe();

    // Cleanup: remove all channels on unmount
    return () => {
      supabase.removeChannel(insertChannel);
      supabase.removeChannel(updateChannel);
      supabase.removeChannel(deleteChannel);
    };
  }, []);

  // Retrieve all applications ordered by creation date
  const fetchApplications = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("merchant_applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        variant: "destructive",
        title: "Error fetching submissions",
        description: error.message,
      });
    } else {
      setApps(data as unknown as PublicMerchantApplication[]);
    }
    setIsLoading(false);
  };

  // Update status of an application and refresh list
  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("merchant_applications")
      .update({ status })
      .eq("id", id);

    if (error) {
      toast({ variant: "destructive", title: "Update failed" });
    } else {
      toast({ title: "Status updated" });
      // Let realtime subscription update the list; manual refresh as fallback
      fetchApplications();
    }
  };

  return (
    <AppLayout pageTitle="Web Submissions">
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Incoming Applications</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : apps.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                No submissions found.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Business Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Volume</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apps.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell>
                        {new Date(app.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium">
                        {app.dba_name || "Untitled"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>
                            {app.dba_contact_first} {app.dba_contact_last}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {app.dba_email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {app.monthly_volume
                          ? `$${app.monthly_volume.toLocaleString()}`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            app.status === "converted"
                              ? "default"
                              : app.status === "archived"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {app.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {app.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatus(app.id, "archived")}
                            >
                              <Archive className="h-4 w-4 mr-1" />
                              Archive
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => updateStatus(app.id, "converted")}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Accept
                            </Button>
                          </>
                        )}
                        {/* You can add a 'View Details' modal trigger here */}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}