/**
 * Route-transition skeleton (motion slot loading.skeleton — spec D). A calm pond
 * of pads settling into place. `animate-pulse` is disabled under reduced motion
 * by the global rule.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-20" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-56 animate-pulse rounded-lg bg-secondary" />
      <div className="mt-4 h-4 w-2/3 max-w-md animate-pulse rounded bg-secondary" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-border bg-card"
            style={{ animationDelay: `calc(${i} * var(--duration-fast))` }}
          />
        ))}
      </div>
    </div>
  );
}
