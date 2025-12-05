import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

const Reports = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 flex items-center px-4 md:px-6 border-b border-border gap-2">
            <SidebarTrigger className="md:hidden" />
            <h1 className="text-lg font-semibold text-foreground">Reports</h1>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <p className="text-muted-foreground">Reports functionality is under construction.</p>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Reports;