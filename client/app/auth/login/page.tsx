import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-zinc-500">Loading…</div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
