-- =====================================================================
-- TCMS-BCNB : 0010 แก้สิทธิ์บนตารางผู้รับเงิน — สามเรื่องในไฟล์เดียว
-- =====================================================================
--
-- เรื่องที่ 1 (ช่องโหว่) — การกั้นข้ามสาขาวิชาบนตาราง payees ไม่เคยมีผลจริง
--
--   policy เดิม payees_write ประกาศเป็น FOR ALL ซึ่ง "รวม SELECT ด้วย"
--   และ PostgreSQL นำ policy แบบ permissive หลายตัวมา OR กัน
--   ผลคือเลขานุการอ่าน payees ได้ทั้งตาราง เพราะผ่าน payees_write
--   ทั้งที่ payees_read ตั้งใจจำกัดไว้เฉพาะสาขาที่ตนดูแล
--
--   วิธีแก้: แยก payees_write ออกเป็น INSERT / UPDATE / DELETE
--   ไม่ให้มี policy ใดครอบ SELECT นอกจาก payees_read
--
-- เรื่องที่ 2 (ช่องโหว่) — subquery ใน policy ก็ถูก RLS บังคับ ทำให้ NOT EXISTS
--   กลับความหมาย
--
--   เงื่อนไข "ผู้รับเงินที่ยังไม่ผูกสาขาวิชา" เขียนตรง ๆ เป็น
--       not exists (select 1 from payee_departments where payee_id = payees.id)
--   ดูเหมือนถูก แต่ subquery นั้นถูก policy ของ payee_departments บังคับอีกชั้น
--   เลขานุการจึง "มองไม่เห็น" แถวเชื่อมของสาขาอื่น subquery เลยคืนศูนย์แถว
--   แล้ว NOT EXISTS กลายเป็นจริง → เห็นผู้รับเงินของสาขาอื่นได้ทั้งหมด
--
--   กลายเป็นว่าเงื่อนไขที่ตั้งใจให้แคบลง กลับเปิดกว้างกว่าเดิม
--
--   วิธีแก้: ย้ายการตรวจไปไว้ในฟังก์ชัน SECURITY DEFINER ซึ่งอ่านตารางเชื่อม
--   ได้ครบทุกแถวโดยไม่ผ่าน RLS จึงตอบคำถาม "มีสาขาผูกอยู่ไหม" ได้ตรงความจริง
--
--   บทเรียนที่ต้องจำ: ในไฟล์นี้และไฟล์ต่อ ๆ ไป ถ้า policy ใดใช้ NOT EXISTS
--   บนตารางที่เปิด RLS ให้ถือว่าผิดไว้ก่อน จนกว่าจะห่อด้วย SECURITY DEFINER
--
-- เรื่องที่ 3 (ใช้งานไม่ได้) — ผู้รับเงินที่เพิ่งสร้างมองไม่เห็นตัวเอง
--
--   หน้าเว็บบันทึกผู้รับเงินแล้วอ่านกลับทันที (insert ... returning)
--   ก่อนผูกสาขาวิชาในคำสั่งถัดไป ณ จังหวะนั้นยังไม่มีแถวใน payee_departments
--   policy จึงคืน 0 แถว หน้าเว็บขึ้นข้อผิดพลาดและการผูกสาขาไม่ถูกเรียก
--   กลายเป็นข้อมูลค้างที่เจ้าตัวมองไม่เห็นและแก้ไม่ได้
-- =====================================================================

-- ---------------------------------------------------------------------
-- ฟังก์ชันช่วย — อ่านตารางเชื่อมโดยไม่ผ่าน RLS เพื่อให้คำตอบตรงความจริง
-- ---------------------------------------------------------------------
create or replace function public.payee_has_any_department(p_payee_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.payee_departments where payee_id = p_payee_id);
$$;

create or replace function public.payee_in_my_departments(p_payee_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.payee_departments pd
    where pd.payee_id = p_payee_id
      and pd.department_id = any (public.current_department_ids())
  );
$$;

grant execute on function public.payee_has_any_department(uuid) to authenticated;
grant execute on function public.payee_in_my_departments(uuid) to authenticated;

drop policy if exists payees_read  on public.payees;
drop policy if exists payees_write on public.payees;

-- ---------------------------------------------------------------------
-- อ่าน
-- ---------------------------------------------------------------------
create policy payees_read on public.payees
  for select to authenticated
  using (
    (select public.sees_all_departments())
    or public.payee_in_my_departments(payees.id)
    or (
      (select public.current_role_code()) in ('admin', 'academic', 'secretary')
      and not public.payee_has_any_department(payees.id)
    )
  );

-- ---------------------------------------------------------------------
-- เพิ่ม — payees ไม่มีคอลัมน์สาขาวิชา (ผูกผ่านตารางเชื่อม)
-- จึงจำกัดตามบทบาทได้อย่างเดียว ณ จังหวะที่เพิ่ม
-- ---------------------------------------------------------------------
create policy payees_insert on public.payees
  for insert to authenticated
  with check ((select public.current_role_code()) in ('admin', 'academic', 'secretary'));

-- ---------------------------------------------------------------------
-- แก้ไข / ลบ
-- ---------------------------------------------------------------------
create policy payees_update on public.payees
  for update to authenticated
  using (
    (select public.current_role_code()) in ('admin', 'academic')
    or (
      (select public.current_role_code()) = 'secretary'
      and (
        public.payee_in_my_departments(payees.id)
        or not public.payee_has_any_department(payees.id)
      )
    )
  )
  with check ((select public.current_role_code()) in ('admin', 'academic', 'secretary'));

create policy payees_delete on public.payees
  for delete to authenticated
  using (
    (select public.current_role_code()) in ('admin', 'academic')
    or (
      (select public.current_role_code()) = 'secretary'
      and public.payee_in_my_departments(payees.id)
    )
  );

comment on policy payees_read on public.payees is
  'เห็นผู้รับเงินตามสาขาวิชาที่ผูกไว้ · รายการที่ยังไม่ผูกสาขาให้ผู้ที่บันทึกข้อมูลได้เห็นเพื่อกรอกให้ครบ '
  '· ห้ามเพิ่ม policy แบบ FOR ALL บนตารางนี้ เพราะจะครอบ SELECT และทำให้การกั้นข้ามสาขาไร้ผล '
  '· การตรวจ "ยังไม่ผูกสาขา" ต้องผ่านฟังก์ชัน SECURITY DEFINER เท่านั้น '
  'เพราะ subquery ใน policy ถูก RLS บังคับและจะทำให้ NOT EXISTS กลับความหมาย';
