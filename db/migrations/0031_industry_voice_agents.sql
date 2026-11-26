-- 0031_industry_voice_agents.sql: eight industry voice agents, created and committed (v1) on Sarvam on
-- 26 Nov 2026 through the Sarvam Voice Agents MCP. Same pattern as the insurance, stock and matrimony agents:
-- female persona on the same voice, English/Hindi/Telugu/Tamil/Kannada/Marathi, business facts as variables that
-- start EMPTY (the agents never invent prices, offers or policies), 10 s silence nudges, never ask for OTPs, PINs,
-- cards, Aadhaar or payments, escalate to a person when needed.
--
-- The full scripts live on Sarvam (source of truth). `instructions` here is a short summary of each; open the
-- agent on Sarvam (ids below) for the complete text. See docs/features/industry-voice-agents.md.
--
-- Each agent is added to every workspace, with contact fields mapped and fixed facts left as "=" (empty) until filled
-- on the Voice Agents page.

insert into public.voice_agents (
  organization_id, name, purpose, language, status,
  sarvam_agent_id, sarvam_app_version, sarvam_connection_id, sarvam_agent_phone_number,
  greeting, greeting_no_name, instructions, agent_variables, created_by
)
select o.id, a.name, a.purpose, 'en-IN', 'active',
       a.sarvam_agent_id, 1, '614a33c8-31-e56314c0-c598', '+918064269483',
       'Hello! Am I speaking with {customer_name}?', a.greeting_no_name, a.instructions, a.agent_variables, null
