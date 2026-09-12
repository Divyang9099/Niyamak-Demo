-- Add super_admin to the users role check constraint
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY['admin','project_manager','pilot','super_admin']));

-- Promote the platform owner to super_admin so they are hidden from User Management
UPDATE users SET role = 'super_admin' WHERE email = 'gujaratidivyang212@gmail.com';
