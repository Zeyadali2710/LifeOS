export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-[lo-shimmer_1.4s_linear_infinite] rounded-4 bg-[length:200%_100%] bg-[linear-gradient(90deg,rgba(255,255,255,.04)_0%,rgba(255,255,255,.09)_50%,rgba(255,255,255,.04)_100%)] ${className}`}
    />
  );
}
