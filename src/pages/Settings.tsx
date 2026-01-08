import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, THEME_OPTIONS, ThemeVariant } from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Shield, RefreshCw, LogOut, Camera, User, Loader2, Save, Bell, Palette, Sun, Moon, Trees, Waves, Flame, Stars, MessageCircle, Volume2, Download, FileArchive, Users, Cloudy, Circle, Smartphone } from "lucide-react";
import JSZip from "jszip";
import { Switch } from "@/components/ui/switch";
import { usePushNotifications } from "@/hooks/usePushNotifications";

// Theme variant icons mapping
const VARIANT_ICONS: Record<ThemeVariant, React.ReactNode> = {
  'dark-default': <Moon className="h-4 w-4" />,
  'dark-midnight': <Stars className="h-4 w-4" />,
  'dark-forest': <Trees className="h-4 w-4" />,
  'dark-charcoal': <Cloudy className="h-4 w-4" />,
  'dark-mono': <Circle className="h-4 w-4" />,
  'light-default': <Sun className="h-4 w-4" />,
  'light-ocean': <Waves className="h-4 w-4" />,
  'light-warm': <Flame className="h-4 w-4" />,
  'light-silver': <Cloudy className="h-4 w-4" />,
  'light-mono': <Circle className="h-4 w-4" />,
};

