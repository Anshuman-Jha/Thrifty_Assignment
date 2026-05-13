export default function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 py-12 dark:bg-zinc-950">
      {children}
    </div>
  );
}
