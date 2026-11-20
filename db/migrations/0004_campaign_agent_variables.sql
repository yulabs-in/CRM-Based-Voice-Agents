-- Which contact fields are sent to the Sarvam agent as variables, e.g.
-- {"customer_name": "full_name", "loan_amount": "custom.loan_amount"}.
-- Sarvam rejects cohorts containing variables the agent doesn't define, so this is explicit per campaign.
alter table public.call_campaigns add column agent_variables jsonb not null default '{}';
