import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

const Settings = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 flex items-center px-4 md:px-6 border-b border-border gap-2">
            <SidebarTrigger className="md:hidden" />
            <h1 className="text-lg font-semibold text-foreground">Settings</h1>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <p className="text-muted-foreground">Settings page is under construction.</p>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Settings;