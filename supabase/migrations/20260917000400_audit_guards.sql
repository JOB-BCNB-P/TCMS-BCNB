-- =====================================================================
-- TCMS-BCNB : 0004 audit log, ฟังก์ชันสิทธิ์, guard และ RPC
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ฟังก์ชันสิทธิ์ (อ่านจากตารางจริง ไม่พึ่ง claim ใน JWT)
--    เหตุผล: JWT อายุ ~1 ชม. ถ้าถอนสิทธิ์ผู้ใช้ claim เดิมจะยังใช้ได้จนหมดอายุ
--    ฟังก์ชันเป็น STABLE + เรียกใน policy ด้วย (select ...) เพื่อให้ Postgres
--    แคชเป็น InitPlan ครั้งเดียวต่อ query (ไม่เสียประสิทธิภาพรายแถว)
-- ---------------------------------------------------------------------
create or replace function public.current_role_code()
returns public.role_code
language sql stable security definer set search_path = '' as $$
  select r.code
  from public.user_profiles p
  join public.roles r on r.id = p.role_id
  where p.id = (select auth.uid()) and p.is_active;
$$;

create or replace function public.current_user_email()
returns text language sql stable security definer set search_path = '' as $$
  select p.email::text from public.user_profiles p where p.id = (select auth.uid());
$$;

create or replace function public.current_department_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(department_id), '{}'::uuid[])
  from public.user_department_scopes where user_id = (select auth.uid());
$$;

-- บทบาทที่เห็นข้อมูลทุกสาขาวิชา
create or replace function public.sees_all_departments()
returns boolean language sql stable parallel safe as $$
  select (select public.current_role_code())
         in ('admin','academic','finance','executive');
$$;

create or replace function public.can_read_department(p_department_id uuid)
returns boolean language sql stable parallel safe as $$
  select (select public.sees_all_departments())
      or p_department_id = any (public.current_department_ids());
$$;

-- บทบาทที่บันทึก/แก้ไขข้อมูลหลักและเอกสารได้
create or replace function public.can_write_department(p_department_id uuid)
returns boolean language sql stable parallel safe as $$
  select case (select public.current_role_code())
           when 'admin'     then true
           when 'academic'  then true
           when 'secretary' then p_department_id = any (public.current_department_ids())
           else false
         end;
$$;

create or replace function public.is_admin()
returns boolean language sql stable parallel safe as $$
  select (select public.current_role_code()) = 'admin';
$$;

create or replace function public.is_active_user()
returns boolean language sql stable parallel safe as $$
  select (select public.current_role_code()) is not null;
$$;

-- ---------------------------------------------------------------------
-- 2. AUDIT LOG (append-only)
-- ---------------------------------------------------------------------
create table audit.activity_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  actor_email text,
  actor_role  text,
  action      text not null check (action in ('INSERT','UPDATE','DELETE')),
  schema_name text not null,
  table_name  text not null,
  record_id   text,
  before_data jsonb,
  after_data  jsonb
);
create index on audit.activity_log (table_name, record_id);
create index on audit.activity_log (occurred_at desc);
create index on audit.activity_log (actor_id, occurred_at desc);

-- บันทึกเฉพาะ "การเข้าถึงเลขบัญชี" แยกต่างหาก และห้ามเก็บเลขบัญชีลงล็อกเด็ดขาด
create table audit.sensitive_access_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  actor_email text,
  actor_role  text,
  operation   text not null check (operation in ('READ','WRITE','DELETE')),
  owner_type  public.bank_owner_type not null,
  owner_id    uuid not null,
  purpose     text
);
create index on audit.sensitive_access_log (occurred_at desc);
create index on audit.sensitive_access_log (owner_type, owner_id);

-- ป้องกันการแก้/ลบร่องรอย แม้โดยบทบาท admin ของแอป
create or replace function audit.deny_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'ตาราง audit เป็นแบบเขียนอย่างเดียว ห้ามแก้ไขหรือลบ'
    using errcode = '42501';
end $$;

create trigger trg_activity_log_immutable
  before update or delete on audit.activity_log
  for each row execute function audit.deny_mutation();

create trigger trg_sensitive_log_immutable
  before update or delete on audit.sensitive_access_log
  for each row execute function audit.deny_mutation();

