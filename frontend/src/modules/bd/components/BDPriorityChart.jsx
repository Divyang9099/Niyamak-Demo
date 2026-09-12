import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

// Same "chart card" treatment as the Sales Pipeline module's Lead Types pie
// (PipelineBoard.jsx) — small donut, legend list with counts/percentages.
const COLORS = { A: '#EF4444', B: '#F59E0B', C: '#94A3B8' };
const LABELS = { A: 'Priority A', B: 'Priority B', C: 'Priority C' };

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

export const BDPriorityChart = ({ stats }) => {
  const data = ['A', 'B', 'C']
    .map(p => ({ key: p, label: LABELS[p], value: Number(stats?.[`priority_${p.toLowerCase()}`] || 0), color: COLORS[p] }))
    .filter(d => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Pipeline</p>
          <h3 className="text-sm font-black text-slate-900">Clients by Priority</h3>
        </div>
        <span className="material-symbols-outlined text-base text-slate-300">donut_large</span>
      </div>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 flex-1 py-8 text-slate-300">
          <span className="material-symbols-outlined text-3xl">pie_chart</span>
          <p className="text-[11px] font-medium text-slate-400">No clients yet</p>
        </div>
      ) : (
        <>
          <div className="flex justify-center mb-2" style={{ height: 110 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%"
                  innerRadius={30} outerRadius={48} stroke="#fff" strokeWidth={2}
                  animationBegin={150} animationDuration={1000}>
                  {data.map(d => <Cell key={d.key} fill={d.color} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 mt-1">
            {data.map(d => (
              <div key={d.key} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="text-slate-600 font-medium flex-1 truncate">{d.label}</span>
                <span className="font-bold text-slate-800 tabular-nums">{d.value}</span>
                <span className="text-slate-400 text-[10px] tabular-nums">{total > 0 ? Math.round(d.value / total * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default BDPriorityChart;
