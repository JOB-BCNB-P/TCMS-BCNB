-- =====================================================================
-- 0016 สองข้อที่ "โค้ดบอกอย่าง RLS บอกอีกอย่าง" — พบตอนรีวิวหน้าจอ
--
-- 1. trigger guard_voucher_mutable และ guard_voucher_header ใน 0004 เขียนไว้ว่า
--    เอกสารสถานะ verified "แก้ได้เฉพาะผู้ดูแลระบบ" (มีเงื่อนไข not is_admin())
--    แต่ policy voucher_update / vlines_write / vchk_write ใน 0005 จำกัดไว้
--    เฉพาะสถานะ draft/submitted โดยไม่มีข้อยกเว้นให้ผู้ดูแลระบบ
--    ข้อยกเว้นใน trigger จึงไปไม่ถึงเลย — ผู้ดูแลระบบแก้เอกสารที่ตรวจสอบแล้วไม่ได้
--    และร้ายกว่านั้นคือ UPDATE ที่ถูก RLS กรองแถวออก PostgREST ตอบ 204 ไม่ใช่ error
--    หน้าเว็บจึงขึ้นว่า "บันทึกเรียบร้อย" ทั้งที่ไม่มีอะไรเปลี่ยน
--
--    เอกสารที่ตรวจสอบแล้วต้องแก้ได้จริงในทางปฏิบัติ (การเงินตีกลับให้แก้ตัวเลข)
--    จึงเปิดให้ผู้ดูแลระบบตามที่ trigger ตั้งใจไว้ตั้งแต่ต้น
--    ส่วนเอกสารที่จ่ายเงินแล้ว ยังห้ามแก้ทุกกรณีตามเดิม (trigger เป็นผู้บังคับ)
--
-- 2. policy cover_write ใน 0005 ให้สิทธิ์ ('admin','finance') ทำหน้างบฯ
--    แต่ role_menu_permissions ใน 0006 ให้เจ้าหน้าที่การเงินแค่ can_view
--    เจ้าหน้าที่การเงินจึงเปิดหน้าได้แต่ไม่มีปุ่มใด ๆ ให้กด
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ผู้ดูแลระบบแก้เอกสารที่ตรวจสอบแล้วได้ (แต่ไม่ใช่เอกสารที่จ่ายเงินแล้ว)
-- ---------------------------------------------------------------------
create policy voucher_update_admin on public.payment_vouchers
  for update to authenticated
  using ((select public.is_admin()) and deleted_at is null and status <> 'paid')
  with check ((select public.is_admin()));

-- แยกตามคำสั่ง ไม่ใช้ FOR ALL ตามกฎที่ตั้งไว้ใน SECURITY-REVIEW ข้อ 14.3
create policy vlines_admin_insert on public.voucher_lines
  for insert to authenticated
  with check ((select public.is_admin())
              and exists (select 1 from public.payment_vouchers v
                          where v.id = voucher_id and v.status <> 'paid'));
create policy vlines_admin_update on public.voucher_lines
  for update to authenticated
  using ((select public.is_admin())
         and exists (select 1 from public.payment_vouchers v
                     where v.id = voucher_id and v.status <> 'paid'))
  with check ((select public.is_admin()));
create policy vlines_admin_delete on public.voucher_lines
  for delete to authenticated
  using ((select public.is_admin())
         and exists (select 1 from public.payment_vouchers v
                     where v.id = voucher_id and v.status <> 'paid'));

create policy vchk_admin_insert on public.voucher_checklists
  for insert to authenticated
  with check ((select public.is_admin()));
create policy vchk_admin_update on public.voucher_checklists
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- 2. เจ้าหน้าที่งานการเงินทำหน้างบฯ ได้จริงตามที่ RLS อนุญาต
-- ---------------------------------------------------------------------
update public.role_menu_permissions p
   set can_create = true, can_update = true, can_delete = true
  from public.roles r
 where r.id = p.role_id and r.code = 'finance'
   and p.menu_key = 'docs.cover';

-- และให้เห็นเมนูใบสำคัญเพื่อกดเข้าไปดูรายละเอียดก่อนตรวจสอบ (อ่านอย่างเดียว)
insert into public.role_menu_permissions (role_id, menu_key, can_view)
select r.id, 'docs.voucher', true from public.roles r where r.code = 'finance'
on conflict (role_id, menu_key) do update set can_view = true;

comment on policy voucher_update_admin on public.payment_vouchers is
  'เปิดให้ผู้ดูแลระบบแก้เอกสารที่ตรวจสอบแล้ว ตามที่ guard_voucher_header ตั้งใจไว้ ส่วนเอกสารที่จ่ายเงินแล้ว trigger ยังห้ามแก้ทุกกรณี';
