// NMI Partner Portal Guide — Types & Static Data

export interface HotspotPin {
  id: string;
  x: string;
  y: string;
  label: number;
  title: string;
  description: string;
  tip: string;
}

export interface ScreenshotSection {
  key: string;
  label: string;
  pins?: HotspotPin[];
}

export interface WalkthroughStep {
  title: string;
  subtitle: string;
  text: string;
  actions: string[];
  tip: string;
  imageKey: string;
  highlight: { top: string; left: string; width: string; height: string; label: string };
}

export interface Walkthrough {
  id: string;
  title: string;
  icon: string;
  description: string;
  steps: WalkthroughStep[];
}

export interface SearchEntry {
  title: string;
  keywords: string;
  sectionId: string;
}

export type GuideMode = 'reference' | 'walkthroughs';

// ── WALKTHROUGHS ──────────────────────────────────────────────────────────────
export const WALKTHROUGHS: Walkthrough[] = [
  {
    id: 'add-merchant', title: 'Add a New Merchant', icon: '➕',
    description: 'Full onboarding from type selection to live account',
    steps: [
      {
        title: 'Go to Add Merchant', subtitle: 'My Accounts → Add Merchant',
        text: "You're about to onboard a new merchant to your portfolio, giving them a gateway account to start processing payments.",
        actions: ['Click My Accounts in the left sidebar', 'Click Add Merchant', 'The Select a Merchant Type page opens'],
        tip: "<strong>Permission check:</strong> Your user needs 'Manage merchant accounts.' If you don't see Add Merchant, ask your admin.",
        imageKey: 'home_dashboard',
        highlight: { top: '22%', left: '0%', width: '32%', height: '14%', label: 'My Accounts → Add Merchant' },
      },
      {
        title: 'Select: Standard', subtitle: 'Choose the right account type',
        text: 'For a real live merchant who will process payments, always choose Standard. Test is free and never charges anyone.',
        actions: ['Click the Standard card', 'Standard = full portal, all payment methods, all services', 'Test = sandbox, never charges — great for demos'],
        tip: '<strong>Test accounts are free</strong> and never bill anyone. Great for letting a new merchant try the portal first.',
        imageKey: 'add_merchant_type',
        highlight: { top: '28%', left: '5%', width: '37%', height: '55%', label: 'Click: Standard' },
      },
      {
        title: 'Fill in the Merchant Form', subtitle: 'Company info, contact, and username',
        text: 'Complete all three sections. Fields marked * are required.',
        actions: ['Company Name — what the merchant sees at login', 'Company Contact — receives the welcome email. Verify this email.', 'Primary Username — 4–32 chars, alphanumeric, globally unique', 'Click Continue'],
        tip: '<strong>Welcome email:</strong> Wrong email = merchant does not receive their login credentials.',
        imageKey: 'add_merchant_form',
        highlight: { top: '38%', left: '3%', width: '93%', height: '22%', label: 'Company Contact — verify email' },
      },
      {
        title: 'Add Processor, Fees & Submit', subtitle: 'Connect processor and go live',
        text: "Connect a processor using the merchant's VAR sheet, set fees, enter billing. Submit creates the live account instantly.",
        actions: ["Processor — credentials from merchant's VAR sheet (from their acquiring bank)", 'Account Classification — E-Commerce, Retail, MOTO, or Restaurant', 'Fee Schedule — preset or custom. Above buy rate = commission.', 'Click Submit — account created, welcome email sent'],
        tip: '<strong>VAR sheet:</strong> Merchant requests from their processor (First Data, TSYS, etc.). Cannot add live processor without it.',
        imageKey: 'merchant_details_full',
        highlight: { top: '60%', left: '2%', width: '96%', height: '20%', label: 'Processing Services' },
      },
    ],
  },
  {
    id: 'enable-vas', title: 'Enable a Value-Added Service', icon: '⭐',
    description: 'Turn on features like Fraud Prevention or Invoicing',
    steps: [
      {
        title: 'Open the Merchant Account', subtitle: 'List Accounts → click merchant name',
        text: 'Navigate to the merchant you want to add a service to. Everything is done from your partner portal.',
        actions: ['Go to My Accounts → List Accounts', 'Find the merchant (use the search box)', 'Click merchant name to open Merchant Details'],
        tip: '<strong>Shortcut:</strong> Home screen search bar searches all merchants by name instantly.',
        imageKey: 'list_accounts',
        highlight: { top: '43%', left: '15%', width: '60%', height: '10%', label: 'Click merchant name' },
      },
      {
        title: 'Click Update Services', subtitle: 'Open the VAS selection page',
        text: 'On Merchant Details, scroll to Value-added Services. Review statuses, then click Update Services.',
        actions: ['Scroll to Value-added Services on Merchant Details', 'Active = on. Offered = available, not enabled. Not Offered = unavailable.', 'Click Update Services (top right of that section)'],
        tip: '<strong>Free Trials:</strong> Many services have free trials. Activates immediately on Submit.',
        imageKey: 'processing_services_vas',
        highlight: { top: '33%', left: '65%', width: '29%', height: '8%', label: 'Update Services' },
      },
      {
        title: 'Enable & Submit', subtitle: 'Toggle on, always click Submit',
        text: 'Find the service, enable it. Always click Submit — nothing saves until you do.',
        actions: ['Find the service (e.g. Fraud Prevention, Customer Vault, Invoicing)', 'Click Start Free Trial, or change dropdown to Active', 'Click Submit at the bottom to save all changes'],
        tip: '<strong>No partial saves:</strong> All changes are saved together when you click Submit.',
        imageKey: 'value_added_services_select',
        highlight: { top: '82%', left: '2%', width: '22%', height: '10%', label: 'Click Submit to save' },
      },
    ],
  },
  {
    id: 'update-billing', title: 'Update Merchant Billing', icon: '🏦',
    description: 'Change the bank account fees are drawn from',
    steps: [
      {
        title: 'Find the Merchant', subtitle: 'List Accounts → click merchant name',
        text: 'Update the bank account gateway fees are drawn from — merchant changed banks, or fees are failing.',
        actions: ['Go to My Accounts → List Accounts', 'Find the merchant', 'Click name to open Merchant Details'],
        tip: '<strong>When to update:</strong> Fee collection failures suspend the merchant and stop your commissions. Fix immediately.',
        imageKey: 'list_accounts',
        highlight: { top: '43%', left: '15%', width: '60%', height: '10%', label: 'Click merchant name' },
      },
      {
        title: 'Click Edit on Billing Information', subtitle: 'Open the billing update form',
        text: 'Billing Information is on the left side of Merchant Details. Account number shows masked. Click Edit.',
        actions: ['Find Billing Information — left side, below Merchant Info', 'Account shown masked (e.g. ******9)', 'Click Edit next to Billing Information'],
        tip: '<strong>Warning:</strong> Invalid billing = merchant suspended, no commissions until fixed.',
        imageKey: 'merchant_details_top',
        highlight: { top: '30%', left: '2%', width: '46%', height: '22%', label: 'Billing Information → Edit' },
      },
      {
        title: 'Enter New Details & Save', subtitle: 'Fill in updated bank account info',
        text: 'Enter updated banking details. Verify account and routing numbers with the merchant before saving.',
        actions: ['Enter name, company, and address', 'Enter Account Number and Routing/ABA Number', 'Account Holder Type: Business or Personal', 'Account Type: Checking or Savings', 'Click Update Billing'],
        tip: "<strong>Bank statement:</strong> Fees appear as 'GATEWAY SERVICES — CO ID 4460522024'.",
        imageKey: 'custom_billing_modal',
        highlight: { top: '60%', left: '5%', width: '88%', height: '25%', label: 'Account & Routing fields' },
      },
    ],
  },
  {
    id: 'mass-enable', title: 'Mass Enable Services', icon: '⚡',
    description: 'Apply a service across multiple merchants at once',
    steps: [
      {
        title: 'Go to Bulk Actions', subtitle: 'List Accounts → Update Multiple Accounts',
        text: 'Apply a service to many merchants at once — far faster than updating individually.',
        actions: ['Go to My Accounts → List Accounts', 'Click Update Multiple Accounts (top right)', 'Click Mass Enable Services'],
        tip: '<strong>When to use:</strong> Any time you are enabling the same service for 5+ merchants.',
        imageKey: 'list_accounts',
        highlight: { top: '14%', left: '60%', width: '34%', height: '10%', label: 'Update Multiple Accounts' },
      },
      {
        title: 'Select the Service', subtitle: 'Choose which service to roll out',
        text: 'Use the dropdown to pick the service. One service per bulk operation.',
        actions: ['Click the service dropdown', 'Select: Authvia TXT2PAY, Auto Card Updater, Customer Vault, Fraud Prevention, Invoicing, Kount, Mobile Payments, or Shopify', 'A list of eligible merchants appears'],
        tip: '<strong>One at a time:</strong> Run separate operations for multiple services.',
        imageKey: 'mass_enable_services',
        highlight: { top: '12%', left: '2%', width: '86%', height: '18%', label: 'Select service' },
      },
      {
        title: 'Select Accounts & Submit', subtitle: 'Choose merchants then confirm',
        text: 'Select merchants, review carefully, then submit. No undo available.',
        actions: ['Check individual merchants, or tick Accounts at top to select all', 'Review selection — verify these are the right merchants', 'Click Submit to apply immediately'],
        tip: '<strong>No undo:</strong> Double-check before submitting.',
        imageKey: 'mass_enable_services',
        highlight: { top: '38%', left: '2%', width: '88%', height: '52%', label: 'Select accounts then Submit' },
      },
    ],
  },
  {
    id: 'change-status', title: 'Change Merchant Status', icon: '🔄',
    description: 'Set Active, Restricted, or Closed',
    steps: [
      {
        title: 'Find the Merchant', subtitle: 'List Accounts → click merchant name',
        text: 'Navigate to the merchant whose status needs changing. Status controls access and billing.',
        actions: ['Go to My Accounts → List Accounts', 'Status badge shows current state', 'Click name to open Merchant Details'],
        tip: '<strong>Common reasons:</strong> Restrict for suspicious activity. Close when no longer processing.',
        imageKey: 'list_accounts',
        highlight: { top: '43%', left: '27%', width: '13%', height: '10%', label: 'Click merchant name' },
      },
      {
        title: 'Find Merchant Status Section', subtitle: 'Right side of Merchant Details',
        text: 'Merchant Status is on the right side. Shows current status, definitions, and a full history log.',
        actions: ['Scroll to Merchant Status on the right side', 'Review: Active, Restricted, Closed, Deleted definitions', 'Click Edit next to Merchant Status'],
        tip: '<strong>Remember:</strong> Closed keeps your reporting access. Deleted removes from reports.',
        imageKey: 'edit_merchant_billing_status',
        highlight: { top: '5%', left: '52%', width: '46%', height: '62%', label: 'Merchant Status section' },
      },
      {
        title: 'Select Status & Save', subtitle: 'Change is immediate',
        text: 'Select new status from the dropdown. Takes effect immediately and is logged in History.',
        actions: ['Click the Select a Status dropdown', 'Active = full. Restricted = no processing. Closed = no login. Deleted = removed from reports.', 'Click Save — effective immediately'],
        tip: '<strong>Reversible?</strong> Active/Restricted/Closed can switch freely. Deleted is effectively permanent.',
        imageKey: 'edit_merchant_billing_status',
        highlight: { top: '46%', left: '52%', width: '38%', height: '10%', label: 'Select a Status dropdown' },
      },
    ],
  },
];

