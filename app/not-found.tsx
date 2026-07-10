import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <h1 className="text-4xl font-bold text-mint">[404]</h1>
      <p className="text-sm text-muted">this room doesn&apos;t exist yet</p>
      <Link
        href="/"
        className="px-6 py-2 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm"
      >
        [back to lobby]
      </Link>
    </div>
  );
}