from public.organizations o
cross join (values
  ('Real Estate Advisor', 'sales', 'Real-Estate-e2c00180-d617',
   'Hello! I''m calling about the property you had enquired about. Is this a good time to talk?',
   'Kavya, property advisor. Understands property type, location, budget, purpose and possession timeline; shares only approved projects, prices and locations; books site visits. Never invents prices, availability, approvals or returns; legal/title/RERA/loan questions go to the sales manager. Outputs: disposition (interested, site_visit_booked, callback, escalated, not_interested, do_not_call, wrong_person, busy, no_answer), summary, property_type, preferred_location, budget, purpose, possession_timeline, site_visit_time, follow_up_time, next_action, objections, escalation_reason.',
   jsonb_build_object('customer_name', 'full_name', 'city', 'city', 'lead_interest', 'custom.interest', 'agent_name', '=Kavya',
     'company_name', '=', 'projects', '=', 'price_ranges', '=', 'locations', '=', 'site_visit_slots', '=', 'business_hours', '=')),
  ('Hospital Front Desk', 'support', 'Hospital-Fr-8a748167-13cb',
   'Hello! I''m calling from the hospital front desk. Is this a good time to talk?',
   'Anjali, hospital front desk. Books and reschedules appointment requests, gives appointment reminders (call_purpose = appointment_reminder with appointment_details), answers timings, departments, fees and address from the facts. Never gives medical advice; emergencies are told to call 108 or come to emergency. Never confirms a slot itself. Outputs: disposition (appointment_requested, appointment_confirmed, appointment_rescheduled, appointment_cancelled, enquiry_answered, callback, escalated, emergency_redirected, not_interested, do_not_call, wrong_person, busy, no_answer), summary, patient_name, patient_age, department, preferred_slot, visit_type, follow_up_time, next_action, escalation_reason.',
   jsonb_build_object('customer_name', 'full_name', 'call_purpose', 'custom.call_purpose', 'appointment_details', 'custom.appointment_details', 'agent_name', '=Anjali',
     'company_name', '=', 'departments_doctors', '=', 'hospital_timings', '=', 'consultation_fees', '=', 'address', '=', 'emergency_number', '=')),
  ('Admissions Counsellor', 'sales', 'Admissions--5a5bf9e9-60ef',
   'Hello! I''m calling about the course you had enquired about. Is this a good time to talk?',
   'Riya, admissions counsellor. Talks to students or parents, explains approved courses, fees, batches and admission steps, books counselling sessions. Never promises results, ranks or placements, or invents fees and scholarships. Outputs: disposition (interested, counselling_booked, callback, escalated, not_interested, do_not_call, wrong_person, busy, no_answer), summary, caller_role, student_name, course_interest, current_education, mode_preference, counselling_time, follow_up_time, next_action, objections, escalation_reason.',
   jsonb_build_object('customer_name', 'full_name', 'lead_interest', 'custom.interest', 'agent_name', '=Riya',
     'company_name', '=', 'courses', '=', 'fees', '=', 'batch_timings', '=', 'admission_process', '=', 'address', '=')),
  ('Car Dealership Assistant', 'sales', 'Car-Dealers-d116bef4-4a68',
   'Hello! I''m calling from the dealership about the vehicle you had enquired about. Is this a good time to talk?',
   'Sneha, dealership assistant. Sales enquiries (model, fuel, budget, timeline, exchange, finance), test drive booking, quotation follow-up (call_purpose = quotation_follow_up) and service booking (call_purpose = service_booking). Never invents on-road prices, discounts, EMIs, exchange values or delivery dates; price negotiation goes to the advisor. Outputs: disposition (interested, test_drive_booked, service_booked, callback, escalated, not_interested, do_not_call, wrong_person, busy, no_answer), summary, model_interest, budget, purchase_timeline, finance_needed, exchange_vehicle, appointment_time, vehicle_number, follow_up_time, next_action, objections, escalation_reason.',
   jsonb_build_object('customer_name', 'full_name', 'call_purpose', 'custom.call_purpose', 'lead_interest', 'custom.interest', 'agent_name', '=Sneha',
     'company_name', '=', 'models', '=', 'price_ranges', '=', 'current_offers', '=', 'service_info', '=', 'showroom_address', '=')),
  ('Travel Planner', 'sales', 'Travel-Plan-ec27cd2b-6415',
   'Hello! I''m calling about the trip you had enquired about. Is this a good time to talk?',
   'Pooja, travel planner. Collects destination, dates, travellers, trip type, budget, departure city and hotel preference; shares only approved packages, prices and inclusions; passes a complete request for a quotation and itinerary. Never invents prices, availability, timings or visa rules. Outputs: disposition (interested, quote_requested, callback, escalated, not_interested, do_not_call, wrong_person, busy, no_answer), summary, destination, travel_dates, travellers, trip_type, budget, departure_city, hotel_preference, follow_up_time, next_action, objections, escalation_reason.',
   jsonb_build_object('customer_name', 'full_name', 'lead_interest', 'custom.interest', 'agent_name', '=Pooja',
     'company_name', '=', 'packages', '=', 'price_ranges', '=', 'inclusions', '=', 'booking_policy', '=', 'business_hours', '=')),
  ('E-commerce Support', 'support', 'E-commerce--eb459771-dd53',
   'Hello! I''m calling from customer support about your recent order. Is this a good time to talk?',
   'Nisha, e-commerce support. Order status only when order_status is passed for the call (otherwise takes the order ID and raises a ticket), product questions, delivery updates, returns per policy, complaints and feedback. Never pretends to look up, cancel or refund an order; refunds, damaged or wrong items, payment and fraud issues are escalated. Outputs: disposition (resolved, ticket_raised, return_requested, complaint, callback, escalated, do_not_call, wrong_person, busy, no_answer), summary, issue_type, order_id, product_name, sentiment, feedback_rating, follow_up_time, next_action, escalation_reason.',
   jsonb_build_object('customer_name', 'full_name', 'call_purpose', 'custom.call_purpose', 'order_reference', 'custom.order_id', 'order_status', 'custom.order_status', 'agent_name', '=Nisha',
     'company_name', '=', 'product_info', '=', 'delivery_info', '=', 'return_policy', '=', 'support_contact', '=')),
  ('Loan Assistant', 'sales', 'Loan-Assist-9e6a2051-75ec',
   'Hello! I''m calling from the loan team. Is this a good time to talk?',
   'Divya, loan assistant for a regulated lender. Loan enquiries, application status (from account_context) and polite EMI reminders. Fair practice: identifies herself and the company, shares details only with the customer, reasonable hours, never threatens or mentions family/employer/legal action, never promises approval, never collects payments (official channels only), warns about upfront-fee and OTP scams; hardship and disputes are escalated. Outputs: disposition (interested, application_assistance, status_shared, payment_promised, already_paid, callback, escalated, not_interested, do_not_call, wrong_person, busy, no_answer), summary, loan_type, loan_amount, employment_type, promised_payment_date, follow_up_time, next_action, objections, escalation_reason.',
   jsonb_build_object('customer_name', 'full_name', 'call_purpose', 'custom.call_purpose', 'lead_interest', 'custom.interest', 'account_context', 'custom.account_context', 'agent_name', '=Divya',
     'company_name', '=', 'loan_products', '=', 'interest_rate_info', '=', 'eligibility_info', '=', 'documents_required', '=', 'payment_channels', '=', 'grievance_contact', '=')),
  ('Hotel & Restaurant Reservations', 'support', 'Hotel---Res-794ec65e-108b',
   'Hello! I''m calling from reservations. Is this a good time to talk?',
   'Asha, reservations host. Room and table reservation requests (never confirms availability itself), booking confirmations (call_purpose = booking_confirmation with booking_details), menu/rooms/timings/address questions from the facts, and guest feedback. Complaints, billing, refunds and large events are escalated. Outputs: disposition (reservation_requested, booking_confirmed, booking_changed, booking_cancelled, enquiry_answered, feedback_given, complaint, callback, escalated, not_interested, do_not_call, wrong_person, busy, no_answer), summary, reservation_type, reservation_date, guests, room_or_seating, special_requests, feedback_rating, feedback_comments, follow_up_time, next_action, escalation_reason.',
   jsonb_build_object('customer_name', 'full_name', 'call_purpose', 'custom.call_purpose', 'booking_details', 'custom.booking_details', 'agent_name', '=Asha',
     'company_name', '=', 'venue_type', '=', 'room_types_rates', '=', 'menu_highlights', '=', 'timings', '=', 'cancellation_policy', '=', 'address', '='))
) as a(name, purpose, sarvam_agent_id, greeting_no_name, instructions, agent_variables)
where not exists (
  select 1 from public.voice_agents v where v.organization_id = o.id and v.sarvam_agent_id = a.sarvam_agent_id
);