// ── SEARCH INDEX ──────────────────────────────────────────────────────────────
export const SEARCH_INDEX: SearchEntry[] = [
  { title: 'Dashboard', keywords: 'home dashboard tiles navigation accounts reporting services account id', sectionId: 's1' },
  { title: 'List Accounts', keywords: 'list accounts search filter sign in export csv excel bulk update multiple', sectionId: 's2' },
  { title: 'Add Merchant', keywords: 'add merchant standard mobile test onboard username company contact var sheet processor', sectionId: 's3' },
  { title: 'Add Affiliate', keywords: 'add affiliate sub affiliate form contact welcome email', sectionId: 's4' },
  { title: 'Merchant Details', keywords: 'merchant details gateway id contact billing users advanced features status processing services fee schedule', sectionId: 's5' },
  { title: 'Editing a Merchant', keywords: 'edit merchant billing advanced features surcharge tips receipt routing quickclick duplicate', sectionId: 's6' },
  { title: 'Merchant Status', keywords: 'status active restricted closed deleted history audit change suspend', sectionId: 's7' },
  { title: 'Processing Services', keywords: 'processing credit card ach echeck cash processor var sheet classification ecommerce retail moto restaurant', sectionId: 's8' },
  { title: 'Value-Added Services', keywords: 'customer vault fraud prevention card updater authvia invoicing kount mobile shopify level III payer authentication encrypted', sectionId: 's9' },
  { title: 'VAMP Guidance', keywords: 'vamp visa acquirer monitoring fraud chargeback threshold penalty', sectionId: 's10' },
  { title: 'Transactions', keywords: 'transactions snapshot search void receipt approval rate decline fraud background run report', sectionId: 's11' },
  { title: 'Commissions', keywords: 'commissions residuals buy rate monthly earnings 22nd affiliate id discrepancy', sectionId: 's12' },
  { title: 'Billing Reports', keywords: 'billing reports invoices charges gateway services bank statement tuesday friday monthly', sectionId: 's13' },
  { title: 'Service Prices', keywords: 'service prices cost schedule fee schedule manager buy rate margin overview', sectionId: 's16' },
  { title: 'Bulk Actions', keywords: 'bulk actions mass enable update fee schedules multiple merchants portfolio', sectionId: 's-bulk' },
  { title: 'Account Information', keywords: 'account information contact types billing support emergency marketing risk email preferences', sectionId: 's21' },
  { title: 'Look and Feel', keywords: 'look feel colours logo icon header white label branding customise portal', sectionId: 's22' },
  { title: 'Users Permissions', keywords: 'users permissions admin sub-user manage merchants affiliates transaction commission billing 2FA password reset', sectionId: 's26' },
  { title: 'Security Keys', keywords: 'security keys api integration boarding ip restrict programmatic', sectionId: 's27' },
  { title: 'Two-Factor Auth', keywords: 'two factor 2FA QR code authenticator 6 digit october 2025 required', sectionId: 's29' },
  { title: 'Contact Support', keywords: 'contact support documentation nmi email phone 847 affiliate id', sectionId: 's31' },
  { title: 'Processor Matrix', keywords: 'processor matrix certified countries currencies card updater apple pay ecommerce retail moto', sectionId: 'help-matrix' },
  { title: 'Screenshots Needed', keywords: 'screenshots priority capture next pages needed', sectionId: 'screenshots-needed' },
];
