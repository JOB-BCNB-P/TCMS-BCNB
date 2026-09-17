-- =====================================================================
-- TCMS-BCNB : 0009 แหล่งเงิน (หมวดเงิน) และอัตราค่าตอบแทน
-- =====================================================================
-- แก้ความเข้าใจผิดของ migration 0006: "หมวดเงิน" ในข้อกำหนดหมายถึง
-- แหล่งเงิน (เงินอุดหนุนทั่วไป / เงินรายได้สถาบัน) ไม่ใช่ประเภทรายการ
-- ของจริงจึงเป็นสองมิติ: แหล่งเงิน × รายการค่าใช้จ่าย
-- และอัตราต่อชั่วโมงขึ้นกับทั้งสองมิติ บวกสถานะข้าราชการของผู้สอน
--
-- ที่มา: หลักเกณฑ์และกรอบอัตราการเบิกค่าใช้จ่าย วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ
-- =====================================================================

create type public.fund_source as enum ('general_subsidy', 'institutional_revenue');
create type public.rate_unit   as enum ('hour', 'person_month', 'person_group_month', 'actual_cost');

-- ---------------------------------------------------------------------
-- 1. ปรับ budget_categories ให้เป็น (แหล่งเงิน × รายการ)
-- ---------------------------------------------------------------------
alter table public.budget_categories add column fund_source public.fund_source;

-- ลบชุดเดิมที่ยังไม่มีใครอ้างถึง (ฐานข้อมูลใหม่จะลบได้ทั้งหมด
-- ถ้าเป็นฐานข้อมูลที่ใช้งานแล้ว แถวที่ถูกอ้างถึงจะคงไว้ให้ตั้ง fund_source เอง)
delete from public.budget_categories bc
where bc.code in ('TEACH_THEORY','TEACH_LAB','TEACH_PRAC','SITE_COMP','SUPERVISION','SIM_PATIENT')
  and not exists (select 1 from public.course_budget_allocations a
                  where a.budget_category_id = bc.id);

insert into public.budget_categories (code, name_th, expense_item, fund_source, sort_order) values
  -- เงินอุดหนุนทั่วไป
  ('GEN_THEORY',  'เงินอุดหนุนทั่วไป — ค่าสอนทฤษฎี',            'theory',             'general_subsidy',       11),
  ('GEN_LAB',     'เงินอุดหนุนทั่วไป — ค่าสอนทดลอง',            'lab',                'general_subsidy',       12),
  ('GEN_PRAC',    'เงินอุดหนุนทั่วไป — ค่าสอนภาคปฏิบัติ',        'practice',           'general_subsidy',       13),
  ('GEN_TRAVEL',  'เงินอุดหนุนทั่วไป — ค่าเดินทางไปนิเทศ',       'supervision_travel', 'general_subsidy',       14),
  -- เงินรายได้สถาบัน
  ('REV_THEORY',  'เงินรายได้สถาบัน — ค่าสอนทฤษฎี',             'theory',             'institutional_revenue', 21),
  ('REV_LAB',     'เงินรายได้สถาบัน — ค่าสอนทดลอง',             'lab',                'institutional_revenue', 22),
  ('REV_SITE',    'เงินรายได้สถาบัน — ค่าตอบแทนแหล่งฝึก',        'site_compensation',  'institutional_revenue', 23),
  ('REV_CLINIC',  'เงินรายได้สถาบัน — ค่าตอบแทนบุคคลภายนอกสอนคลินิก', 'external_clinical', 'institutional_revenue', 24),
  ('REV_TRAVEL',  'เงินรายได้สถาบัน — ค่าเดินทางไปนิเทศ',        'supervision_travel', 'institutional_revenue', 25),
  ('REV_SIMPAT',  'เงินรายได้สถาบัน — ค่าตอบแทนผู้ป่วยเสมือน',   'simulated_patient',  'institutional_revenue', 26)
on conflict (code) do nothing;

-- แถวเดิมที่ยังถูกอ้างถึงต้องมีแหล่งเงิน จึงตั้งเป็นเงินอุดหนุนทั่วไปไว้ก่อน
-- และให้ผู้ดูแลระบบแก้ให้ถูกต้องภายหลัง (ฐานข้อมูลใหม่จะไม่มีแถวเหลือ)
update public.budget_categories set fund_source = 'general_subsidy' where fund_source is null;
alter table public.budget_categories alter column fund_source set not null;

