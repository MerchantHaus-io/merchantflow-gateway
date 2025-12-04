import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { FileText } from "lucide-react";

const DocumentsPage = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 flex items-center px-6 border-b border-border">
            <h1 className="text-lg font-semibold text-foreground">Documents</h1>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No documents yet</p>
              <p className="text-sm mt-2">Documents will appear here once uploaded to opportunities</p>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default DocumentsPage;
