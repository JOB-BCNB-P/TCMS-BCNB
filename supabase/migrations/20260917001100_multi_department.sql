-- =====================================================================
-- TCMS-BCNB : 0011 รองรับหลายสาขาวิชาต่อรายวิชา ผู้ประสานงาน และแหล่งฝึก
-- =====================================================================
-- ที่มา: รายวิชาบางวิชาหลายสาขาวิชาดูแลร่วมกัน แหล่งฝึกบางแห่งใช้ร่วมกัน
-- และผู้ประสานงานบางคนดูแลมากกว่าหนึ่งสาขา แต่โครงสร้างเดิมเก็บได้สาขาเดียว
--
-- หลักการที่เลือก: **แชร์ข้อมูล ไม่แชร์เงิน**
--
--   คอลัมน์ department_id เดิมยังอยู่ และเปลี่ยนความหมายเป็น "สาขาเจ้าภาพ"
--   ซึ่งเป็นตัวที่ไหลต่อไปเป็นขอบเขตของ course_offerings → วงเงิน → ใบเบิก
--   ทำให้ทุกใบเบิกยังมีสาขาเจ้าของเพียงหนึ่งเดียว ตอบผู้ตรวจสอบได้ว่า
--   เงินก้อนนี้เป็นของสาขาไหนและใครรับผิดชอบ
--
--   ตารางเชื่อมที่เพิ่มใหม่ทำหน้าที่เรื่อง "การมองเห็นและแก้ไขข้อมูลหลัก"
--   เท่านั้น ไม่แตะขอบเขตของเงินเลย
--
-- ข้อควบคุมที่เพิ่ม: การเปลี่ยน "สาขาเจ้าภาพ" ของรายวิชาที่มีอยู่แล้ว
--   เท่ากับการโอนความรับผิดชอบด้านการเงิน จึงจำกัดไว้เฉพาะผู้ดูแลระบบ
--   และงานวิชาการ เลขานุการสาขาที่ร่วมดูแลทำเองไม่ได้
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ตารางเชื่อม
-- ---------------------------------------------------------------------
create table public.course_departments (
  course_id     uuid not null references public.courses      on delete cascade,
  department_id uuid not null references public.departments  on delete restrict,
  created_at    timestamptz not null default now(),
  primary key (course_id, department_id)
);
create index on public.course_departments (department_id);

create table public.coordinator_departments (
  coordinator_id uuid not null references public.coordinators on delete cascade,
  department_id  uuid not null references public.departments  on delete restrict,
  created_at     timestamptz not null default now(),
  primary key (coordinator_id, department_id)
);
create index on public.coordinator_departments (department_id);

create table public.clinical_site_departments (
  clinical_site_id uuid not null references public.clinical_sites on delete cascade,
  department_id    uuid not null references public.departments    on delete restrict,
  created_at       timestamptz not null default now(),
  primary key (clinical_site_id, department_id)
);
create index on public.clinical_site_departments (department_id);

comment on table public.course_departments is
  'สาขาวิชาที่ร่วมดูแลรายวิชา (รวมสาขาเจ้าภาพ) ใช้กับการมองเห็นและแก้ไขข้อมูลหลักเท่านั้น '
  'ขอบเขตของวงเงินและใบเบิกยังยึดตาม courses.department_id ซึ่งเป็นสาขาเจ้าภาพ';

-- ---------------------------------------------------------------------
-- 2. ย้ายข้อมูลเดิม — สาขาเจ้าภาพต้องอยู่ในตารางเชื่อมด้วยเสมอ
-- ---------------------------------------------------------------------
insert into public.course_departments (course_id, department_id)
select id, department_id from public.courses
on conflict do nothing;

insert into public.coordinator_departments (coordinator_id, department_id)
select id, department_id from public.coordinators
on conflict do nothing;

insert into public.clinical_site_departments (clinical_site_id, department_id)
select id, department_id from public.clinical_sites where department_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. trigger: สาขาเจ้าภาพถูกใส่ลงตารางเชื่อมให้อัตโนมัติเสมอ
--    เพื่อไม่ให้เกิดกรณีเจ้าภาพมองไม่เห็นข้อมูลของตัวเอง
-- ---------------------------------------------------------------------
create or replace function public.sync_primary_department()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.department_id is null then
    return new;
  end if;

  if tg_table_name = 'courses' then
    insert into public.course_departments (course_id, department_id)
    values (new.id, new.department_id) on conflict do nothing;
  elsif tg_table_name = 'coordinators' then
    insert into public.coordinator_departments (coordinator_id, department_id)
    values (new.id, new.department_id) on conflict do nothing;
  elsif tg_table_name = 'clinical_sites' then
    insert into public.clinical_site_departments (clinical_site_id, department_id)
    values (new.id, new.department_id) on conflict do nothing;
  end if;
  return new;