create unique index budget_categories_fund_item_key
  on public.budget_categories (fund_source, expense_item);

-- ---------------------------------------------------------------------
-- 2. ตารางอัตราค่าตอบแทน
-- ---------------------------------------------------------------------
create table public.pay_rates (
  id             uuid primary key default gen_random_uuid(),
  fund_source    public.fund_source  not null,
  expense_item   public.expense_item not null,
  -- null = ใช้กับทุกคน · true/false = เฉพาะผู้ที่เป็น/ไม่เป็นข้าราชการหรือ
  -- ลูกจ้างประจำของทางราชการหรือพนักงานรัฐวิสาหกิจ
  is_government_officer boolean,
  unit           public.rate_unit not null,
  -- null = เบิกได้ตามจ่ายจริง ไม่มีเพดานต่อหน่วย (เช่น ค่าพาหนะ)
  amount         numeric(10,2) check (amount is null or amount >= 0),
  -- true = "ไม่เกิน" · false = อัตราตายตัวตามหลักเกณฑ์
  is_ceiling     boolean not null default true,
  effective_from date not null default '2000-01-01',
  effective_to   date,
  source_note    text,
  created_at     timestamptz not null default now(),
  updated_by     uuid references public.user_profiles,
  check (effective_to is null or effective_to >= effective_from),
  check (unit <> 'actual_cost' or amount is null)
);

-- คีย์ไม่ซ้ำแบบรองรับ NULL (NULL ปกติไม่ชนกันเองใน unique index)
create unique index pay_rates_key
  on public.pay_rates (fund_source, expense_item,
                       coalesce(is_government_officer, false),
                       (is_government_officer is null),
                       effective_from);

create index on public.pay_rates (fund_source, expense_item);

comment on table public.pay_rates is
  'อัตราตามหลักเกณฑ์และกรอบอัตราการเบิกค่าใช้จ่ายของวิทยาลัย '
  'การไม่มีแถวสำหรับคู่ (แหล่งเงิน × รายการ) แปลว่าหลักเกณฑ์ไม่ได้ให้เบิกจากแหล่งเงินนั้น';

-- ---------------------------------------------------------------------
-- 3. ข้อมูลอัตราตั้งต้น
-- ---------------------------------------------------------------------
insert into public.pay_rates
  (fund_source, expense_item, is_government_officer, unit, amount, is_ceiling, source_note) values
  -- ── เงินอุดหนุนทั่วไป ────────────────────────────────────────────
  ('general_subsidy', 'theory',  true,  'hour', 400.00, false,
   'ทฤษฎี 400 บาท/ชั่วโมง'),
  ('general_subsidy', 'theory',  false, 'hour', 800.00, false,
   'ทฤษฎี 800 บาท/ชั่วโมง (ผู้ทำการสอนที่มิได้เป็นข้าราชการหรือลูกจ้างประจำของทางราชการหรือพนักงานรัฐวิสาหกิจ)'),
  ('general_subsidy', 'lab',     null,  'hour', 200.00, false,
   'ทดลอง 200 บาท/ชั่วโมง'),
  ('general_subsidy', 'practice', null, 'hour', 150.00, true,
   'ค่าสอนภาคปฏิบัติ ไม่เกิน 150 บาท/ชั่วโมง'),
  ('general_subsidy', 'supervision_travel', null, 'actual_cost', null, true,
   'ค่าพาหนะเดินทางเบิกได้เท่าที่จ่ายจริง ใช้ยานพาหนะประจำทางและเบิกโดยประหยัด'),

  -- ── เงินรายได้สถาบัน ────────────────────────────────────────────
  ('institutional_revenue', 'theory', true,  'hour', 400.00, true,
   'ทฤษฎี ไม่เกิน 400 บาท/ชั่วโมง'),
  ('institutional_revenue', 'theory', false, 'hour', 800.00, true,
   'ทฤษฎี ไม่เกิน 800 บาท/ชั่วโมง (ผู้ทำการสอนที่มิได้เป็นข้าราชการหรือลูกจ้างประจำของทางราชการหรือพนักงานรัฐวิสาหกิจ)'),
  ('institutional_revenue', 'lab',    null,  'hour', 200.00, true,
   'ทดลอง ไม่เกิน 200 บาท/ชั่วโมง'),
  ('institutional_revenue', 'site_compensation', null, 'person_month', 100.00, true,
   'ค่าตอบแทนแหล่งฝึกภาคปฏิบัติ (หน่วยงาน) เหมาจ่ายไม่เกิน 100 บาท/คน/เดือน'),
  ('institutional_revenue', 'external_clinical', null, 'person_group_month', 900.00, true,
   'ค่าตอบแทนบุคคลภายนอกสอนด้านคลินิกในหอผู้ป่วยหรือแหล่งฝึกภาคปฏิบัติ ไม่เกิน 900 บาท/คน(ผู้สอน)/กลุ่ม/เดือน'),
  ('institutional_revenue', 'supervision_travel', null, 'actual_cost', null, true,
   'ค่าพาหนะเดินทางเบิกได้เท่าที่จ่ายจริง'),
  -- หลักเกณฑ์ที่ได้รับมายังไม่ระบุอัตราค่าตอบแทนผู้ป่วยเสมือน
  -- ตั้งเป็นเบิกตามจริงไว้ก่อน เพื่อไม่ให้ระบบบล็อกงานที่ทำอยู่
  -- และต้องกลับมาใส่เพดานเมื่อได้หลักเกณฑ์ฉบับที่ระบุอัตรา
  ('institutional_revenue', 'simulated_patient', null, 'actual_cost', null, true,
   'ยังไม่ได้รับอัตราตามหลักเกณฑ์ — ต้องยืนยันกับงานการเงินและใส่เพดานภายหลัง');

