// App-wide database client typed against the app's own schema (src/lib/db-types.ts),
// so platform regeneration of the generated types file can't break the build.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as generated } from "@/integrations/supabase/client";
import type { Database } from "./db-types";
export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from "./db-types";
export const supabase = generated as unknown as SupabaseClient<Database>;
export type AppClient = SupabaseClient<Database>;
/** Re-type a generated client (auth middleware / admin) against the app schema. */
export const asApp = (client: unknown) => client as AppClient;