-- trigger กลางสำหรับบันทึกการเปลี่ยนแปลง
create or replace function audit.log_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_id     text;
  v_rec    jsonb;
  v_before jsonb;
  v_after  jsonb;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
  elsif tg_op = 'INSERT' then
    v_after  := to_jsonb(new);
  else
    v_before := to_jsonb(old); v_after := to_jsonb(new);
  end if;
  v_rec := coalesce(v_after, v_before);

  -- ตารางส่วนใหญ่มีคอลัมน์ id แต่ตารางเชื่อมโยง (เช่น user_department_scopes,
  -- role_menu_permissions) ใช้คีย์ประกอบ จึงประกอบรหัสอ้างอิงจากคีย์หลักจริง
  v_id := v_rec ->> 'id';
  if v_id is null then
    select string_agg(format('%s=%s', a.attname, v_rec ->> a.attname), ';'
                      order by a.attnum)
      into v_id
      from pg_index i
      join pg_attribute a
        on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
     where i.indrelid = tg_relid and i.indisprimary;
  end if;

  insert into audit.activity_log (actor_id, actor_email, actor_role, action,
                                  schema_name, table_name, record_id,
                                  before_data, after_data)
  values ((select auth.uid()),
          public.current_user_email(),
          (public.current_role_code())::text,
          tg_op, tg_table_schema, tg_table_name, v_id, v_before, v_after);

  return coalesce(new, old);
end $$;

-- ติด audit กับตารางที่การตรวจสอบภายใน/สตง. ต้องตามรอยได้
do $$
declare t text;
begin
  foreach t in array array[
    'payment_vouchers','voucher_lines','treasury_cover_sheets',
    'treasury_cover_sheet_items','course_budget_allocations',
    'payees','clinical_sites','courses','course_offerings',
    'user_profiles','user_department_scopes','role_menu_permissions',
    'app_settings','fiscal_years'
  ] loop
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on public.%1$I
       for each row execute function audit.log_change()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. GUARD: ความสอดคล้องของข้อมูล
-- ---------------------------------------------------------------------
-- 3.1 course_offerings.department_id ต้องตรงกับ courses.department_id
--     และ semester ต้องอยู่ในปีการศึกษาเดียวกัน, fiscal_year ต้องตรงกับช่วงภาค
create or replace function public.sync_offering_keys()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_dept uuid; v_year uuid;
begin
  select department_id into v_dept from public.courses where id = new.course_id;
  new.department_id := v_dept;

  select academic_year_id into v_year from public.semesters where id = new.semester_id;
  if v_year is distinct from new.academic_year_id then
    raise exception 'ภาคการศึกษาที่เลือกไม่อยู่ในปีการศึกษาที่ระบุ' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger trg_offering_sync_keys
  before insert or update on public.course_offerings
  for each row execute function public.sync_offering_keys();

-- 3.2 payment_vouchers: สำเนา department_id / fiscal_year_id จากรายวิชา
create or replace function public.sync_voucher_keys()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_dept uuid; v_fy uuid;
begin
  select department_id, fiscal_year_id into v_dept, v_fy
  from public.course_offerings where id = new.course_offering_id;
  new.department_id  := v_dept;
  new.fiscal_year_id := coalesce(new.fiscal_year_id, v_fy);
  new.updated_at     := now();

  -- ผู้จัดทำต้องถูกบันทึกเสมอ ไม่พึ่งให้ฝั่งหน้าเว็บส่งมา
  -- ถ้าคอลัมน์นี้ว่าง การควบคุม maker-checker ใน migration 0007 จะไร้ผล
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  else
    new.created_by := old.created_by;   -- ห้ามเปลี่ยนผู้จัดทำย้อนหลัง
  end if;

  return new;
end $$;

create trigger trg_voucher_sync_keys
  before insert or update on public.payment_vouchers
  for each row execute function public.sync_voucher_keys();

-- 3.3 ยอดรวมใบหลักฐาน คำนวณจากบรรทัดเสมอ
create or replace function public.recalc_voucher_total()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_voucher uuid := coalesce(new.voucher_id, old.voucher_id);
begin
  update public.payment_vouchers v
     set total_amount = coalesce((select sum(l.amount)
                                  from public.voucher_lines l
                                  where l.voucher_id = v_voucher), 0),
         updated_at   = now()
   where v.id = v_voucher;
  return coalesce(new, old);
