interface ProgressBarProps {
  value: number;
  label?: string;
  showValue?: boolean;
  className?: string;
  tone?: "warm" | "green";
}

export function ProgressBar({ value, label, showValue = true, className = "", tone = "warm" }: ProgressBarProps) {
  const safeValue = Math.min(100, Math.max(0, Math.round(value)));
  const fillClass =
    tone === "green"
      ? "bg-gradient-to-r from-[#1B5E20] to-[#2E7D32]"
      : "bg-gradient-to-r from-cream-gold to-cream-espresso";

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <span className="text-[10px] font-semibold text-cream-text-soft uppercase tracking-widest">
              {label}
            </span>
          )}
          {showValue && (
            <span className="text-xs font-semibold text-cream-text tabular-nums">
              {safeValue}%
            </span>
          )}
        </div>
      )}
      <div className="w-full h-1.5 bg-cream-border-soft rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out motion-reduce:transition-none ${fillClass}`}
          style={{ width: `${safeValue}%` }}
          role="progressbar"
          aria-valuenow={safeValue}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label ?? `Progresso ${safeValue}%`}
        />
      </div>
    </div>
  );
}
