import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { activeGroupFor, activeItemFor } from "@/config/navigation";
import { cn } from "@/lib/utils";

/**
 * "Where am I" for the persistent chrome (#119).
 *
 * The rail defaults to collapsed (56px of unlabelled icons), the header's mega
 * menu is gone, and list pages like Opportunities render their title inside
 * ListViewHeader in the content area rather than passing pageTitle to
 * AppLayout — so the header slot is empty and there is no back button either.
 * On a deep page the only orientation cue was one highlighted icon.
 *
 * Derived from the same navigation.ts the rail and launcher use, so a renamed
 * section renames here too. A record-level segment (an opportunity id, a ticket
 * number) is deliberately not resolved: the page owns that name, and guessing
 * it here would mean a second fetch for something already on screen.
 */
export function HeaderBreadcrumb({ className }: { className?: string }) {
  const { pathname } = useLocation();

  const crumbs = useMemo(() => {
    const group = activeGroupFor(pathname);
    if (!group) return [];

    const item = activeItemFor(pathname);
    const trail: { label: string; url: string }[] = [{ label: group.title, url: group.url }];

    // Only add the item when it says something the group doesn't — every
    // group's landing page is also its first item, so otherwise the crumb
    // would read "Pipeline / Pipeline Board" on the section's own page.
    if (item && item.url !== group.url) trail.push({ label: item.title, url: item.url });

    return trail;
  }, [pathname]);

  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("hidden sm:flex min-w-0 items-center gap-1 text-xs", className)}
    >
      <ol className="flex min-w-0 items-center gap-1">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={crumb.url} className="flex min-w-0 items-center gap-1">
              {i > 0 && (
                <ChevronRight className="h-3 w-3 shrink-0 opacity-40" aria-hidden="true" />
              )}
              {isLast ? (
                <span aria-current="page" className="truncate font-medium">
                  {crumb.label}
                </span>
              ) : (
                <Link to={crumb.url} className="truncate opacity-70 hover:opacity-100 transition-opacity">
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
