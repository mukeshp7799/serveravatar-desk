'use client';
import { Palmtree } from 'lucide-react';
import StatCard from './StatCard';
import ListWidget from './ListWidget';

export default function LeaveWidget({ permissions, data }: { permissions: string[]; data: any }) {
  const leaveBalances = data?.leaveBalances || [];
  const pendingApprovals = data?.pendingApprovals || [];
  const hasApprove = permissions.includes('leaves.approve');
  const hasApply = permissions.includes('leaves.apply');

  const widgets = [];

  if (hasApply && leaveBalances.length > 0) {
    widgets.push(
      <ListWidget
        key="leave-balances"
        title="Leave Balances"
        icon={Palmtree}
        items={leaveBalances}
        emptyText="No leave allocated"
        viewAllHref="/leaves"
        delay={300}
        headerAction={<a href="/leaves/apply" className="text-xs font-bold text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm px-3 py-1 rounded-full transition no-underline">Apply →</a>}
        renderItem={(b: any) => {
          const pct = Math.min(100, (parseFloat(b.current_balance) / b.max_allowed) * 100);
          return (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="font-semibold text-sm text-gray-700">{b.leave_type_name}</span>
                <span className="text-sm font-bold text-emerald-600">{b.current_balance} <span className="text-gray-400 font-normal">/ {b.max_allowed}</span></span>
              </div>
              <div className="bg-gray-50 rounded-full h-2.5 overflow-hidden">
                <div className="bg-indigo-600 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        }}
      />
    );
  }

  if (hasApprove && pendingApprovals.length > 0) {
    widgets.push(
      <StatCard key="pending-leaves" label="Pending Leaves" value={pendingApprovals.length} icon={Palmtree} color="text-orange-600" bgColor="bg-orange-50" delay={250} />
    );
    widgets.push(
      <ListWidget
        key="pending-approvals"
        title="Pending Approvals"
        icon={Palmtree}
        items={pendingApprovals}
        emptyText="No pending approvals"
        viewAllHref="/leaves"
        delay={350}
        headerAction={<span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-bold">{pendingApprovals.length}</span>}
        renderItem={(lr: any) => (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              {lr.first_name?.[0]}{lr.last_name?.[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm text-gray-800">{lr.first_name} {lr.last_name}</div>
              <div className="text-xs text-gray-500">{lr.leave_type} · {lr.start_date} → {lr.end_date}</div>
            </div>
          </div>
        )}
      />
    );
  }

  return <>{widgets}</>;
}
