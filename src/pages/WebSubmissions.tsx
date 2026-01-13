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
import { Loader2, ExternalLink, Archive, CheckCircle } from "lucide-react";
import type { PublicMerchantApplication } from "@/types/application";

export default function WebSubmissions() {
  const [apps, setApps] = useState<PublicMerchantApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchApplications();
  }, []);

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
      setApps((data as unknown) as PublicMerchantApplication[]);
    }
    setIsLoading(false);
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("merchant_applications")
      .update({ status })
      .eq("id", id);

    if (error) {
      toast({ variant: "destructive", title: "Update failed" });
    } else {
      toast({ title: "Status updated" });
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
