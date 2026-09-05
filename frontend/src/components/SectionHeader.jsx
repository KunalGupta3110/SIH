export default function SectionHeader({ title, sub }) {
  return (
    <div className="mb-4">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <p className="mt-0.5 text-[12px] text-dim2">{sub}</p>
    </div>
  );
}
