import { redirect } from "next/navigation";
import { isSkipAuth } from "@/lib/demo";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (isSkipAuth()) {
    redirect("/app");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/app" : "/auth/login");
}