end $$;

create trigger trg_voucher_lines_total
  after insert or update or delete on public.voucher_lines
  for each row execute function public.recalc_voucher_total();

-- 3.4 ล็อกเอกสารหลังตรวจสอบ/จ่ายเงิน
--     - สถานะ paid      : ห้ามแก้ไขหรือลบโดยเด็ดขาด (ต้องออกเอกสารกลับรายการแทน)
--     - สถานะ verified  : แก้ได้เฉพาะผู้ดูแลระบบ
create or replace function public.guard_voucher_mutable()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status public.voucher_status;
begin
  if tg_table_name = 'payment_vouchers' then
    v_status := coalesce(old.status, new.status);
  else
    select status into v_status from public.payment_vouchers
    where id = coalesce(old.voucher_id, new.voucher_id);
  end if;

  if v_status = 'paid' then
    raise exception 'เอกสารนี้จ่ายเงินแล้ว ไม่สามารถแก้ไขหรือลบได้ (ต้องทำเอกสารกลับรายการ)'
      using errcode = '42501';
  elsif v_status = 'verified' and not public.is_admin() then
    raise exception 'เอกสารผ่านการตรวจสอบแล้ว แก้ไขได้เฉพาะผู้ดูแลระบบ'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_voucher_lines_guard
  before update or delete on public.voucher_lines
  for each row execute function public.guard_voucher_mutable();

-- สำหรับหัวเอกสาร: อนุญาตให้ RPC เปลี่ยนสถานะได้ แต่กันการแก้เนื้อหาหลัง paid
create or replace function public.guard_voucher_header()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'ลบได้เฉพาะเอกสารสถานะร่างเท่านั้น' using errcode = '42501';
    end if;
    return old;
  end if;

  if old.status = 'paid' then
    -- อนุญาตเฉพาะ soft-delete flag ไม่ได้ และห้ามแก้ค่าใด ๆ
    if to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
      raise exception 'เอกสารจ่ายเงินแล้ว ไม่สามารถแก้ไขได้' using errcode = '42501';
    end if;
  elsif old.status = 'verified'
        and not public.is_admin()
        and (to_jsonb(new) - 'status' - 'updated_at' - 'verified_by' - 'verified_at'
             - 'paid_by' - 'paid_at' - 'payment_date' - 'payment_bank_code')
            is distinct from
            (to_jsonb(old) - 'status' - 'updated_at' - 'verified_by' - 'verified_at'
             - 'paid_by' - 'paid_at' - 'payment_date' - 'payment_bank_code') then
    raise exception 'เอกสารผ่านการตรวจสอบแล้ว แก้ไขเนื้อหาได้เฉพาะผู้ดูแลระบบ'
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger trg_voucher_header_guard
  before update or delete on public.payment_vouchers
  for each row execute function public.guard_voucher_header();

-- 3.5 กันเบิกเกินงบประมาณที่จัดสรรไว้ต่อหมวดเงินของรายวิชา
create or replace function public.guard_budget_ceiling()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_offering  uuid;
  v_allocated numeric(12,2);
  v_used      numeric(12,2);
  v_cat_name  text;
begin
  select v.course_offering_id into v_offering
  from public.payment_vouchers v where v.id = new.voucher_id;

  select a.allocated_amount into v_allocated
  from public.course_budget_allocations a
  where a.course_offering_id = v_offering
    and a.budget_category_id = new.budget_category_id;

  if v_allocated is null then
    select bc.name_th into v_cat_name
    from public.budget_categories bc where bc.id = new.budget_category_id;
    raise exception 'ยังไม่ได้ตั้งวงเงินหมวด "%" ให้รายวิชานี้', coalesce(v_cat_name,'?')
      using errcode = '23514';
  end if;

  select coalesce(sum(l.amount), 0) into v_used
  from public.voucher_lines l
  join public.payment_vouchers v on v.id = l.voucher_id
  where v.course_offering_id = v_offering
    and l.budget_category_id = new.budget_category_id
    and v.status <> 'cancelled'
    and v.deleted_at is null
    and l.id is distinct from new.id;

  if v_used + new.amount > v_allocated then
    raise exception 'เกินวงเงินที่จัดสรร: ใช้ไปแล้ว % + รายการนี้ % > วงเงิน %',
      v_used, new.amount, v_allocated using errcode = '23514';
  end if;
  return new;
