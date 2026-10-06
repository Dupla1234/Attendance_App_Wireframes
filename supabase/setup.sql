create table if not exists public.employee_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  employee_id text not null unique,
  full_name text not null,
  department text,
  branch text not null default 'HQ - Centurion',
  role text not null default 'employee' check (role in ('employee', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.device_registrations (
  device_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  registered_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  employee_id text not null,
  employee_name text not null,
  department text,
  branch text not null,
  captured_at timestamptz not null,
  clocked_out_at timestamptz,
  worked_milliseconds bigint not null default 0,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  distance_meters integer,
  in_bounds boolean not null default false,
  late boolean not null default false,
  late_by_milliseconds bigint not null default 0,
  status text not null default 'Present'
    check (status in ('Present', 'Late', 'Completed')),
  created_at timestamptz not null default now()
);

create index if not exists attendance_records_captured_at_idx
  on public.attendance_records (captured_at desc);
create index if not exists attendance_records_user_id_idx
  on public.attendance_records (user_id);

alter table public.employee_profiles enable row level security;
alter table public.device_registrations enable row level security;
alter table public.attendance_records enable row level security;

drop policy if exists "Users can read their own profile" on public.employee_profiles;
create policy "Users can read their own profile"
  on public.employee_profiles for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.employee_profiles from anon, authenticated;
grant select on public.employee_profiles to authenticated;
revoke all on public.device_registrations from anon, authenticated;

drop policy if exists "Employees can read their attendance" on public.attendance_records;
create policy "Employees can read their attendance"
  on public.attendance_records for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.employee_profiles profile
      where profile.user_id = auth.uid() and profile.role = 'admin'
    )
  );

drop policy if exists "Employees can clock in for themselves" on public.attendance_records;
create policy "Employees can clock in for themselves"
  on public.attendance_records for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Employees can clock out their own shift" on public.attendance_records;
create policy "Employees can clock out their own shift"
  on public.attendance_records for update
  to authenticated
  using (auth.uid() = user_id and clocked_out_at is null)
  with check (auth.uid() = user_id);

revoke all on public.attendance_records from anon, authenticated;
grant select, insert, update on public.attendance_records to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.attendance_records;
exception
  when duplicate_object then null;
end;
$$;

create or replace function public.register_current_device(
  p_device_id uuid,
  p_department text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_user_id uuid;
  v_profile public.employee_profiles%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select * into v_profile
  from public.employee_profiles
  where user_id = v_user_id;

  if not found then
    raise exception using errcode = '42501', message = 'EMPLOYEE_PROFILE_NOT_FOUND';
  end if;

  if v_profile.role = 'employee' and v_profile.department is null then
    if nullif(trim(p_department), '') is null then
      raise exception using errcode = '22023', message = 'DEPARTMENT_REQUIRED';
    end if;

    update public.employee_profiles
    set department = trim(p_department)
    where user_id = v_user_id;
    v_profile.department := trim(p_department);
  end if;

  insert into public.device_registrations (device_id, user_id)
  values (p_device_id, v_user_id)
  on conflict (device_id) do nothing;

  select user_id into v_existing_user_id
  from public.device_registrations
  where device_id = p_device_id;

  if v_existing_user_id is distinct from v_user_id then
    raise exception using errcode = '42501', message = 'DEVICE_REGISTERED_TO_ANOTHER_ACCOUNT';
  end if;

  return jsonb_build_object(
    'success', true,
    'employee_id', v_profile.employee_id,
    'department', v_profile.department,
    'branch', v_profile.branch,
    'role', v_profile.role
  );
end;
$$;

revoke all on function public.register_current_device(uuid, text) from public, anon;
grant execute on function public.register_current_device(uuid, text) to authenticated;
