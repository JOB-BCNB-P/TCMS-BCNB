-- =====================================================================
-- 0018 ทำให้ "ติ๊กออก" ในหน้าสิทธิ์เมนู ปิดถึงฐานข้อมูลจริง
--
-- เดิมตาราง role_menu_permissions ไม่ถูกอ้างถึงใน policy ใดเลย
-- (ตรวจแล้ว: ไม่มี policy หรือฟังก์ชันใดใน 0001-0017 อ่านตารางนี้)
-- ติ๊กออกจึงแค่ซ่อนเมนู ยิง REST ตรงยังเขียนได้เหมือนเดิม
--
-- ---------------------------------------------------------------------
-- วิธีที่เลือก: RESTRICTIVE policy — "หักออกได้ แต่เพิ่มไม่ได้"
-- ---------------------------------------------------------------------
-- PostgreSQL นำ policy แบบ permissive มา OR กัน แต่นำแบบ restrictive มา AND
-- ทับอีกชั้นหนึ่ง การเพิ่มด่านแบบ restrictive จึงทำให้
--
--   ติ๊กออก  -> ปิดจริง ทั้งหน้าเว็บและการยิง REST ตรง
--   ติ๊กเพิ่ม -> ไม่ได้สิทธิ์เกินกว่าที่บทบาทนั้นมีอยู่แล้ว
--
-- ข้อหลังสำคัญมาก ถ้าให้ช่องติ๊กเปิดสิทธิ์ได้ด้วย จะพังสองอย่างที่
-- หน่วยตรวจสอบถามหาโดยตรง:
--   1. การกั้นข้ามสาขา — ช่องติ๊กไม่มีข้อมูลว่า "สาขาไหน" เลขานุการสาขาเด็ก
--      จะแก้ข้อมูลสาขาผู้ใหญ่ได้ทันทีที่ใครติ๊กผิดหนึ่งช่อง
--   2. การแบ่งแยกหน้าที่ — ติ๊กเมนูงานการเงินให้ผู้จัดทำ = ตรวจสอบเอกสารตัวเองได้
--
-- ---------------------------------------------------------------------
-- สิ่งที่ "ไม่" ถูกกั้นด้วยตารางนี้ และเหตุผล
-- ---------------------------------------------------------------------
-- • คำสั่ง SELECT — ถ้ากั้นการอ่านด้วย แดชบอร์ดของผู้บริหารและอาจารย์จะพัง
--   เพราะ v_payment_summary อ่าน payment_vouchers ทั้งที่สองบทบาทนั้น
--   ไม่มีเมนู docs.voucher การอ่านยังคุมด้วยขอบเขตสาขาและสถานะบัญชีตามเดิม
-- • ผู้ดูแลระบบ — ยกเว้นทุกกรณี กันการติ๊กผิดแล้วไม่เหลือใครแก้กลับ
-- • trigger และ RPC ที่เป็น SECURITY DEFINER — ทำงานในสิทธิ์เจ้าของตาราง
--   จึงไม่ถูก policy ใด ๆ บังคับ (set_voucher_status ยังทำงานตามเดิม)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ด่านตรวจ
-- ---------------------------------------------------------------------
create or replace function public.menu_allows(p_menu_key text, p_action text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select
    -- ผู้ดูแลระบบผ่านตลอด: ถ้าติ๊กผิดจนตัวเองเข้าไม่ได้ จะไม่เหลือใครแก้กลับ
    coalesce((select public.is_admin()), false)
    or exists (
      select 1
      from public.role_menu_permissions p
      join public.user_profiles u on u.role_id = p.role_id
      where u.id = (select auth.uid())
        and u.is_active
        and p.menu_key = p_menu_key
        and case p_action
              when 'create' then p.can_create
              when 'update' then p.can_update
              when 'delete' then p.can_delete
              else false
            end
    );
$$;

comment on function public.menu_allows(text, text) is
  'ด่านเสริมจากตารางสิทธิ์เมนู ใช้เป็น RESTRICTIVE policy — ติ๊กออกแล้วปิดจริง แต่ติ๊กเพิ่มไม่ได้สิทธิ์เกินบทบาท';

grant execute on function public.menu_allows(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. ติดด่านกับตารางข้อมูลหลักและตารางเอกสาร
-- ---------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('courses',                    'master.course'),
      ('course_offerings',           'master.offering'),
      ('coordinators',               'master.coord'),
      ('clinical_sites',             'master.site'),
      ('course_budget_allocations',  'master.budget'),
      ('payment_vouchers',           'docs.voucher'),
      ('voucher_lines',              'docs.voucher'),
      ('voucher_checklists',         'docs.voucher'),
      ('treasury_cover_sheets',      'docs.cover'),
      ('treasury_cover_sheet_items', 'docs.cover')
    ) as v(tbl, menu_key)
  loop
    execute format($f$
      create policy %1$s_menu_insert on public.%1$I
        as restrictive for insert to authenticated
        with check ((select public.menu_allows(%2$L, 'create')));
      create policy %1$s_menu_update on public.%1$I
        as restrictive for update to authenticated
        using ((select public.menu_allows(%2$L, 'update')))
        with check ((select public.menu_allows(%2$L, 'update')));
      create policy %1$s_menu_delete on public.%1$I
        as restrictive for delete to authenticated
        using ((select public.menu_allows(%2$L, 'delete')));
    $f$, t.tbl, t.menu_key);
  end loop;
end $$;

-- ผู้รับเงินอยู่ตารางเดียวกันทั้งอาจารย์พิเศษและอาจารย์แหล่งฝึก
-- จึงเลือกคีย์เมนูจากค่าในแถวนั้นเอง
create policy payees_menu_insert on public.payees
  as restrictive for insert to authenticated
  with check ((select public.menu_allows(
    case when payee_kind = 'preceptor' then 'master.preceptor' else 'master.lecturer' end,
    'create')));
create policy payees_menu_update on public.payees
  as restrictive for update to authenticated
  using ((select public.menu_allows(
    case when payee_kind = 'preceptor' then 'master.preceptor' else 'master.lecturer' end,
    'update')))
  with check ((select public.menu_allows(
    case when payee_kind = 'preceptor' then 'master.preceptor' else 'master.lecturer' end,
    'update')));
create policy payees_menu_delete on public.payees
  as restrictive for delete to authenticated
  using ((select public.menu_allows(
    case when payee_kind = 'preceptor' then 'master.preceptor' else 'master.lecturer' end,
    'delete')));

-- ---------------------------------------------------------------------
-- 3. กันการล็อกตัวเองออกจากหน้าที่ใช้แก้สิทธิ์
--
-- ถ้าติ๊ก "ดู" ของเมนูสิทธิ์ออกจากบทบาทผู้ดูแลระบบ เมนูจะหายไป
-- และไม่มีทางกดกลับเข้าไปติ๊กคืนได้จากหน้าเว็บ ต้องไปแก้ที่ SQL Editor
-- ---------------------------------------------------------------------
create or replace function public.guard_admin_keeps_permission_menu()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_is_admin boolean;
begin
  select r.code = 'admin' into v_is_admin
  from public.roles r where r.id = coalesce(new.role_id, old.role_id);

  if coalesce(v_is_admin, false)
     and coalesce(old.menu_key, new.menu_key) in ('settings', 'settings.perms', 'settings.users')
     and (tg_op = 'DELETE' or not new.can_view) then
    raise exception
      'ปิดเมนูจัดการสิทธิ์ของผู้ดูแลระบบไม่ได้ มิฉะนั้นจะไม่เหลือใครแก้สิทธิ์กลับคืน'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_rmp_guard_admin
  before update or delete on public.role_menu_permissions
  for each row execute function public.guard_admin_keeps_permission_menu();
