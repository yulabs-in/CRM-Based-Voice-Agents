# Sales operations: orders, KYC, payments, renewals, hierarchy, reports

This covers the AI call silence handling, sales orders, client KYC from calls, the payments dashboard,
the Manager > Team Lead > Sales Rep hierarchy, renewal reminders and the Reports page.

## 1. Apply the migrations (in this order, each on its own)

| File | What it does |
|---|---|
| `db/migrations/0020_sales_hierarchy.sql` | Adds the `team_lead` role and `memberships.reports_to` (with loop and same-workspace checks). **Run it alone.** Postgres won't let a new enum value be used in the transaction that adds it. |
| `db/migrations/0021_sales_orders_kyc_payments.sql` | `sales_orders`, `payments`, `client_kyc`, `renewal_reminders`, order numbers (`SO-00001` per workspace), `amount_paid` kept in sync with payments, RLS, realtime, and a daily pg_cron job at 09:00 IST that creates renewal reminder tasks. |
| `db/migrations/0022_insurance_script_v3.sql` | Updates the CRM's copy of the insurance agent script (silence handling, KYC with consent, order capture). |

`0019` is taken by the notifications PR (#14).

The app keeps working before these are applied. KYC and order capture in the call sync never fails the
lead/deal update; it just logs `KYC not saved: …`. The new pages show empty lists until then.

## 2. Update the live Sarvam agent (needed for the call changes)

The agent runs on Sarvam, not in the CRM. Migration 0022 only updates the CRM's copy. On agent
`YULabs-Insu-13e07aa4-48c0`:

1. **Script:** paste `public.yulabs_insurance_script()` from 0022, changing `{var}` to `{{var}}`.
2. **Output variables:** add `order_confirmed`, `order_plan`, `order_insurer`, `order_sum_insured`,
   `order_budget`, `order_payment_frequency`, `kyc_consent`, `kyc_full_name`, `kyc_dob`, `kyc_email`,
   `kyc_address`, `kyc_city`, `kyc_pincode`, `kyc_nominee_name`, `kyc_nominee_relation`, `kyc_pan`.
3. **Silence settings:** the script tells the agent to wait, ask "are you there?" after about 10 seconds,
   and close politely after about 10 more. The agent can only follow that if the platform doesn't hang up
   first. In the agent's call/interaction settings, set the user-silence (inactivity) timeout to about
   **10 seconds with a re-prompt**, allow **at least 2 re-prompts**, and make sure any "end call on
   silence" limit is **at least 25–30 seconds**. Setting names differ between Sarvam versions; look for
   silence, inactivity or no-input timeouts.
4. **Commit a new version**, then set `voice_agents.sarvam_app_version` to it (Voice Agents page or SQL).
5. Place a test call and stay silent: you should hear "Hello, are you there?" once, then a polite goodbye.
   The call should end as `no_answer` (or `callback` if you had spoken).

## 3. What happens on a call

- **Silence:** never hangs up on the first pause. One "are you there?", then a polite close.
- **Order request:** if the customer wants to go ahead, the agent notes plan, insurer, cover, budget and
  payment frequency. The CRM creates a **draft sales order** (`source = ai_call`, one per call) linked to
  the contact and deal. The agent still never quotes a premium or takes payment.
- **KYC:** only after the customer agrees to go ahead **and** gives consent. It collects name, date of
  birth, email, address + pincode, nominee, and optionally PAN. Dates, emails, pincodes and amounts
  ("5 lakh") are cleaned up (`src/lib/call-capture.ts`).
- **PAN** is masked (`ABCxxxxx4F`) as soon as answers arrive from Sarvam, so the full number is never
  stored in `calls.answers` or `client_kyc`. Note: Sarvam's own transcript and recording still contain
  whatever was said on the call.
- KYC details are kept out of the one-line call summary shown around the app.
- A KYC record staff have marked **Verified** is never overwritten by a later call.

## 4. Pages

| Page | Route | Who |
|---|---|---|
| Sales Orders | `/sales-orders` | Everyone reads; sales roles create and edit. Click a row for payments, recording a payment, owner and KYC status. |
| Payments | `/payments` | Collected / outstanding / overdue, collections per month, by mode, and the "needs payment" queue. |
| Client KYC | `/kyc` | Sales roles only (owner, admin, sales manager, team lead, sales rep). |
| Renewals | `/renewals` | Policies ending in the next 30/90 days or lapsed. **AI call** dials a renewal call (track B, with insurer and end date). **Renew** creates next year's draft order and stops reminders. |
| Reports | `/reports` | Sales, Payments, Calls, KYC and Team tabs, with a period and team filter, and CSV export per tab. |
| Team Management | `/team` | Admins set "reports to" for each member. The list shows the tree. |
| Overview | `/dashboard` | New "Sales & payments" strip. |

**Payment status** is calculated, not stored: `paid`, `partly paid`, `pending`, `overdue` (past
`payment_due_date`), or `premium not set`. Only the transaction reference (UTR/txn id) is recorded,
never card or bank numbers.

**Team filter:** Everyone, My team, a manager's or team lead's whole team (everyone under them), one
person, or Unassigned (orders from AI calls nobody has picked up yet).

**Renewal reminders:** an open task for the order owner 30, 15, 7 and 1 day before the policy ends, and
once when it lapses (high priority from 7 days). Run `select public.queue_renewal_reminders();` to
trigger it by hand.

## 5. Code map

- `src/lib/call-capture.ts`: answers → KYC / order, PAN masking (tests: `src/test/call-capture.test.ts`)
- `src/lib/sales-ops.ts`: payment state, renewals, hierarchy, leaderboard (tests: `src/test/sales-ops.test.ts`)
- `src/lib/sales-data.ts`: shared queries
- `src/lib/crm-sync.server.ts`: saves KYC and draft orders after each call
- `src/components/app/OrderSheet.tsx`, `TeamFilter.tsx`, `SalesOverview.tsx`
- `src/routes/_authenticated/_app/{sales-orders,payments,kyc,renewals,reports}.tsx`
