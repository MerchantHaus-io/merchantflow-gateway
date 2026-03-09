import React, { Suspense, lazy, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Loader2, Users, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const NMIGuide = lazy(() => import('@/components/nmi-guide/NMIGuide'));

type GuideTab = 'partner' | 'merchant';

const GatewayGuide: React.FC = () => {
  const [activeTab, setActiveTab] = useState<GuideTab>('partner');

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden h-full">
        {/* ── Tab Switcher ── */}
        <div className="shrink-0 flex items-center gap-1 px-4 pt-3 pb-2 border-b border-border bg-background/80 backdrop-blur-md z-10">
          <button
            onClick={() => setActiveTab('partner')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200',
              activeTab === 'partner'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <Building2 className="h-4 w-4" />
            Partner Portal
          </button>
          <button
            onClick={() => setActiveTab('merchant')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200',
              activeTab === 'merchant'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <Users className="h-4 w-4" />
            Merchant Portal
          </button>
        </div>

        {/* ── Tab Content ── */}
        {activeTab === 'partner' ? (
          <Suspense
            fallback={
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm font-medium">Loading Partner Portal Guide…</p>
                <p className="text-xs text-muted-foreground/60">Baking in 14 screenshots</p>
              </div>
            }
          >
            <NMIGuide />
          </Suspense>
        ) : (
          <div className="flex-1 relative">
            <iframe
              src="https://guide-savvy.lovable.app"
              title="NMI Merchant Portal Guide"
              className="w-full h-full border-0"
              allow="clipboard-read; clipboard-write"
              loading="lazy"
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default GatewayGuide;
