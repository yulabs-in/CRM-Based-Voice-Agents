# KYC documents and workspace owner verification

Migration: `db/migrations/0033_kyc_documents_and_owner_verification.sql`.

## Client KYC documents (Client KYC page → "KYC documents")

- Pick a client who has a KYC record, choose the document type (Aadhaar (masked), PAN, passport, driving licence,
  voter ID, photo, address proof, other) and upload a JPG, PNG, WebP or PDF up to 5 MB.
- Mark each document **Verified** or **Rejected** (who and when is stamped automatically).
- Files live in the **private** `kyc-documents` bucket at `{workspace}/clients/{client}/…` and open through a
  signed link that expires after 60 seconds.
- Access matches client KYC: owner, admin, sales manager, team lead and sales rep can view and upload; owner,
  admin and sales manager can delete.

## Workspace owner verification (sidebar → Workspace → Verification)

- The workspace owner enters their legal name, PAN and Aadhaar number and uploads the PAN card and Aadhaar front
  (back optional), then submits. A banner reminds the owner until it's submitted.
- **Stored as text: only the masked PAN (ABCxxxxx4F) and the last 4 Aadhaar digits.** PAN format and the Aadhaar
  Verhoeff check digit are validated in the browser. Full numbers exist only on the uploaded documents.
- Files live at `{workspace}/owner/…` in the same private bucket; only the owner and admins can open them, and
  only the owner can upload.
- Status: Not submitted → **Pending review** on submit → Verified or Needs changes. A database trigger makes any
  submission from the workspace "pending": nobody in a workspace can mark it verified. Reviewers (platform team)
  set the result with the service role:

```sql
update public.organization_verifications
set status = 'verified'            -- or 'rejected'
  , review_note = null             -- or what needs changing
where organization_id = '<workspace id>';
```

## Privacy notes

- Ask clients for a **masked Aadhaar** (first 8 digits hidden) wherever possible.
- The AI voice agents never collect documents or Aadhaar numbers on calls; documents are uploaded by your team.
