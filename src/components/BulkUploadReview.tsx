import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, X, Sparkles, AlertTriangle, CheckCircle2, HelpCircle, FileText } from "lucide-react";
import { DOCUMENT_TYPE_OPTIONS } from "@/components/DocumentsTab";
import { SuggestedLabel } from "@/lib/document-label-ai";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface BulkUploadReviewProps {
  suggestions: SuggestedLabel[];
  labelCounts: Record<string, number>;
  labelLimits: Record<string, number>;
  defaultLimit: number;
  isUploading: boolean;
  onUpload: (assignments: { file: File; type: string }[]) => void;
  onCancel: () => void;
}

export const BulkUploadReview = ({
  suggestions,
  labelCounts,
  labelLimits,
  defaultLimit,
  isUploading,
  onUpload,
  onCancel,
}: BulkUploadReviewProps) => {
  const [assignments, setAssignments] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    suggestions.forEach((s, i) => {
      init[i] = s.suggestedType;
    });
    return init;
  });

  const updateAssignment = (index: number, type: string) => {
    setAssignments(prev => ({ ...prev, [index]: type }));
  };

  const allAssigned = useMemo(() => {
    return suggestions.every((_, i) => !!assignments[i]);
  }, [assignments, suggestions]);

  const unassignedCount = useMemo(() => {
    return suggestions.filter((_, i) => !assignments[i]).length;
  }, [assignments, suggestions]);

  const handleUpload = () => {
    const items = suggestions.map((s, i) => ({
      file: s.file,
      type: assignments[i] || "",
    }));
    onUpload(items);
  };

  const confidenceIcon = (confidence: "high" | "medium" | "low") => {
    switch (confidence) {
      case "high":
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
      case "medium":
        return <HelpCircle className="h-3.5 w-3.5 text-amber-500" />;
      case "low":
        return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;
    }
  };

  const confidenceLabel = (confidence: "high" | "medium" | "low") => {
    switch (confidence) {
      case "high": return "Auto-detected";
      case "medium": return "Best guess";
      case "low": return "Needs review";
    }
  };

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">
            Bulk Upload — {suggestions.length} file{suggestions.length !== 1 ? "s" : ""}
          </span>
          {unassignedCount > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {unassignedCount} unlabelled
            </Badge>
          )}
        </div>
        <button onClick={onCancel} className="p-1 hover:bg-muted rounded transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* File list */}
      <div className="divide-y divide-border max-h-[320px] overflow-y-auto">
        {suggestions.map((s, i) => {
          const currentType = assignments[i];
          const isUnassigned = !currentType;

          return (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                isUnassigned ? "bg-destructive/5" : "hover:bg-muted/30"
              }`}
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{s.file.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    {formatFileSize(s.file.size)}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {confidenceIcon(s.confidence)}
                    {confidenceLabel(s.confidence)}
                  </span>
                </div>
              </div>

              {/* Label selector */}
              <Select value={currentType || "unassigned"} onValueChange={(val) => updateAssignment(i, val === "unassigned" ? "" : val)}>
                <SelectTrigger
                  className={`w-[200px] h-8 text-xs ${
                    isUnassigned ? "border-destructive ring-1 ring-destructive/30" : ""
                  }`}
                >
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPE_OPTIONS.map(opt => {
                    const max = labelLimits[opt] ?? defaultLimit;
                    const count = labelCounts[opt] || 0;
                    // Count how many other files in this batch already use this label
                    const batchCount = Object.entries(assignments).filter(
                      ([idx, t]) => t === opt && Number(idx) !== i
                    ).length;
                    const atLimit = (count + batchCount) >= max;

                    return (
                      <SelectItem key={opt} value={opt} className="text-xs" disabled={atLimit}>
                        {opt}{atLimit ? ` (${max}/${max})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/20 border-t border-border">
        <p className="text-xs text-muted-foreground">
          {allAssigned
            ? "✓ All files labelled — ready to upload"
            : `⚠ Assign labels to ${unassignedCount} file${unassignedCount !== 1 ? "s" : ""} before uploading`
          }
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={isUploading}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleUpload} disabled={isUploading || !allAssigned}>
            {isUploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
            Upload {suggestions.length} file{suggestions.length !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </div>
  );
};
