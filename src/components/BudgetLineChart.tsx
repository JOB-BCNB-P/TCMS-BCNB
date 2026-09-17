import { useMemo } from 'react'
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useTheme } from '@/hooks/useTheme'
import { thaiMonthShort } from '@/lib/thaiDate'
import { formatBaht } from '@/lib/format'

/**
 * จานสีเชิงหมวดหมู่ 5 ช่อง เรียงลำดับตายตัว ห้ามวนใช้ซ้ำ
 * ผ่านการตรวจ (ความสว่าง ความอิ่มสี การแยกแยะของผู้มีภาวะตาบอดสี และคอนทราสต์)
 * ทั้งโหมดสว่างและมืด — ถ้าจะเปลี่ยนสี ต้องรันเครื่องมือตรวจซ้ำ
 * ในโหมดสว่างมีสามสีที่คอนทราสต์ต่ำกว่า 3:1 จึงต้องมีคำอธิบายสัญลักษณ์
 * และตารางข้อมูลกำกับเสมอ ไม่สื่อความหมายด้วยสีอย่างเดียว
 */
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181']

/** เดือนเรียงตามปีงบประมาณไทย: ตุลาคม → กันยายน */
const FISCAL_MONTH_ORDER = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9]

export interface SpendPoint {
  /** เลขเดือน 1-12 */
  month: number
  courseCode: string
  amount: number
}

interface Props {
  points: SpendPoint[]
  fiscalYearBE: number
  loading?: boolean
}

interface ChartRow {
  monthLabel: string
  [courseCode: string]: string | number
}

export function BudgetLineChart({ points, fiscalYearBE, loading }: Props) {
  const { theme } = useTheme()
  const colors = theme === 'dark' ? SERIES_DARK : SERIES_LIGHT
  const axisColor = theme === 'dark' ? '#94a3b8' : '#64748b'
  const gridColor = theme === 'dark' ? '#1e293b' : '#e2e8f0'

  const { rows, courses } = useMemo(() => {
    // เลือก 5 รายวิชาที่ใช้งบสูงสุด — ไม่วาดทุกรายวิชาเพราะอ่านไม่ออก
    // ที่เหลือดูได้จากตารางด้านล่าง ซึ่งแสดงครบทุกรายวิชา
    const totals = new Map<string, number>()
    for (const p of points) totals.set(p.courseCode, (totals.get(p.courseCode) ?? 0) + p.amount)
    const top = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code]) => code)

    const byMonth = new Map<number, Map<string, number>>()
    for (const p of points) {
      if (!top.includes(p.courseCode)) continue
      if (!byMonth.has(p.month)) byMonth.set(p.month, new Map())
      const m = byMonth.get(p.month)!
      m.set(p.courseCode, (m.get(p.courseCode) ?? 0) + p.amount)
    }

    // ยอดสะสมตลอดปีงบ ทำให้เส้นอ่านง่ายกว่ายอดรายเดือนที่กระโดดขึ้นลง
    const running = new Map<string, number>(top.map((c) => [c, 0]))
    const out: ChartRow[] = FISCAL_MONTH_ORDER.map((m) => {
      const row: ChartRow = { monthLabel: thaiMonthShort(m) }
      for (const code of top) {
        running.set(code, (running.get(code) ?? 0) + (byMonth.get(m)?.get(code) ?? 0))
        row[code] = running.get(code) ?? 0
      }
      return row
    })

    return { rows: out, courses: top }
  }, [points])

  return (
    <section className="card p-4">
      <header className="mb-1">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          การใช้เงินงบประมาณสะสมรายเดือน
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          ปีงบประมาณ พ.ศ. {fiscalYearBE} · แสดง 5 รายวิชาที่ใช้งบสูงสุด (ดูครบทุกรายวิชาได้จากตารางด้านล่าง)
        </p>
      </header>

      {loading ? (
        <div className="flex h-72 items-center justify-center text-sm text-slate-500">กำลังโหลดข้อมูล…</div>
      ) : courses.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-sm text-slate-500">
          ยังไม่มีข้อมูลการเบิกจ่ายในปีงบประมาณนี้
        </div>
      ) : (
        <div className="h-72 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="monthLabel" tickLine={false} axisLine={{ stroke: gridColor }}
                tick={{ fill: axisColor, fontSize: 12 }} interval="preserveStartEnd"
              />
              <YAxis
                tickLine={false} axisLine={false} width={68}
                tick={{ fill: axisColor, fontSize: 12 }}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
              <Tooltip
                formatter={(value: number, name: string) => [formatBaht(value), name]}
                labelFormatter={(l: string) => `เดือน ${l}`}
                contentStyle={{
                  borderRadius: 12,
                  border: `1px solid ${gridColor}`,
                  background: theme === 'dark' ? '#0f172a' : '#ffffff',
                  color: theme === 'dark' ? '#e2e8f0' : '#1e293b',
                  fontSize: 12,
                }}
              />
              <Legend
                verticalAlign="bottom" height={36}
                wrapperStyle={{ fontSize: 12, color: axisColor }}
              />
              {courses.map((code, i) => (
                <Line
                  key={code}
                  type="monotone"
                  dataKey={code}
                  name={code}
                  stroke={colors[i]}
                  strokeWidth={2}
                  dot={{ r: 4, strokeWidth: 0, fill: colors[i] }}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: theme === 'dark' ? '#0f172a' : '#ffffff' }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
