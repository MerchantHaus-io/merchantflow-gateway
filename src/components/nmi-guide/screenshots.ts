// NMI Partner Portal Guide — Screenshot Data
// Images live in /public/nmi-guide/*.webp and are referenced by URL so they
// load lazily per-screenshot and stay out of the JS bundle.

export const SCREENSHOTS = {
  "home_dashboard": "/nmi-guide/home_dashboard.webp",
  "list_accounts": "/nmi-guide/list_accounts.webp",
  "merchant_details_full": "/nmi-guide/merchant_details_full.webp",
  "processing_services_vas": "/nmi-guide/processing_services_vas.webp",
  "merchant_details_top": "/nmi-guide/merchant_details_top.webp",
  "value_added_services_select": "/nmi-guide/value_added_services_select.webp",
  "custom_billing_modal": "/nmi-guide/custom_billing_modal.webp",
  "edit_merchant_billing_status": "/nmi-guide/edit_merchant_billing_status.webp",
  "edit_merchant_advanced_features": "/nmi-guide/edit_merchant_advanced_features.webp",
  "bulk_actions": "/nmi-guide/bulk_actions.webp",
  "bulk_update_fee_schedules": "/nmi-guide/bulk_update_fee_schedules.webp",
  "mass_enable_services": "/nmi-guide/mass_enable_services.webp",
  "add_merchant_type": "/nmi-guide/add_merchant_type.webp",
  "add_merchant_form": "/nmi-guide/add_merchant_form.webp",
} as const;

export type ScreenshotKey = keyof typeof SCREENSHOTS;
