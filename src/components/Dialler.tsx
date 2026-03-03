import { useState, useEffect, useCallback, useRef } from "react";
import { Phone, Delete, X, Clock, User, PhoneIncoming, PhoneOutgoing, Loader2, Wifi } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { quoApi, type QuoPhoneNumber, type QuoCall } from "@/lib/api/quo";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface MatchedContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  account_name?: string;
}

interface RecentCall {
  id: string;
  direction: string;
  status: string;
  duration: number | null;
  phone_number: string | null;
  created_at: string;
  contact_name?: string;
  account_name?: string;
}

const DIAL_KEYS = [
  { digit: "1", letters: "" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
  { digit: "*", letters: "" },
  { digit: "0", letters: "+" },
  { digit: "#", letters: "" },
];

export const Dialler = () => {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Listen for external open event (from MobileAppDock)
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("openDialler", handler);
    return () => window.removeEventListener("openDialler", handler);
  }, []);
  const [number, setNumber] = useState("");
  const [quoNumbers, setQuoNumbers] = useState<QuoPhoneNumber[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string>("");
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [matchedContacts, setMatchedContacts] = useState<MatchedContact[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [quoConnected, setQuoConnected] = useState<boolean | null>(null);

  // Swipe-down to close on mobile
  const swipeStartRef = useRef<{ startY: number; startTime: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    swipeStartRef.current = { startY: e.touches[0].clientY, startTime: Date.now() };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeStartRef.current) return;
    const deltaY = e.changedTouches[0].clientY - swipeStartRef.current.startY;
    const elapsed = Date.now() - swipeStartRef.current.startTime;
    if (deltaY > 80 || (deltaY > 40 && elapsed < 300)) {
      setOpen(false);
    }
    swipeStartRef.current = null;
  }, []);

  const handleKeyPress = useCallback((digit: string) => {
    setNumber((prev) => prev + digit);
  }, []);

  const handleBackspace = useCallback(() => {
    setNumber((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setNumber("");
  }, []);

  // Use a temporary anchor to trigger tel: — more reliable for Android intent picker
  const triggerTelLink = useCallback((phoneNumber: string) => {
    const a = document.createElement("a");
    a.href = `tel:${phoneNumber}`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const handleCall = useCallback(() => {
    if (!number.trim()) return;
    triggerTelLink(number);
    toast.success(`Initiating call to ${number}`, {
      description: "Select Quo when prompted to dial...",
    });
  }, [number, triggerTelLink]);

  const handleCallNumber = useCallback((phone: string, name?: string) => {
    triggerTelLink(phone);
    toast.success(`Initiating call to ${name || phone}`, {
      description: "Select Quo when prompted to dial...",
    });
  }, [triggerTelLink]);

  // Fetch Quo phone numbers on open
  useEffect(() => {
    if (!open) return;
    const fetchLines = async () => {
      setLoadingLines(true);
      const result = await quoApi.listPhoneNumbers();
      if (result.success && result.data) {
        setQuoNumbers(result.data);
        setQuoConnected(true);
        if (result.data.length > 0 && !selectedLineId) {
          setSelectedLineId(result.data[0].id);
        }
      } else {
        setQuoConnected(false);
      }
      setLoadingLines(false);
    };
    fetchLines();
  }, [open]);

  // Fetch recent calls from local call_logs table with contact matching
  useEffect(() => {
    if (!open) return;
    const fetchCalls = async () => {
      setLoadingCalls(true);
      const { data } = await supabase
        .from("call_logs")
        .select("id, direction, status, duration, phone_number, created_at, contact_id, contacts(first_name, last_name, account_id, accounts(name))")
        .order("created_at", { ascending: false })
        .limit(25);
      if (data) {
        setRecentCalls(
          data.map((c: any) => ({
            id: c.id,
            direction: c.direction,
            status: c.status,
            duration: c.duration,
            phone_number: c.phone_number,
            created_at: c.created_at,
            contact_name: c.contacts
              ? `${c.contacts.first_name || ""} ${c.contacts.last_name || ""}`.trim()
              : undefined,
            account_name: c.contacts?.accounts?.name,
          }))
        );
      }
      setLoadingCalls(false);
    };
    fetchCalls();
  }, [open]);

  // Search contacts as user types
  useEffect(() => {
    if (number.length < 3) {
      setMatchedContacts([]);
      return;
    }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, phone, accounts!inner(name)")
        .or(`phone.ilike.%${number}%,first_name.ilike.%${number}%,last_name.ilike.%${number}%`)
        .limit(5);
      if (data) {
        setMatchedContacts(
          data.map((c: any) => ({
            id: c.id,
            first_name: c.first_name,
            last_name: c.last_name,
            phone: c.phone,
            account_name: c.accounts?.name,
          }))
        );
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [number]);

  // Keyboard support
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (/^[0-9*#]$/.test(e.key)) {
        handleKeyPress(e.key);
      } else if (e.key === "Backspace") {
        handleBackspace();
      } else if (e.key === "Enter" && number) {
        handleCall();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleKeyPress, handleBackspace, handleCall, number]);

  if (!user) return null;

  const formatDuration = (seconds: number) => {
    if (!seconds) return "0s";
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  return (
    <>
      {/* Trigger: Desktop only — mobile uses MobileAppDock */}
      {!open && !isMobile && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "fixed bottom-0 right-[358px] z-50 w-[240px] h-12 rounded-t-xl flex items-center gap-3 px-4",
            "bg-gradient-to-r from-slate-800 to-slate-700 dark:from-slate-900 dark:to-slate-800",
            "text-white shadow-xl hover:shadow-2xl transition-all duration-200 ease-out",
            "border border-b-0 border-slate-600"
          )}
          aria-label="Open dialler"
        >
          <Phone className="h-5 w-5 shrink-0" />
          <span className="font-semibold text-sm">Quo Dialler</span>
        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        {/* Swipe handle for mobile */}
        {isMobile && (
          <div
            className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="w-10 h-1 rounded-full bg-white/30" />
          </div>
        )}
        {/* Quo branded header */}
        <div className="bg-[hsl(0,0%,7%)] text-white px-4 pt-4 pb-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-xl font-black tracking-tight">QUO</span>
              <span className="text-sm font-medium opacity-80">Dialler</span>
            </div>
            <div className="flex items-center gap-2">
              {quoConnected === true && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[hsl(72,100%,50%)]/20 text-[hsl(72,100%,50%)]">
                  <Wifi className="h-3 w-3" /> Connected
                </span>
              )}
              {quoConnected === false && (
                <Badge variant="destructive" className="text-xs">Offline</Badge>
              )}
            </div>
          </div>
          {/* Quo line selector */}
          {quoNumbers.length > 0 && (
            <Select value={selectedLineId} onValueChange={setSelectedLineId}>
              <SelectTrigger className="h-9 text-sm bg-white/10 border-white/20 text-white hover:bg-white/15 [&>svg]:text-white/60">
                <SelectValue placeholder="Select Quo line" />
              </SelectTrigger>
              <SelectContent>
                {quoNumbers.map((line) => (
                  <SelectItem key={line.id} value={line.id}>
                    <span className="font-medium">{line.name || "Line"}</span>
                    <span className="text-muted-foreground ml-2">{line.formattedNumber || line.number}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {loadingLines && (
            <div className="flex items-center gap-2 text-xs text-white/60 mt-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading Quo lines...
            </div>
          )}
        </div>

        <Tabs defaultValue="keypad" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 grid w-auto grid-cols-2">
            <TabsTrigger value="keypad">Keypad</TabsTrigger>
            <TabsTrigger value="recent">
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              Recent
            </TabsTrigger>
          </TabsList>

          <TabsContent value="keypad" className="flex-1 flex flex-col mt-0 px-4 pb-4">
            {/* Number display */}
            <div className="relative my-4">
              <Input
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/[^0-9*#+\s\-()]/g, ""))}
                placeholder="Enter number"
                className="text-center text-2xl font-mono h-14 tracking-widest pr-10"
              />
              {number && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                  onClick={handleClear}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Contact matches */}
            {matchedContacts.length > 0 && (
              <div className="mb-3 space-y-1 max-h-28 overflow-auto">
                {matchedContacts.map((c) => (
                  <button
                    key={c.id}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted text-left text-sm transition-colors"
                    onClick={() => c.phone && handleCallNumber(c.phone, `${c.first_name || ""} ${c.last_name || ""}`.trim())}
                  >
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">
                      {c.first_name} {c.last_name}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">{c.phone}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Dial pad */}
            <div className="grid grid-cols-3 gap-2 flex-1 content-center max-w-xs mx-auto w-full">
              {DIAL_KEYS.map(({ digit, letters }) => (
                <button
                  key={digit}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-full aspect-square",
                    "bg-muted/50 hover:bg-muted active:bg-muted/80 transition-colors",
                    "text-foreground select-none cursor-pointer"
                  )}
                  onClick={() => handleKeyPress(digit)}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <span className="text-2xl font-semibold leading-none">{digit}</span>
                  {letters && (
                    <span className="text-[10px] text-muted-foreground tracking-widest mt-0.5">
                      {letters}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Action row */}
            <div className="flex items-center justify-center gap-6 mt-4">
              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12 rounded-full"
                onClick={handleBackspace}
                disabled={!number}
              >
                <Delete className="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                className="h-16 w-16 rounded-full bg-[hsl(72,100%,50%)] hover:bg-[hsl(72,100%,45%)] text-[hsl(0,0%,7%)] shadow-lg"
                onClick={handleCall}
                disabled={!number.trim()}
              >
                <Phone className="h-7 w-7" />
              </Button>
              <div className="h-12 w-12" /> {/* spacer for symmetry */}
            </div>
          </TabsContent>

          <TabsContent value="recent" className="flex-1 mt-0 overflow-hidden">
            <ScrollArea className="h-full px-4 pb-4">
              {loadingCalls ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading recent calls...</span>
                </div>
              ) : recentCalls.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No recent calls</p>
              ) : (
                <div className="space-y-1">
                  {recentCalls.map((call) => (
                    <button
                      key={call.id}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-left"
                      onClick={() => call.phone_number && handleCallNumber(call.phone_number, call.contact_name)}
                    >
                      {call.direction === "incoming" ? (
                        <PhoneIncoming className="h-4 w-4 shrink-0 text-accent-foreground" />
                      ) : (
                        <PhoneOutgoing className="h-4 w-4 shrink-0 text-primary" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {call.contact_name || call.phone_number || "Unknown"}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {call.account_name && (
                            <>
                              <span className="truncate max-w-[100px]">{call.account_name}</span>
                              <span>·</span>
                            </>
                          )}
                          <span>{call.direction}</span>
                          {call.duration && call.duration > 0 && (
                            <>
                              <span>·</span>
                              <span>{formatDuration(call.duration)}</span>
                            </>
                          )}
                          <span>·</span>
                          <span>{formatDistanceToNow(new Date(call.created_at), { addSuffix: true })}</span>
                        </div>
                        {call.contact_name && call.phone_number && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{call.phone_number}</p>
                        )}
                      </div>
                      <Badge variant={call.status === "completed" ? "secondary" : "outline"} className="text-[10px] shrink-0">
                        {call.status}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
    </>
  );
};
