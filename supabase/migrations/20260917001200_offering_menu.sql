-- 0012 เมนู "รายวิชาที่เปิดสอน"
--
-- เดิมรายวิชาที่เปิดสอน (course_offerings) สร้างได้ทาง SQL เท่านั้น
-- ทั้งที่เป็นตัวที่วงเงินและใบเบิกทุกใบผูกอยู่ จึงต้องมีเมนูของตัวเอง
-- และต้องแยกสิทธิ์จาก master.course เพราะ "รายวิชา" เป็นข้อมูลนิ่ง
-- ส่วน "รายวิชาที่เปิดสอน" เปลี่ยนทุกภาคการศึกษา

insert into public.menus (key, parent_key, name_th, sort_order) values
  ('master.offering', 'master', 'รายวิชาที่เปิดสอน', 2)
on conflict (key) do nothing;

-- ดันเมนูเดิมในกลุ่มลงหนึ่งตำแหน่ง ให้ลำดับยังเรียงถูก
update public.menus set sort_order = sort_order + 1
 where parent_key = 'master' and key in
   ('master.lecturer','master.preceptor','master.coord','master.site','master.budget')
   and sort_order < 7;

-- สิทธิ์เริ่มต้น: ให้ตรงกับที่แต่ละบทบาทมีใน master.course อยู่แล้ว
-- (ยึดของเดิมเป็นหลัก ดีกว่าเขียนเงื่อนไขซ้ำแล้วหลุดจากกัน)
insert into public.role_menu_permissions (role_id, menu_key, can_view, can_create, can_update, can_delete)
select p.role_id, 'master.offering', p.can_view, p.can_create, p.can_update, p.can_delete
  from public.role_menu_permissions p
 where p.menu_key = 'master.course'
on conflict do nothing;