-- ---------------------------------------------------------------------
-- 4. จำนวนหน่วยของรายการ (รองรับหน่วยที่ไม่ใช่ชั่วโมง)
-- ---------------------------------------------------------------------
alter table public.voucher_lines
  add column quantity numeric(9,2) check (quantity is null or quantity >= 0);

comment on column public.voucher_lines.quantity is
  'จำนวนหน่วยตามหน่วยของอัตรา: ชั่วโมง / คน-เดือน / คน-กลุ่ม-เดือน '
  'สำหรับอัตรารายชั่วโมง ระบบเติมจากคอลัมน์ hours ให้อัตโนมัติ';

-- ---------------------------------------------------------------------
-- 5. ค้นอัตราที่ใช้บังคับ ณ วันที่หนึ่ง
--    แถวที่ระบุสถานะข้าราชการตรงตัว ชนะแถวที่เป็น null (ทั่วไป)
-- ---------------------------------------------------------------------
create or replace function public.resolve_pay_rate(
  p_fund_source  public.fund_source,
  p_expense_item public.expense_item,
  p_is_gov       boolean,
  p_on_date      date default null
) returns public.pay_rates
language sql stable security definer set search_path = '' as $$
  select r.*
  from public.pay_rates r
  where r.fund_source  = p_fund_source
    and r.expense_item = p_expense_item
    and (r.is_government_officer is null or r.is_government_officer is not distinct from p_is_gov)
    and r.effective_from <= coalesce(p_on_date, public.today_bkk())
    and (r.effective_to is null or r.effective_to >= coalesce(p_on_date, public.today_bkk()))
  order by (r.is_government_officer is not null) desc, r.effective_from desc
  limit 1;
$$;

grant execute on function
  public.resolve_pay_rate(public.fund_source, public.expense_item, boolean, date)
to authenticated;

-- ---------------------------------------------------------------------
-- 6. กันเบิกผิดอัตรา — ตรวจที่ฐานข้อมูล ไม่ใช่ที่หน้าจอ
-- ---------------------------------------------------------------------
create or replace function public.guard_pay_rate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r        public.pay_rates;
  v_fund   public.fund_source;
  v_item   public.expense_item;
  v_gov    boolean;
  v_date   date;
  v_cat    text;
  v_expect numeric(12,2);
