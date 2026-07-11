"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLogError } from "@/lib/logging/use-log-error";

export default function CourseError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  useLogError(error, pathname);
  const locale = pathname.split("/")[1] || "it";

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-6">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
          <span className="text-3xl">!</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900">
          Errore nel caricamento del corso
        </h2>
        <p className="text-gray-500 text-sm">
          Si è verificato un problema. Riprova o torna alla home.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition"
          >
            Riprova
          </button>
          <Link
            href={`/${locale}`}
            className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition"
          >
            Torna alla Home
          </Link>
        </div>
        {error.digest && (
          <p className="text-[10px] text-gray-400 font-mono">
            ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
