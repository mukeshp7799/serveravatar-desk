'use client'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useDateSettings } from '@/contexts/CompanySettingsContext'
import PageLoader from '@/components/PageLoader'
import {
  BarChart3, Users, Clock, Palmtree, FolderKanban, ListChecks,
  Download, ArrowRight, TrendingUp, UserCheck, AlertTriangle,
  CheckCircle2, XCircle, PauseCircle,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from 'recharts'

const C = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6']

type ReportTab = 'overview'|'employees'|'attendance'|'leaves'|'projects'|'tasks'

// ─── Helpers ──────────────────────────────────────────────────
const fmt = (v: any, f = '—') => v == null ? f : String(v)

function fmtDateDefault(s: any): string {
  if (!s) return '—'
  const d = String(s).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
    const [y,m,day] = d.split('T')[0].split('-')
    return new Date(+y, +m-1, +day).toLocaleDateString('en-US',{month:'short',day:'numeric'})
  }
  return d.slice(0, 10)
}

function fmtHours(v: any): string {
  if (v == null) return '—'
  const h = Math.floor(v), m = Math.round((v-h)*60)
  return h===0 ? `${m}m` : m===0 ? `${h}h` : `${h}h ${m}m`
}

// ─── KPI Card ─────────────────────────────────────────────────
function Kpi({ label, value, sub, icon }: { label:string; value:any; sub?:string; icon?:React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-3 sm:p-5 flex flex-col gap-1.5 sm:gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">{label}</span>
        {icon && <span className="text-indigo-500 shrink-0">{icon}</span>}
      </div>
      <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-none">{fmt(value)}</div>
      {sub && <div className="text-[10px] sm:text-xs text-gray-400 leading-tight">{sub}</div>}
    </div>
  )
}

// ─── Metric Mini Card ─────────────────────────────────────────
function MetricCard({ value, label, color }: { value:any; label:string; color:string }) {
  const Icon = color === 'indigo' ? Clock : color === 'amber' ? AlertTriangle : color === 'emerald' ? CheckCircle2 : XCircle
  const bg = color === 'indigo' ? 'bg-indigo-100' : color === 'amber' ? 'bg-amber-100' : color === 'emerald' ? 'bg-emerald-100' : 'bg-red-100'
  const tc = color === 'indigo' ? 'text-indigo-600' : color === 'amber' ? 'text-amber-600' : color === 'emerald' ? 'text-emerald-600' : 'text-red-600'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3">
      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
        <Icon size={16} className={`sm:${tc}`} />
      </div>
      <div className="min-w-0">
        <div className="text-lg sm:text-xl font-extrabold text-gray-900 leading-tight truncate">{fmt(value)}</div>
        <div className="text-[10px] sm:text-xs text-gray-500 leading-tight">{label}</div>
      </div>
    </div>
  )
}

// ─── Chart Card ───────────────────────────────────────────────
function ChartCard({ title, children }: { title:string; children:React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-3 sm:p-5">
      <h3 className="text-xs sm:text-sm font-bold text-gray-700 mb-3 sm:mb-4 leading-tight">{title}</h3>
      {children}
    </div>
  )
}

// ─── Recent List ──────────────────────────────────────────────
function RecentItem({ label, sub, badge }: { label:string; sub?:string; badge?:React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 sm:px-4 border-b border-gray-50 last:border-0 gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-xs sm:text-sm font-semibold text-gray-800 truncate">{label}</div>
        {sub && <div className="text-[10px] sm:text-xs text-gray-400 mt-0.5 truncate">{sub}</div>}
      </div>
      {badge && <div className="shrink-0">{badge}</div>}
    </div>
  )
}

// ─── Donut label ──────────────────────────────────────────────
function DonutLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.05) return null
  const r = innerRadius+(outerRadius-innerRadius)*0.5
  const x = cx+r*Math.cos(-midAngle*Math.PI/180)
  const y = cy+r*Math.sin(-midAngle*Math.PI/180)
  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">{(percent*100).toFixed(0)}%</text>
}

// ─── Theme-aware Tooltip ───────────────────────────────────────
function isDarkTheme() {
  if (typeof window === 'undefined') return false
  const t = document.documentElement.getAttribute('data-theme')
  return t === 'dark'
}

