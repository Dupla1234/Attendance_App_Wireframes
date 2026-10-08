create table if not exists public.employee_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  employee_id text not null unique,
  full_name text not null,
  department text,
  branch text not null default 'HQ - Centurion',
  role text not null default 'employee' check (role in ('employee', 'admin')),
  face_reference_path text,
  face_enrolled_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.employee_profiles add column if not exists face_reference_path text;
alter table public.employee_profiles add column if not exists face_enrolled_at timestamptz;

create table if not exists public.device_registrations (
  device_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  registered_at timestamptz not null default now()
);

create table if not exists public.face_verification_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  aws_session_id text not null unique,
  status text not null default 'pending' check (status in ('pending', 'verified', 'failed', 'consumed')),
  liveness_confidence double precision,
  face_match_similarity double precision,
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
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
  face_verification_id uuid references public.face_verification_sessions (id),
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
alter table public.face_verification_sessions enable row level security;

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
alter table public.attendance_records add column if not exists face_verification_id uuid references public.face_verification_sessions (id);

drop policy if exists "Employees can clock out their own shift" on public.attendance_records;
create policy "Employees can clock out their own shift"
  on public.attendance_records for update
  to authenticated
  using (auth.uid() = user_id and clocked_out_at is null)
  with check (auth.uid() = user_id);

revoke all on public.attendance_records from anon, authenticated;
grant select on public.attendance_records to authenticated;
grant update (clocked_out_at, worked_milliseconds, status) on public.attendance_records to authenticated;
revoke all on public.face_verification_sessions from anon, authenticated;

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

create or replace function public.clock_in_with_face(
  p_face_verification_id uuid,
  p_captured_at timestamptz,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision,
  p_distance_meters integer,
  p_in_bounds boolean,
  p_late boolean,
  p_late_by_milliseconds bigint
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.employee_profiles%rowtype;
  v_verification public.face_verification_sessions%rowtype;
  v_attendance_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select * into v_profile
  from public.employee_profiles
  where user_id = v_user_id;

  if not found or v_profile.role <> 'employee' then
    raise exception using errcode = '42501', message = 'EMPLOYEE_PROFILE_REQUIRED';
  end if;

  if v_profile.face_reference_path is null then
    raise exception using errcode = '42501', message = 'FACE_ENROLLMENT_REQUIRED';
  end if;

  select * into v_verification
  from public.face_verification_sessions
  where id = p_face_verification_id
    and user_id = v_user_id
  for update;

  if not found
    or v_verification.status <> 'verified'
    or v_verification.consumed_at is not null
    or v_verification.expires_at <= now() then
    raise exception using errcode = '42501', message = 'FACE_VERIFICATION_INVALID_OR_EXPIRED';
  end if;

  if p_in_bounds is distinct from true then
    raise exception using errcode = '42501', message = 'CLOCK_IN_OUTSIDE_APPROVED_RADIUS';
  end if;

  insert into public.attendance_records (
    user_id, employee_id, employee_name, department, branch,
    captured_at, latitude, longitude, accuracy, distance_meters,
    in_bounds, late, late_by_milliseconds, face_verification_id, status
  ) values (
    v_user_id, v_profile.employee_id, v_profile.full_name, v_profile.department, v_profile.branch,
    p_captured_at, p_latitude, p_longitude, p_accuracy, p_distance_meters,
    p_in_bounds, p_late, p_late_by_milliseconds, p_face_verification_id,
    case when p_late then 'Late' else 'Present' end
  ) returning id into v_attendance_id;

  update public.face_verification_sessions
  set status = 'consumed', consumed_at = now()
  where id = p_face_verification_id;

  return v_attendance_id;
end;
$$;

revoke all on function public.clock_in_with_face(uuid, timestamptz, double precision, double precision, double precision, integer, boolean, boolean, bigint) from public, anon;
grant execute on function public.clock_in_with_face(uuid, timestamptz, double precision, double precision, double precision, integer, boolean, boolean, bigint) to authenticated;

insert into storage.buckets (id, name, public)
values ('face-references', 'face-references', false)
on conflict (id) do update set public = false;