end $$;

create trigger trg_courses_primary_dept
  after insert or update of department_id on public.courses
  for each row execute function public.sync_primary_department();

create trigger trg_coordinators_primary_dept
  after insert or update of department_id on public.coordinators
  for each row execute function public.sync_primary_department();

create trigger trg_sites_primary_dept
  after insert or update of department_id on public.clinical_sites
  for each row execute function public.sync_primary_department();

-- ---------------------------------------------------------------------
-- 4. guard: เปลี่ยนสาขาเจ้าภาพของรายวิชา = โอนความรับผิดชอบด้านการเงิน
-- ---------------------------------------------------------------------
create or replace function public.guard_course_host_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.department_id is distinct from old.department_id
     and (select public.current_role_code()) not in ('admin', 'academic') then
    raise exception
      'การเปลี่ยนสาขาเจ้าภาพของรายวิชาทำได้เฉพาะผู้ดูแลระบบและงานวิชาการ เพราะเป็นการโอนความรับผิดชอบด้านการเบิกจ่าย'
      using errcode = '42501',
            hint = 'ถ้าต้องการให้สาขาของท่านร่วมดูแลรายวิชานี้ ให้เพิ่มในช่อง "สาขาที่ร่วมดูแล" แทน';
  end if;
  return new;
end $$;

create trigger trg_courses_guard_host
  before update on public.courses
  for each row execute function public.guard_course_host_change();

-- ---------------------------------------------------------------------
-- 5. ฟังก์ชันตรวจขอบเขต — ต้องเป็น SECURITY DEFINER
--    บทเรียนจาก migration 0010: subquery ที่อยู่ใน policy ถูก RLS บังคับด้วย
--    ถ้าอ่านตารางเชื่อมตรง ๆ ใน policy คำตอบจะเพี้ยนตามสิทธิ์ของผู้เรียก
-- ---------------------------------------------------------------------
create or replace function public.course_in_my_departments(p_course_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.course_departments cd
    where cd.course_id = p_course_id
      and cd.department_id = any (public.current_department_ids())
  );
$$;

create or replace function public.coordinator_in_my_departments(p_coordinator_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.coordinator_departments cd
    where cd.coordinator_id = p_coordinator_id
      and cd.department_id = any (public.current_department_ids())
  );
$$;

create or replace function public.site_in_my_departments(p_site_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clinical_site_departments sd
    where sd.clinical_site_id = p_site_id
      and sd.department_id = any (public.current_department_ids())
  );
$$;

/** แหล่งฝึกที่ไม่ผูกสาขาใดเลย = ใช้ร่วมกันทุกสาขา (ตั้งใจให้เป็นเช่นนั้น) */
create or replace function public.site_has_any_department(p_site_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clinical_site_departments where clinical_site_id = p_site_id);
$$;

grant execute on function public.course_in_my_departments(uuid)      to authenticated;
grant execute on function public.coordinator_in_my_departments(uuid) to authenticated;
grant execute on function public.site_in_my_departments(uuid)        to authenticated;
grant execute on function public.site_has_any_department(uuid)       to authenticated;

-- ---------------------------------------------------------------------
-- 6. RLS ของตารางเชื่อม
--    เขียนได้เท่ากับสิทธิ์เขียนข้อมูลหลัก · อ่านได้ถ้าเห็นข้อมูลหลัก
-- ---------------------------------------------------------------------
alter table public.course_departments        enable row level security;
alter table public.coordinator_departments   enable row level security;
alter table public.clinical_site_departments enable row level security;

create policy cd_read on public.course_departments
  for select to authenticated using ((select public.is_active_user()));
create policy cd_write on public.course_departments
  for all to authenticated
  using ((select public.current_role_code()) in ('admin', 'academic', 'secretary'))
  with check ((select public.current_role_code()) in ('admin', 'academic', 'secretary'));

create policy cod_read on public.coordinator_departments
  for select to authenticated using ((select public.is_active_user()));
create policy cod_write on public.coordinator_departments
  for all to authenticated
  using ((select public.current_role_code()) in ('admin', 'academic', 'secretary'))
  with check ((select public.current_role_code()) in ('admin', 'academic', 'secretary'));

create policy sd_read on public.clinical_site_departments
  for select to authenticated using ((select public.is_active_user()));
create policy sd_write on public.clinical_site_departments
  for all to authenticated
  using ((select public.current_role_code()) in ('admin', 'academic', 'secretary'))
  with check ((select public.current_role_code()) in ('admin', 'academic', 'secretary'));

-- ---------------------------------------------------------------------
-- 7. เขียน policy ของตารางหลักใหม่
--    แยกเป็นคำสั่งย่อยแทน FOR ALL ตามบทเรียนจาก migration 0010
--    (FOR ALL ครอบ SELECT ด้วย และ policy แบบ permissive ถูก OR กัน
--     ทำให้ policy อ่านที่ตั้งใจให้แคบกลายเป็นไร้ผล)
-- ---------------------------------------------------------------------

