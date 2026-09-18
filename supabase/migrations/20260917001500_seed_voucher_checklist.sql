-- =====================================================================
-- 0015 สร้างเช็คลิสต์เอกสารแนบให้ใบสำคัญอัตโนมัติ
--
-- set_voucher_status ตรวจว่า "ไม่มีรายการเช็คลิสต์ที่ยังไม่ติ๊ก" ก่อนส่งเอกสาร
-- ถ้าใบนั้นไม่มีแถวเช็คลิสต์เลย เงื่อนไขจะเป็นจริงโดยปริยาย และส่งเอกสารผ่านได้
-- โดยไม่ต้องตรวจเอกสารแนบอะไร
--
-- เดิมหน้าเว็บเป็นฝ่ายสร้างแถวเหล่านี้หลังสร้างใบสำคัญ ซึ่งพลาดได้สองทาง:
-- คำสั่งที่สองล้มเหลวหลังจากสร้างหัวเอกสารสำเร็จ หรือมีใครสร้างใบสำคัญ
-- ผ่าน REST โดยตรงเพื่อข้ามเช็คลิสต์ไปเลย
--
-- การควบคุมจึงต้องอยู่ที่ฐานข้อมูล เหมือนกับการควบคุมอื่นทั้งหมดในระบบนี้
-- =====================================================================

create or replace function public.seed_voucher_checklist()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.voucher_checklists (voucher_id, item_key, is_checked)
  select new.id, c.key, false
  from public.checklist_items c
  where c.is_active
  on conflict (voucher_id, item_key) do nothing;
  return new;
end $$;

create trigger trg_voucher_seed_checklist
  after insert on public.payment_vouchers
  for each row execute function public.seed_voucher_checklist();

-- เติมย้อนหลังให้เอกสารที่ยังเป็นร่างและยังไม่มีเช็คลิสต์
-- (เอกสารที่ส่ง/ตรวจ/จ่ายแล้ว ไม่แตะ เพราะการเพิ่มรายการที่ยังไม่ติ๊ก
--  จะทำให้เอกสารที่ปิดไปแล้วดูเหมือนไม่ครบ)
insert into public.voucher_checklists (voucher_id, item_key, is_checked)
select v.id, c.key, false
from public.payment_vouchers v
cross join public.checklist_items c
where v.status = 'draft' and c.is_active
  and not exists (select 1 from public.voucher_checklists x where x.voucher_id = v.id)
on conflict (voucher_id, item_key) do nothing;

comment on function public.seed_voucher_checklist() is
  'ถ้าใบสำคัญไม่มีแถวเช็คลิสต์เลย เงื่อนไข "ติ๊กครบ" ตอนส่งเอกสารจะผ่านโดยไม่ตรวจอะไร';
