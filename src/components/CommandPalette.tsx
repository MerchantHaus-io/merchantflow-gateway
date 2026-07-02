import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, LayoutDashboard, Briefcase, ListChecks, Building2, Users,
  FileText, BarChart3, Settings, BookOpen, Calculator, Send, Globe,
  BadgeDollarSign, Cloud, CreditCard, Activity, Sparkles, UserPlus, ScanSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchItem {
  title: string;
  url: string;
  icon: React.ElementType;
  keywords?: string;
}

const SEARCH_ITEMS: SearchItem[] = [
  { title: "Pipeline Board", url: "/", icon: LayoutDashboard, keywords: "dashboard home board kanban" },
  { title: "All Opportunities", url: "/opportunities", icon: Briefcase, keywords: "deals pipeline list" },
  { title: "Tasks", url: "/tasks", icon: ListChecks, keywords: "todo checklist" },
  { title: "Leads", url: "/leads", icon: UserPlus, keywords: "accounts companies businesses prospects" },
  { title: "Contacts", url: "/contacts", icon: Users, keywords: "people clients" },
  { title: "Documents", url: "/documents", icon: FileText, keywords: "files uploads" },
  { title: "Reports", url: "/reports", icon: BarChart3, keywords: "analytics performance" },
  { title: "Transactions", url: "/reports/transactions", icon: CreditCard, keywords: "nmi gateway transactions payments volume" },
  { title: "Commissions", url: "/commissions", icon: BadgeDollarSign, keywords: "commission partner earnings residual" },
  { title: "Settings", url: "/settings", icon: Settings, keywords: "profile preferences theme" },
  { title: "SOP", url: "/sop", icon: BookOpen, keywords: "procedures guide how to" },
  { title: "Statement Analyzer", url: "/tools/statement-analysis", icon: ScanSearch, keywords: "statement analysis fee benchmark savings proposal pdf overcharge" },
  { title: "Revenue Calculator", url: "/tools/revenue-calculator", icon: Calculator, keywords: "money estimate" },
  { title: "Quote Builder", url: "/tools/quote-builder", icon: Calculator, keywords: "quote pricing pdf gateway" },
  { title: "Email Outreach", url: "/outreach", icon: Send, keywords: "campaigns email marketing" },
  { title: "Web Submissions", url: "/admin/web-submissions", icon: Globe, keywords: "applications incoming" },
  { title: "Live & Billing", url: "/live-billing", icon: BadgeDollarSign, keywords: "accounts billing" },
  { title: "Preboarding Wizard", url: "/tools/preboarding-wizard", icon: Sparkles, keywords: "onboarding setup" },
  { title: "Partner Portal Guide", url: "/tools/gateway-guide", icon: CreditCard, keywords: "nmi gateway guide" },
  { title: "NMI Boarding", url: "/tools/nmi-boarding", icon: CreditCard, keywords: "gateway merchant board" },
  { title: "Terminal Updates", url: "/tools/terminal-updates", icon: Sparkles, keywords: "changelog features" },
  { title: "Netlify Hub", url: "/tools/netlify", icon: Cloud, keywords: "deployment audit" },
  { title: "Administration", url: "/admin/administration", icon: Activity, keywords: "login tracking admin agenda" },
  { title: "Supported Processors", url: "/supported-processors", icon: Globe, keywords: "compatibility" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const filtered = query.trim()
    ? SEARCH_ITEMS.filter(item => {
        const q = query.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          (item.keywords && item.keywords.toLowerCase().includes(q))
        );
      })
    : SEARCH_ITEMS.slice(0, 8);

  // Keyboard shortcut to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = useCallback((url: string) => {
    setOpen(false);
    navigate(url);
  }, [navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      handleSelect(filtered[selectedIndex].url);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            className="fixed top-[20%] left-1/2 z-[101] w-full max-w-lg -translate-x-1/2"
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            <div className="mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 border-b border-border">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search pages…"
                  className="flex-1 bg-transparent py-3.5 text-sm outline-none text-foreground placeholder:text-muted-foreground"
                />
                <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-[300px] overflow-y-auto py-1.5">
                {filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No results for "{query}"
                  </p>
                ) : (
                  filtered.map((item, i) => (
                    <button
                      key={item.url}
                      onClick={() => handleSelect(item.url)}
                      onMouseEnter={() => setSelectedIndex(i)}
                      className={cn(
                        "flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors",
                        i === selectedIndex
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground hover:bg-muted/50"
                      )}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
                        <item.icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <span className="font-medium">{item.title}</span>
                    </button>
                  ))
                )}
              </div>

              {/* Footer hint */}
              <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
                <span>↑↓ Navigate</span>
                <span>↵ Open</span>
                <span>esc Close</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
