# Supabase setup

The app stays in demo mode while `assets/js/supabase-config.js` has empty values. To enable hosted authentication and server-side browser registration:

1. Create a Supabase project.
2. Run `supabase/setup.sql` in the Supabase SQL Editor.
3. In `assets/js/supabase-config.js`, set `url` to the project URL and `anonKey` to the project's publishable/anon key. These client values are public; never put a service-role key in this file.
4. Create each user in Supabase Authentication with their work email and password. Then insert a matching row into `public.employee_profiles` using that Auth user's UUID, employee ID, name, branch, and role. For example:

	```sql
	insert into public.employee_profiles (user_id, employee_id, full_name, department, branch, role)
	values ('AUTH_USER_UUID', 'EMP-1001', 'Employee Name', null, 'HQ - Centurion', 'employee');
	```

	Replace `AUTH_USER_UUID` with the user's ID shown in Supabase Authentication. The employee's department may be left null; they choose it on their first sign-in. Confirm invited users in Supabase Auth if email confirmation is enabled.
5. In Supabase Authentication URL Configuration, set the production site URL and add the official HTTPS domain to the allowed redirect URLs before publishing.
6. Publish the static app over HTTPS. Browser location access and service workers require HTTPS (localhost is also allowed for testing).

With Supabase configured, login uses work email and password. The database stores the employee profile and department, and the `register_current_device` RPC enforces that one browser-generated device ID belongs to only one account. A different account on that browser is rejected. To release a device after an employee loses or replaces it, an administrator can remove its row in the Supabase SQL Editor using its device ID: `delete from public.device_registrations where device_id = 'DEVICE_UUID';`. The browser-generated ID is kept in local storage, so clearing site data or using another browser can create a new ID; ordinary websites cannot reliably identify physical hardware. Strong physical-device enforcement would require a native app with platform device attestation or managed-device controls.

The Admin Monitoring dashboard loads attendance records from Supabase and updates live when employees clock in or out. The employee Attendance History page and weekly/monthly summaries still use local browser history, and the existing admin user form does not provision Supabase Auth accounts. Keep the service-role key private and perform privileged account provisioning through a trusted server or Supabase dashboard.
