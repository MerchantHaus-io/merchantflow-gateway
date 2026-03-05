import React, { Suspense, lazy } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Loader2 } from 'lucide-react';

// Lazy-load so the 1.5MB screenshot data doesn't block initial app load
const NMIGuide = lazy(() => import('@/components/nmi-guide/NMIGuide'));

const GatewayGuide: React.FC = () => {
  return (
    <AppLayout>
      {/* Full-height container — no padding, guide manages its own layout */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden h-full">
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
      </div>
    </AppLayout>
  );
};

export default GatewayGuide;
