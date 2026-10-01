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

alter table public.employee_profiles enable row level security;
alter table public.device_registrations enable row level security;

drop policy if exists "Users can read their own profile" on public.employee_profiles;
create policy "Users can read their own profile"
  on public.employee_profiles for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.employee_profiles from anon, authenticated;
grant select on public.employee_profiles to authenticated;
revoke all on public.device_registrations from anon, authenticated;

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
