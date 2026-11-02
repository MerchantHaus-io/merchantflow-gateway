/** True for activity types that represent an outbound email we can look up and view. */
export const isViewableEmailActivity = (type: string, description: string | null) =>
  type.startsWith("email_") && type !== "email_received" && type !== "email_failed" && /@/.test(description ?? "");
