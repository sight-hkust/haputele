export function AppVersion() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  const revision = process.env.NEXT_PUBLIC_APP_REVISION?.slice(0, 7);

  return (
    <span className="text-sm text-[var(--muted-foreground)]">
      {version ? `Version ${version} (${revision})` : "Development build"}
    </span>
  );
}
