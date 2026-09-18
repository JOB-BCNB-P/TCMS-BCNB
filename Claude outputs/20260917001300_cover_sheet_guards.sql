-- =====================================================================
-- 0013 ปิดช่องโหว่ของหน้างบใบสำคัญฯ
--
-- สามอย่างที่ขาดไปตั้งแต่ migration 0003/0007 และเพิ่งเห็นตอนทำหน้าจอ:
--
-- 1. treasury_cover_sheets.created_by ไม่มีใครเติม ถ้าหน้าเว็บไม่ส่งมาก็เป็น NULL
--    ซึ่งทำให้ guard_cover_sheet_segregation() ใน 0007 ผ่านตลอดโดยไม่ตรวจอะไรเลย
--    (v_owner is not null เป็นเท็จ) การควบคุมการแบ่งแยกหน้าที่จึงไร้ผลเงียบ ๆ
--
-- 2. total_amount ของหน้างบฯ ไม่มี trigger คำนวณ ถ้าให้หน้าเว็บส่งยอดรวมมาเอง
--    ตัวเลขบนฎีกาจะเพี้ยนจากผลรวมรายการได้ — ยอดบนเอกสารการเงินต้องคำนวณจากข้อมูล
--
-- 3. ไม่มีอะไรกันการเอาใบสำคัญที่ยังเป็นร่าง ถูกยกเลิก ถูกลบ หรืออยู่คนละปีงบ
--    มาขึ้นหน้างบฯ
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ผู้จัดทำหน้างบฯ บันทึกจากผู้ใช้ที่เข้าสู่ระบบเสมอ และห้ามเปลี่ยนย้อนหลัง
-- ---------------------------------------------------------------------
create or replace function public.sync_cover_sheet_keys()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  else
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger trg_cover_sheet_sync_keys
  before insert or update on public.treasury_cover_sheets
  for each row execute function public.sync_cover_sheet_keys();

-- ---------------------------------------------------------------------
-- 2. ยอดรวมหน้างบฯ คำนวณจากรายการเสมอ
--    ใช้ subtotal เพราะเป็นช่อง "รวมเงิน" ที่ปรากฏบนแบบฟอร์ม
-- ---------------------------------------------------------------------
create or replace function public.recalc_cover_sheet_total()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_sheet uuid := coalesce(new.sheet_id, old.sheet_id);
begin
  update public.treasury_cover_sheets s
     set total_amount = coalesce((select sum(i.subtotal)
                                  from public.treasury_cover_sheet_items i
                                  where i.sheet_id = v_sheet), 0),
         updated_at   = now()
   where s.id = v_sheet;
  return coalesce(new, old);
end $$;

create trigger trg_cover_sheet_items_total
  after insert or update or delete on public.treasury_cover_sheet_items
  for each row execute function public.recalc_cover_sheet_total();

-- ห้ามหน้าเว็บส่ง total_amount มาเอง (คอลัมน์นี้เป็นผลคำนวณ)
revoke update on public.treasury_cover_sheets from authenticated;
grant  update (sheet_no, fiscal_year_id, teacher_type, study_level, program_name,
               student_year_level, period_month,
               requester_name, requester_position, request_date,
               approver_name, approver_position, approve_date,
               status, note, deleted_at, deleted_by, updated_at)
       on public.treasury_cover_sheets to authenticated;

-- ---------------------------------------------------------------------
-- 3. ใบสำคัญที่นำขึ้นหน้างบฯ ต้องพร้อมจริง
-- ---------------------------------------------------------------------
create or replace function public.guard_cover_sheet_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v public.payment_vouchers;
  v_sheet_fy uuid;
begin
  select * into v from public.payment_vouchers where id = new.voucher_id;
  if not found then
    raise exception 'ไม่พบใบสำคัญที่อ้างถึง' using errcode = 'P0002';
  end if;

  if v.deleted_at is not null then
    raise exception 'ใบสำคัญฉบับนี้ถูกลบแล้ว นำขึ้นหน้างบฯ ไม่ได้' using errcode = '23514';
  end if;

  if v.status in ('draft', 'cancelled') then
    raise exception
      'ใบสำคัญที่ยังเป็นร่างหรือถูกยกเลิก นำขึ้นหน้างบฯ ไม่ได้ (สถานะปัจจุบัน: %)', v.status
      using errcode = '23514';
  end if;

  select fiscal_year_id into v_sheet_fy
  from public.treasury_cover_sheets where id = new.sheet_id;

  if v_sheet_fy is distinct from v.fiscal_year_id then
    raise exception 'ใบสำคัญเลขที่ % อยู่คนละปีงบประมาณกับหน้างบฯ ฉบับนี้',
      coalesce(v.voucher_no, '(ยังไม่มีเลขที่)') using errcode = '23514';
  end if;

  -- ยอดบนหน้างบฯ ต้องตรงกับยอดในใบสำคัญ ไม่ให้พิมพ์ตัวเลขใหม่
  if new.amount is distinct from v.total_amount then
    raise exception 'จำนวนเงิน % ไม่ตรงกับยอดในใบสำคัญ %', new.amount, v.total_amount
      using errcode = '23514';
  end if;

  return new;
end $$;

-- ทำงานคู่กับ trg_cover_item_segregation ใน 0007 (ทั้งคู่เป็น BEFORE ที่มีแต่การ raise
-- ลำดับจึงไม่สำคัญ ข้อใดผิดก่อนก็หยุดทั้งคำสั่ง)
create trigger trg_cover_sheet_item_guard
  before insert or update on public.treasury_cover_sheet_items
  for each row execute function public.guard_cover_sheet_item();

comment on function public.guard_cover_sheet_item() is
  'กันการนำใบสำคัญที่ยังไม่ส่ง ถูกยกเลิก ถูกลบ ข้ามปีงบ หรือยอดไม่ตรง มาขึ้นฎีกา';
