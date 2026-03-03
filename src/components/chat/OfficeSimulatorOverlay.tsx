import React, { useState, useEffect, lazy, Suspense } from "react";
import { Gamepad2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const OfficeChatWrapper = lazy(() => import("@/components/chat/OfficeChatWrapper"));

/**
 * Full-screen overlay for the 3D Office Simulator.
 * Triggered via the "openOfficeSimulator" custom event or the exported toggle.
 */
export function OfficeSimulatorOverlay() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener("openOfficeSimulator", handleOpen);
    return () => window.removeEventListener("openOfficeSimulator", handleOpen);
  }, []);

  // Notify dock
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(isOpen ? "dockAppOpened" : "dockAppClosed"));
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[60] bg-background flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Gamepad2 className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-sm text-foreground">Office Simulator</h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-full hover:bg-muted transition-colors"
              aria-label="Close simulator"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {/* 3D Canvas */}
          <div className="flex-1 min-h-0">
            <Suspense fallback={
              <div className="w-full h-full flex items-center justify-center bg-background">
                <div className="text-center space-y-3">
                  <Gamepad2 className="h-12 w-12 text-muted-foreground mx-auto animate-pulse" />
                  <p className="text-muted-foreground text-sm">Loading Office Simulator...</p>
                </div>
              </div>
            }>
              <OfficeChatWrapper />
            </Suspense>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
