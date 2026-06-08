import { redirect } from "next/navigation";
import { isSkipAuth } from "@/lib/demo";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listWorkspacesForUser } from "@/lib/workspaces";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function AppHomePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const skip = isSkipAuth();

  if (!user && !skip) {
    redirect("/auth/login");
  }

  const workspaces = user
    ? await listWorkspacesForUser(supabase, user.id)
    : [];

  return <DashboardClient initialWorkspaces={workspaces} />;
}
