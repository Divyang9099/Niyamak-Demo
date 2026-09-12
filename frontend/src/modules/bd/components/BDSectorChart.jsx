import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// Same "chart card" treatment as the Sales Pipeline module's bar charts —
// how many clients are in each sector, sourced from bd.stats.sector_breakdown.
const PALETTE = ['#3B82F6', '#22C55E', '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6', '#EC4899', '#0EA5E9'];

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="bg-surface border border-slate-200 shadow-lg rounded-lg px-3 py-2">
      <p className="text-xs font-bold text-slate-900">{p.payload.label}</p>
      <p className="text-[11px] text-slate-500">{p.value} client{p.value === 1 ? '' : 's'}</p>
    </div>
  );
};

export const BDSectorChart = ({ stats }) => {
  const data = (stats?.sector_breakdown || [])
    .map((s, i) => ({ label: s.label, value: Number(s.count || 0), color: PALETTE[i % PALETTE.length] }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col min-h-[240px]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Pipeline</p>
          <h3 className="text-sm font-black text-slate-900">Clients by Sector</h3>
        </div>
        <span className="material-symbols-outlined text-base text-slate-300">bar_chart</span>
      </div>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 flex-1 py-8 text-slate-300">
          <span className="material-symbols-outlined text-3xl">bar_chart</span>
          <p className="text-[11px] font-medium text-slate-400">No sectors assigned yet</p>
        </div>
      ) : (
        <div className="flex-1 min-h-[170px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 8 }} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval={0} tick={{ fontSize: 9, fontWeight: 700, fill: '#334155' }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} tick={{ fontSize: 9, fill: '#94A3B8' }} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36}>
                {data.map(d => <Cell key={d.label} fill={d.color} />)}
                <LabelList dataKey="value" position="top" style={{ fontSize: 10, fontWeight: 800, fill: '#334155' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default BDSectorChart;