const Settings = () => {
  const { user, teamMemberName } = useAuth();
  const { variant, setVariant } = useTheme();
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, isLoading: pushLoading, toggleSubscription: togglePush } = usePushNotifications();
  const isAdmin = user?.email === "admin@merchanthaus.io" || user?.email === "darryn@merchanthaus.io";
  const [isResetting, setIsResetting] = useState(false);
  const [isSigningOutAll, setIsSigningOutAll] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [adminUsers, setAdminUsers] = useState<{ id: string; email: string; full_name: string | null; avatar_url: string | null }[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [chatNotificationsEnabled, setChatNotificationsEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chatNotificationsEnabled') !== 'false';
    }
    return true;
  });
  const [chatSoundEnabled, setChatSoundEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chatSoundEnabled') !== 'false';
    }
    return true;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayName = fullName || teamMemberName || user?.email?.split("@")[0] || "User";

  useEffect(() => {
    if (user) {
      fetchProfile();
      if (isAdmin) {
        fetchAdminUsers();
      }
    }
  }, [user, isAdmin]);

  const fetchAdminUsers = async () => {
    setLoadingAdmins(true);
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, profiles:user_id(id, email, full_name, avatar_url)")
        .eq("role", "admin");

      if (error) throw error;

      const admins = data?.map((item: any) => ({
        id: item.profiles?.id || item.user_id,
        email: item.profiles?.email || "Unknown",
        full_name: item.profiles?.full_name,
        avatar_url: item.profiles?.avatar_url,
      })) || [];

      setAdminUsers(admins);
    } catch (error) {
      console.error("Error fetching admin users:", error);
    } finally {
      setLoadingAdmins(false);
    }
  };

  const fetchProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("avatar_url, full_name")
      .eq("id", user.id)
      .single();
    
    if (data) {
      setAvatarUrl(data.avatar_url);
      setFullName(data.full_name || "");
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${user.id}/avatar.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      // Add cache buster
      const urlWithCacheBuster = `${publicUrl}?t=${Date.now()}`;

      // Update profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: urlWithCacheBuster })
        .eq("id", user.id);

      if (updateError) throw updateError;

      setAvatarUrl(urlWithCacheBuster);
      toast.success("Profile picture updated!");
    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast.error("Failed to upload profile picture");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", user.id);

      if (error) throw error;
      toast.success("Profile saved successfully!");
    } catch (error) {
      console.error("Error saving profile:", error);
      toast.error("Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  };

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
    } catch (error) {
      console.error("Failed to sign out all users:", error);
      toast.error("Failed to sign out all users");
    } finally {
      setIsSigningOutAll(false);
    }
  };

  const handleDataExport = async () => {
    setIsExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Not authenticated");
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

      toast.success("Data exported successfully!");
    } catch (error) {
      console.error("Export error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to export data");
    } finally {
      setIsExporting(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <AppLayout pageTitle="Settings">
      <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6 max-w-2xl">
              {/* Profile Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Profile Settings
                  </CardTitle>
                  <CardDescription>
                    Manage your profile picture and display name
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Avatar Section */}
                  <div className="flex items-center gap-6">
                    <div className="relative group">
                      <Avatar className="h-24 w-24 cursor-pointer" onClick={handleAvatarClick}>
                        <AvatarImage src={avatarUrl || undefined} alt={displayName} />
                        <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                          {getInitials(displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <button
                        onClick={handleAvatarClick}
                        disabled={isUploading}
                        className="absolute bottom-0 right-0 p-2 bg-primary text-primary-foreground rounded-full shadow-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {isUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Camera className="h-4 w-4" />
                        )}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground mb-1">{user?.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Click the avatar to upload a new profile picture (max 5MB)
                      </p>
                    </div>
                  </div>

                  {/* Name Setting */}
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Display Name</Label>
                    <div className="flex gap-2">
                      <Input
                        id="fullName"
                        placeholder="Enter your full name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                      <Button onClick={handleSaveProfile} disabled={isSaving}>
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        <span className="ml-2 hidden sm:inline">Save</span>
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This name will be displayed in chat and throughout the app
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Appearance Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="h-5 w-5" />
                    Appearance
                  </CardTitle>
                  <CardDescription>
                    Customize the look and feel of the application
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="theme">Theme Style</Label>
                    <Select value={variant} onValueChange={(value) => setVariant(value as ThemeVariant)}>
                      <SelectTrigger id="theme" className="w-full">
                        <SelectValue placeholder="Select a theme" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Dark Themes</div>
                        {THEME_OPTIONS.filter(opt => opt.mode === 'dark').map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            <div className="flex items-center gap-2">
                              {VARIANT_ICONS[option.id]}
                              <span>{option.name}</span>
                              <span className="text-xs text-muted-foreground">- {option.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">Light Themes</div>
                        {THEME_OPTIONS.filter(opt => opt.mode === 'light').map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            <div className="flex items-center gap-2">
                              {VARIANT_ICONS[option.id]}
                              <span>{option.name}</span>
                              <span className="text-xs text-muted-foreground">- {option.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Choose from multiple dark and light theme variants. You can also toggle between dark/light mode using the button in the sidebar.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Notification Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Notification Settings
                  </CardTitle>
                  <CardDescription>
                    Manage how you receive notifications
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                    <div>
                      <h3 className="font-medium">Task Assignments</h3>
                      <p className="text-sm text-muted-foreground">
                        Get notified when a task is assigned to you
                      </p>
                    </div>
                    <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
                  </div>
                  <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                    <div>
                      <h3 className="font-medium">Opportunity Assignments</h3>
                      <p className="text-sm text-muted-foreground">
                        Get notified when an opportunity is assigned to you
                      </p>
                    </div>
                    <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Notifications appear in the bell icon at the top of the sidebar
                  </p>
                </CardContent>
              </Card>

              {/* Chat Notification Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5" />
                    Chat Notifications
                  </CardTitle>
                  <CardDescription>
                    Manage chat message notifications and sounds
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Push Notifications */}
                  {pushSupported && (
                    <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/30">
                      <div className="flex items-center gap-3">
                        <Smartphone className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <h3 className="font-medium">Push Notifications</h3>
                          <p className="text-sm text-muted-foreground">
                            Get alerts on your phone/device when new messages arrive
                          </p>
                        </div>
                      </div>
                      <Switch 
                        checked={pushSubscribed} 
                        onCheckedChange={() => togglePush()}
                        disabled={pushLoading}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                    <div>
                      <h3 className="font-medium">Browser Notifications</h3>
                      <p className="text-sm text-muted-foreground">
                        Show desktop notifications for new chat messages
                      </p>
                    </div>
                    <Switch 
                      checked={chatNotificationsEnabled} 
                      onCheckedChange={(checked) => {
                        setChatNotificationsEnabled(checked);
                        localStorage.setItem('chatNotificationsEnabled', String(checked));
                      }} 
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Volume2 className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <h3 className="font-medium">Notification Sound</h3>
                        <p className="text-sm text-muted-foreground">
                          Play a sound when you receive new chat messages
                        </p>
                      </div>
                    </div>
                    <Switch 
                      checked={chatSoundEnabled} 
                      onCheckedChange={(checked) => {
                        setChatSoundEnabled(checked);
                        localStorage.setItem('chatSoundEnabled', String(checked));
                      }} 
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Push notifications require browser permission. Enable push notifications to get alerts even when the app is closed.
                  </p>
                </CardContent>
              </Card>

              {/* Data Export - Admin Only */}
              {isAdmin && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileArchive className="h-5 w-5" />
                      Data Export
                    </CardTitle>
                    <CardDescription>
                      Download a complete backup of all application data
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground space-y-2">
                      <p className="font-medium">Includes:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Accounts & Contacts</li>
                        <li>Opportunities & Applications</li>
                        <li>Tasks & Activities</li>
                        <li>Comments & Documents metadata</li>
                        <li>Chat messages & Direct messages</li>
                        <li>Notifications & User profiles</li>
                      </ul>
                    </div>
                    <Button 
                      onClick={handleDataExport} 
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
                          Download ZIP Backup
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Exports all data as JSON files in a ZIP archive
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Admin Users List - Only for admins */}
              {isAdmin && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Admin Users
                    </CardTitle>
                    <CardDescription>
                      Users with administrator privileges
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loadingAdmins ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : adminUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No admin users found
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {adminUsers.map((admin) => (
                          <div 
                            key={admin.id} 
                            className="flex items-center gap-3 p-3 border border-border rounded-lg"
                          >
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={admin.avatar_url || undefined} alt={admin.full_name || admin.email} />
                              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                {(admin.full_name || admin.email).slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">
                                {admin.full_name || admin.email.split("@")[0]}
                              </p>
                              <p className="text-sm text-muted-foreground truncate">
                                {admin.email}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
                              <Shield className="h-3 w-3" />
                              Admin
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Admin Controls - Only for admins */}
              {isAdmin && (
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
              )}
          </div>
        </div>
    </AppLayout>
  );
};

export default Settings;