-- Allows a user to delete their own account from the client side.
-- security definer runs with the privileges of the function owner (postgres),
-- which has permission to delete from auth.users.
create or replace function public.delete_user()
returns void language plpgsql security definer as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;