end $$;

create trigger trg_voucher_lines_budget
  before insert or update on public.voucher_lines
  for each row execute function public.guard_budget_ceiling();

-- 3.6 กันบันทึกย้อนหลังในปีงบประมาณที่ปิดแล้ว
create or replace function public.guard_closed_fiscal_year()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.fiscal_years f
             where f.id = new.fiscal_year_id and f.is_closed)
     and not public.is_admin() then
    raise exception 'ปีงบประมาณนี้ปิดแล้ว ไม่สามารถบันทึกเพิ่มได้' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger trg_voucher_closed_fy
  before insert or update on public.payment_vouchers
  for each row execute function public.guard_closed_fiscal_year();

-- ---------------------------------------------------------------------
-- 4. RPC: สถานะการเบิกจ่าย (state machine)
--    เส้นทางเดียวที่เปลี่ยนสถานะได้ — RLS จึงไม่ต้องให้สิทธิ์ UPDATE แก่การเงิน
-- ---------------------------------------------------------------------
create or replace function public.set_voucher_status(
  p_voucher_id  uuid,
  p_new_status  public.voucher_status,
  p_payment_date date default null,
  p_bank_code    text default null,
  p_reason       text default null
) returns public.payment_vouchers
language plpgsql security definer set search_path = '' as $$
declare
  v public.payment_vouchers;
  v_role public.role_code := public.current_role_code();
  v_next text;
begin
  if v_role is null then
    raise exception 'ไม่ได้เข้าสู่ระบบ หรือบัญชียังไม่ถูกเปิดใช้งาน' using errcode = '42501';
  end if;

  select * into v from public.payment_vouchers where id = p_voucher_id and deleted_at is null;
  if not found then
    raise exception 'ไม่พบเอกสาร' using errcode = 'P0002';
  end if;

  if not public.can_read_department(v.department_id) then
    raise exception 'ไม่มีสิทธิ์เข้าถึงเอกสารของสาขาวิชานี้' using errcode = '42501';
  end if;

  v_next := v.status::text || '->' || p_new_status::text;

  case
    -- ส่งเอกสาร: ผู้จัดทำ (เลขานุการ/วิชาการ/แอดมิน)
    when v_next = 'draft->submitted' then
      if not public.can_write_department(v.department_id) then
        raise exception 'ไม่มีสิทธิ์ส่งเอกสารของสาขาวิชานี้' using errcode = '42501';
      end if;
      if exists (select 1 from public.voucher_checklists c
                 where c.voucher_id = v.id and not c.is_checked) then
        raise exception 'ยังติ๊กเช็คลิสต์เอกสารแนบไม่ครบ' using errcode = '23514';
      end if;
      if not exists (select 1 from public.voucher_lines l where l.voucher_id = v.id) then
        raise exception 'ยังไม่มีรายการในใบหลักฐาน' using errcode = '23514';
      end if;
      update public.payment_vouchers
         set status = 'submitted',
             submitted_by = (select auth.uid()), submitted_at = now(),
             voucher_no = coalesce(voucher_no, public.next_voucher_no(v.fiscal_year_id))
       where id = v.id returning * into v;

    -- ตรวจสอบแล้ว: การเงิน หรือ แอดมิน
    when v_next = 'submitted->verified' then
      if v_role not in ('finance','admin') then
        raise exception 'เฉพาะเจ้าหน้าที่งานการเงินหรือผู้ดูแลระบบเท่านั้น' using errcode = '42501';
      end if;
      update public.payment_vouchers
         set status = 'verified', verified_by = (select auth.uid()), verified_at = now()
       where id = v.id returning * into v;

    -- จ่ายเงินแล้ว: การเงิน หรือ แอดมิน + ต้องระบุวันที่จ่ายและธนาคาร
    when v_next = 'verified->paid' then
      if v_role not in ('finance','admin') then
        raise exception 'เฉพาะเจ้าหน้าที่งานการเงินหรือผู้ดูแลระบบเท่านั้น' using errcode = '42501';
      end if;
      if p_payment_date is null or p_bank_code is null then
        raise exception 'ต้องระบุวันที่จ่ายเงินและธนาคารที่โอน' using errcode = '23514';
      end if;
      update public.payment_vouchers
         set status = 'paid', paid_by = (select auth.uid()), paid_at = now(),
             payment_date = p_payment_date, payment_bank_code = p_bank_code
       where id = v.id returning * into v;

    -- ย้อนกลับเพื่อแก้ไข: เฉพาะแอดมิน และต้องยังไม่จ่ายเงิน
    when v_next in ('submitted->draft','verified->submitted') then
      if v_role <> 'admin' then
        raise exception 'การย้อนสถานะทำได้เฉพาะผู้ดูแลระบบ' using errcode = '42501';
      end if;
      update public.payment_vouchers set status = p_new_status
       where id = v.id returning * into v;

    -- ยกเลิก: เฉพาะแอดมิน ต้องมีเหตุผล และห้ามยกเลิกหลังจ่ายเงิน
    when p_new_status = 'cancelled' then
      if v_role <> 'admin' then
        raise exception 'การยกเลิกเอกสารทำได้เฉพาะผู้ดูแลระบบ' using errcode = '42501';
      end if;
      if v.status = 'paid' then
        raise exception 'เอกสารจ่ายเงินแล้ว ต้องทำเอกสารกลับรายการแทนการยกเลิก'
          using errcode = '42501';
      end if;
      if coalesce(length(trim(p_reason)), 0) < 5 then
        raise exception 'ต้องระบุเหตุผลการยกเลิก' using errcode = '23514';
      end if;
      update public.payment_vouchers
         set status = 'cancelled', cancel_reason = p_reason
       where id = v.id returning * into v;

    else
      raise exception 'เปลี่ยนสถานะจาก % ไป % ไม่ได้', v.status, p_new_status
        using errcode = '23514';
  end case;

  return v;