-- ── รายวิชา ─────────────────────────────────────────────────────────
drop policy if exists courses_read  on public.courses;
drop policy if exists courses_write on public.courses;

create policy courses_read on public.courses
  for select to authenticated
  using (
    (select public.sees_all_departments())
    or public.course_in_my_departments(courses.id)
  );

create policy courses_insert on public.courses
  for insert to authenticated
  with check ((select public.can_write_department(department_id)));

-- แก้ไขได้ถ้าสาขาของตนร่วมดูแลอยู่ (การเปลี่ยนสาขาเจ้าภาพถูก trigger กันไว้อีกชั้น)
create policy courses_update on public.courses
  for update to authenticated
  using (
    (select public.current_role_code()) in ('admin', 'academic')
    or (
      (select public.current_role_code()) = 'secretary'
      and public.course_in_my_departments(courses.id)
    )
  )
  with check ((select public.current_role_code()) in ('admin', 'academic', 'secretary'));

-- ลบได้เฉพาะสาขาเจ้าภาพ เพราะเป็นการทิ้งข้อมูลที่ผูกกับเงิน
create policy courses_delete on public.courses
  for delete to authenticated
  using ((select public.can_write_department(department_id)));

-- ── ผู้ประสานงานรายวิชา ──────────────────────────────────────────────
drop policy if exists coordinators_read  on public.coordinators;
drop policy if exists coordinators_write on public.coordinators;

create policy coordinators_read on public.coordinators
  for select to authenticated
  using (
    (select public.sees_all_departments())
    or public.coordinator_in_my_departments(coordinators.id)
  );

create policy coordinators_insert on public.coordinators
  for insert to authenticated
  with check ((select public.can_write_department(department_id)));

create policy coordinators_update on public.coordinators
  for update to authenticated
  using (
    (select public.current_role_code()) in ('admin', 'academic')
    or (
      (select public.current_role_code()) = 'secretary'
      and public.coordinator_in_my_departments(coordinators.id)
    )
  )
  with check ((select public.current_role_code()) in ('admin', 'academic', 'secretary'));

create policy coordinators_delete on public.coordinators
  for delete to authenticated
  using ((select public.can_write_department(department_id)));

-- ── แหล่งฝึกปฏิบัติการ ───────────────────────────────────────────────
drop policy if exists sites_read  on public.clinical_sites;
drop policy if exists sites_write on public.clinical_sites;

create policy sites_read on public.clinical_sites
  for select to authenticated
  using (
    (select public.sees_all_departments())
    or public.site_in_my_departments(clinical_sites.id)
    -- ไม่ผูกสาขาใดเลย = แหล่งฝึกกลางที่ทุกสาขาใช้ร่วมกัน
    or not public.site_has_any_department(clinical_sites.id)
  );

create policy sites_insert on public.clinical_sites
  for insert to authenticated
  with check ((select public.current_role_code()) in ('admin', 'academic', 'secretary'));

create policy sites_update on public.clinical_sites
  for update to authenticated
  using (
    (select public.current_role_code()) in ('admin', 'academic')
    or (
      (select public.current_role_code()) = 'secretary'
      and (
        public.site_in_my_departments(clinical_sites.id)
        or not public.site_has_any_department(clinical_sites.id)
      )
    )
  )
  with check ((select public.current_role_code()) in ('admin', 'academic', 'secretary'));

create policy sites_delete on public.clinical_sites
  for delete to authenticated
  using (
    (select public.current_role_code()) in ('admin', 'academic')
    or (
      (select public.current_role_code()) = 'secretary'
      and public.site_in_my_departments(clinical_sites.id)
    )
  );

-- ---------------------------------------------------------------------
-- 8. audit ตารางเชื่อม — การเปลี่ยนว่าสาขาใดเห็นอะไรได้ ต้องตามรอยได้
-- ---------------------------------------------------------------------
create trigger trg_audit_course_departments
  after insert or update or delete on public.course_departments
  for each row execute function audit.log_change();
create trigger trg_audit_coordinator_departments
  after insert or update or delete on public.coordinator_departments
  for each row execute function audit.log_change();
create trigger trg_audit_clinical_site_departments
  after insert or update or delete on public.clinical_site_departments
  for each row execute function audit.log_change();

comment on column public.courses.department_id is
  'สาขาเจ้าภาพ — เป็นตัวกำหนดว่าใครทำเอกสารและถือวงเงินของรายวิชานี้ '
  'สาขาที่ร่วมดูแล (เห็นและแก้ข้อมูลหลักได้) อยู่ในตาราง course_departments';
