import { createClient } from "@supabase/supabase-js";

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
    readonly NEXT_PUBLIC_SUPABASE_URL?: string;
    readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL) as string | undefined;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as
  | string
  | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables. Copy .env.example to .env.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
