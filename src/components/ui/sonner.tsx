import { useEffect, useState } from "react";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const [theme, setTheme] = useState<ToasterProps["theme"]>("system");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

    const updateTheme = () => {
      const isDarkMode = document.documentElement.classList.contains("dark") || prefersDark.matches;
      setTheme(isDarkMode ? "dark" : "light");
    };

    updateTheme();
    prefersDark.addEventListener("change", updateTheme);
    return () => prefersDark.removeEventListener("change", updateTheme);
  }, []);

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
