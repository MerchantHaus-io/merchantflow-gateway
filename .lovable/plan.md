

## Fix: Document Submission Uploads Failing Silently on Public Form

### Problem
Kip's document submission (March 18) created the application record successfully but **zero documents were saved**. The client-side file upload uses the anonymous Supabase client against the private `opportunity-documents` bucket. When storage rejects the upload, the error is silently swallowed — no toast, no feedback to the user.

### Root Cause
The `MerchantApply.tsx` public form uploads files client-side with `supabase.storage.upload()`, but the visitor has no auth session. The private bucket rejects the request. The code pattern `if (!storageError) { insert record }` means failures are invisible.

### Solution
Move document uploads to the **server-side edge function** (`submit-merchant-application`), which uses the service role key and can write to private storage.

### Steps

1. **Update `submit-merchant-application` edge function**
   - Accept base64-encoded file data in the request payload for document submissions
   - Upload files server-side using the service role client
   - Insert `application_documents` records server-side
   - Return upload results (success/failure count) in the response

2. **Update `MerchantApply.tsx` client code**
   - Convert selected files to base64 before submission
   - Include file data in the JSON payload sent to the edge function
   - Remove the client-side storage upload block for document submissions
   - Add a file size cap (e.g., 10MB total) with user feedback
   - Show error toasts if the server reports upload failures

3. **Add error visibility for all upload paths**
   - For processing applications (statement_docs, void_check_docs), apply the same server-side pattern or add visible error handling for client-side failures
   - Ensure users always see a toast if any file fails to upload

### Technical Details
- Files will be base64-encoded and sent as part of the JSON body to the edge function
- The edge function already has access to `SUPABASE_SERVICE_ROLE_KEY` for storage writes
- A reasonable payload limit of ~15MB covers most document uploads
- The `application_documents` table and storage paths remain unchanged