function ThemeTooltip({ active, payload, label }: any) {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDarkTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    setDark(isDarkTheme())
    return () => observer.disconnect()
  }, [])

  if (!active || !payload || !payload.length) return null

  const bg = dark ? '#1f2937' : '#ffffff'
  const border = dark ? '#374151' : '#e5e7eb'
  const text = dark ? '#f9fafb' : '#111827'
  const sub = dark ? '#9ca3af' : '#6b7280'
  const shadow = dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)'

  return (
    <div style={{
      backgroundColor: bg,
      border: `1px solid ${border}`,
      borderRadius: 10,
      padding: '8px 12px',
      boxShadow: `0 4px 12px ${shadow}`,
      fontSize: 12,
      color: text,
      minWidth: 120,
    }}>
      {label && (
        <div style={{ color: sub, fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'capitalize' }}>
          {label}
        </div>
      )}
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color || entry.fill, flexShrink: 0 }} />
          <span style={{ color: sub, fontSize: 11 }}>{entry.name || entry.dataKey}:</span>
          <span style={{ color: text, fontWeight: 700, fontSize: 12 }}>
            {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// Theme-aware legend wrapper style
function legendStyle() {
  return {
    fontSize: 11,
    color: isDarkTheme() ? '#9ca3af' : '#6b7280',
    fontFamily: 'inherit',
  }
}

// ─── Export ───────────────────────────────────────────────────
async function exportReport(type: string, filters: Record<string,string>={}) {
  const params = new URLSearchParams({...filters, format:'csv'})
  try {
    const token = localStorage.getItem('token')
    const lang = (()=>{try{return (localStorage.getItem('i18nextLng')||'en').split('-')[0]}catch{return 'en'}})()
    const res = await fetch(`/api/${type}?${params.toString()}&lang=${lang}`, {
      headers:{Authorization:`Bearer ${token}`},
    })
    if (!res.ok) throw new Error(await res.text())
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=`${type}-report.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('Export downloaded')
  } catch (err: any) { toast.error(err.message||'Export failed') }
}

// ─── Overview ─────────────────────────────────────────────────
function OverviewTab({ s, ch, dateFrom, dateTo, onDateChange, onRefresh, canExport }: any) {
  const attByDay = ch?.attendance_by_day || []
  const dm: any = {}
  attByDay.forEach((r: any) => {
    const d = r.date?.slice(0,10)
    if (!dm[d]) dm[d] = {date:d, Present:0, Absent:0}
    if (['clocked_in','working','completed'].includes(r.status)) dm[d].Present += r.count
    else dm[d].Absent += r.count
  })
  const dailyTrend = Object.values(dm).reverse().slice(-14) as any[]

  const projStatusData = (ch?.project_status||[]).map((r:any)=>({name:r.status, value:r.value||r.count}))
  const taskStatusData = (ch?.task_status||[]).map((r:any)=>({name:r.status, value:r.value||r.count}))
  const taskPriData = (ch?.task_priority||[]).map((r:any)=>({name:r.priority, value:r.count})).filter((r:any)=>r.value>0)
  const empGrowth = (ch?.employee_growth||[]).map((r:any)=>({month:r.month, Employees:r.count}))
  const lMonth = ch?.leave_by_month||[]
  const ltm: any = {}
  lMonth.forEach((r:any)=>{ if(!ltm[r.month]) ltm[r.month]={month:r.month}; ltm[r.month][r.status]=r.count })
  const leaveTrend = Object.values(ltm).reverse().slice(-6) as any[]
  const deptData = (ch?.department_employees||[]).map((r:any)=>({name:r.name, value:r.count})).filter((r:any)=>r.value>0)

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* Date filter */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-end">
          <div className="flex-1 min-w-0">
            <label className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1 block">From</label>
            <input type="date" value={dateFrom} onChange={e=>onDateChange(e.target.value,dateTo)}
              className="w-full px-2 sm:px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-[10px] sm:text-xs font-medium text-gray-500 mb-1 block">To</label>
            <input type="date" value={dateTo} onChange={e=>onDateChange(dateFrom,e.target.value)}
              className="w-full px-2 sm:px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button onClick={onRefresh}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold rounded-lg transition cursor-pointer border-0 whitespace-nowrap">
            Apply
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
        <Kpi label="Employees" value={s?.employees?.total||0} sub={`${s?.employees?.active||0} active`} icon={<Users size={13}/>} />
        <Kpi label="Present" value={s?.attendance?.present||0} sub={`${s?.attendance?.late_checkins||0} late`} icon={<UserCheck size={13}/>} />
        <Kpi label="Leave Req." value={s?.leaves?.total_requests||0} sub={`${s?.leaves?.pending||0} pending`} icon={<Palmtree size={13}/>} />
        <Kpi label="Projects" value={s?.projects?.total_projects||0} sub={`${s?.projects?.active||0} active`} icon={<FolderKanban size={13}/>} />
        <Kpi label="Tasks" value={s?.tasks?.total_tasks||0} sub={`${s?.tasks?.urgent||0} urgent`} icon={<ListChecks size={13}/>} />
        <Kpi label="Depts" value={s?.departments?.total_departments||0} sub="organization" icon={<BarChart3 size={13}/>} />
      </div>

      {/* Metric row */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <MetricCard value={fmtHours(s?.attendance?.avg_working_hours)} label="Avg Working Hrs" color="indigo" />
        <MetricCard value={s?.leaves?.pending||0} label="Pending Leaves" color="amber" />
        <MetricCard value={s?.leaves?.approved||0} label="Approved Leaves" color="emerald" />
        <MetricCard value={s?.tasks?.urgent||0} label="Urgent Tasks" color="red" />
      </div>

      {/* Charts row 1: Emp Growth + Att Trend + Leave Trend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {empGrowth.length >= 1 && (
          <ChartCard title="Employee Growth Trend">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={empGrowth}>
                
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="month" tick={{fontSize:10}} tickFormatter={v=>v.slice(5)} stroke="#9ca3af"/>
                <YAxis tick={{fontSize:10}} stroke="#9ca3af" allowDecimals={false}/>
                <Tooltip content={<ThemeTooltip />}  formatter={(v:number)=>[v,'Hires']} />
                <Area type="monotone" dataKey="Employees" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={2}/>
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
        {dailyTrend.length >= 1 && (
          <ChartCard title="Attendance Trend (14 days)">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="date" tick={{fontSize:10}} tickFormatter={v=>v.slice(5)} stroke="#9ca3af"/>
                <YAxis tick={{fontSize:10}} stroke="#9ca3af" allowDecimals={false}/>
                <Tooltip content={<ThemeTooltip />} /><Legend
              wrapperStyle={{
                fontSize: 11,
                color: "color" in window && document.documentElement.getAttribute("data-theme") === "dark" ? "#9ca3af" : "#6b7280",
                fontFamily: "inherit",
              }}
            />
                <Line type="monotone" dataKey="Present" name="Present" stroke="#10b981" strokeWidth={2} dot={false}/>
                <Line type="monotone" dataKey="Absent" name="Absent" stroke="#ef4444" strokeWidth={2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
        {leaveTrend.length >= 1 && (
          <ChartCard title="Leave Requests Trend">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={leaveTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="month" tick={{fontSize:10}} tickFormatter={v=>v.slice(5)} stroke="#9ca3af"/>
                <YAxis tick={{fontSize:10}} stroke="#9ca3af" allowDecimals={false}/>
                <Tooltip content={<ThemeTooltip />} /><Legend
              wrapperStyle={{
                fontSize: 11,
                color: "color" in window && document.documentElement.getAttribute("data-theme") === "dark" ? "#9ca3af" : "#6b7280",
                fontFamily: "inherit",
              }}
            />
                <Bar dataKey="pending" name="Pending" fill="#f59e0b" radius={[3,3,0,0]}/>
                <Bar dataKey="approved" name="Approved" fill="#10b981" radius={[3,3,0,0]}/>
                <Bar dataKey="rejected" name="Rejected" fill="#ef4444" radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Charts row 2: Dept + Leave Status + Proj + Task */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {deptData.length >= 1 && (
          <ChartCard title="Employees by Dept">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={deptData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis type="number" tick={{fontSize:9}} stroke="#9ca3af" allowDecimals={false}/>
                <YAxis type="category" dataKey="name" tick={{fontSize:9}} width={70} stroke="#9ca3af"/>
                <Tooltip content={<ThemeTooltip />} />
                <Bar dataKey="value" name="Employees" fill="#6366f1" radius={[0,4,4,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <ChartCard title="Leave by Status">
          {(()=>{
            const data=[{name:'Approved',value:+s?.leaves?.approved||0},{name:'Pending',value:+s?.leaves?.pending||0},{name:'Rejected',value:+s?.leaves?.rejected||0}].filter(d=>d.value>0)
            return data.length>=1?(
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={65} labelLine={false} label={DonutLabel}>
                    {data.map((_,i)=><Cell key={i} fill={C[i%C.length]}/>)}
                  </Pie>
                  <Tooltip content={<ThemeTooltip />} /><Legend
              wrapperStyle={{
                fontSize: 11,
                color: "color" in window && document.documentElement.getAttribute("data-theme") === "dark" ? "#9ca3af" : "#6b7280",
                fontFamily: "inherit",
              }}
            />
                </PieChart>
              </ResponsiveContainer>
            ):<p className="text-xs text-gray-400 text-center py-8">No data</p>
          })()}
        </ChartCard>

        <ChartCard title="Projects by Status">
          {projStatusData.length>=1?(
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={projStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={65} labelLine={false} label={DonutLabel}>
                  {projStatusData.map((_,i)=><Cell key={i} fill={C[i%C.length]}/>)}
                </Pie>
                <Tooltip content={<ThemeTooltip />} /><Legend
              wrapperStyle={{
                fontSize: 11,
                color: "color" in window && document.documentElement.getAttribute("data-theme") === "dark" ? "#9ca3af" : "#6b7280",
                fontFamily: "inherit",
              }}
            />
              </PieChart>
            </ResponsiveContainer>
          ):<p className="text-xs text-gray-400 text-center py-8">No projects</p>}
        </ChartCard>

        <ChartCard title="Tasks by Priority">
          {taskPriData.length>=1?(
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={taskPriData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={65} labelLine={false} label={DonutLabel}>
                  {taskPriData.map((_,i)=><Cell key={i} fill={C[i%C.length]}/>)}
                </Pie>
                <Tooltip content={<ThemeTooltip />} /><Legend
              wrapperStyle={{
                fontSize: 11,
                color: "color" in window && document.documentElement.getAttribute("data-theme") === "dark" ? "#9ca3af" : "#6b7280",
                fontFamily: "inherit",
              }}
            />
              </PieChart>
            </ResponsiveContainer>
          ):<p className="text-xs text-gray-400 text-center py-8">No tasks</p>}
        </ChartCard>
      </div>
    </div>
  )
}

// ─── Employees ────────────────────────────────────────────────
function EmployeesTab({ ch, dateFrom, dateTo }: any) {
  const [recent, setRecent] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({page:'1',limit:'5',sort:'created_at',order:'desc'})
    if(dateFrom) params.set('hire_date_from',dateFrom)
    if(dateTo) params.set('hire_date_to',dateTo)
    api.get(`/reports/employees?${params.toString()}`).then(r=>setRecent(r.employees||[])).catch(()=>{}).finally(()=>setLoading(false))
  }, [dateFrom,dateTo])

  const empGrowth = (ch?.employee_growth||[]).map((r:any)=>({month:r.month, Employees:r.count}))
  const deptData = (ch?.department_employees||[]).map((r:any)=>({name:r.name,value:r.count})).filter((r:any)=>r.value>0)
  const statusData = (ch?.employee_status||[]).map((r:any)=>({name:r.status,value:r.count}))
  const empTotal = empGrowth.reduce((s:number,r:any)=>s+r.count,0)

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <ChartCard title="Employee Growth Trend">
          {empGrowth.length>=1?(
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={empGrowth}>
                
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="month" tick={{fontSize:10}} tickFormatter={v=>v.slice(5)} stroke="#9ca3af"/>
                <YAxis tick={{fontSize:10}} stroke="#9ca3af" allowDecimals={false}/>
                <Tooltip content={<ThemeTooltip />}  formatter={(v:number)=>[v,'Hires']} />
                <Area type="monotone" dataKey="Employees" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={2}/>
              </AreaChart>
            </ResponsiveContainer>
          ):<p className="text-xs text-gray-400 text-center py-8">No data</p>}
        </ChartCard>

        <ChartCard title="Department Distribution">
          {deptData.length>=1?(
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={deptData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="name" tick={{fontSize:9}} stroke="#9ca3af" angle={-20} textAnchor="end" height={40}/>
                <YAxis tick={{fontSize:10}} stroke="#9ca3af" allowDecimals={false}/>
                <Tooltip content={<ThemeTooltip />} />
                <Bar dataKey="value" name="Employees" fill="#8b5cf6" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ):<p className="text-xs text-gray-400 text-center py-8">No data</p>}
        </ChartCard>

        <ChartCard title="Employment Status">
          {statusData.length>=1?(
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={65} labelLine={false} label={DonutLabel}>
                  {statusData.map((_,i)=><Cell key={i} fill={C[i%C.length]}/>)}
                </Pie>
                <Tooltip content={<ThemeTooltip />} /><Legend
              wrapperStyle={{
                fontSize: 11,
                color: "color" in window && document.documentElement.getAttribute("data-theme") === "dark" ? "#9ca3af" : "#6b7280",
                fontFamily: "inherit",
              }}
            />
              </PieChart>
            </ResponsiveContainer>
          ):<p className="text-xs text-gray-400 text-center py-8">No employees</p>}
        </ChartCard>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Kpi label="Total" value={ch?.employees?.total||0} sub="registered" icon={<Users size={12}/>}/>
        <Kpi label="Active" value={ch?.employees?.active||0} sub="employed" icon={<UserCheck size={12}/>}/>
        <Kpi label="Depts" value={deptData.length} sub="with staff" icon={<BarChart3 size={12}/>}/>
        <Kpi label="Growth" value={empTotal} sub={`${empGrowth.length}mo`} icon={<TrendingUp size={12}/>}/>
      </div>

      {/* Recent list */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100">
          <h3 className="text-xs sm:text-sm font-bold text-gray-900">Recent Employees</h3>
          <a href="/employees" className="flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-indigo-600 hover:text-indigo-800 no-underline whitespace-nowrap">
            View All <ArrowRight size={11}/>
          </a>
        </div>
        <div className="divide-y divide-gray-50">
          {loading?<div className="p-6 text-center"><PageLoader size="sm"/></div>:
           recent.length===0?<div className="p-6 text-center text-xs text-gray-400">No employees found</div>:
           recent.map((e:any)=>(
            <RecentItem key={e.id} label={`${e.first_name} ${e.last_name}`} sub={e.department_name}
              badge={<span className={`inline-flex px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${e.status==='active'?'bg-emerald-50 text-emerald-700':'bg-gray-50 text-gray-500'}`}>{e.status}</span>}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Attendance ────────────────────────────────────────────────
function AttendanceTab({ ch }: { ch: any }) {
  const [recent, setRecent] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get('/reports/attendance?page=1&limit=5').then(r=>setRecent(r.records||[])).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  const attByDay = ch?.attendance_by_day||[]
  const dm: any={}
  attByDay.forEach((r:any)=>{
    const d=r.date?.slice(0,10)
    if(!dm[d]) dm[d]={date:d,Present:0,'Late Check-in':0}
    if(['clocked_in','working','completed'].includes(r.status)) dm[d].Present+=r.count
    if(r.status==='clocked_in'&&r.is_late) dm[d]['Late Check-in']+=r.count
  })
  const dailyTrend = Object.values(dm).reverse().slice(-14) as any[]
  const lastDay = dailyTrend[dailyTrend.length-1]||{}
  const totalEmp = ch?.employees?.total||10
  const presentToday = lastDay.Present||0
  const absentToday = Math.max(0,totalEmp-presentToday)
  const presentData=[{name:'Present',value:presentToday},{name:'Absent',value:absentToday}].filter(d=>d.value>0)

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <ChartCard title="Today's Attendance">
          {presentData.length>=1?(
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={presentData} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={65} labelLine={false} label={DonutLabel}>
                  <Cell fill="#10b981"/><Cell fill="#ef4444"/>
                </Pie>
                <Tooltip content={<ThemeTooltip />} /><Legend
              wrapperStyle={{
                fontSize: 11,
                color: "color" in window && document.documentElement.getAttribute("data-theme") === "dark" ? "#9ca3af" : "#6b7280",
                fontFamily: "inherit",
              }}
            />
              </PieChart>
            </ResponsiveContainer>
          ):<p className="text-xs text-gray-400 text-center py-8">No data</p>}
        </ChartCard>

        <ChartCard title="Attendance Trend (14 days)">
          {dailyTrend.length>=1?(
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="date" tick={{fontSize:10}} tickFormatter={v=>v.slice(5)} stroke="#9ca3af"/>
                <YAxis tick={{fontSize:10}} stroke="#9ca3af" allowDecimals={false}/>
                <Tooltip content={<ThemeTooltip />} /><Legend
              wrapperStyle={{
                fontSize: 11,
                color: "color" in window && document.documentElement.getAttribute("data-theme") === "dark" ? "#9ca3af" : "#6b7280",
                fontFamily: "inherit",
              }}
            />
                <Line type="monotone" dataKey="Present" name="Present" stroke="#10b981" strokeWidth={2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          ):<p className="text-xs text-gray-400 text-center py-8">No data</p>}
        </ChartCard>

        <ChartCard title="Late Check-ins">
          {dailyTrend.some((d:any)=>d['Late Check-in']>0)?(
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={dailyTrend.filter((d:any)=>d['Late Check-in']>0)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="date" tick={{fontSize:10}} tickFormatter={v=>v.slice(5)} stroke="#9ca3af"/>
                <YAxis tick={{fontSize:10}} stroke="#9ca3af" allowDecimals={false}/>
                <Tooltip content={<ThemeTooltip />} />
                <Bar dataKey="Late Check-in" name="Late" fill="#f59e0b" radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ):<div className="flex flex-col items-center justify-center h-36 sm:h-48 gap-2">
            <CheckCircle2 size={28} className="text-emerald-400"/>
            <p className="text-xs sm:text-sm text-emerald-600 font-semibold">No late check-ins</p>
          </div>}
        </ChartCard>
      </div>

      <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100">
          <h3 className="text-xs sm:text-sm font-bold text-gray-900">Recent Attendance</h3>
          <a href="/attendance" className="flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-indigo-600 hover:text-indigo-800 no-underline whitespace-nowrap">
            View All <ArrowRight size={11}/>
          </a>
        </div>
        <div className="divide-y divide-gray-50">
          {loading?<div className="p-6 text-center"><PageLoader size="sm"/></div>:
           recent.length===0?<div className="p-6 text-center text-xs text-gray-400">No records</div>:
           recent.map((r:any)=>(
            <RecentItem key={r.id} label={`${r.first_name} ${r.last_name}`}
              sub={`${fmtDateDefault(r.date)} · ${r.department_name||'No dept'}`}
              badge={<span className={`inline-flex items-center gap-0.5 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${
                r.status==='clocked_in'?'bg-emerald-50 text-emerald-700':
                r.status==='working'?'bg-blue-50 text-blue-700':
                r.status==='on_break'?'bg-amber-50 text-amber-700':'bg-gray-50 text-gray-600'
              }`}>{r.is_late?'⚠ ':''}{r.status?.replace('_',' ')}</span>}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Leave ────────────────────────────────────────────────────
function LeaveTab({ ch }: { ch: any }) {
  const [recent, setRecent] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get('/reports/leaves?page=1&limit=5').then(r=>setRecent(r.records||[])).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  const statusData=[{name:'Approved',value:+ch?.leaves?.approved||0},{name:'Pending',value:+ch?.leaves?.pending||0},{name:'Rejected',value:+ch?.leaves?.rejected||0}].filter(d=>d.value>0)
  const typeData=(ch?.leave_type_distribution||[]).map((r:any)=>({name:r.name,value:r.count})).filter((r:any)=>r.value>0)
  const lMonth=ch?.leave_by_month||[]
  const ltm:any={}
  lMonth.forEach((r:any)=>{ if(!ltm[r.month]) ltm[r.month]={month:r.month}; ltm[r.month][r.status]=r.count })
  const leaveTrend = Object.values(ltm).reverse().slice(-6) as any[]

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <ChartCard title="Leave Requests by Status">
          {statusData.length>=1?(
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={65} labelLine={false} label={DonutLabel}>
                  {statusData.map((_,i)=><Cell key={i} fill={C[i%C.length]}/>)}
                </Pie>
                <Tooltip content={<ThemeTooltip />} /><Legend
              wrapperStyle={{
                fontSize: 11,
                color: "color" in window && document.documentElement.getAttribute("data-theme") === "dark" ? "#9ca3af" : "#6b7280",
                fontFamily: "inherit",
              }}
            />
              </PieChart>
            </ResponsiveContainer>
          ):<p className="text-xs text-gray-400 text-center py-8">No data</p>}
        </ChartCard>

        <ChartCard title="Leave Type Distribution">
          {typeData.length>=1?(
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="name" tick={{fontSize:9}} stroke="#9ca3af" angle={-20} textAnchor="end" height={40}/>
                <YAxis tick={{fontSize:10}} stroke="#9ca3af" allowDecimals={false}/>
                <Tooltip content={<ThemeTooltip />} />
                <Bar dataKey="value" name="Requests" fill="#ec4899" radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ):<p className="text-xs text-gray-400 text-center py-8">No data</p>}
        </ChartCard>

        <ChartCard title="Monthly Leave Trend">
          {leaveTrend.length>=1?(
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={leaveTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="month" tick={{fontSize:10}} tickFormatter={v=>v.slice(5)} stroke="#9ca3af"/>
                <YAxis tick={{fontSize:10}} stroke="#9ca3af" allowDecimals={false}/>
                <Tooltip content={<ThemeTooltip />} /><Legend
              wrapperStyle={{
                fontSize: 11,
                color: "color" in window && document.documentElement.getAttribute("data-theme") === "dark" ? "#9ca3af" : "#6b7280",
                fontFamily: "inherit",
              }}
            />
                <Line type="monotone" dataKey="pending" name="Pending" stroke="#f59e0b" strokeWidth={2} dot={false}/>
                <Line type="monotone" dataKey="approved" name="Approved" stroke="#10b981" strokeWidth={2} dot={false}/>
                <Line type="monotone" dataKey="rejected" name="Rejected" stroke="#ef4444" strokeWidth={2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          ):<p className="text-xs text-gray-400 text-center py-8">No data</p>}
        </ChartCard>
      </div>

      <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100">
          <h3 className="text-xs sm:text-sm font-bold text-gray-900">Recent Leave Requests</h3>
          <a href="/leaves" className="flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-indigo-600 hover:text-indigo-800 no-underline whitespace-nowrap">
            View All <ArrowRight size={11}/>
          </a>
        </div>
        <div className="divide-y divide-gray-50">
          {loading?<div className="p-6 text-center"><PageLoader size="sm"/></div>:
           recent.length===0?<div className="p-6 text-center text-xs text-gray-400">No leave requests</div>:
           recent.map((r:any)=>(
            <RecentItem key={r.id} label={`${r.first_name} ${r.last_name}`}
              sub={`${r.leave_type||'Leave'} · ${fmtDateDefault(r.start_date)} – ${fmtDateDefault(r.end_date)}`}
              badge={<span className={`inline-flex px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${
                r.status==='approved'?'bg-emerald-50 text-emerald-700':
                r.status==='pending'?'bg-amber-50 text-amber-700':'bg-red-50 text-red-700'
              }`}>{r.status}</span>}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Projects ─────────────────────────────────────────────────
function ProjectsTab({ ch }: { ch: any }) {
  const [recent, setRecent] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get('/reports/projects?page=1&limit=5').then(r=>setRecent(r.records||[])).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  const statusData=(ch?.project_status||[]).map((r:any)=>({name:r.status,value:r.value||r.count}))
  const priData=(ch?.project_priority||[]).map((r:any)=>({name:r.priority,value:r.count})).filter((r:any)=>r.value>0)

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Kpi label="Projects" value={ch?.projects?.total_projects||0} sub="registered" icon={<FolderKanban size={12}/>}/>
        <Kpi label="Active" value={ch?.projects?.active||0} sub="in progress" icon={<PauseCircle size={12}/>}/>
        <Kpi label="Completed" value={ch?.projects?.completed||0} sub="finished" icon={<CheckCircle2 size={12}/>}/>
        <Kpi label="Tasks" value={ch?.tasks?.total_tasks||0} sub="across all" icon={<ListChecks size={12}/>}/>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <ChartCard title="Projects by Status">
          {statusData.length>=1?(
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={65} labelLine={false} label={DonutLabel}>
                  {statusData.map((_,i)=><Cell key={i} fill={C[i%C.length]}/>)}
                </Pie>
                <Tooltip content={<ThemeTooltip />} /><Legend
              wrapperStyle={{
                fontSize: 11,
                color: "color" in window && document.documentElement.getAttribute("data-theme") === "dark" ? "#9ca3af" : "#6b7280",
                fontFamily: "inherit",
              }}
            />
              </PieChart>
            </ResponsiveContainer>
          ):<p className="text-xs text-gray-400 text-center py-8">No projects</p>}
        </ChartCard>

        <ChartCard title="Task Priority Distribution">
          {priData.length>=1?(
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={priData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="name" tick={{fontSize:10}} stroke="#9ca3af"/>
                <YAxis tick={{fontSize:10}} stroke="#9ca3af" allowDecimals={false}/>
                <Tooltip content={<ThemeTooltip />} />
                <Bar dataKey="value" name="Tasks" fill="#6366f1" radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ):<p className="text-xs text-gray-400 text-center py-8">No tasks</p>}
        </ChartCard>
      </div>

      <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100">
          <h3 className="text-xs sm:text-sm font-bold text-gray-900">Recent Projects</h3>
          <a href="/projects" className="flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-indigo-600 hover:text-indigo-800 no-underline whitespace-nowrap">
            View All <ArrowRight size={11}/>
          </a>
        </div>
        <div className="divide-y divide-gray-50">
          {loading?<div className="p-6 text-center"><PageLoader size="sm"/></div>:
           recent.length===0?<div className="p-6 text-center text-xs text-gray-400">No projects</div>:
           recent.map((p:any)=>(
            <RecentItem key={p.id} label={p.name}
              sub={`${p.manager_name||'Unassigned'} · ${p.task_count||0} tasks`}
              badge={<span className={`inline-flex px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${
                p.status==='active'?'bg-emerald-50 text-emerald-700':
                p.status==='completed'?'bg-indigo-50 text-indigo-700':'bg-gray-50 text-gray-600'
              }`}>{p.status}</span>}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Tasks ────────────────────────────────────────────────────
function TasksTab({ ch }: { ch: any }) {
  const [recent, setRecent] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get('/reports/tasks?page=1&limit=5').then(r=>setRecent(r.records||[])).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  const priData=(ch?.task_priority||[]).map((r:any)=>({name:r.priority,value:r.count})).filter((r:any)=>r.value>0)
  const colData=(ch?.task_status||[]).map((r:any)=>({name:r.status,value:r.count})).filter((r:any)=>r.value>0)

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Kpi label="Total Tasks" value={ch?.tasks?.total_tasks||0} sub="open tasks" icon={<ListChecks size={12}/>}/>
        <Kpi label="Urgent" value={ch?.tasks?.urgent||0} sub="immediate" icon={<AlertTriangle size={12}/>}/>
        <Kpi label="High Priority" value={ch?.tasks?.high||0} sub="important" icon={<TrendingUp size={12}/>}/>
        <Kpi label="Columns" value={colData.length} sub="stages" icon={<BarChart3 size={12}/>}/>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <ChartCard title="Tasks by Priority">
          {priData.length>=1?(
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={priData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={65} labelLine={false} label={DonutLabel}>
                  {priData.map((_,i)=><Cell key={i} fill={C[i%C.length]}/>)}
                </Pie>
                <Tooltip content={<ThemeTooltip />} /><Legend
              wrapperStyle={{
                fontSize: 11,
                color: "color" in window && document.documentElement.getAttribute("data-theme") === "dark" ? "#9ca3af" : "#6b7280",
                fontFamily: "inherit",
              }}
            />
              </PieChart>
            </ResponsiveContainer>
          ):<p className="text-xs text-gray-400 text-center py-8">No tasks</p>}
        </ChartCard>

        <ChartCard title="Tasks by Column">
          {colData.length>=1?(
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={colData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                <XAxis dataKey="name" tick={{fontSize:10}} stroke="#9ca3af"/>
                <YAxis tick={{fontSize:10}} stroke="#9ca3af" allowDecimals={false}/>
                <Tooltip content={<ThemeTooltip />} />
                <Bar dataKey="value" name="Tasks" fill="#8b5cf6" radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ):<p className="text-xs text-gray-400 text-center py-8">No tasks</p>}
        </ChartCard>
      </div>

      <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100">
          <h3 className="text-xs sm:text-sm font-bold text-gray-900">Recent Tasks</h3>
          <a href="/projects" className="flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-indigo-600 hover:text-indigo-800 no-underline whitespace-nowrap">
            View All <ArrowRight size={11}/>
          </a>
        </div>
        <div className="divide-y divide-gray-50">
          {loading?<div className="p-6 text-center"><PageLoader size="sm"/></div>:
           recent.length===0?<div className="p-6 text-center text-xs text-gray-400">No tasks</div>:
           recent.map((t:any)=>(
            <RecentItem key={t.id} label={t.title}
              sub={`${t.project_name||'No project'} · ${t.column_name||'No column'}`}
              badge={<span className={`inline-flex px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${
                t.priority==='urgent'?'bg-red-50 text-red-700':
                t.priority==='high'?'bg-orange-50 text-orange-700':
                t.priority==='medium'?'bg-amber-50 text-amber-700':'bg-blue-50 text-blue-700'
              }`}>{t.priority}</span>}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────
export default function ReportsPage() {
  const { t } = useTranslation()
  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user')||'{}') : {}
  const perms: string[] = Array.isArray(user.permissions) ? user.permissions : []
  const canExport = perms.includes('reports.export')


  const { date_format } = useDateSettings();
  const fmtDate = (s: any): string => {
    if (!s) return '';
    const str = String(s);
    const parts = str.split('T')[0].split('-');
    const [y, m, day] = parts.map(Number);
    if (parts.length < 3 || isNaN(y)) return str;
    const pattern = date_format || 'YYYY-MM-DD';
    return pattern
      .replace('YYYY', String(y)).replace('YY', String(y).slice(-2))
      .replace('MM', String(m).padStart(2,'0')).replace('M', String(m))
      .replace('DD', String(day).padStart(2,'0')).replace('D', String(day));
  };
  const [tab, setTab] = useState<ReportTab>('overview')
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<any>(null)
  const [charts, setCharts] = useState<any>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const loadData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if(dateFrom) params.set('date_from',dateFrom)
      if(dateTo) params.set('date_to',dateTo)
      const qs = params.toString() ? `?${params.toString()}` : ''
      const [sumRes, chartsRes] = await Promise.all([api.get(`/reports/summary${qs}`), api.get(`/reports/charts${qs}`)])
      setSummary(sumRes); setCharts(chartsRes)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [])
  useEffect(() => { if(tab==='overview') loadData() }, [tab,dateFrom,dateTo])

  const tabs: {key:ReportTab;label:string}[] = [
    {key:'overview',label:'Overview'},
    {key:'employees',label:'Employees'},
    {key:'attendance',label:'Attendance'},
    {key:'leaves',label:'Leave'},
    {key:'projects',label:'Projects'},
    {key:'tasks',label:'Tasks'},
  ]

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in-up px-1 sm:px-0">
      {/* Header */}
      <div className="flex flex-col xs:flex-row gap-2 xs:gap-0 xs:justify-between xs:items-center">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 leading-tight">Reports & Analytics</h1>
          <p className="text-[11px] sm:text-sm text-gray-500 mt-0.5">Real-time insights across your organization</p>
        </div>
      </div>

      {/* Tabs — horizontal scroll on mobile */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-1.5">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map(tb => (
            <button key={tb.key} onClick={()=>setTab(tb.key)}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer border-none whitespace-nowrap shrink-0
                ${tab===tb.key?'bg-indigo-600 text-white shadow-sm':'text-gray-600 hover:bg-gray-100 bg-transparent'}`}>
              {tb.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <PageLoader label={t('common.loading')||'Loading...'} size="lg"/>
      ) : (
        <>
          {tab==='overview' && <OverviewTab s={summary} ch={charts} dateFrom={dateFrom} dateTo={dateTo} onDateChange={(f:string,t:string)=>{setDateFrom(f);setDateTo(t)}} onRefresh={loadData} canExport={canExport}/>}
          {tab==='employees' && <EmployeesTab ch={charts} dateFrom={dateFrom} dateTo={dateTo}/>}
          {tab==='attendance' && <AttendanceTab ch={charts}/>}
          {tab==='leaves' && <LeaveTab ch={charts}/>}
          {tab==='projects' && <ProjectsTab ch={charts}/>}
          {tab==='tasks' && <TasksTab ch={charts}/>}
        </>
      )}
    </div>
  )
}