end $$;

-- เลขที่ใบสำคัญแบบเรียงต่อปีงบประมาณ
-- ใช้ตารางนับแยก ไม่ใช้ count(*) เพราะเลขที่ต้องไม่ถูกนำกลับมาใช้ซ้ำ
-- แม้เอกสารจะถูกยกเลิกหรือลบ (ข้อกำหนดการตรวจสอบ: เลขที่ต้องต่อเนื่อง ไม่ซ้ำ)
create table public.voucher_number_counters (
  fiscal_year_id uuid primary key references public.fiscal_years on delete restrict,
  last_seq       integer not null default 0
);

create or replace function public.next_voucher_no(p_fiscal_year_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_year smallint; v_seq int;
begin
  select year_be into v_year from public.fiscal_years where id = p_fiscal_year_id;
  if v_year is null then
    raise exception 'ไม่พบปีงบประมาณ' using errcode = 'P0002';
  end if;

  insert into public.voucher_number_counters (fiscal_year_id, last_seq)
  values (p_fiscal_year_id, 1)
  on conflict (fiscal_year_id) do update
    set last_seq = public.voucher_number_counters.last_seq + 1
  returning last_seq into v_seq;

  return format('%s-%s', v_year, lpad(v_seq::text, 5, '0'));
end $$;

-- ---------------------------------------------------------------------
-- 5. RPC: เลขบัญชีธนาคาร — ทางเข้าออกเพียงทางเดียว และบันทึก audit ทุกครั้ง
-- ---------------------------------------------------------------------
create or replace function public.get_bank_account(
  p_owner_type public.bank_owner_type,
  p_owner_id   uuid,
  p_purpose    text
) returns table (bank_code text, bank_name_th text, account_no text, account_name text)
language plpgsql security definer set search_path = '' as $$
begin
  if public.current_role_code() not in ('admin','finance') then
    raise exception 'ไม่มีสิทธิ์เข้าถึงเลขที่บัญชีธนาคาร' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_purpose)), 0) < 5 then
    raise exception 'ต้องระบุวัตถุประสงค์ในการเรียกดูเลขบัญชี' using errcode = '23514';
  end if;

  insert into audit.sensitive_access_log
    (actor_id, actor_email, actor_role, operation, owner_type, owner_id, purpose)
  values ((select auth.uid()), public.current_user_email(),
          (public.current_role_code())::text, 'READ', p_owner_type, p_owner_id, p_purpose);

  return query
  select b.bank_code, bk.name_th, b.account_no, b.account_name
  from private.bank_accounts b
  join public.banks bk on bk.code = b.bank_code
  where b.owner_type = p_owner_type and b.owner_id = p_owner_id;
