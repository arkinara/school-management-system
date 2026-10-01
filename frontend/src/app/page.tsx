import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh flex-col items-start justify-center gap-4 p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        School Management System
      </p>
      <h1 className="text-2xl font-semibold text-foreground">Scaffold berjalan</h1>
      <p className="text-sm text-muted-foreground">
        Fondasi monorepo (Next.js + Tailwind promax tokens + FastAPI) siap.
      </p>
      <Link
        href="/preview"
        className="inline-flex min-h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
      >
        Buka component preview
      </Link>
    </main>
  );
}
