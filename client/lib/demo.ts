/** When true, middleware skips login redirects and DemoGate signs in anonymously. */
export function isSkipAuth(): boolean {
  return process.env.NEXT_PUBLIC_SKIP_AUTH === "true";
}
