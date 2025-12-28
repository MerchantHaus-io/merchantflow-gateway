import { TableHead } from "@/components/ui/table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortableTableHeadProps {
  field: string;
  currentSortField: string;
  sortDirection: 'asc' | 'desc';
  onSort: (field: string) => void;
  children: React.ReactNode;
  className?: string;
}

export const SortableTableHead = ({
  field,
  currentSortField,
  sortDirection,
  onSort,
  children,
  className,
}: SortableTableHeadProps) => {
  const isActive = currentSortField === field;
  
  return (
    <TableHead
      className={cn(
        "cursor-pointer hover:bg-muted/50 transition-colors select-none",
        className
      )}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {isActive ? (
          sortDirection === 'asc' ? (
            <ArrowUp className="h-3 w-3 text-primary" />
          ) : (
            <ArrowDown className="h-3 w-3 text-primary" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
        )}
      </div>
    </TableHead>
  );
};
