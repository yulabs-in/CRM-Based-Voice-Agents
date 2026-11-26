# Matrimony Consultant voice agent

A third voice agent, next to YULabs Insurance and Stock Market Advisory.

| | |
|---|---|
| Sarvam agent | `Matrimony-C-f229c028-342e` ("Matrimony Consultant — India"), committed **v1** on 26 Nov 2026 |
| CRM | `voice_agents` row "Matrimony Consultant" in every workspace (migration `0030_matrimony_consultant_agent.sql`) |
| Script copy | `public.matrimony_consultant_script()` (CRM uses `{var}`, Sarvam `{{var}}`) |
| Persona | Meera (`agent_name`), a female matrimonial relationship consultant |
| Languages | English, Hindi, Marathi, Telugu |
| Max call | 480 s |
| Silence | 10 s "Hello, are you there?", 10 s goodbye, then the call ends |

## What it does

Explains the platform, registration and membership; asks one question at a time (bride or groom, for whom,
age, city, education, profession, partner preferences, community/language only if they raise it, free or
premium); answers the usual questions (free registration, genuine profiles, community filters, parents creating
profiles, deleting a profile, privacy, no guarantee of marriage); handles concerns; and, only when the person is
genuinely interested and agrees, notes a lead (name, city, registration help, callback time, optional email).

It never asks for OTPs, passwords, PINs, card or bank details, Aadhaar or payments, never invents prices or
benefits, and hands over to a person for payment/refund complaints, fake profiles or fraud, privacy or security
concerns, complex technical issues, or anything not in the company facts.

Works for **outbound** callbacks to leads (default, `call_direction = outbound`) and **inbound** calls
(`call_direction = inbound` uses the "Welcome to … How may I help you with your partner search?" opening).

## Before using it with real customers: fill in the company facts

They start empty on purpose, so the agent says "our matrimony service" and "the team will share the plans and
pricing". On the **Voice Agents** page, set these `agent_variables` (fixed values start with `=`):

| Variable | Example |
|---|---|
| `company_name` | `=Shubh Vivah Matrimony` |
| `membership_plans` | `=Free: create profile, browse matches. Gold (3 months): contact 50 profiles, chat. Platinum (6 months): unlimited contacts, relationship manager.` |
| `pricing_details` | `=Gold ₹2,999 for 3 months. Platinum ₹5,999 for 6 months. No offers running.` |
| `free_features` | `=Free profile, browse and shortlist matches, send interests.` |
| `verification_process` | `=Mobile number verified by OTP on the website; ID verification badge optional.` |
| `company_website` | `=www.example.com` |
| `support_hours` | `=Mon–Sat, 9 am to 7 pm` |
| `agent_name` | `=Meera` (change the persona's name here) |

Only approved, current facts: the agent repeats them to customers word for word.

## What comes back after each call

`disposition` (interested, registration_help, callback, escalated, not_interested, do_not_call, wrong_person,
busy, no_answer), `summary`, `customer_name`, `city`, `looking_for`, `profile_for`, `candidate_age`, `education`,
`profession`, `partner_preferences`, `community_language_preference`, `membership_interest`, `interest_level`
(hot/warm/cold), `email`, `follow_up_time`, `next_action`, `objections`, `consent_to_contact`, `escalation_reason`.

The CRM sync treats `registration_help` like a booked consultation (lead qualified, deal moves to proposal).

## Inbound calls

Taking calls on a business number is issue #19 (inbound calls). Until that lands, the agent is used for
outbound calls and campaigns; the inbound opening is ready for when it does.

## Changing the script

Edit on Sarvam (or through the Sarvam MCP), commit a new version, copy the committed text into a new migration
with `{{var}}` → `{var}`, and raise `voice_agents.sarvam_app_version`.
