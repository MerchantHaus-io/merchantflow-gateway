import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Download, Loader2, ShieldAlert } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import JSZip from "jszip";

export default function DataExport() {
  const [isExporting, setIsExporting] = useState(false);
  const { isAdmin, loading } = useUserRole();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
        return;
      }

      const response = await supabase.functions.invoke("export-data", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const { data, metadata } = response.data;

      // Create ZIP file
      const zip = new JSZip();

      // Add metadata
      zip.file("_metadata.json", JSON.stringify(metadata, null, 2));

      // Add each table as JSON file
      for (const [table, records] of Object.entries(data)) {
        zip.file(`${table}.json`, JSON.stringify(records, null, 2));
      }

      // Generate and download
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `merchantflow-export-${new Date().toISOString().split("T")[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "Success", description: "Data exported successfully" });
    } catch (error) {
      console.error("Export error:", error);
      toast({ 
        title: "Export Failed", 
        description: error instanceof Error ? error.message : "Unknown error", 
        variant: "destructive" 
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout pageTitle="Data Export">
        <div className="flex-1 p-6">
          <Card className="max-w-md mx-auto mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive" />
                Access Denied
              </CardTitle>
              <CardDescription>
                Only administrators can export data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigate("/")}>
                Return to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout pageTitle="Data Export">
      <div className="flex-1 p-6">
        <Card className="max-w-lg mx-auto mt-10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export All Data
            </CardTitle>
            <CardDescription>
              Download a complete backup of all database tables as a ZIP file containing JSON files.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-2">Includes:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Accounts & Contacts</li>
                <li>Opportunities & Tasks</li>
                <li>Activities & Comments</li>
                <li>Documents metadata</li>
                <li>Notifications & Deletion requests</li>
                <li>User profiles & roles</li>
              </ul>
            </div>
            <Button 
              onClick={handleExport} 
              disabled={isExporting}
              className="w-full"
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download ZIP
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
