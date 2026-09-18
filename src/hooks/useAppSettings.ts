import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface SettingRow { key: string; value: unknown; name_th: string }

/** คีย์เดียวสำหรับค่าคงที่องค์กร — ห้ามมีหน้าใดสร้าง query ['app_settings'] รูปอื่น */
export const APP_SETTINGS_KEY = ['app_settings'] as const

/**
 * ค่าคงที่องค์กร (ชื่อส่วนราชการ ชื่อผู้อำนวยการ รหัสแบบฟอร์ม)
 *
 * เดิมสามหน้าต่างสร้าง useQuery คีย์ ['app_settings'] เหมือนกันแต่คืนรูปข้อมูลต่างกัน
 * (บางหน้าคืน Map บางหน้าคืน array) TanStack Query ใช้ cache ช่องเดียวกัน
 * หน้าที่ mount ทีหลังจึงได้ข้อมูลของหน้าอื่นแล้วพังทั้งหน้า (.get is not a function)
 * รวมมาไว้ที่ฟังก์ชันเดียวเพื่อให้คีย์หนึ่งคีย์มีรูปข้อมูลเดียวเสมอ
 */
export function useAppSettings() {
  return useQuery({
    queryKey: APP_SETTINGS_KEY,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('key, value, name_th')
      if (error) throw error
      const rows = (data ?? []) as SettingRow[]
      return {
        rows,
        map: new Map(rows.map((r) => [r.key, r.value])),
      }
    },
  })
}

/** ค่าข้อความของคีย์หนึ่ง ("" ถ้าไม่มีหรือไม่ใช่ข้อความ) */
export function settingText(
  data: { map: Map<string, unknown> } | undefined, key: string,
): string {
  const v = data?.map.get(key)
  return typeof v === 'string' ? v : ''
}

/** ค่าอ็อบเจกต์ของคีย์หนึ่ง (เช่น org.director) */
export function settingObject(
  data: { map: Map<string, unknown> } | undefined, key: string,
): Record<string, string> {
  const v = data?.map.get(key)
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {}
}
