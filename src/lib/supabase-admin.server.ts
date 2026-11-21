import { supabaseAdmin as generated } from "@/integrations/supabase/client.server";
import { asApp } from "./supabase";
export const supabaseAdmin = asApp(generated);
