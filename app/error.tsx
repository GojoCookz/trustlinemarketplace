"use client";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <h1 className="text-4xl font-bold text-red-400">[error]</h1>
      <p className="text-sm text-muted">something broke</p>
      <p className="text-xs text-muted/60 max-w-md text-center">
        {error.message || "unexpected error"}
      </p>
      <button
        onClick={reset}
        className="px-6 py-2 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm"
      >
        [try again]
      </button>
    </div>
  );
}
