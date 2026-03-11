import { useState, useRef, useEffect, useCallback } from "react";
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
import { Shield, RefreshCw, LogOut, Camera, User, Loader2, Save, Bell, Palette, Sun, Moon, Trees, Waves, Flame, Stars, MessageCircle, Volume2, Download, FileArchive, Users, Cloudy, Circle, Smartphone, DatabaseBackup, Gamepad2, Cloud } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import JSZip from "jszip";
import { Switch } from "@/components/ui/switch";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import AvatarCropDialog from "@/components/AvatarCropDialog";

// Theme variant icons mapping
const VARIANT_ICONS: Record<ThemeVariant, React.ReactNode> = {
  'dark-default': <Moon className="h-4 w-4" />,
  'dark-midnight': <Stars className="h-4 w-4" />,
  'dark-forest': <Trees className="h-4 w-4" />,
  'dark-charcoal': <Cloudy className="h-4 w-4" />,
  'dark-mono': <Circle className="h-4 w-4" />,
  'dark-ps1': <Gamepad2 className="h-4 w-4" />,
  'light-default': <Sun className="h-4 w-4" />,
  'light-ocean': <Waves className="h-4 w-4" />,
  'light-warm': <Flame className="h-4 w-4" />,
  'light-silver': <Cloudy className="h-4 w-4" />,
  'light-mono': <Circle className="h-4 w-4" />,
  'light-salesforce': <Cloud className="h-4 w-4" />,
};

