-- =====================================================================
-- 0019 ประวัติการเข้าใช้งาน + การลงทะเบียนผู้ใช้ล่วงหน้า
--
-- สองเรื่องที่พบว่าขาดไปตอนรีวิวหน้าจัดการผู้ใช้:
--
-- 1. ไม่มีที่ไหนบันทึกการเข้าสู่ระบบเลย คอลัมน์ user_profiles.last_login_at
--    ถูกประกาศไว้ตั้งแต่ 0001 แต่ไม่มีโค้ดใดเขียนลง หน้าจอจึงขึ้น "-" ตลอด
--    ซึ่งแย่กว่าไม่มีคอลัมน์ เพราะดูเหมือนระบบบันทึกไว้แล้วแต่ไม่มีข้อมูล
--
-- 2. ผู้ดูแลระบบสร้างบัญชีเองไม่ได้ (ต้องใช้ service_role ซึ่งห้ามอยู่ในหน้าเว็บ)
--    แต่ "ลงทะเบียนล่วงหน้า" ทำได้และปลอดภัย: เก็บอีเมลกับชื่อไว้ก่อน
--    พอเจ้าตัวล็อกอิน Google ครั้งแรก ระบบเติมชื่อ บทบาท สาขา และเปิดใช้งานให้ทันที
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. บันทึกการเข้าสู่ระบบ
-- ---------------------------------------------------------------------
create table audit.login_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  user_id     uuid,
  email       text,
  role_code   text,
  -- เก็บเฉพาะชนิดอุปกรณ์แบบหยาบ ไม่เก็บ user-agent เต็มหรือ IP
  -- ข้อมูลพวกนั้นเป็นข้อมูลส่วนบุคคลที่ไม่จำเป็นต่อการตรวจสอบการเบิกจ่าย
  device_kind text check (device_kind in ('desktop','mobile','tablet','unknown'))
);

create index on audit.login_log (occurred_at desc);
create index on audit.login_log (user_id, occurred_at desc);

create trigger trg_login_log_immutable
  before update or delete on audit.login_log
  for each row execute function audit.deny_mutation();

comment on table audit.login_log is
  'ประวัติการเข้าสู่ระบบ — ไม่เก็บ IP และ user-agent เต็ม เก็บแค่ชนิดอุปกรณ์';

/**
 * บันทึกการเข้าสู่ระบบ เรียกจากหน้าเว็บหลังยืนยันตัวตนสำเร็จ
 *
 * กันการบันทึกซ้ำด้วยการเว้นช่วง 15 นาที เพราะเหตุการณ์ SIGNED_IN ของ Supabase
 * ยิงซ้ำได้ทุกครั้งที่ต่ออายุ token หรือสลับกลับมาที่แท็บ
 * ถ้าไม่กัน ตารางจะเต็มไปด้วยแถวซ้ำจนอ่านไม่ออกภายในไม่กี่วัน
 */