end $$;

create or replace function public.upsert_bank_account(
  p_owner_type   public.bank_owner_type,
  p_owner_id     uuid,
  p_bank_code    text,
  p_account_no   text,
  p_account_name text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.current_role_code() not in ('admin','finance') then
    raise exception 'ไม่มีสิทธิ์บันทึกเลขที่บัญชีธนาคาร' using errcode = '42501';
  end if;

  insert into private.bank_accounts
    (owner_type, owner_id, bank_code, account_no, account_name, updated_by, updated_at)
  values (p_owner_type, p_owner_id, p_bank_code, p_account_no, p_account_name,
          (select auth.uid()), now())
  on conflict (owner_type, owner_id) do update
    set bank_code = excluded.bank_code,
        account_no = excluded.account_no,
        account_name = excluded.account_name,
        updated_by = excluded.updated_by,
        updated_at = now();

  -- หมายเหตุ: ไม่บันทึกเลขบัญชีลง audit โดยเจตนา บันทึกเพียงว่าใครแก้ของใครเมื่อใด
  insert into audit.sensitive_access_log
    (actor_id, actor_email, actor_role, operation, owner_type, owner_id, purpose)
  values ((select auth.uid()), public.current_user_email(),
          (public.current_role_code())::text, 'WRITE', p_owner_type, p_owner_id,
          'บันทึก/แก้ไขเลขบัญชี');
end $$;

-- ---------------------------------------------------------------------
-- 6. VIEW สำหรับแดชบอร์ด (security_invoker = RLS ของตารางต้นทางมีผล)
-- ---------------------------------------------------------------------
create or replace view public.v_budget_usage
with (security_invoker = true) as
select
  o.id                as course_offering_id,
  o.department_id,
  o.fiscal_year_id,
  o.academic_year_id,
  o.semester_id,
  c.code              as course_code,
  c.name_th           as course_name,
  bc.id               as budget_category_id,
  bc.name_th          as budget_category_name,
  a.allocated_amount,
  coalesce(u.used_amount, 0)                        as used_amount,
  a.allocated_amount - coalesce(u.used_amount, 0)   as remaining_amount
from public.course_budget_allocations a
join public.course_offerings  o  on o.id = a.course_offering_id
join public.courses           c  on c.id = o.course_id
join public.budget_categories bc on bc.id = a.budget_category_id
left join lateral (
  select sum(l.amount) as used_amount
  from public.voucher_lines l
  join public.payment_vouchers v on v.id = l.voucher_id
  where v.course_offering_id = a.course_offering_id
    and l.budget_category_id = a.budget_category_id
    and v.status <> 'cancelled' and v.deleted_at is null
) u on true;

create or replace view public.v_payment_summary
with (security_invoker = true) as
select
  v.id              as voucher_id,
  v.voucher_no,
  v.status,
  v.department_id,
  v.fiscal_year_id,
  o.academic_year_id,
  o.semester_id,
  c.code            as course_code,
  c.name_th         as course_name,
  l.student_year_level,
  l.teaching_month,
  public.fiscal_year_be(coalesce(l.teaching_month, v.doc_date)) as fiscal_year_be,
  coalesce(p.prefix, '')                                        as payee_prefix,
  coalesce(p.first_name || ' ' || p.last_name, cs.name_th)       as payee_name,
  case when l.payee_id is not null then 'person' else 'site' end as payee_type,
  l.expense_item,
  bc.name_th        as budget_category_name,
  l.hours,
  l.amount,
  v.payment_date,
  b.name_th         as payment_bank_name
from public.voucher_lines l
join public.payment_vouchers v on v.id = l.voucher_id and v.deleted_at is null
join public.course_offerings o on o.id = v.course_offering_id
join public.courses          c on c.id = o.course_id
join public.budget_categories bc on bc.id = l.budget_category_id
left join public.payees          p  on p.id  = l.payee_id
left join public.clinical_sites  cs on cs.id = l.clinical_site_id
left join public.banks           b  on b.code = v.payment_bank_code;

comment on view public.v_payment_summary is
  'ตารางสรุปการจ่ายเงินสำหรับหน้าแดชบอร์ด — ไม่มีคอลัมน์เลขบัญชีโดยเจตนา';