const Settings = () => {
  const { user, teamMemberName } = useAuth();
  const { variant, setVariant } = useTheme();
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, isLoading: pushLoading, toggleSubscription: togglePush } = usePushNotifications();
  const { isAdmin } = useUserRole();
  const [isResetting, setIsResetting] = useState(false);
  const [isSigningOutAll, setIsSigningOutAll] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
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
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string>("");
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
      // Step 1: Get admin user_ids from user_roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (rolesError) throw rolesError;

      const adminIds = (roles || []).map((r) => r.user_id);
      if (adminIds.length === 0) {
        setAdminUsers([]);
        return;
      }

      // Step 2: Fetch profiles for those user_ids
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url")
        .in("id", adminIds);

      if (profilesError) throw profilesError;

      setAdminUsers(
        (profiles || []).map((p) => ({
          id: p.id,
          email: p.email || "Unknown",
          full_name: p.full_name,
          avatar_url: p.avatar_url,
        }))
      );
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
      .select("avatar_url, full_name, phone")
      .eq("id", user.id)
      .single();
    
    if (data) {
      setAvatarUrl(data.avatar_url);
      setFullName(data.full_name || "");
      setPhone(data.phone || "");
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

    // Show crop dialog instead of uploading directly
    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCroppedUpload = useCallback(async (blob: Blob) => {
    if (!user) return;
    setCropDialogOpen(false);
    setIsUploading(true);
    try {
      const filePath = `${user.id}/avatar.png`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, blob, { upsert: true, contentType: "image/png" });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const urlWithCacheBuster = `${publicUrl}?t=${Date.now()}`;

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
    }
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName, phone })
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

  const handleBackSync = async () => {
    setIsSyncing(true);
    let synced = 0;
    let failed = 0;
    try {
      // Fetch all opportunities with their related data
      const { data: opportunities, error: oppError } = await supabase
        .from("opportunities")
        .select(`
          id, service_type,
          account:accounts(name, address1, address2, city, state, zip, country, website),
          contact:contacts(first_name, last_name, email, phone, fax)
        `)
        .eq("status", "active");

      if (oppError) throw oppError;

      for (const opp of opportunities || []) {
        try {
          // Get merchants data if exists
          // We need to find the application_id linked to this opportunity
          // Since there's no direct FK, we match by account name → application
          const { data: wizardState } = await supabase
            .from("onboarding_wizard_states")
            .select("form_state")
            .eq("opportunity_id", opp.id)
            .maybeSingle();

          const existingForm = (wizardState?.form_state as Record<string, unknown>) || {};
          const account = opp.account as any;
          const contact = opp.contact as any;
          const isGateway = opp.service_type === "gateway_only";

          // Build canonical form state, preserving existing values where they exist
          const syncedForm: Record<string, unknown> = {
            dba_name: existingForm.dba_name || account?.name || "",
            product_description: existingForm.product_description || "",
            nature_of_business: existingForm.nature_of_business || "",
            dba_contact_first_name: existingForm.dba_contact_first_name || contact?.first_name || "",
            dba_contact_last_name: existingForm.dba_contact_last_name || contact?.last_name || "",
            dba_contact_phone: existingForm.dba_contact_phone || contact?.phone || "",
            dba_contact_email: existingForm.dba_contact_email || contact?.email || "",
            dba_address_line1: existingForm.dba_address_line1 || account?.address1 || "",
            dba_address_line2: existingForm.dba_address_line2 || account?.address2 || "",
            dba_city: existingForm.dba_city || account?.city || "",
            dba_state: existingForm.dba_state || account?.state || "",
            dba_zip: existingForm.dba_zip || account?.zip || "",
            legal_entity_name: existingForm.legal_entity_name || account?.name || "",
            federal_tax_id: existingForm.federal_tax_id || "",
            ownership_type: existingForm.ownership_type || "",
            business_formation_date: existingForm.business_formation_date || "",
            state_incorporated: existingForm.state_incorporated || "",
            legal_address_line1: existingForm.legal_address_line1 || account?.address1 || "",
            legal_address_line2: existingForm.legal_address_line2 || account?.address2 || "",
            legal_city: existingForm.legal_city || account?.city || "",
            legal_state: existingForm.legal_state || account?.state || "",
            legal_zip: existingForm.legal_zip || account?.zip || "",
            monthly_volume: existingForm.monthly_volume || "",
            average_transaction: existingForm.average_transaction || "",
            high_ticket: existingForm.high_ticket || "",
            percent_swiped: existingForm.percent_swiped || "",
            percent_keyed: existingForm.percent_keyed || "",
            percent_moto: existingForm.percent_moto || "",
            percent_ecommerce: existingForm.percent_ecommerce || "",
            percent_b2b: existingForm.percent_b2b || "",
            percent_b2c: existingForm.percent_b2c || "",
            sic_mcc_code: existingForm.sic_mcc_code || "",
            website_url: existingForm.website_url || account?.website || "",
            username: existingForm.username || "",
            current_processor: existingForm.current_processor || "",
            documents: [],
            notes: existingForm.notes || "",
          };

          // Calculate progress
          const requiredFields = isGateway
            ? ["dba_name", "dba_contact_first_name", "dba_contact_last_name", "dba_contact_phone", "dba_contact_email", "dba_address_line1", "dba_city", "dba_state", "dba_zip", "username", "current_processor"]
            : ["dba_name", "product_description", "nature_of_business", "dba_contact_first_name", "dba_contact_last_name", "dba_contact_phone", "dba_contact_email", "dba_address_line1", "dba_city", "dba_state", "dba_zip", "legal_entity_name", "federal_tax_id", "ownership_type", "business_formation_date", "state_incorporated", "legal_address_line1", "legal_city", "legal_state", "legal_zip", "monthly_volume", "average_transaction", "high_ticket", "percent_swiped", "percent_keyed", "percent_moto", "percent_ecommerce", "percent_b2c", "percent_b2b"];

          const filled = requiredFields.filter(f => {
            const v = syncedForm[f];
            return typeof v === "string" ? v.trim().length > 0 : Boolean(v);
          }).length;

          // Check uploaded docs count
          const { count: docCount } = await supabase
            .from("documents")
            .select("id", { count: "exact", head: true })
            .eq("opportunity_id", opp.id);

          const totalRequired = requiredFields.length + (isGateway ? 0 : 1);
          const docsComplete = (docCount ?? 0) > 0 ? 1 : 0;
          const progress = Math.round(((filled + (isGateway ? 0 : docsComplete)) / totalRequired) * 100);

          await supabase
            .from("onboarding_wizard_states")
            .upsert({
              opportunity_id: opp.id,
              progress,
              step_index: wizardState ? undefined : 0,
              form_state: syncedForm,
            } as never, { onConflict: "opportunity_id" });

          synced++;
        } catch (e) {
          console.error(`Failed to sync opportunity ${opp.id}:`, e);
          failed++;
        }
      }

      toast.success(`Back-sync complete: ${synced} synced, ${failed} failed`);
    } catch (error) {
      console.error("Back-sync error:", error);
      toast.error("Back-sync failed");
    } finally {
      setIsSyncing(false);
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
      toast.error((await import('@/lib/friendly-errors')).getFriendlyError(error));
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
                    <Input
                      id="fullName"
                      placeholder="Enter your full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      This name will be displayed in chat and throughout the app
                    </p>
                  </div>

                  {/* Phone Setting */}
                  <div className="space-y-2">
                    <Label htmlFor="phone">Contact Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="Enter your contact number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Your phone number will be visible to other team members
                    </p>
                  </div>

                  <Button onClick={handleSaveProfile} disabled={isSaving} className="w-full sm:w-auto">
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span className="ml-2">Save Profile</span>
                  </Button>
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

              {/* Back-Sync Wizard Data - Admin Only */}
              {isAdmin && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DatabaseBackup className="h-5 w-5" />
                      Back-Sync Wizard Data
                    </CardTitle>
                    <CardDescription>
                      Re-populate all onboarding wizard states from account, contact, and merchant data for existing opportunities.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                      <div>
                        <h3 className="font-medium">Sync All Opportunities</h3>
                        <p className="text-sm text-muted-foreground">
                          Fills empty wizard fields from linked records. Existing values are preserved.
                        </p>
                      </div>
                      <Button onClick={handleBackSync} disabled={isSyncing}>
                        {isSyncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DatabaseBackup className="h-4 w-4 mr-2" />}
                        {isSyncing ? "Syncing…" : "Run Back-Sync"}
                      </Button>
                    </div>
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
      <AvatarCropDialog
        open={cropDialogOpen}
        onOpenChange={setCropDialogOpen}
        imageSrc={cropImageSrc}
        onCropComplete={handleCroppedUpload}
      />
    </AppLayout>
  );
};

export default Settings;