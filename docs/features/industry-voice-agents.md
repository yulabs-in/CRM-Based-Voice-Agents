# Industry voice agents

Ten ready-made voice agents, one per industry. All run on Sarvam and are in every CRM workspace.

| # | Industry | Agent (CRM name) | Persona | Sarvam id | Main jobs |
|---|---|---|---|---|---|
| 1 | Real estate | Real Estate Advisor | Kavya | `Real-Estate-e2c00180-d617` | Property enquiries, approved prices/locations, site visits, buyer follow-up |
| 2 | Insurance & finance | YULabs Insurance | Priya | `YULabs-Insu-13e07aa4-48c0` | Health/term/life/motor, requirements, advisor consultations, KYC, renewals (see `sales-ops.md`) |
| 3 | Matrimonial | Matrimony Consultant | Meera | `Matrimony-C-f229c028-342e` | Bride/groom requirements, membership, registration help (see `matrimony-agent.md`) |
| 4 | Hospitals | Hospital Front Desk | Anjali | `Hospital-Fr-8a748167-13cb` | Appointment requests, reminders, timings, general enquiries |
| 5 | Education | Admissions Counsellor | Riya | `Admissions--5a5bf9e9-60ef` | Courses and fees, admission enquiries, counselling sessions |
| 6 | Automobile | Car Dealership Assistant | Sneha | `Car-Dealers-d116bef4-4a68` | Models, test drives, quotation follow-up, service booking |
| 7 | Travel | Travel Planner | Pooja | `Travel-Plan-ec27cd2b-6415` | Packages, travel requirements, itinerary info, quote leads |
| 8 | E-commerce | E-commerce Support | Nisha | `E-commerce--eb459771-dd53` | Order status, product info, delivery, returns, complaints, feedback |
| 9 | Banking & NBFC | Loan Assistant | Divya | `Loan-Assist-9e6a2051-75ec` | Loan enquiries, EMI info, application status, payment reminders |
| 10 | Hotels & restaurants | Hotel & Restaurant Reservations | Asha | `Hotel---Res-794ec65e-108b` | Room and table reservations, menu/service questions, confirmations, feedback |

Agents 1 and 4–10 were created and committed (v1) on 26 Nov 2026 (migration `0031_industry_voice_agents.sql`).
The full script of each lives on Sarvam; the CRM row has a short summary.

## What every agent does the same way

- Female persona on the same voice; English, Hindi, Telugu, Tamil, Kannada, Marathi (matrimony: English, Hindi,
  Marathi, Telugu); replies in the caller's language.
- One question at a time, short turns, answers what was asked first, never re-asks.
- Silence: 10 s "Hello, are you there?", 10 s goodbye, then the call ends (`no_answer`/`callback`).
- **Business facts are variables that start empty.** Until filled, the agent says "our team will confirm" and never
  invents prices, offers, availability, timings or policies.
- Never asks for or accepts OTPs, passwords, PINs, card/CVV, bank details, Aadhaar or payments.
- Hands over to a person (`escalated` + `escalation_reason`) for complaints, refunds, disputes, requests for a
  human, or anything not in the facts.
- Honest that it's an AI assistant if asked.

## Sector-specific safeguards

- **Hospital:** never diagnoses or suggests medicines; emergencies (chest pain, breathing trouble, bleeding, stroke
  signs…) are told to call **108** or come to emergency (`emergency_redirected`). Never confirms a slot itself.
- **Banking/NBFC:** identifies itself and the lender, shares details only with the customer, reasonable hours,
  polite reminders only (no threats, no mention of family/employer/legal action), never promises approval, never
  collects payment, warns about upfront-fee/OTP scams, escalates hardship and disputes.
- **E-commerce:** can't see live orders. Shares status only if `order_status` is passed for the call, otherwise takes
  the order ID and raises a ticket. Never pretends to cancel or refund.
- **Hotel/restaurant:** can't see live availability; takes the request and the team confirms.
- **Admissions:** never promises results, ranks or placements.
- **Real estate / car dealership:** legal, title, RERA, loan approval and price negotiation go to a person.

## Before going live: fill the facts (Voice Agents page → agent_variables, values start with `=`)

| Agent | Variables to fill |
|---|---|
| Real Estate Advisor | `company_name`, `projects`, `price_ranges`, `locations`, `site_visit_slots`, `business_hours` |
| Hospital Front Desk | `company_name`, `departments_doctors`, `hospital_timings`, `consultation_fees`, `address`, `emergency_number` |
| Admissions Counsellor | `company_name`, `courses`, `fees`, `batch_timings`, `admission_process`, `address` |
| Car Dealership Assistant | `company_name`, `models`, `price_ranges`, `current_offers`, `service_info`, `showroom_address` |
| Travel Planner | `company_name`, `packages`, `price_ranges`, `inclusions`, `booking_policy`, `business_hours` |
| E-commerce Support | `company_name`, `product_info`, `delivery_info`, `return_policy`, `support_contact` |
| Loan Assistant | `company_name`, `loan_products`, `interest_rate_info`, `eligibility_info`, `documents_required`, `payment_channels`, `grievance_contact` |
| Hotel & Restaurant Reservations | `company_name`, `venue_type`, `room_types_rates`, `menu_highlights`, `timings`, `cancellation_policy`, `address` |

`agent_name` sets the persona's name (e.g. `=Kavya`).

## Per-call data (from the contact's custom fields)

Lead files and campaigns can pass these columns; they're mapped to the agents automatically:

| Column (custom field) | Used by |
|---|---|
| `call_purpose` | Hospital (`enquiry`, `appointment_reminder`, `follow_up`), Car (`sales_enquiry`, `quotation_follow_up`, `service_booking`), E-commerce (`support`, `delivery_update`, `return_follow_up`, `feedback`), Loan (`loan_enquiry`, `application_status`, `payment_reminder`), Hotel (`reservation_enquiry`, `booking_confirmation`, `feedback`) |
| `appointment_details` | Hospital reminders ("Dr Rao, Orthopaedics, 28 Nov 10:30 am") |
| `order_id`, `order_status` | E-commerce |
| `account_context` | Loan status and reminders ("EMI ₹8,450 due 5 Dec") |
| `booking_details` | Hotel confirmations |
| `interest` | Enquiry topic for all sales agents |

## How outcomes reach the CRM

- Bookings (`site_visit_booked`, `counselling_booked`, `test_drive_booked`, `service_booked`, `quote_requested`,
  `appointment_requested`, `reservation_requested`, `application_assistance`) qualify the lead and move the deal to
  **proposal**.
- Service and support outcomes (confirmed/rescheduled/cancelled bookings, `resolved`, `ticket_raised`,
  `return_requested`, `complaint`, `emergency_redirected`, `enquiry_answered`, `status_shared`, `payment_promised`,
  `already_paid`, `feedback_given`) only mark the contact as contacted; they never create or move a sales deal.
- `not_interested` / `do_not_call` behave as for the other agents.

## Not connected yet

The agents don't read live data from order, loan, booking or hospital systems. Pass what a call needs in the custom
fields above, or the agent takes the details and the team follows up.
