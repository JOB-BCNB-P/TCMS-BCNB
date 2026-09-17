-- =====================================================================
-- TCMS-BCNB : 0002 บุคคล แหล่งฝึก รายวิชา งบประมาณ และเลขบัญชีธนาคาร
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ผู้รับเงินที่เป็นบุคคล (อาจารย์พิเศษ / อาจารย์แหล่งฝึก)
-- ---------------------------------------------------------------------
create table public.payees (
  id                uuid primary key default gen_random_uuid(),
  payee_kind        public.payee_kind not null,
  prefix            text,
  first_name        text not null,
  last_name         text not null,
  position_title    text,                    -- ตำแหน่งผู้ทำการสอน (ลงในแบบ FM2.2-03)
  organization      text,                    -- หน่วยงาน
  ward              text,                    -- Ward (เฉพาะอาจารย์แหล่งฝึก)
  phone             text,
  email             extensions.citext,
  -- ช่อง "ผู้ได้รับเชิญให้สอน" ตามข้อ 14.3: ติ๊กเมื่อ "ไม่ได้" เป็นข้าราชการ/
  -- ลูกจ้างของทางราชการ หรือพนักงาน/ลูกจ้างรัฐวิสาหกิจ
  is_government_officer boolean,
  -- ธงสถานะเลขบัญชี (จุดสีเขียวบน UI) ดูแลโดย trigger เท่านั้น ห้าม client เขียน
  has_bank_account  boolean not null default false,
  is_active         boolean not null default true,
  note              text,
  created_by        uuid references public.user_profiles,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (payee_kind <> 'special_lecturer' or ward is null)
);

create table public.payee_departments (              -- สาขาวิชาที่เชิญสอน
  payee_id      uuid not null references public.payees      on delete cascade,
  department_id uuid not null references public.departments on delete restrict,
  primary key (payee_id, department_id)
);

