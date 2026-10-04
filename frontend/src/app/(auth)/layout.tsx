import * as React from "react";

/**
 * Shell for the unauthenticated route group: no app bar, no nav rail.
 * Auth screens are the one place a centered card is allowed (promax pitfall
 * #47); the card itself constrains width, not the page.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      {children}
    </div>
  );
}
