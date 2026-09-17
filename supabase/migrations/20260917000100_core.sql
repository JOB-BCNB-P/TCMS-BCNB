-- =====================================================================
-- TCMS-BCNB : ระบบบริหารจัดการค่าสอนรายวิชา
-- วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ
-- 0001 : schemas, extensions, enums, ตารางอ้างอิง, ผู้ใช้และบทบาท
-- =====================================================================
-- หลักการ:
--   public   = ตารางที่เปิดผ่าน PostgREST (ทุกตารางต้องเปิด RLS)
--   private  = ข้อมูลอ่อนไหว ไม่เปิดผ่าน API เด็ดขาด (เลขบัญชีธนาคาร)
--   audit    = ร่องรอยการใช้งาน append-only สำหรับการตรวจสอบภายใน/สตง.
-- สำคัญ: ห้ามเพิ่ม private / audit ลงใน Data API > Exposed schemas
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext    with schema extensions;

create schema if not exists private;
create schema if not exists audit;

revoke all on schema private from public, anon, authenticated;
revoke all on schema audit   from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
create type public.role_code as enum (
  'admin',       -- ผู้ดูแลระบบ / ผู้รับผิดชอบการเบิกจ่ายค่าสอน
  'academic',    -- เจ้าหน้าที่งานวิชาการ
  'secretary',   -- เลขานุการสาขาวิชา
  'finance',     -- เจ้าหน้าที่งานการเงิน
  'instructor',  -- อาจารย์ (อ่านอย่างเดียว เฉพาะสาขาตน)
  'executive'    -- ผู้บริหาร (อ่านอย่างเดียว ทุกสาขา)
);

create type public.semester_code   as enum ('first','second','summer');
create type public.course_kind     as enum ('theory','practice');
create type public.payee_kind      as enum ('special_lecturer','preceptor');
create type public.bank_owner_type as enum ('payee','clinical_site');
create type public.teaching_level  as enum ('bachelor','graduate');   -- ระดับการสอนในแบบ FM2.2-03
create type public.voucher_kind    as enum ('lecturer','clinical_site');
create type public.voucher_status  as enum ('draft','submitted','verified','paid','cancelled');

-- หมวดรายการค่าใช้จ่ายตามที่ต้องแสดงบนแดชบอร์ด
create type public.expense_item as enum (
  'theory',             -- ค่าสอนทฤษฎี
  'lab',                -- ค่าสอนทดลอง
  'practice',           -- ค่าสอนปฏิบัติ
  'site_compensation',  -- ค่าตอบแทนแหล่งฝึก
  'supervision_travel', -- ค่าเดินทางไปนิเทศ
  'simulated_patient'   -- ค่าตอบแทนผู้ป่วยเสมือน
);

-- ---------------------------------------------------------------------
-- 2. ฟังก์ชันช่วยเรื่องวันที่ (เก็บ ค.ศ. คำนวณได้ / แสดง พ.ศ. ที่ชั้น UI)
-- ---------------------------------------------------------------------
-- ปีงบประมาณไทย: 1 ต.ค. ปีก่อนหน้า - 30 ก.ย.  => ต.ค. เป็นต้นไปนับปีถัดไป
create or replace function public.fiscal_year_be(p_date date)
returns smallint language sql immutable parallel safe as $$
  select (extract(year from p_date)::int + 543
          + case when extract(month from p_date) >= 10 then 1 else 0 end)::smallint;
$$;

create or replace function public.today_bkk()
returns date language sql stable parallel safe as $$
  select (now() at time zone 'Asia/Bangkok')::date;
$$;

comment on function public.fiscal_year_be(date) is
  'คืนปีงบประมาณ พ.ศ. ของวันที่ (ปีงบเริ่ม 1 ตุลาคม)';

-- ---------------------------------------------------------------------
-- 3. ตารางอ้างอิง
-- ---------------------------------------------------------------------
create table public.departments (                    -- สาขาวิชา
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name_th     text not null,
  sort_order  smallint not null default 0,
  is_active   boolean  not null default true,
  created_at  timestamptz not null default now()
);

create table public.academic_years (                 -- ปีการศึกษา (พ.ศ.)
  id        uuid primary key default gen_random_uuid(),
  year_be   smallint not null unique check (year_be between 2500 and 2700),
  is_active boolean not null default true
);

create table public.semesters (                      -- ภาคการศึกษา
  id               uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years on delete restrict,
  code             public.semester_code not null,
  name_th          text not null,
  start_date       date not null,
  end_date         date not null,
  unique (academic_year_id, code),
  check (end_date >= start_date)
);

