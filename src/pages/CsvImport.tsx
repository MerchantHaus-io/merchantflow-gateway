import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, FileSpreadsheet, Users } from "lucide-react";

interface CsvEntry {
  id: string;
  raw: Record<string, string>;
  accountName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  duplicateReasons: string[];
  selected: boolean;
}

interface ColumnMapping {
  account: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

const defaultMapping: ColumnMapping = {
  account: "company",
  firstName: "first_name",
  lastName: "last_name",
  email: "email",
  phone: "phone",
};

const CsvImport = () => {
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(defaultMapping);
  const [csvEntries, setCsvEntries] = useState<CsvEntry[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ imported: number; skipped: number; errors: number } | null>(null);
  const [existingAccounts, setExistingAccounts] = useState<Record<string, string>>({});
  const [existingContacts, setExistingContacts] = useState<{ email: Set<string>; phone: Set<string> }>(
    { email: new Set(), phone: new Set() },
  );
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    const loadExistingData = async () => {
      const { data: accounts } = await supabase.from("accounts").select("id, name");
      const { data: contacts } = await supabase.from("contacts").select("email, phone");

      const accountMap: Record<string, string> = {};
      accounts?.forEach((account) => {
        if (account.name) accountMap[account.name.toLowerCase()] = account.id;
      });
      const contactEmails = new Set<string>();
      const contactPhones = new Set<string>();
      contacts?.forEach((contact) => {
        if (contact.email) contactEmails.add(contact.email.toLowerCase());
        if (contact.phone) contactPhones.add(contact.phone.toLowerCase());
      });

      setExistingAccounts(accountMap);
      setExistingContacts({ email: contactEmails, phone: contactPhones });
    };

    loadExistingData();
  }, []);

  const parseCsv = (text: string) => {
    const [headerLine, ...rows] = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!headerLine) return;

    const parsedHeaders = headerLine.split(",").map((header) => header.trim());
    setHeaders(parsedHeaders);

    const entries: CsvEntry[] = rows.map((row, index) => {
      const cells = row.split(",");
      const raw = parsedHeaders.reduce<Record<string, string>>((acc, header, idx) => {
        acc[header] = cells[idx]?.trim() || "";
        return acc;
      }, {});

      const accountName = raw[columnMapping.account] || raw.company || "";
      const firstName = raw[columnMapping.firstName] || "";
      const lastName = raw[columnMapping.lastName] || "";
      const email = raw[columnMapping.email] || "";
      const phone = raw[columnMapping.phone] || "";

      const duplicateReasons: string[] = [];
      if (email && existingContacts.email.has(email.toLowerCase())) duplicateReasons.push("Email already exists");
      if (phone && existingContacts.phone.has(phone.toLowerCase())) duplicateReasons.push("Phone already exists");
      if (accountName && existingAccounts[accountName.toLowerCase()]) duplicateReasons.push("Account exists");

      return {
        id: `row-${index}`,
        raw,
        accountName,
        firstName,
        lastName,
        email,
        phone,
        duplicateReasons,
        selected: duplicateReasons.length === 0,
      };
    });

    setCsvEntries(entries);
    setSummary(null);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    parseCsv(text);
  };

  const toggleSelectAll = (checked: boolean) => {
    setCsvEntries((prev) => prev.map((entry) => ({ ...entry, selected: checked })));
  };

  const updateMapping = (field: keyof ColumnMapping, value: string) => {
    setColumnMapping((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (headers.length === 0) return;
    // Re-parse when mapping changes so derived fields stay in sync
    const syntheticCsv = [headers.join(","), ...csvEntries.map((entry) => headers.map((h) => entry.raw[h] || "").join(","))].join(
      "\n",
    );
    parseCsv(syntheticCsv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnMapping]);

  const selectedCount = useMemo(() => csvEntries.filter((entry) => entry.selected).length, [csvEntries]);

  const handleImport = async () => {
    setIsImporting(true);
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const entry of csvEntries) {
      if (!entry.selected) {
        skipped += 1;
        continue;
      }

      if (entry.duplicateReasons.length > 0) {
        skipped += 1;
        continue;
      }

      try {
        let accountId = entry.accountName ? existingAccounts[entry.accountName.toLowerCase()] : undefined;
        if (!accountId && entry.accountName) {
          const { data: createdAccount, error: accountError } = await supabase
            .from("accounts")
            .insert({ name: entry.accountName })
            .select()
            .single();
          if (accountError) throw accountError;
          accountId = createdAccount?.id;
          if (accountId) {
            setExistingAccounts((prev) => ({ ...prev, [entry.accountName.toLowerCase()]: accountId as string }));
          }
        }

        if (entry.email && existingContacts.email.has(entry.email.toLowerCase())) {
          skipped += 1;
          continue;
        }
        if (entry.phone && existingContacts.phone.has(entry.phone.toLowerCase())) {
          skipped += 1;
          continue;
        }

        const { error: contactError } = await supabase.from("contacts").insert({
          account_id: accountId || null,
          first_name: entry.firstName,
          last_name: entry.lastName,
          email: entry.email,
          phone: entry.phone,
        });

        if (contactError) throw contactError;

        imported += 1;
      } catch (error) {
        console.error(error);
        errors += 1;
      }
    }

    setSummary({ imported, skipped, errors });
    setIsImporting(false);
    toast.success("CSV import complete", {
      description: `${imported} imported, ${skipped} skipped, ${errors} errors`,
    });
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col overflow-hidden">
          <header className="flex h-16 items-center gap-2 border-b px-4 flex-shrink-0">
            <SidebarTrigger className="md:hidden" />
            <div>
              <p className="text-sm text-muted-foreground">Tools</p>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                CSV Import
              </h1>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 lg:p-6">
            <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Upload & validate</CardTitle>
                  <CardDescription>
                    Map your columns, check duplicates, and confirm the rows you want to import.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="csv">Upload CSV</Label>
                    <Input id="csv" type="file" accept=".csv" onChange={handleFileChange} />
                    <p className="text-xs text-muted-foreground">Headers should include contacts and company details.</p>
                  </div>

                  {headers.length > 0 && (
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1">
                        <Label>Account / Company</Label>
                        <Select
                          value={columnMapping.account}
                          onValueChange={(value) => updateMapping("account", value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {headers.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label>First name</Label>
                        <Select value={columnMapping.firstName} onValueChange={(value) => updateMapping("firstName", value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {headers.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label>Last name</Label>
                        <Select value={columnMapping.lastName} onValueChange={(value) => updateMapping("lastName", value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {headers.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label>Email</Label>
                        <Select value={columnMapping.email} onValueChange={(value) => updateMapping("email", value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {headers.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label>Phone</Label>
                        <Select value={columnMapping.phone} onValueChange={(value) => updateMapping("phone", value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {headers.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {csvEntries.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3 justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Preview</p>
                          <p className="text-xs text-muted-foreground">
                            Select the rows you want to import. Duplicates are flagged and skipped.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => toggleSelectAll(true)}>
                            Select all
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => toggleSelectAll(false)}>
                            Deselect all
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-lg border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10">Select</TableHead>
                              <TableHead>Contact</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Phone</TableHead>
                              <TableHead>Account</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {csvEntries.map((entry) => (
                              <TableRow key={entry.id}>
                                <TableCell>
                                  <Checkbox
                                    checked={entry.selected}
                                    onCheckedChange={(checked) =>
                                      setCsvEntries((prev) =>
                                        prev.map((item) =>
                                          item.id === entry.id ? { ...item, selected: Boolean(checked) } : item,
                                        ),
                                      )
                                    }
                                  />
                                </TableCell>
                                <TableCell className="font-medium">
                                  {[entry.firstName, entry.lastName].filter(Boolean).join(" ") || "Unknown"}
                                </TableCell>
                                <TableCell className="text-muted-foreground">{entry.email || "-"}</TableCell>
                                <TableCell className="text-muted-foreground">{entry.phone || "-"}</TableCell>
                                <TableCell>{entry.accountName || "Unassigned"}</TableCell>
                                <TableCell>
                                  {entry.duplicateReasons.length > 0 ? (
                                    <div className="flex flex-col gap-1">
                                      {entry.duplicateReasons.map((reason) => (
                                        <Badge key={reason} variant="destructive">
                                          {reason}
                                        </Badge>
                                      ))}
                                    </div>
                                  ) : (
                                    <Badge variant="secondary">Ready</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 justify-between">
                        <div className="text-sm text-muted-foreground">
                          {selectedCount} of {csvEntries.length} selected.
                        </div>
                        <Button onClick={handleImport} disabled={selectedCount === 0 || isImporting}>
                          {isImporting ? "Importing…" : "Import selected"}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>What gets created</CardTitle>
                    <CardDescription>Accounts and contacts are linked automatically when possible.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-primary/10 p-2 text-primary">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">Accounts</p>
                        <p className="text-sm text-muted-foreground">
                          Company names map to existing accounts or create new ones.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-primary/10 p-2 text-primary">
                        <Users className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">Contacts</p>
                        <p className="text-sm text-muted-foreground">Emails and phone numbers guard against duplicates.</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">Import summary</p>
                      {summary ? (
                        <ul className="list-disc pl-4 text-muted-foreground space-y-1">
                          <li>{summary.imported} imported</li>
                          <li>{summary.skipped} skipped</li>
                          <li>{summary.errors} errors</li>
                        </ul>
                      ) : (
                        <p className="text-muted-foreground">Run an import to see results.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Tips for clean imports</CardTitle>
                    <CardDescription>Format your CSV to speed up processing.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Include headers like first_name, last_name, email, phone, company.</li>
                      <li>Remove blank rows and keep one contact per line.</li>
                      <li>Use unique emails or phone numbers to prevent duplicates.</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </section>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default CsvImport;
