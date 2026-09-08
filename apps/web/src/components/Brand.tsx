export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand brand--compact" : "brand"} aria-label="Near">
      <img src="/near-icon.svg" alt="" className="brand__mark" />
      <span className="brand__name">Near</span>
    </div>
  );
}
