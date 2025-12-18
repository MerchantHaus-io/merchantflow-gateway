import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Shield, RefreshCw, LogOut } from "lucide-react";

const Settings = () => {
  const { user } = useAuth();
  const isAdmin = user?.email === "admin@merchanthaus.io" || user?.email === "darryn@merchanthaus.io";
  const [isResetting, setIsResetting] = useState(false);
  const [isSigningOutAll, setIsSigningOutAll] = useState(false);

  const handleForcePasswordReset = async () => {
    setIsResetting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke("force-password-reset", {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success("All users will be required to change their password on next login");
      console.log("Force password reset results:", response.data);
    } catch (error) {
      console.error("Failed to force password reset:", error);
      toast.error("Failed to force password reset");
    } finally {
      setIsResetting(false);
    }
  };

  const handleSignOutAllUsers = async () => {
    setIsSigningOutAll(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke("sign-out-all-users", {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success(response.data.message || "All users have been signed out");
      console.log("Sign out all users results:", response.data);
    } catch (error) {
      console.error("Failed to sign out all users:", error);
      toast.error("Failed to sign out all users");
    } finally {
      setIsSigningOutAll(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 flex items-center px-4 md:px-6 border-b border-border gap-2">
            <SidebarTrigger className="md:hidden" />
            <h1 className="text-lg font-semibold text-foreground">Settings</h1>
          </header>
          <main className="flex-1 overflow-auto p-6">
            {isAdmin ? (
              <div className="space-y-6 max-w-2xl">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Admin Security Controls
                    </CardTitle>
                    <CardDescription>
                      Manage security settings for all team members
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                      <div>
                        <h3 className="font-medium">Force Password Reset</h3>
                        <p className="text-sm text-muted-foreground">
                          Require all users to change their password on next login
                        </p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" disabled={isResetting}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${isResetting ? "animate-spin" : ""}`} />
                            Reset All Passwords
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Force Password Reset?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will require ALL users to create a new password the next time they log in. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleForcePasswordReset}>
                              Confirm Reset
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                      <div>
                        <h3 className="font-medium">Sign Out All Users</h3>
                        <p className="text-sm text-muted-foreground">
                          Force all users to re-authenticate (use for switching to Google login)
                        </p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" disabled={isSigningOutAll}>
                            <LogOut className={`h-4 w-4 mr-2 ${isSigningOutAll ? "animate-spin" : ""}`} />
                            Sign Out All
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Sign Out All Users?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will immediately sign out ALL users, including yourself. Everyone will need to log in again. This is useful for forcing users to switch to Google authentication.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleSignOutAllUsers}>
                              Sign Out Everyone
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <p className="text-muted-foreground">Settings page is under construction.</p>
            )}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Settings;
