import { useMemo } from 'react'
import { useAuth } from '@/auth/AuthProvider'

export interface MenuNode {
  key: string
  label: string
  path: string
  children?: MenuNode[]
}

/** ต้องตรงกับตาราง public.menus ใน migration 0006 */
export const MENU_TREE: MenuNode[] = [
  { key: 'dashboard', label: 'หน้าหลัก', path: '/' },
  {
    key: 'master',
    label: 'ข้อมูลรายวิชา/อาจารย์/แหล่งฝึก',
    path: '/master',
    children: [
      { key: 'master.course', label: 'รายวิชา', path: '/master/courses' },
      { key: 'master.offering', label: 'รายวิชาที่เปิดสอน', path: '/master/offerings' },
      { key: 'master.lecturer', label: 'อาจารย์พิเศษ', path: '/master/lecturers' },
      { key: 'master.preceptor', label: 'อาจารย์แหล่งฝึก', path: '/master/preceptors' },
      { key: 'master.coord', label: 'ผู้ประสานงานรายวิชา', path: '/master/coordinators' },
      { key: 'master.site', label: 'แหล่งฝึกปฏิบัติการ', path: '/master/sites' },
      { key: 'master.budget', label: 'หมวดเงินและวงเงินรายวิชา', path: '/master/budget' },
    ],
  },
  {
    key: 'docs',
    label: 'สร้างเอกสาร',
    path: '/docs',
    children: [
      { key: 'docs.voucher', label: 'สร้างใบเบิก', path: '/docs/vouchers' },
      { key: 'docs.cover', label: 'หน้างบใบสำคัญฯ ประกอบฎีกา', path: '/docs/cover-sheets' },
      { key: 'docs.checklist', label: 'ใบเช็คลิสต์การเบิกจ่าย', path: '/docs/checklists' },
    ],
  },
  {
    key: 'finance',
    label: 'งานการเงิน',
    path: '/finance',
    children: [{ key: 'finance.status', label: 'ปรับสถานะการเบิกจ่าย', path: '/finance/status' }],
  },
  {
    key: 'settings',
    label: 'ตั้งค่าระบบ',
    path: '/settings',
    children: [
      { key: 'settings.users', label: 'จัดการผู้ใช้งาน', path: '/settings/users' },
      { key: 'settings.perms', label: 'สิทธิ์การเข้าถึงของแต่ละบทบาท', path: '/settings/permissions' },
      { key: 'settings.ref', label: 'ปีการศึกษา/ภาคการศึกษา/ปีงบประมาณ', path: '/settings/reference' },
      { key: 'settings.audit', label: 'ประวัติการเข้าใช้งาน', path: '/settings/audit' },
    ],
  },
]

type Action = 'view' | 'create' | 'update' | 'delete'

export function usePermissions() {
  const { permissions, user } = useAuth()

  return useMemo(() => {
    /**
     * ใช้ตัดสินว่าจะแสดงเมนูและปุ่มอะไร
     *
     * ตั้งแต่ migration 0018 ตารางเดียวกันนี้ถูกบังคับที่ฐานข้อมูลด้วย
     * RESTRICTIVE policy ด้วย — ติ๊กออกแล้วปิดจริงถึง API
     * แต่ยังห้ามคิดว่าการซ่อนปุ่มคือการควบคุมสิทธิ์: การ "ติ๊กเพิ่ม"
     * ไม่ได้เปิดสิทธิ์ใด ๆ ขอบเขตสาขาและการแบ่งแยกหน้าที่ยังอยู่ที่ RLS เดิม
     */
    const can = (menuKey: string, action: Action = 'view'): boolean => {
      const p = permissions.get(menuKey)
      if (!p) return false
      switch (action) {
        case 'view': return p.can_view
        case 'create': return p.can_create
        case 'update': return p.can_update
        case 'delete': return p.can_delete
      }
    }

    const visibleMenu = MENU_TREE.flatMap((node) => {
      const children = node.children?.filter((c) => can(c.key)) ?? []
      if (node.children && node.children.length > 0) {
        return children.length > 0 ? [{ ...node, children }] : []
      }
      return can(node.key) ? [node] : []
    })

    const isReadOnlyRole = user?.role_code === 'instructor' || user?.role_code === 'executive'

    return { can, visibleMenu, isReadOnlyRole }
  }, [permissions, user])
}