begin
  select bc.fund_source, bc.expense_item, bc.name_th
    into v_fund, v_item, v_cat
  from public.budget_categories bc where bc.id = new.budget_category_id;

  -- รายการในใบต้องตรงกับรายการของหมวดเงินที่เลือก
  -- ไม่งั้นแดชบอร์ดกับการคุมวงเงินจะนับคนละอย่างกัน
  if new.expense_item is distinct from v_item then
    raise exception 'รายการ "%" ไม่ตรงกับหมวดเงิน "%" ที่เลือก', new.expense_item, v_cat
      using errcode = '23514';
  end if;

  if new.payee_id is not null then
    select p.is_government_officer into v_gov from public.payees p where p.id = new.payee_id;
  end if;

  v_date := coalesce(new.teaching_month,
                     (select v.doc_date from public.payment_vouchers v where v.id = new.voucher_id));

  r := public.resolve_pay_rate(v_fund, v_item, v_gov, v_date);

  if r.id is null then
    raise exception
      'หลักเกณฑ์ไม่ได้กำหนดอัตราสำหรับ "%" ในหมวดเงินนี้ — ตรวจหมวดเงินที่เลือก หรือให้ผู้ดูแลระบบเพิ่มอัตราในตาราง pay_rates',
      v_cat using errcode = '23514';
  end if;

  -- หน่วยเป็นชั่วโมง: เติม quantity จาก hours ให้อัตโนมัติ
  if r.unit = 'hour' then
    new.quantity := coalesce(new.quantity, new.hours);
  end if;

  -- เบิกตามจ่ายจริง: ไม่มีเพดานต่อหน่วยให้ตรวจ
  if r.unit = 'actual_cost' or r.amount is null then
    return new;
  end if;

  -- เติมอัตราให้เมื่อผู้กรอกไม่ได้ระบุ
  new.rate := coalesce(new.rate, r.amount);

  if r.is_ceiling then
    if new.rate > r.amount then
      raise exception 'อัตราที่กรอก % บาท เกินเพดาน % บาทต่อหน่วย (%)',
        new.rate, r.amount, coalesce(r.source_note, '') using errcode = '23514';
    end if;
  else
    if new.rate <> r.amount then
      raise exception 'อัตราตามหลักเกณฑ์คือ % บาทต่อหน่วย (%) แก้เป็นค่าอื่นไม่ได้',
        r.amount, coalesce(r.source_note, '') using errcode = '23514';
    end if;
  end if;

  -- คำนวณจำนวนเงินให้เมื่อยังไม่ได้กรอก และตรวจว่าตรงกันเมื่อกรอกมาแล้ว
  if new.quantity is not null then
    v_expect := round(new.quantity * new.rate, 2);
    if new.amount is null or new.amount = 0 then
      new.amount := v_expect;
    elsif abs(new.amount - v_expect) > 0.01 then
      raise exception 'จำนวนเงิน % ไม่ตรงกับ จำนวนหน่วย % × อัตรา % = %',
        new.amount, new.quantity, new.rate, v_expect using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

-- ต้องทำงานก่อน trigger คุมวงเงิน (เรียงตามชื่อ: pay_rate < voucher_lines_budget)
create trigger trg_voucher_lines_pay_rate
  before insert or update on public.voucher_lines
  for each row execute function public.guard_pay_rate();

-- ---------------------------------------------------------------------
-- 7. RLS ของตารางอัตรา — ทุกคนที่เปิดใช้งานอ่านได้ แก้ได้เฉพาะผู้ดูแลระบบ
-- ---------------------------------------------------------------------
alter table public.pay_rates enable row level security;

create policy pay_rates_read on public.pay_rates
  for select to authenticated using ((select public.is_active_user()));
create policy pay_rates_write on public.pay_rates
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create trigger trg_audit_pay_rates
  after insert or update or delete on public.pay_rates
  for each row execute function audit.log_change();

-- ---------------------------------------------------------------------
-- 8. มุมมองอัตราที่อ่านง่ายสำหรับหน้าจอ
-- ---------------------------------------------------------------------
create or replace view public.v_pay_rates
with (security_invoker = true) as
select
  r.id, r.fund_source, r.expense_item,
  bc.name_th   as budget_category_name,
  r.is_government_officer,
  r.unit, r.amount, r.is_ceiling,
  r.effective_from, r.effective_to, r.source_note,
  case r.unit
    when 'hour'               then 'บาท/ชั่วโมง'
    when 'person_month'       then 'บาท/คน/เดือน'
    when 'person_group_month' then 'บาท/คน/กลุ่ม/เดือน'
    when 'actual_cost'        then 'เบิกตามจ่ายจริง'
  end as unit_label
from public.pay_rates r
left join public.budget_categories bc
  on bc.fund_source = r.fund_source and bc.expense_item = r.expense_item;
