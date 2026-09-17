-- =====================================================================
-- TCMS-BCNB : 0007 การแบ่งแยกหน้าที่แบบ maker-checker
-- =====================================================================
-- ที่มา: บทบาท admin เดิมรวมอำนาจไว้คนเดียว (กำหนดสิทธิ์ ทำเอกสาร
-- ย้อนสถานะ อ่านเลขบัญชี) ซึ่งขัดหลักการแบ่งแยกหน้าที่ที่งานตรวจสอบภายในดู
-- วิทยาลัยเลือกคงบทบาทเดียวไว้ แต่บังคับที่ฐานข้อมูลว่าเอกสารแต่ละฉบับ
-- ต้องผ่านมือมากกว่าหนึ่งคน การควบคุมจึงอยู่ที่ "คนละคน" ไม่ใช่ "คนละบทบาท"
-- ซึ่งพิสูจน์ได้จริงจาก audit และตอบผู้ตรวจสอบได้ว่ามีการสอบยันทุกฉบับ
--
-- แยกเป็นสองสวิตช์โดยตั้งใจ เพราะข้อบังคับสองข้อนี้มีต้นทุนต่างกันมาก
-- ในหน่วยงานที่มีเจ้าหน้าที่จำกัด
-- =====================================================================

insert into public.app_settings (key, value, name_th) values
  -- ข้อนี้แทบไม่มีต้นทุน: ผู้จัดทำคือเลขานุการ/วิชาการ ผู้ตรวจสอบคือการเงิน
  -- ซึ่งเป็นคนละคนอยู่แล้วตามกระบวนงานปกติ จึงเปิดเป็นค่าตั้งต้น
  ('control.enforce_maker_checker', 'true'::jsonb,
   'บังคับให้ผู้ตรวจสอบเอกสารไม่ใช่คนเดียวกับผู้จัดทำ'),
  -- ข้อนี้มีต้นทุนจริง: ถ้างานการเงินมีเจ้าหน้าที่คนเดียว จะทำงานไม่ได้เลย
  -- จึงปิดเป็นค่าตั้งต้น ให้วิทยาลัยเปิดเมื่อมีเจ้าหน้าที่การเงินตั้งแต่ 2 คนขึ้นไป
  ('control.enforce_checker_payer', 'false'::jsonb,
   'บังคับให้ผู้จ่ายเงินไม่ใช่คนเดียวกับผู้ตรวจสอบ (เปิดเมื่อมีเจ้าหน้าที่การเงิน 2 คนขึ้นไป)')
on conflict (key) do nothing;

create or replace function public.control_flag(p_key text, p_default boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::boolean
                   from public.app_settings where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------
-- บังคับที่ใบหลักฐานการเบิกจ่าย
-- ---------------------------------------------------------------------
create or replace function public.guard_segregation_of_duties()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_maker uuid := coalesce(new.submitted_by, new.created_by);
begin
  if public.control_flag('control.enforce_maker_checker', true) then
    if new.verified_by is not null and v_maker is not null
       and new.verified_by = v_maker then
      raise exception
        'ผู้ตรวจสอบต้องไม่ใช่ผู้จัดทำเอกสารฉบับเดียวกัน (การแบ่งแยกหน้าที่)'
        using errcode = '42501',
              hint = 'ให้เจ้าหน้าที่อีกท่านเป็นผู้กดตรวจสอบ';
    end if;
    if new.paid_by is not null and v_maker is not null
       and new.paid_by = v_maker then
      raise exception
        'ผู้จ่ายเงินต้องไม่ใช่ผู้จัดทำเอกสารฉบับเดียวกัน (การแบ่งแยกหน้าที่)'
        using errcode = '42501';
    end if;
  end if;

  if public.control_flag('control.enforce_checker_payer', false) then
    if new.paid_by is not null and new.verified_by is not null
       and new.paid_by = new.verified_by then
      raise exception
        'ผู้จ่ายเงินต้องไม่ใช่ผู้ตรวจสอบเอกสารฉบับเดียวกัน (การแบ่งแยกหน้าที่)'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

create trigger trg_voucher_segregation
  before insert or update on public.payment_vouchers
  for each row execute function public.guard_segregation_of_duties();

-- ---------------------------------------------------------------------
-- บังคับที่หน้างบใบสำคัญฯ: ผู้จัดทำหน้างบต้องไม่ใช่ผู้จัดทำใบสำคัญที่นำมาขึ้น
-- (กันกรณีทำใบเบิกเองแล้วรวบขึ้นฎีกาเองโดยไม่มีใครสอบยัน)
-- ---------------------------------------------------------------------
create or replace function public.guard_cover_sheet_segregation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_maker uuid; v_no text;
begin
  if not public.control_flag('control.enforce_maker_checker', true) then
    return new;
  end if;

  select created_by into v_owner
  from public.treasury_cover_sheets where id = new.sheet_id;

  select coalesce(submitted_by, created_by), voucher_no into v_maker, v_no
  from public.payment_vouchers where id = new.voucher_id;

  if v_owner is not null and v_maker is not null and v_owner = v_maker then
    raise exception
      'ผู้จัดทำหน้างบฯ ต้องไม่ใช่ผู้จัดทำใบสำคัญเลขที่ % (การแบ่งแยกหน้าที่)',
      coalesce(v_no, '(ยังไม่มีเลขที่)')
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger trg_cover_item_segregation
  before insert or update on public.treasury_cover_sheet_items
  for each row execute function public.guard_cover_sheet_segregation();

-- ---------------------------------------------------------------------
-- มุมมองสำหรับผู้ตรวจสอบภายใน: เอกสารแต่ละฉบับผ่านมือใครบ้าง
-- ไม่มีคอลัมน์เลขบัญชี และ RLS ของตารางต้นทางมีผลกับผู้เรียก
-- ---------------------------------------------------------------------
create or replace view public.v_voucher_control_trail
with (security_invoker = true) as
select
  v.id              as voucher_id,
  v.voucher_no,
  v.status,
  v.department_id,
  v.fiscal_year_id,
  v.total_amount,
  v.doc_date,
  v.payment_date,
  maker.email::text   as maker_email,
  checker.email::text as checker_email,
  payer.email::text   as payer_email,
  v.submitted_at, v.verified_at, v.paid_at,
  (maker.id   is not null and checker.id is not null and maker.id = checker.id)
                    as flag_maker_equals_checker,
  (checker.id is not null and payer.id   is not null and checker.id = payer.id)
                    as flag_checker_equals_payer
from public.payment_vouchers v
left join public.user_profiles maker   on maker.id   = coalesce(v.submitted_by, v.created_by)
left join public.user_profiles checker on checker.id = v.verified_by
left join public.user_profiles payer   on payer.id   = v.paid_by
where v.deleted_at is null;

comment on view public.v_voucher_control_trail is
  'รายงานการสอบยันระหว่างบุคคลต่อใบสำคัญ ใช้ตอบคำถามผู้ตรวจสอบภายในและ สตง. '
  'แถวที่ flag_* เป็นจริง คือฉบับที่ทำในช่วงที่ปิดสวิตช์ควบคุมไว้';

grant execute on function public.control_flag(text, boolean) to authenticated;
