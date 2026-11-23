import { useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IMPORT_FIELDS, type CsvContact, type CsvField } from '@/lib/outreachCadence';

const groups: { title: string; fields: CsvField[] }[] = [
  { title: 'Contact & company', fields: ['first_name', 'last_name', 'company', 'email', 'job_title', 'website', 'linkedin'] },
  { title: 'Address & state', fields: ['address_street', 'address_city', 'address_state', 'address_state_code', 'address_zip', 'address_country', 'address_country_code'] },
  { title: 'Phone numbers', fields: ['phone', 'direct_phone', 'mobile_phone', 'contact_phone_numbers', 'company_primary_phone', 'company_phone_numbers'] },
  { title: 'Business & source context', fields: ['industry', 'sub_industry', 'employee_count', 'employee_range', 'reported_turnover', 'estimated_online_turnover', 'payment_providers', 'website_technology', 'company_description', 'email_quality', 'source_company_id', 'source_contact_id'] },
  { title: 'Assignment & timezone', fields: ['timezone', 'assignee'] },
];
export function CsvContactReview({ headers, mapping, onMapping, contacts, busy }: {
  headers: string[]; mapping: Record<CsvField, string>; onMapping: (mapping: Record<CsvField, string>) => void; contacts: CsvContact[]; busy: boolean;
}) {
  const [page, setPage] = useState(0);
  const maxPage = Math.max(0, Math.ceil(contacts.length / 10) - 1);
  const current = Math.min(page, maxPage);
  return <div className="min-w-0 space-y-5">
    <Accordion type="multiple" defaultValue={['Contact & company']}>
      {groups.map(group => <AccordionItem key={group.title} value={group.title}>
        <AccordionTrigger className="text-sm">{group.title}<span className="ml-auto mr-3 text-xs text-muted-foreground">{group.fields.filter(f => mapping[f]).length}/{group.fields.length} mapped</span></AccordionTrigger>
        <AccordionContent><div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">{group.fields.map(f => <div key={f} className="min-w-0">
          <Label htmlFor={`map-${f}`} className="text-xs">{IMPORT_FIELDS[f][0]}</Label>
          <Select disabled={busy} value={mapping[f] || '__none'} onValueChange={value => onMapping({ ...mapping, [f]: value === '__none' ? '' : value })}>
            <SelectTrigger id={`map-${f}`} aria-label={`Map ${IMPORT_FIELDS[f][0]}`} className="min-w-0 [&>span]:truncate"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__none">Not supplied</SelectItem>{headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
          </Select>
        </div>)}</div></AccordionContent>
      </AccordionItem>)}
    </Accordion>
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Contact preview</h3><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>{contacts.length ? current * 10 + 1 : 0}–{Math.min((current + 1) * 10, contacts.length)} of {contacts.length}</span><Button size="icon" variant="ghost" aria-label="Previous preview contacts" disabled={!current} onClick={() => setPage(current - 1)}><ChevronLeft /></Button><Button size="icon" variant="ghost" aria-label="Next preview contacts" disabled={current >= maxPage} onClick={() => setPage(current + 1)}><ChevronRight /></Button></div></div>
      <Accordion type="multiple">{contacts.slice(current * 10, (current + 1) * 10).map(row => <AccordionItem key={row.email} value={row.email}>
        <AccordionTrigger className="gap-3 text-left"><div className="min-w-0 flex-1"><p className="break-words text-sm">{[row.first_name, row.last_name].filter(Boolean).join(' ') || row.email} <span className="font-normal text-muted-foreground">· {row.company || 'No company'}</span></p><p className="break-all text-xs font-normal text-muted-foreground">{row.email}</p></div></AccordionTrigger>
        <AccordionContent><dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Company address</dt><dd className="break-words">{[row.address_street, row.address_city, row.address_state, row.address_state_code, row.address_zip, row.address_country, row.address_country_code].filter(Boolean).join(', ') || 'Not supplied'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Preferred calling number</dt><dd>{row.phone || 'Not supplied'}</dd></div>
          {(['direct_phone', 'mobile_phone', 'contact_phone_numbers', 'company_primary_phone', 'company_phone_numbers', 'website', 'linkedin', 'job_title', 'timezone', 'assignee', 'industry', 'sub_industry', 'employee_count', 'employee_range', 'reported_turnover', 'estimated_online_turnover', 'payment_providers', 'website_technology', 'company_description', 'email_quality', 'source_company_id', 'source_contact_id'] as CsvField[]).filter(f => row[f]).map(f => <div key={f} className={f === 'company_description' ? 'sm:col-span-2' : ''}><dt className="text-xs text-muted-foreground">{IMPORT_FIELDS[f][0]}</dt><dd className="break-words [overflow-wrap:anywhere]">{row[f]}</dd></div>)}
        </dl></AccordionContent>
      </AccordionItem>)}</Accordion>
      {!contacts.length && <p className="py-4 text-sm text-muted-foreground">No valid contacts in the current mapping.</p>}
    </div>
  </div>;
}