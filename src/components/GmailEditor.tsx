import { useRef, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Bold, Italic, Underline, Link2, List, ListOrdered,
  Sparkles, Loader2, Type, Braces, Undo2, Redo2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface GmailEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  mergeTags?: string[];
  className?: string;
}

const MERGE_TAGS = ["{{first_name}}", "{{last_name}}", "{{company}}", "{{email}}"];

export function GmailEditor({
  value,
  onChange,
  placeholder = "Write your email…",
  minHeight = "160px",
  mergeTags = MERGE_TAGS,
  className,
}: GmailEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [polishing, setPolishing] = useState(false);
  const [focused, setFocused] = useState(false);
  const [linkPopover, setLinkPopover] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const isInternalChange = useRef(false);

  // Sync contentEditable → parent on every input
  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  // Set initial content on mount, and sync external changes (e.g. AI polish)
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!editorRef.current) return;
    if (!hasInitialized.current) {
      editorRef.current.innerHTML = value;
      hasInitialized.current = true;
      return;
    }
    // Skip DOM update if the change came from user typing
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    // External change (AI polish, step switch) — update DOM
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  // Formatting commands
  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
    handleInput();
  };

  const insertMergeTag = (tag: string) => {
    exec("insertText", tag);
  };

  const insertLink = () => {
    if (linkUrl) {
      exec("createLink", linkUrl);
      setLinkUrl("");
      setLinkPopover(false);
    }
  };

  // AI Polish
  const handlePolish = async () => {
    const html = editorRef.current?.innerHTML;
    if (!html || html === "<br>" || html.replace(/<[^>]*>/g, "").trim().length < 10) {
      toast.error("Write at least a few sentences before polishing");
      return;
    }
    setPolishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("polish-email", {
        body: { html },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      if (data?.html) {
        isInternalChange.current = false;
        onChange(data.html);
        toast.success("Email polished by AI ✨");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to polish email");
    } finally {
      setPolishing(false);
    }
  };

  const ToolBtn = ({ icon: Icon, label, onClick, active }: {
    icon: React.ElementType; label: string; onClick: () => void; active?: boolean;
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onClick(); }}
          className={cn(
            "h-7 w-7 rounded flex items-center justify-center transition-colors",
            "hover:bg-muted text-muted-foreground hover:text-foreground",
            active && "bg-muted text-foreground"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );

  const isEmpty = !value || value === "<br>" || value.replace(/<[^>]*>/g, "").trim() === "";

  return (
    <div className={cn(
      "rounded-lg border transition-all",
      focused ? "border-primary/50 ring-2 ring-primary/15" : "border-border/60",
      "bg-background",
      className,
    )}>
      {/* Toolbar — Gmail style */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border/40 bg-muted/20 rounded-t-lg flex-wrap">
        <ToolBtn icon={Bold} label="Bold (Ctrl+B)" onClick={() => exec("bold")} />
        <ToolBtn icon={Italic} label="Italic (Ctrl+I)" onClick={() => exec("italic")} />
        <ToolBtn icon={Underline} label="Underline (Ctrl+U)" onClick={() => exec("underline")} />

        <Separator orientation="vertical" className="h-4 mx-1" />

        <ToolBtn icon={List} label="Bullet list" onClick={() => exec("insertUnorderedList")} />
        <ToolBtn icon={ListOrdered} label="Numbered list" onClick={() => exec("insertOrderedList")} />

        <Separator orientation="vertical" className="h-4 mx-1" />

        {/* Link */}
        <Popover open={linkPopover} onOpenChange={setLinkPopover}>
          <PopoverTrigger asChild>
            <span>
              <ToolBtn icon={Link2} label="Insert link" onClick={() => setLinkPopover(true)} />
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start">
            <p className="text-xs font-medium mb-2">Insert Link</p>
            <div className="flex gap-2">
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://…"
                className="flex-1 h-8 px-2 text-sm rounded border border-border bg-background"
                onKeyDown={(e) => e.key === "Enter" && insertLink()}
              />
              <Button size="sm" className="h-8" onClick={insertLink} disabled={!linkUrl}>
                Add
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="h-4 mx-1" />

        {/* Merge tags */}
        <Popover>
          <PopoverTrigger asChild>
            <span>
              <ToolBtn icon={Braces} label="Insert merge tag" onClick={() => {}} />
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1.5" align="start">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1">Merge Tags</p>
            {mergeTags.map(tag => (
              <button
                key={tag}
                type="button"
                className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors font-mono"
                onClick={() => { insertMergeTag(tag); }}
              >
                {tag}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="h-4 mx-1" />

        <ToolBtn icon={Undo2} label="Undo" onClick={() => exec("undo")} />
        <ToolBtn icon={Redo2} label="Redo" onClick={() => exec("redo")} />

        {/* Spacer + AI Polish */}
        <div className="flex-1" />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            "h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary",
            polishing && "pointer-events-none"
          )}
          disabled={polishing || isEmpty}
          onClick={handlePolish}
        >
          {polishing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {polishing ? "Polishing…" : "AI Polish"}
        </Button>
      </div>

      {/* Editor area */}
      <div className="relative">
        {isEmpty && !focused && (
          <div className="absolute inset-0 px-4 py-3 text-sm text-muted-foreground pointer-events-none">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className={cn(
            "px-4 py-3 text-sm text-foreground focus:outline-none",
            "prose prose-sm dark:prose-invert max-w-none",
            "[&_a]:text-primary [&_a]:underline",
            "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
            "[&_p]:my-1",
          )}
          style={{ minHeight }}
          onInput={handleInput}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={(e) => {
            // Paste as plain text to avoid weird formatting
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
          }}
          dangerouslySetInnerHTML={{ __html: value }}
        />
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t border-border/30 bg-muted/10 rounded-b-lg">
        <p className="text-[10px] text-muted-foreground">
          Tip: Use merge tags like <code className="bg-muted px-1 rounded">{"{{first_name}}"}</code> to personalize. Hit <kbd className="bg-muted px-1 rounded font-mono">AI Polish</kbd> to refine your draft.
        </p>
      </div>
    </div>
  );
}
