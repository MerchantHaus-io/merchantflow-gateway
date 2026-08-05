import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Copy, ExternalLink, Plug, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const APP_NAME = "The Ops Terminal";

function slugify(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
  const reserved = ["workspace", "computer-use", "claude-in-chrome", "claude-preview", "claude-browser"];
  if (!slug) return "lovable-app";
  return reserved.includes(slug) ? `${slug}-app` : slug;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(`${label} copied`);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          toast.error("Could not copy — select the text and copy manually");
        }
      }}
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      <span className="ml-2">{copied ? "Copied" : "Copy"}</span>
    </Button>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-2.5 pl-5 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <li key={i} className="leading-relaxed">
          {item}
        </li>
      ))}
    </ol>
  );
}

export default function Connect() {
  const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
  const mcpUrl = `https://${projectRef ?? "project-ref-unset"}.supabase.co/functions/v1/mcp`;
  const serverSlug = useMemo(() => slugify(APP_NAME), []);
  const claudeCommand = `claude mcp add --scope user --transport http ${serverSlug} '${mcpUrl.replace(/'/g, "'\\''")}'`;

  const claudeLink = `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(
    APP_NAME,
  )}&connectorUrl=${encodeURIComponent(mcpUrl)}`;

  return (
    <AppLayout pageTitle="Agent connections">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <header className="space-y-2">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Plug className="h-6 w-6 text-primary" />
              Connect an AI assistant to {APP_NAME}
            </h1>
            <p className="text-sm text-muted-foreground">
              Link ChatGPT, Claude, or another AI assistant to this app so it can look up merchant
              accounts, pipeline deals, support tickets, and tasks — and create tasks — on your
              behalf. You sign in with your own account, so the assistant only sees what you can see.
            </p>
          </header>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your connection URL</CardTitle>
              <CardDescription>
                Every assistant asks for this address. Copy it once and paste it into the steps below.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <code className="flex-1 overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs sm:text-sm">
                {mcpUrl}
              </code>
              <CopyButton value={mcpUrl} label="Connection URL" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connect</CardTitle>
              <CardDescription>Pick the assistant you use, then follow the steps.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="chatgpt">
                <TabsList className="flex w-full flex-wrap justify-start">
                  <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
                  <TabsTrigger value="claude">Claude</TabsTrigger>
                  <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
                  <TabsTrigger value="other">Other assistants</TabsTrigger>
                </TabsList>

                <TabsContent value="chatgpt" className="pt-4">
                  <Steps
                    items={[
                      <>
                        Open{" "}
                        <a
                          className="text-primary underline underline-offset-4"
                          href="https://chatgpt.com/#settings/Connectors/Advanced"
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          ChatGPT&nbsp;Apps settings
                          <ExternalLink className="ml-1 inline h-3 w-3" />
                        </a>{" "}
                        and turn on Developer mode (read the risk notice ChatGPT shows there). If it
                        isn't available, ask a ChatGPT admin to enable it for your workspace.
                      </>,
                      <>
                        Open the{" "}
                        <a
                          className="text-primary underline underline-offset-4"
                          href="https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins"
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          New plugin dialog
                          <ExternalLink className="ml-1 inline h-3 w-3" />
                        </a>
                        .
                      </>,
                      <>
                        Enter <strong>{APP_NAME}</strong> as the name and paste the connection URL
                        above into the URL field.
                      </>,
                      <>
                        Review the details, tick “I understand and want to continue” (ChatGPT shows
                        this warning for every custom connection), then click <strong>Create</strong>.
                      </>,
                      <>Sign in with your {APP_NAME} account when prompted and approve the request.</>,
                      <>
                        Enable the app from the chat composer, then ask ChatGPT to use it — for
                        example, “Using {APP_NAME}, show my open support tickets.”
                      </>,
                    ]}
                  />
                </TabsContent>

                <TabsContent value="claude" className="pt-4">
                  <Steps
                    items={[
                      <>
                        Open the{" "}
                        <a
                          className="text-primary underline underline-offset-4"
                          href={claudeLink}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          prefilled custom connector dialog
                          <ExternalLink className="ml-1 inline h-3 w-3" />
                        </a>{" "}
                        in Claude.
                      </>,
                      <>
                        Review the name and URL, then click <strong>Add</strong>.
                      </>,
                      <>
                        If the prefilled form doesn't open, go to Claude's Connectors page, choose{" "}
                        <strong>Add custom connector</strong>, name it {APP_NAME}, and paste the
                        connection URL above.
                      </>,
                      <>Sign in with your {APP_NAME} account when prompted and approve the request.</>,
                      <>
                        Enable the connector from the chat composer, then ask Claude to use it — for
                        example, “Using {APP_NAME}, find the account for SRR INC.”
                      </>,
                    ]}
                  />
                </TabsContent>

                <TabsContent value="claude-code" className="space-y-4 pt-4">
                  <p className="text-sm text-muted-foreground">
                    Claude Code connects with a single command — no settings screens.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <code className="flex-1 overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
                      {claudeCommand}
                    </code>
                    <CopyButton value={claudeCommand} label="Command" />
                  </div>
                  <Steps
                    items={[
                      <>Run the command above in a terminal.</>,
                      <>
                        Start Claude Code and run <code className="font-mono text-xs">/mcp</code> to
                        confirm {APP_NAME} is connected, signing in from that menu when asked.
                      </>,
                      <>Ask Claude Code to use {APP_NAME}.</>,
                    ]}
                  />
                </TabsContent>

                <TabsContent value="other" className="pt-4">
                  <Steps
                    items={[
                      <>Open your assistant's connector or remote server settings.</>,
                      <>Create a new remote connection.</>,
                      <>Name it {APP_NAME} and paste the connection URL above.</>,
                      <>Complete the sign-in and approval prompts with your {APP_NAME} account.</>,
                      <>Enable the connection, then ask the assistant to use {APP_NAME}.</>,
                    ]}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <RefreshCw className="h-4 w-4" />
                Refresh after we update the app
              </CardTitle>
              <CardDescription>
                Assistants remember what {APP_NAME} could do when you connected. After we ship
                changes, refresh the connection to pick them up.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="chatgpt-refresh">
                <TabsList className="flex w-full flex-wrap justify-start">
                  <TabsTrigger value="chatgpt-refresh">ChatGPT</TabsTrigger>
                  <TabsTrigger value="claude-refresh">Claude</TabsTrigger>
                  <TabsTrigger value="claude-code-refresh">Claude Code</TabsTrigger>
                  <TabsTrigger value="other-refresh">Other assistants</TabsTrigger>
                </TabsList>

                <TabsContent value="chatgpt-refresh" className="pt-4">
                  <Steps
                    items={[
                      <>Open ChatGPT's Plugins page and select {APP_NAME}.</>,
                      <>
                        Scroll to <strong>Information</strong> and click <strong>Refresh</strong>.
                      </>,
                      <>
                        ChatGPT can't change an existing URL — if the connection URL above has
                        changed, delete the app in Plugins and connect it again.
                      </>,
                      <>Start a new chat and ask ChatGPT to use {APP_NAME}.</>,
                    ]}
                  />
                </TabsContent>

                <TabsContent value="claude-refresh" className="pt-4">
                  <Steps
                    items={[
                      <>Open Claude's Connectors page and select {APP_NAME}.</>,
                      <>Refresh or update the connector.</>,
                      <>
                        Claude can't change an existing URL — if the connection URL above has changed,
                        remove the connector and add it again.
                      </>,
                      <>Ask Claude to use {APP_NAME}.</>,
                    ]}
                  />
                </TabsContent>

                <TabsContent value="claude-code-refresh" className="pt-4">
                  <Steps
                    items={[
                      <>Start a new Claude Code session — it reconnects and picks up the latest setup.</>,
                      <>
                        If the connection URL changed, run{" "}
                        <code className="font-mono text-xs">claude mcp remove {serverSlug}</code>,
                        then run the install command again.
                      </>,
                      <>Ask Claude Code to use {APP_NAME}.</>,
                    ]}
                  />
                </TabsContent>

                <TabsContent value="other-refresh" className="pt-4">
                  <Steps
                    items={[
                      <>Open your assistant's connector settings and select {APP_NAME}.</>,
                      <>Refresh, reload, or reconnect the connection.</>,
                      <>If the connection URL changed, paste the latest one from above.</>,
                      <>Start a new chat or session and ask the assistant to use {APP_NAME}.</>,
                    ]}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
