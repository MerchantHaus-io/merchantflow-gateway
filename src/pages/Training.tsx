import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GraduationCap, Download, ExternalLink as ExternalLinkIcon, Printer } from "lucide-react";
import trainingMarkdown from "@/content/training/ops-terminal-training.md?raw";

const isInternalHref = (href?: string) =>
  !!href && href.startsWith("/") && !href.startsWith("//");

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-3xl font-bold tracking-tight text-foreground mt-2 mb-4">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-semibold tracking-tight text-foreground mt-10 mb-3 pb-2 border-b border-border">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-foreground mt-6 mb-2">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-sm text-foreground/90 leading-relaxed my-3">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 space-y-1.5 my-3 text-sm text-foreground/90 marker:text-muted-foreground">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 space-y-1.5 my-3 text-sm text-foreground/90 marker:text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-foreground/90">{children}</em>,
  hr: () => <hr className="my-8 border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/40 pl-4 my-4 italic text-foreground/80">
      {children}
    </blockquote>
  ),
  code: ({ children, ...props }) => {
    const isInline = !("data-language" in props);
    if (isInline) {
      return (
        <code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-[0.85em] font-mono">
          {children}
        </code>
      );
    }
    return <code className="font-mono text-xs">{children}</code>;
  },
  pre: ({ children }) => (
    <pre className="my-4 p-4 rounded-lg bg-muted/60 border border-border overflow-x-auto text-xs leading-relaxed">
      {children}
    </pre>
  ),
  a: ({ href, children }) => {
    if (isInternalHref(href)) {
      return (
        <Link
          to={href as string}
          className="text-primary underline-offset-4 hover:underline font-medium"
        >
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline-offset-4 hover:underline font-medium inline-flex items-center gap-0.5"
      >
        {children}
        <ExternalLinkIcon className="h-3 w-3 inline-block opacity-70" />
      </a>
    );
  },
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-border last:border-0">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="text-left font-semibold text-foreground px-3 py-2 text-xs uppercase tracking-wide">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 align-top text-foreground/90">{children}</td>
  ),
};

export default function Training() {
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = useCallback(() => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 200);
  }, []);

  const handleDownload = useCallback(() => {
    const blob = new Blob([trainingMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ops-terminal-training.md";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <AppLayout pageTitle="Training">
      <div className="max-w-3xl mx-auto py-6 px-4 sm:px-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <GraduationCap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Ops Terminal Training</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Onboarding guide for new team members. Read end-to-end once, then keep open as a reference.
              </p>
            </div>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5">
              <Download className="h-4 w-4" />
              Download .md
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5" disabled={isPrinting}>
              <Printer className="h-4 w-4" />
              {isPrinting ? "Preparing…" : "Print"}
            </Button>
          </div>
        </div>

        <Card className="p-6 sm:p-8">
          <article>
            <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
              {trainingMarkdown}
            </ReactMarkdown>
          </article>
        </Card>
      </div>
    </AppLayout>
  );
}
