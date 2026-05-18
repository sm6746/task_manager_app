create extension if not exists pgcrypto;

create type public.project_role as enum ('admin', 'member');
create type public.task_status as enum ('todo', 'in_progress', 'done');
create type public.task_priority as enum ('low', 'medium', 'high');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  email text not null,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 80),
  description text default '',
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.project_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  description text default '',
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'medium',
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date date,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects(owner_id);
create index project_members_user_id_idx on public.project_members(user_id);
create index tasks_project_id_idx on public.tasks(project_id);
create index tasks_assignee_id_idx on public.tasks(assignee_id);
create index tasks_due_date_idx on public.tasks(due_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create or replace function public.set_project_owner()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  new.owner_id = auth.uid();
  return new;
end;
$$;

create trigger projects_set_owner
before insert on public.projects
for each row execute function public.set_project_owner();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    left(
      case
        when char_length(coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(split_part(new.email, '@', 1), ''), 'New user')) < 2
          then coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(split_part(new.email, '@', 1), ''), 'New user') || ' user'
        else coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(split_part(new.email, '@', 1), ''), 'New user')
      end,
      80
    ),
    coalesce(new.email, new.id::text || '@example.local')
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.add_project_owner_as_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'admin');
  return new;
end;
$$;

create trigger projects_add_owner
after insert on public.projects
for each row execute function public.add_project_owner_as_admin();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;

create policy "Profiles are readable by authenticated users"
on public.profiles for select
to authenticated
using (true);

create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Project owners and members can read projects"
on public.projects for select
to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1 from public.project_members pm
    where pm.project_id = projects.id and pm.user_id = auth.uid()
  )
);

create policy "Authenticated users can create projects"
on public.projects for insert
to authenticated
with check (auth.uid() is not null and owner_id = auth.uid());

create policy "Project admins can update projects"
on public.projects for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Project admins can delete projects"
on public.projects for delete
to authenticated
using (owner_id = auth.uid());

create policy "Members can read memberships"
on public.project_members for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.projects p
    where p.id = project_members.project_id and p.owner_id = auth.uid()
  )
);

create policy "Admins can add members"
on public.project_members for insert
to authenticated
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_members.project_id and p.owner_id = auth.uid()
  )
);

create policy "Admins can update members"
on public.project_members for update
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_members.project_id and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_members.project_id and p.owner_id = auth.uid()
  )
);

create policy "Admins can remove members"
on public.project_members for delete
to authenticated
using (
  user_id <> auth.uid()
  and exists (
    select 1 from public.projects p
    where p.id = project_members.project_id and p.owner_id = auth.uid()
  )
);

create policy "Members can read project tasks"
on public.tasks for select
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = tasks.project_id and p.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.project_members pm
    where pm.project_id = tasks.project_id and pm.user_id = auth.uid()
  )
);

create policy "Admins can create tasks"
on public.tasks for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.projects p
    where p.id = tasks.project_id and p.owner_id = auth.uid()
  )
);

create policy "Admins can update tasks"
on public.tasks for update
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = tasks.project_id and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = tasks.project_id and p.owner_id = auth.uid()
  )
);

create policy "Assigned members can update task status"
on public.tasks for update
to authenticated
using (public.is_project_member(project_id) and assignee_id = auth.uid())
with check (
  assignee_id = auth.uid()
);

create policy "Admins can delete tasks"
on public.tasks for delete
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = tasks.project_id and p.owner_id = auth.uid()
  )
);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_members to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
