

# Add Document Classification Tool to Atria

## What
Give Atria a new `classify_document` tool that opens any uploaded file (PDF, JPG, PNG, DOC, DOCX), analyzes its content using AI vision/extraction, and returns a classification label plus confidence score. Atria can then auto-relabel the document in the CRM.

## Why
Currently document labeling relies on filename heuristics only. Users want Atria to look at the actual content of a file and determine what it is -- a bank statement, a voided check, a passport, etc. -- regardless of what the file is named.

## How

### 1. New tool definition: `classify_document`
Add to the `crmTools` array in `supabase/functions/ai-assistant/index.ts`:
- Name: `classify_document`
- Parameters: `document_id` (required), `auto_relabel` (optional boolean, default false)
- Description: Analyze a document's content and classify it into one of the standard CRM document types

### 2. Tool execution handler
In the `executeTool` switch, add a `classify_document` case that:

1. Fetches the document metadata (file_name, file_path, content_type) from the `documents` table
2. Generates a signed URL
3. Determines file type:
   - **Images** (JPG, PNG): Fetch binary, convert to base64, send as multimodal image to AI gateway
   - **PDFs**: Reuse the existing `parsePdfText` helper (signed URL with inline base64 fallback)
   - **DOC/DOCX**: Fetch binary, convert to base64, send to AI gateway for analysis (Gemini can process these via multimodal input)
4. Sends content to AI gateway (`google/gemini-3-flash-preview`) with a classification prompt that:
   - Lists the valid labels: Bank Statement, Processing Statement, Voided Check, Bank Confirmation Letter, Articles of Organization, EIN / Tax Document, Passport/Drivers License, Business License, Lease Agreement, Transaction History, VAR/Tear Sheet, Signed Agreement, Other
   - Uses tool calling to return structured output: `{ label, confidence, reasoning }`
5. If `auto_relabel` is true, updates the document's `document_type` in the database
6. Returns the classification result to Atria so she can report it conversationally

### 3. System prompt update
Add a line to the ACTIONS section mentioning that Atria can classify/identify documents by content, not just filename. Instruct her to use `classify_document` when someone asks "what is this document" or "identify this file."

### 4. Supported file types
- `.pdf` -- Extract via existing PDF pipeline, classify extracted text
- `.jpg`, `.png` -- Send as base64 image for visual classification
- `.doc`, `.docx` -- Fetch binary, send as base64 document to Gemini (which supports these natively via multimodal)

### Files changed
- `supabase/functions/ai-assistant/index.ts` -- Add tool definition, execution handler, and system prompt update

