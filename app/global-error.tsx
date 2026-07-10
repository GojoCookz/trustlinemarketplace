"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-[#1b1d28] text-white lowercase">
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-4xl font-bold text-red-400">[fatal error]</h1>
          <p className="text-sm text-gray-400">
            {error.message || "something went very wrong"}
          </p>
          <button
            onClick={reset}
            className="px-6 py-2 rounded-lg bg-[#86efac] text-[#1b1d28] font-semibold text-sm"
          >
            [reload]
          </button>
        </div>
      </body>
    </html>
  );
}
