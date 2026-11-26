import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SeededWorkspace {
  orgId: string;
  orgName: string;
  userId: string;
  userEmail: string;
  insuranceAgentId: string;
  insuranceAgentName: string;
  stockAgentId: string;
  stockAgentName: string;
  contactId: string;
  contactPhone: string;
  contactName: string;
  admin: SupabaseClient;
  cleanup: () => Promise<void>;
}

function requireE2eEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required E2E environment variable: ${name}. See e2e/README.md.`);
  }
  return value;
}

export function createE2eAdminClient(): SupabaseClient {
  const url = requireE2eEnv("E2E_SUPABASE_URL");
  const prodUrl = process.env.PROD_SUPABASE_URL?.trim();
  if (prodUrl && url.replace(/\/+$/, "") === prodUrl.replace(/\/+$/, "")) {
    throw new Error("Refusing to run E2E tests against production Supabase URL!");
  }
  const serviceKey = requireE2eEnv("E2E_SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function seedTestWorkspace(suffix: string): Promise<SeededWorkspace> {
  const admin = createE2eAdminClient();
  const email = requireE2eEnv("E2E_USER_EMAIL");
  const password = requireE2eEnv("E2E_USER_PASSWORD");

  // Ensure the E2E user exists
  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 100 });
  let user = listed?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "E2E Test User" },
    });
    if (createErr || !created.user) {
      throw new Error(`Could not create E2E user: ${createErr?.message}`);
    }
    user = created.user;
  }

  const ts = `${Date.now()}-${suffix}`;
  const orgName = `E2E Workspace ${ts}`;
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: orgName,
      created_by: user.id,
      onboarding_completed: true,
      onboarding_step: 4,
    })
    .select("id")
    .single();

  if (orgErr || !org) {
    throw new Error(`Failed to seed E2E organization: ${orgErr?.message}`);
  }

  await admin.from("memberships").insert({
    organization_id: org.id,
    user_id: user.id,
    role: "owner",
  });

  const { data: insuranceAgent, error: insErr } = await admin
    .from("voice_agents")
    .insert({
      organization_id: org.id,
      name: `E2E Insurance Agent ${suffix}`,
      purpose: "insurance",
      status: "active",
      sarvam_agent_id: "mock-insurance-agent",
      sarvam_connection_id: "mock-conn-1",
      sarvam_agent_phone_number: "+919000099999",
    })
    .select("id, name")
    .single();

  if (insErr || !insuranceAgent) {
    throw new Error(`Failed to seed insurance agent: ${insErr?.message}`);
  }

  const { data: stockAgent, error: stockErr } = await admin
    .from("voice_agents")
    .insert({
      organization_id: org.id,
      name: `E2E Stock Agent ${suffix}`,
      purpose: "stock_advisory",
      status: "active",
      sarvam_agent_id: "mock-stock-agent",
      sarvam_connection_id: "mock-conn-1",
      sarvam_agent_phone_number: "+919000099999",
    })
    .select("id, name")
    .single();

  if (stockErr || !stockAgent) {
    throw new Error(`Failed to seed stock agent: ${stockErr?.message}`);
  }

  // Deterministic fake 10-digit Indian test phone (+91900000xxxx)
  const digits = String(Math.floor(1000 + Math.random() * 8999));
  const contactPhone = `+91900000${digits}`;
  const contactName = `E2E Caller ${suffix}`;

  const { data: contact, error: contactErr } = await admin
    .from("contacts")
    .insert({
      organization_id: org.id,
      first_name: "E2E Caller",
      last_name: suffix,
      phone: contactPhone,
      email: `e2e-${ts}@example.test`,
      status: "active",
    })
    .select("id")
    .single();

  if (contactErr || !contact) {
    throw new Error(`Failed to seed E2E contact: ${contactErr?.message}`);
  }

  return {
    orgId: org.id,
    orgName,
    userId: user.id,
    userEmail: email,
    insuranceAgentId: insuranceAgent.id,
    insuranceAgentName: insuranceAgent.name,
    stockAgentId: stockAgent.id,
    stockAgentName: stockAgent.name,
    contactId: contact.id,
    contactPhone,
    contactName,
    admin,
    cleanup: async () => {
      await admin.from("organizations").delete().eq("id", org.id);
    },
  };
}
