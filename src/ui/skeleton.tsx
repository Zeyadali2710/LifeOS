export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-[lo-shimmer_1.4s_linear_infinite] rounded-4 bg-[length:200%_100%] bg-[linear-gradient(90deg,#1a1d24_0%,#232631_50%,#1a1d24_100%)] ${className}`}
    />
  );
}
