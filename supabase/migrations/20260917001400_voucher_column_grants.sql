-- =====================================================================
-- 0014 ปิดช่องที่หน้าเว็บเขียนคอลัมน์ซึ่งไม่ควรเขียนได้
--
-- RLS ควบคุมได้แค่ระดับ "แถว" ไม่ใช่ระดับคอลัมน์ ตาราง payees / clinical_sites /
-- user_profiles ถูกคุมด้วย GRANT ระดับคอลัมน์ไว้แล้วใน 0005 แต่ payment_vouchers
-- ยังไม่ได้คุม ทำให้ผู้ใช้ที่มีสิทธิ์แก้เอกสารของสาขาตน ยิง PATCH ตรงไปที่ REST
-- แล้วเขียนคอลัมน์เหล่านี้ได้:
--
--   total_amount    ยอดที่พิมพ์ลงแบบฟอร์มและขึ้นฎีกา (ต้องมาจากผลรวมบรรทัดเท่านั้น)
--   voucher_no      เลขที่ใบสำคัญ (ต้องออกโดย next_voucher_no ตอนส่งเอกสาร)
--   status และ submitted_by/verified_by/paid_by/payment_date/payment_bank_code
--                   (ต้องเปลี่ยนผ่าน set_voucher_status เท่านั้น)
--   created_by      ผู้จัดทำ ซึ่งเป็นฐานของการแบ่งแยกหน้าที่
--
-- trigger guard_voucher_header กันไว้เฉพาะเอกสารที่ verified/paid แล้ว
-- เอกสารสถานะ draft/submitted จึงยังเขียนได้ทั้งหมด นี่คือช่องที่ปิดในไฟล์นี้
-- =====================================================================

revoke update on public.payment_vouchers from authenticated;

grant update (
  -- ข้อความบนแบบฟอร์ม
  faculty_text, semester_text, year_be, subject_text, teaching_level, doc_date,
  fiscal_year_id,
  -- ช่องลงนามสี่ตำแหน่ง
  preparer_coordinator_id, preparer_position, preparer_date,
  payer_name, payer_position, payer_date,
  certifier_name, certifier_position, certifier_date,
  approver_name, approver_position, approver_date,
  -- ตัวอักษรจำนวนเงิน (คำนวณที่หน้าเว็บ ตรวจซ้ำได้จาก total_amount)
  amount_in_words,
  note, updated_at
) on public.payment_vouchers to authenticated;

-- ---------------------------------------------------------------------
-- ผู้จัดทำต้องเป็นผู้ใช้ที่เข้าสู่ระบบจริง ไม่ใช่ค่าที่หน้าเว็บส่งมา
--
-- เดิมใช้ coalesce(new.created_by, auth.uid()) ซึ่งให้ค่าที่ client ส่งมาชนะ
-- ผู้ใช้จึงใส่ชื่อคนอื่นเป็นผู้จัดทำได้ แล้วไปกดตรวจสอบเอกสารนั้นเองโดยที่
-- guard_segregation_of_duties ไม่จับ — สลับลำดับให้ auth.uid() ชนะเสมอ
-- แต่ยังปล่อยให้ฝั่งเซิร์ฟเวอร์ (auth.uid() เป็น null เช่นสคริปต์นำเข้าข้อมูล)
-- ระบุผู้จัดทำได้ตามเดิม
-- ---------------------------------------------------------------------
create or replace function public.sync_voucher_keys()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_dept uuid; v_fy uuid;
begin
  select department_id, fiscal_year_id into v_dept, v_fy
  from public.course_offerings where id = new.course_offering_id;
  new.department_id  := v_dept;
  new.fiscal_year_id := coalesce(new.fiscal_year_id, v_fy);
  new.updated_at     := now();

  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
  else
    new.created_by := old.created_by;   -- ห้ามเปลี่ยนผู้จัดทำย้อนหลัง
  end if;

  return new;
end $$;

create or replace function public.sync_cover_sheet_keys()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
  else
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- ผู้ติ๊กเช็คลิสต์ก็ต้องเป็นผู้ใช้จริง — ช่องนี้เป็นหลักฐานว่าใครตรวจเอกสารแนบ
-- ---------------------------------------------------------------------
create or replace function public.sync_checklist_mark()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_checked then
    new.checked_by := coalesce((select auth.uid()), new.checked_by);
    new.checked_at := coalesce(new.checked_at, now());
  else
    new.checked_by := null;
    new.checked_at := null;
  end if;
  return new;
end $$;

create trigger trg_checklist_mark_sync
  before insert or update on public.voucher_checklists
  for each row execute function public.sync_checklist_mark();

-- ---------------------------------------------------------------------
-- ช่อง "รวมเงิน" ของหน้างบฯ ต้องเท่ากับ "จำนวนเงิน" ของใบสำคัญบรรทัดนั้น
-- มิฉะนั้นยอดรวมทั้งสิ้นบนฎีกาจะไม่เท่ากับผลรวมใบสำคัญที่แนบ
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

  if new.amount is distinct from v.total_amount then
    raise exception 'จำนวนเงิน % ไม่ตรงกับยอดในใบสำคัญ %', new.amount, v.total_amount
      using errcode = '23514';
  end if;

  if new.subtotal is distinct from new.amount then
    raise exception 'ช่องรวมเงิน % ต้องเท่ากับจำนวนเงิน %', new.subtotal, new.amount
      using errcode = '23514';
  end if;

  return new;
end $$;

comment on table public.payment_vouchers is
  'คอลัมน์ยอดเงิน เลขที่ใบสำคัญ สถานะ และผู้จัดทำ ถูกถอนสิทธิ์ UPDATE จาก authenticated ใน migration 0014 — แก้ได้ผ่าน trigger และ RPC เท่านั้น';
