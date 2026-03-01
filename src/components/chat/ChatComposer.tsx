import React from "react";
import { Send, Smile, Paperclip, Mic, X, Square, File, Reply } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ChannelMessage, DirectMessage, Profile, EMOJI_CATEGORIES, formatFileSize } from "./types";

interface ChatComposerProps {
  input: string;
  onInputChange: (val: string) => void;
  onSend: () => void;
  onTyping: () => void;
  replyTo: ChannelMessage | DirectMessage | null;
  onCancelReply: () => void;
  isChannel: boolean;
  profiles: Record<string, Profile>;
  getDisplayName: (id: string) => string;
  // Attachments
  pendingAttachment: { file: File; url: string } | null;
  onCancelAttachment: () => void;
  onFileSelect: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  // Recording
  isRecording: boolean;
  recordingTime: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  input, onInputChange, onSend, onTyping,
  replyTo, onCancelReply, isChannel, profiles, getDisplayName,
  pendingAttachment, onCancelAttachment, onFileSelect, fileInputRef, onFileChange,
  isRecording, recordingTime, onStartRecording, onStopRecording, onCancelRecording,
}) => {
  return (
    <div className="bg-[hsl(var(--wa-composer-bg))] border-t border-[hsl(var(--wa-divider))]">
      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[hsl(var(--wa-sidebar-bg))] border-b border-[hsl(var(--wa-divider))]">
          <div className="w-1 h-8 bg-[hsl(var(--wa-accent))] rounded-full" />
          <Reply className="h-4 w-4 text-[hsl(var(--wa-accent))] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[hsl(var(--wa-accent))]">
              {isChannel
                ? profiles[(replyTo as ChannelMessage).user_id]?.full_name || (replyTo as ChannelMessage).user_name
                : getDisplayName((replyTo as DirectMessage).sender_id)
              }
            </p>
            <p className="text-xs text-[hsl(var(--wa-meta))] truncate">{replyTo.content}</p>
          </div>
          <button onClick={onCancelReply} className="p-1 hover:bg-white/10 rounded-full transition-colors">
            <X className="h-3.5 w-3.5 text-[hsl(var(--wa-meta))]" />
          </button>
        </div>
      )}

      {/* Pending attachment */}
      {pendingAttachment && (
        <div className="flex items-center gap-2 mx-3 mt-2 p-2 bg-[hsl(var(--wa-search-bg))] rounded-lg">
          {pendingAttachment.file.type.startsWith('image/') ? (
            <img src={pendingAttachment.url} alt="" className="h-12 w-12 rounded object-cover" />
          ) : (
            <File className="h-8 w-8 text-[hsl(var(--wa-meta))] shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[hsl(var(--wa-bubble-in-foreground))] truncate">{pendingAttachment.file.name}</p>
            <p className="text-[10px] text-[hsl(var(--wa-meta))]">{formatFileSize(pendingAttachment.file.size)}</p>
          </div>
          <button onClick={onCancelAttachment} className="p-1 hover:bg-white/10 rounded">
            <X className="h-4 w-4 text-[hsl(var(--wa-meta))]" />
          </button>
        </div>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <div className="flex items-center gap-2 mx-3 mt-2 p-2 bg-red-900/20 rounded-lg border border-red-800/40">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs text-red-400 font-medium">
            Recording {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
          </span>
          <div className="ml-auto flex gap-1">
            <button onClick={onCancelRecording} className="p-1.5 hover:bg-red-900/40 rounded-md transition-colors" title="Cancel">
              <X className="h-4 w-4 text-red-400" />
            </button>
            <button onClick={onStopRecording} className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors" title="Stop & Send">
              <Square className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-1.5 p-2 px-3">
        {/* Emoji */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="p-2 hover:bg-white/5 rounded-full transition-colors shrink-0" title="Emoji">
              <Smile className="h-5 w-5 text-[hsl(var(--wa-meta))]" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0 bg-[hsl(var(--wa-sidebar-bg))] border-[hsl(var(--wa-divider))]" align="start" side="top">
            <div className="max-h-64 overflow-y-auto">
              {EMOJI_CATEGORIES.map(cat => (
                <div key={cat.label} className="p-2">
                  <p className="text-xs font-medium text-[hsl(var(--wa-meta))] mb-1 px-1">{cat.label}</p>
                  <div className="flex flex-wrap gap-0.5">
                    {cat.emojis.map(emoji => (
                      <button key={emoji} onClick={() => onInputChange(input + emoji)} className="text-lg hover:scale-125 hover:bg-white/10 transition-all p-1 rounded">{emoji}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Attach */}
        <button onClick={onFileSelect} className="p-2 hover:bg-white/5 rounded-full transition-colors shrink-0" title="Attach file">
          <Paperclip className="h-5 w-5 text-[hsl(var(--wa-meta))] rotate-45" />
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChange} accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" />

        {/* Text input */}
        <div className="flex-1">
          <Input
            placeholder="Type a message"
            value={input}
            onChange={(e) => { onInputChange(e.target.value); onTyping(); }}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSend()}
            className="bg-[hsl(var(--wa-search-bg))] border-0 text-[hsl(var(--wa-bubble-in-foreground))] placeholder:text-[hsl(var(--wa-meta))] rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0"
            disabled={isRecording}
          />
        </div>

        {/* Send or Mic */}
        {input.trim() || pendingAttachment ? (
          <button
            onClick={onSend}
            className="p-2.5 bg-[hsl(var(--wa-accent))] hover:bg-[hsl(var(--wa-accent)/0.85)] rounded-full transition-colors shrink-0"
            disabled={!input.trim() && !pendingAttachment}
          >
            <Send className="h-5 w-5 text-white" />
          </button>
        ) : (
          <button
            onClick={isRecording ? onStopRecording : onStartRecording}
            className={cn(
              "p-2.5 rounded-full transition-colors shrink-0",
              isRecording ? "bg-red-500 hover:bg-red-600" : "hover:bg-white/5"
            )}
          >
            <Mic className={cn("h-5 w-5", isRecording ? "text-white" : "text-[hsl(var(--wa-meta))]")} />
          </button>
        )}
      </div>
    </div>
  );
};
