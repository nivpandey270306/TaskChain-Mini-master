export default function ProgressBar({ visible, label = "Processing transaction" }) {
  if (!visible) return null;

  return (
    <div className="progress-wrap" role="status" aria-live="polite">
      <p>{label}</p>
      <div className="progress-track">
        <span className="progress-indicator" />
      </div>
    </div>
  );
}
