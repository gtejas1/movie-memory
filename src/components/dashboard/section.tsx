import type { ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-sm uppercase tracking-wide text-neutral-400">{title}</h2>
      {children}
    </section>
  );
}