create or replace function public.record_login(p_device_kind text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return;
  end if;

  update public.user_profiles set last_login_at = now() where id = v_uid;

  if exists (
    select 1 from audit.login_log
    where user_id = v_uid and occurred_at > now() - interval '15 minutes'
  ) then
    return;
  end if;

  insert into audit.login_log (user_id, email, role_code, device_kind)
  values (v_uid,
          public.current_user_email(),
          (public.current_role_code())::text,
          coalesce(nullif(p_device_kind, ''), 'unknown'));
end $$;

grant execute on function public.record_login(text) to authenticated;

/** อ่านประวัติการเข้าใช้งาน — สิทธิ์เดียวกับการอ่านร่องรอยการแก้ไขข้อมูล */
create or replace function public.read_login_log(
  p_from timestamptz default null,
  p_to   timestamptz default null,
  p_email text default null,
  p_limit int default 200,
  p_offset int default 0
) returns setof audit.login_log
language plpgsql security definer set search_path = '' as $$
begin
  if public.current_role_code() not in ('admin','executive') then
    raise exception 'ไม่มีสิทธิ์อ่านประวัติการเข้าใช้งาน' using errcode = '42501';
  end if;
  return query
  select * from audit.login_log l
  where (p_from is null or l.occurred_at >= p_from)
    and (p_to   is null or l.occurred_at <  p_to)
    and (p_email is null or l.email ilike '%' || p_email || '%')
  order by l.occurred_at desc
  limit least(coalesce(p_limit, 200), 1000) offset coalesce(p_offset, 0);
end $$;

grant execute on function
  public.read_login_log(timestamptz, timestamptz, text, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- 2. ลงทะเบียนผู้ใช้ล่วงหน้า
-- ---------------------------------------------------------------------
create table public.user_invitations (
  id             uuid primary key default gen_random_uuid(),
  email          extensions.citext not null unique,
  prefix         text,
  first_name     text not null default '',
  last_name      text not null default '',
  position_title text,
  role_code      public.role_code not null default 'instructor',
  department_ids uuid[] not null default '{}',
  note           text,
  -- เติมเมื่อเจ้าตัวล็อกอินครั้งแรกและถูกนำไปใช้แล้ว
  consumed_at    timestamptz,
  consumed_user_id uuid references public.user_profiles(id) on delete set null,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- โดเมนต้องตรงกับ trigger enforce_bcn_domain บน auth.users
  -- มิฉะนั้นจะลงทะเบียนอีเมลที่ล็อกอินไม่ได้อยู่ดี แล้วงงว่าทำไมไม่มีผล
  constraint user_invitations_email_domain
    check (lower(email::text) like '%@bcn.ac.th')
);

create index on public.user_invitations (consumed_at);

comment on table public.user_invitations is
  'ลงทะเบียนชื่อและอีเมลไว้ล่วงหน้า ระบบเติมให้อัตโนมัติเมื่อเจ้าตัวล็อกอิน Google ครั้งแรก — ไม่ได้สร้างบัญชีให้ และไม่ต้องใช้ service_role';

alter table public.user_invitations enable row level security;

create policy invitations_read on public.user_invitations
  for select to authenticated using ((select public.is_admin()));
create policy invitations_insert on public.user_invitations
  for insert to authenticated with check ((select public.is_admin()));
create policy invitations_update on public.user_invitations
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy invitations_delete on public.user_invitations
  for delete to authenticated using ((select public.is_admin()));

create trigger trg_audit_user_invitations
  after insert or update or delete on public.user_invitations
  for each row execute function audit.log_change();

/** ผู้สร้างต้องเป็นผู้ใช้จริง ไม่ใช่ค่าที่หน้าเว็บส่งมา (กฎเดียวกับเอกสารทุกฉบับ) */
create or replace function public.sync_invitation_keys()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
  else
    new.created_by := old.created_by;
    -- ใบที่ถูกใช้ไปแล้ว ห้ามรีเซ็ตกลับเป็นยังไม่ใช้ มิฉะนั้นจะนำมายิงซ้ำได้
    -- แต่ต้องปล่อยให้เปลี่ยนจาก NULL เป็นค่าได้หนึ่งครั้ง เพราะนั่นคือตอนที่
    -- handle_new_auth_user ทำเครื่องหมายว่าใช้แล้ว (เขียนแบบล็อกทั้งสองทาง
    -- จะทำให้ trigger ของตัวเองเขียนไม่ได้ ซึ่งชุดทดสอบจับได้)
    if old.consumed_at is not null then
      new.consumed_at := old.consumed_at;
      new.consumed_user_id := old.consumed_user_id;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger trg_invitation_sync_keys
  before insert or update on public.user_invitations
  for each row execute function public.sync_invitation_keys();

-- ---------------------------------------------------------------------
-- 3. ใช้ใบลงทะเบียนตอนผู้ใช้ล็อกอินครั้งแรก
--
-- ยังคงกฎเดิมไว้ทั้งหมด: ถ้าไม่มีใบลงทะเบียน บัญชีใหม่ยังเป็น instructor
-- และ is_active = false เหมือนเดิม ต้องให้ผู้ดูแลระบบอนุมัติ
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role uuid;
  v_inv  public.user_invitations;
  v_active boolean := false;
  v_prefix text; v_first text; v_last text; v_position text;
begin
  select * into v_inv from public.user_invitations
   where email = new.email and consumed_at is null;

  if found then
    select id into v_role from public.roles where code = v_inv.role_code;
    v_active   := true;
    v_prefix   := nullif(v_inv.prefix, '');
    v_first    := nullif(v_inv.first_name, '');
    v_last     := nullif(v_inv.last_name, '');
    v_position := nullif(v_inv.position_title, '');
  else
    select id into v_role from public.roles where code = 'instructor';
  end if;

  insert into public.user_profiles (id, email, role_id, is_active,
                                    prefix, first_name, last_name, position_title,
                                    activated_at, activated_by)
  values (new.id,
          new.email,
          v_role,
          v_active,
          v_prefix,
          -- ชื่อจากใบลงทะเบียนมาก่อน ถ้าไม่มีจึงใช้ชื่อจาก Google
          coalesce(v_first, new.raw_user_meta_data ->> 'given_name', ''),
          coalesce(v_last,  new.raw_user_meta_data ->> 'family_name', ''),
          v_position,
          case when v_active then now() end,
          case when v_active then v_inv.created_by end)
  on conflict (id) do update set email = excluded.email;

  if v_inv.id is not null then
    insert into public.user_department_scopes (user_id, department_id)
    select new.id, unnest(v_inv.department_ids)
    on conflict do nothing;

    update public.user_invitations
       set consumed_at = now(), consumed_user_id = new.id
     where id = v_inv.id;
  end if;

  return new;
end $$;

comment on function public.handle_new_auth_user() is
  'ชื่อ-สกุลจาก Google ใช้เป็นค่าเริ่มต้นเท่านั้น ห้ามใช้ raw_user_meta_data กำหนดบทบาทเด็ดขาด (ผู้ใช้แก้ไขเองได้) — บทบาทมาจากใบลงทะเบียนล่วงหน้าที่ผู้ดูแลระบบสร้างไว้เท่านั้น';

-- ---------------------------------------------------------------------
-- 4. เปลี่ยนชื่อเมนูให้ตรงกับเนื้อหาใหม่ (สองแท็บ: เข้าใช้งาน + แก้ไขข้อมูล)
-- ---------------------------------------------------------------------
update public.menus
   set name_th = 'ประวัติการเข้าใช้งาน'
 where key = 'settings.audit';