create table public.fiscal_years (                   -- ปีงบประมาณ (พ.ศ.)
  id         uuid primary key default gen_random_uuid(),
  year_be    smallint not null unique check (year_be between 2500 and 2700),
  start_date date not null,
  end_date   date not null,
  is_closed  boolean not null default false,         -- ปิดปีงบแล้ว = ห้ามแก้ย้อนหลัง
  check (end_date > start_date)
);

create table public.banks (                          -- ธนาคาร
  code    text primary key,
  name_th text not null,
  is_active boolean not null default true
);

create table public.budget_categories (              -- หมวดเงิน (ต้นแบบ)
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name_th      text not null,
  expense_item public.expense_item not null,
  sort_order   smallint not null default 0,
  is_active    boolean not null default true
);

create table public.app_settings (                   -- ค่าคงที่ระดับองค์กร (ชื่อผู้อำนวยการ ฯลฯ)
  key        text primary key,
  value      jsonb not null,
  name_th    text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ---------------------------------------------------------------------
-- 4. บทบาทและเมนู
-- ---------------------------------------------------------------------
create table public.roles (
  id        uuid primary key default gen_random_uuid(),
  code      public.role_code not null unique,
  name_th   text not null,
  is_system boolean not null default true
);

create table public.menus (
  key        text primary key,
  parent_key text references public.menus(key) on delete cascade,
  name_th    text not null,
  sort_order smallint not null default 0
);

-- ตารางนี้ควบคุม "การแสดงเมนู" เท่านั้น — ไม่ใช่ขอบเขตความปลอดภัยที่แท้จริง
-- ขอบเขตจริงคือ RLS + RPC (ดู migration 0005)
create table public.role_menu_permissions (
  role_id    uuid not null references public.roles on delete cascade,
  menu_key   text not null references public.menus on delete cascade,
  can_view   boolean not null default false,
  can_create boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  primary key (role_id, menu_key)
);

comment on table public.role_menu_permissions is
  'ควบคุมการมองเห็นเมนูบน UI เท่านั้น การบังคับสิทธิ์จริงอยู่ที่ RLS policy และ RPC';

-- ---------------------------------------------------------------------
-- 5. ผู้ใช้งาน
-- ---------------------------------------------------------------------
create table public.user_profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          extensions.citext not null unique,
  prefix         text,
  first_name     text not null default '',
  last_name      text not null default '',
  position_title text,
  role_id        uuid not null references public.roles,
  -- ผู้ใช้ใหม่ต้องถูก "เปิดใช้งาน" โดยผู้ดูแลระบบก่อนจึงจะเห็นข้อมูลใด ๆ
  is_active      boolean not null default false,
  activated_at   timestamptz,
  activated_by   uuid references public.user_profiles(id),
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint user_profiles_email_domain
    check (lower(email::text) like '%@bcn.ac.th')
);

create table public.user_department_scopes (         -- ขอบเขตสาขาวิชาที่ผู้ใช้เห็น
  user_id       uuid not null references public.user_profiles on delete cascade,
  department_id uuid not null references public.departments  on delete cascade,
  primary key (user_id, department_id)
);

create index on public.user_department_scopes (user_id);

-- ---------------------------------------------------------------------
-- 6. บังคับโดเมนอีเมลที่ชั้นฐานข้อมูล
--    Supabase ไม่ได้บังคับ hd-claim ของ Google Workspace ให้อัตโนมัติ
--    จึงต้องปิดประตูซ้ำที่นี่ (defense in depth)
-- ---------------------------------------------------------------------
create or replace function public.enforce_bcn_domain()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(coalesce(new.email, '')) not like '%@bcn.ac.th' then
    raise exception 'ปฏิเสธการสมัคร/เข้าสู่ระบบ: อนุญาตเฉพาะบัญชี @bcn.ac.th เท่านั้น'
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger trg_auth_users_enforce_domain
  before insert or update of email on auth.users
  for each row execute function public.enforce_bcn_domain();

-- สร้างโปรไฟล์อัตโนมัติเมื่อมีผู้ใช้ใหม่ — บทบาทต่ำสุด และยังไม่เปิดใช้งาน
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_role uuid;
begin
  select id into v_role from public.roles where code = 'instructor';
  insert into public.user_profiles (id, email, role_id, is_active,
                                    first_name, last_name)
  values (new.id,
          new.email,
          v_role,
          false,
          coalesce(new.raw_user_meta_data ->> 'given_name', ''),
          coalesce(new.raw_user_meta_data ->> 'family_name', ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create trigger trg_auth_users_create_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

comment on function public.handle_new_auth_user() is
  'ชื่อ-สกุลจาก Google ใช้เป็นค่าเริ่มต้นเท่านั้น ห้ามใช้ raw_user_meta_data กำหนดบทบาทเด็ดขาด (ผู้ใช้แก้ไขเองได้)';
