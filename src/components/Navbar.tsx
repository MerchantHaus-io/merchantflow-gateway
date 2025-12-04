import { CreditCard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavbarProps {
  onNewApplication: () => void;
}

const Navbar = ({ onNewApplication }: NavbarProps) => {
  return (
    <nav className="bg-card border-b border-border h-16 flex items-center justify-between px-6 shadow-sm z-20">
      <div className="flex items-center gap-4">
        <div className="bg-primary text-primary-foreground w-9 h-9 rounded-lg flex items-center justify-center text-lg shadow-sm">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight text-foreground">
            Merchant<span className="text-primary">Flow</span>
          </h1>
          <p className="text-xs text-muted-foreground">Processing & Gateway Sales</p>
        </div>
      </div>

      <Button onClick={onNewApplication} className="shadow-md">
        <Plus className="h-4 w-4 mr-2" />
        New Application
      </Button>
    </nav>
  );
};

export default Navbar;
