import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { confirmAutoEmail } from "@/components/EmailSendConfirm";

/**
 * When an opportunity moves to the "qualified" stage, send a
 * request-for-documents email to the contact with a link to /merchant-apply.
 */
export async function sendQualifiedDocsRequest(
  opportunityId: string,
  accountId: string,
  contactId: string
): Promise<void> {
  try {
    // Fetch account name
    const { data: account } = await supabase
      .from("accounts")
      .select("name")
      .eq("id", accountId)
      .single();

    // Fetch contact email & name
    const { data: contact } = await supabase
      .from("contacts")
      .select("email, first_name")
      .eq("id", contactId)
      .single();

    if (!contact?.email) {
      console.warn("No contact email for qualified docs request");
      return;
    }

    const { error } = await supabase.functions.invoke("send-qualified-docs-request", {
      body: {
        opportunity_id: opportunityId,
        account_name: account?.name || "Your Account",
        contact_email: contact.email,
        contact_first_name: contact.first_name || "",
      },
    });

    if (error) {
      console.error("Failed to send qualified docs request email:", error);
      return;
    }

    toast.success("Request for documents email sent to client");
  } catch (err) {
    console.error("Error sending qualified docs request:", err);
  }
}
