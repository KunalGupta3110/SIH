export default function SectionHeader({ title, sub }) {
  return (
    <div className="mb-3">
      <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">{title}</h2>
      {sub && <p className="mt-0.5 text-xs text-slate-400 leading-relaxed max-w-3xl">{sub}</p>}
    </div>
  );
}
