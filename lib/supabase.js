import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export function appPayload({ business, taxSettings, customers, invoices, expenses, subscription }) {
  return {
    business,
    taxSettings,
    customers,
    invoices,
    expenses,
    subscription,
    updatedAt: new Date().toISOString(),
  };
}