-- ---------------------------------------------------------------------
-- 2. แหล่งฝึก / สถานที่ฝึกปฏิบัติการ
-- ---------------------------------------------------------------------
create table public.clinical_sites (
  id            uuid primary key default gen_random_uuid(),
  name_th       text not null,
  ward          text,
  province      text,
  department_id uuid references public.departments on delete restrict,
  phone         text,
  has_bank_account boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index clinical_sites_name_ward_key
  on public.clinical_sites (name_th, coalesce(ward, ''));

-- ---------------------------------------------------------------------
-- 3. ผู้ประสานงานรายวิชา (= "ผู้จัดทำ" บนใบหลักฐานฯ)
-- ---------------------------------------------------------------------
create table public.coordinators (
  id             uuid primary key default gen_random_uuid(),
  prefix         text,
  first_name     text not null,
  last_name      text not null,
  position_title text,
  department_id  uuid not null references public.departments on delete restrict,
  user_id        uuid references public.user_profiles on delete set null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. รายวิชา และรายวิชาที่เปิดสอนในแต่ละภาค
-- ---------------------------------------------------------------------
create table public.courses (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name_th       text not null,
  name_en       text,
  course_kind   public.course_kind not null,
  department_id uuid not null references public.departments on delete restrict,
  credits       numeric(4,1),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.course_offerings (
  id                 uuid primary key default gen_random_uuid(),
  course_id          uuid not null references public.courses        on delete restrict,
  academic_year_id   uuid not null references public.academic_years on delete restrict,
  semester_id        uuid not null references public.semesters      on delete restrict,
  fiscal_year_id     uuid not null references public.fiscal_years   on delete restrict,
  -- สำเนาจาก courses.department_id เพื่อให้ RLS ตัดสินได้โดยไม่ต้อง join
  -- ดูแลความสอดคล้องโดย trigger trg_offering_sync_department
  department_id      uuid not null references public.departments    on delete restrict,
  student_year_level smallint not null check (student_year_level between 1 and 4),
  cohort_no          smallint,               -- รุ่นที่
  room               text,                   -- ห้อง
  section            text not null default '1',
  faculty_text       text,                   -- ช่อง "คณะ" บนแบบฟอร์ม
  note               text,
  created_by         uuid references public.user_profiles,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (course_id, academic_year_id, semester_id, section)
);

create index on public.course_offerings (department_id);
create index on public.course_offerings (fiscal_year_id);
create index on public.course_offerings (academic_year_id, semester_id);

create table public.course_coordinators (
  course_offering_id uuid not null references public.course_offerings on delete cascade,
  coordinator_id     uuid not null references public.coordinators     on delete restrict,
  is_primary         boolean not null default false,
  primary key (course_offering_id, coordinator_id)
);

create table public.payee_course_offerings (         -- อาจารย์พิเศษ/แหล่งฝึก ประจำรายวิชา
  payee_id           uuid not null references public.payees           on delete cascade,
  course_offering_id uuid not null references public.course_offerings on delete cascade,
  primary key (payee_id, course_offering_id)
);

create table public.course_clinical_sites (          -- แหล่งฝึกประจำรายวิชา (เฉพาะวิชาปฏิบัติ)
  course_offering_id uuid not null references public.course_offerings on delete cascade,
  clinical_site_id   uuid not null references public.clinical_sites   on delete restrict,
  primary key (course_offering_id, clinical_site_id)
);

-- ---------------------------------------------------------------------
-- 5. งบประมาณตามหมวดเงินของแต่ละรายวิชา
-- ---------------------------------------------------------------------
create table public.course_budget_allocations (
  id                 uuid primary key default gen_random_uuid(),
  course_offering_id uuid not null references public.course_offerings   on delete cascade,
  budget_category_id uuid not null references public.budget_categories  on delete restrict,
  allocated_amount   numeric(12,2) not null check (allocated_amount >= 0),
  note               text,
  updated_by         uuid references public.user_profiles,
  updated_at         timestamptz not null default now(),
  unique (course_offering_id, budget_category_id)
);

-- ---------------------------------------------------------------------
-- 6. เลขบัญชีธนาคาร — เก็บใน schema private เท่านั้น
--    schema นี้ไม่ถูก expose ผ่าน Data API จึงเข้าถึงได้เฉพาะผ่าน
--    SECURITY DEFINER function ใน public ที่บันทึก audit ทุกครั้ง
-- ---------------------------------------------------------------------
create table private.bank_accounts (
  owner_type   public.bank_owner_type not null,
  owner_id     uuid not null,
  bank_code    text not null references public.banks(code),
  account_no   text not null check (account_no ~ '^[0-9]{8,20}$'),
  account_name text not null,
  updated_by   uuid references public.user_profiles,
  updated_at   timestamptz not null default now(),
  primary key (owner_type, owner_id)
);

-- ไม่มี FK ข้าม schema แบบ polymorphic ได้ จึงตรวจการมีอยู่ด้วย trigger
create or replace function private.check_bank_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_type = 'payee' then
    if not exists (select 1 from public.payees where id = new.owner_id) then
      raise exception 'ไม่พบผู้รับเงินรหัส %', new.owner_id using errcode = '23503';
    end if;
  else
    if not exists (select 1 from public.clinical_sites where id = new.owner_id) then
      raise exception 'ไม่พบแหล่งฝึกรหัส %', new.owner_id using errcode = '23503';
    end if;
  end if;
  return new;
end $$;

create trigger trg_bank_owner_exists
  before insert or update on private.bank_accounts
  for each row execute function private.check_bank_owner();

-- ธงจุดสีเขียว: ซิงก์อัตโนมัติ ห้ามให้ client เขียนคอลัมน์นี้เอง
create or replace function private.sync_bank_flag()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_type public.bank_owner_type := coalesce(new.owner_type, old.owner_type);
  v_id   uuid                   := coalesce(new.owner_id,  old.owner_id);
  v_has  boolean;
begin
  select exists (select 1 from private.bank_accounts
                 where owner_type = v_type and owner_id = v_id)
    into v_has;
  if v_type = 'payee' then
    update public.payees set has_bank_account = v_has where id = v_id;
  else
    update public.clinical_sites set has_bank_account = v_has where id = v_id;
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_bank_sync_flag
  after insert or update or delete on private.bank_accounts
  for each row execute function private.sync_bank_flag();

alter table private.bank_accounts enable row level security;
-- ไม่ประกาศ policy ใด ๆ = ปฏิเสธการเข้าถึงโดยตรงทั้งหมด (ตั้งใจ)
-- เข้าถึงได้เฉพาะผ่าน SECURITY DEFINER function ที่รันในสิทธิ์เจ้าของตาราง
-- (ไม่ใช้ FORCE เพราะจะปิดกั้นฟังก์ชันเหล่านั้นไปด้วย)
