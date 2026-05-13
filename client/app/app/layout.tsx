export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      {children}
    </div>
  );
}
