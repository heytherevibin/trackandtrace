-- The first real end-to-end run (a browser, a virtual key, this database -- no fakes) found that
-- every one of these functions fails for `service_role` with "permission denied for schema
-- console", even though each is `security definer` and owned by `postgres`. The reason: when an
-- argument must be cast to a type that lives in schema `console` (an enum here), PostgREST's own
-- call performs that cast in the CALLING role's context, before the function body -- and therefore
-- its owner's elevated privilege -- ever runs. `service_role` deliberately has no usage on schema
-- console (supabase/tests/console_schema.test.sql asserts exactly that: "the server reaches the
-- console only through functions"), so the cast itself is refused before the function starts.
--
-- The fix is not to grant usage -- that would undo the test above and the boundary it guards.
-- Each affected parameter becomes `text` instead, cast to its real enum type *inside* the
-- function body, where security definer's elevated context already applies. Everything else about
-- each function -- its behaviour, its grants -- is unchanged.

drop function if exists public.console_auth_new_challenge(uuid, uuid, console.challenge_purpose, text, bytea);
drop function if exists public.console_auth_take_challenge(text, uuid, console.challenge_purpose);
drop function if exists public.console_auth_read_challenge(text, uuid, console.challenge_purpose);
drop function if exists public.console_auth_record_key(uuid, bytea, bytea, bigint, text[], text, console.key_type);
drop function if exists public.console_auth_write_audit(text, uuid, text, console.member_role, uuid, text, text, text, text, text, console.audit_result, text, jsonb, jsonb);

create function public.console_auth_new_challenge(
  p_member    uuid,
  p_session   uuid,
  p_purpose   text,
  p_challenge text,
  p_digest    bytea
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at)
  values (p_member, p_session, p_purpose::console.challenge_purpose, p_challenge, p_digest, now() + interval '5 minutes')
  returning id;
$$;

create function public.console_auth_take_challenge(
  p_challenge text,
  p_member    uuid,
  p_purpose   text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with taken as (
    update console.challenges
       set used_at = now()
     where challenge = p_challenge
       and member_id = p_member
       and purpose = p_purpose::console.challenge_purpose
       and used_at is null
       and expires_at > now()
    returning *
  )
  select to_jsonb(t) from taken t;
$$;

-- The key step runs before a session is key-verified, which is precisely what this exists to check
-- first. This is that check: the same predicate, without the update. Still with no caller (2e).
create function public.console_auth_read_challenge(
  p_challenge text,
  p_member    uuid,
  p_purpose   text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(c)
    from console.challenges c
   where c.challenge = p_challenge
     and c.member_id = p_member
     and c.purpose = p_purpose::console.challenge_purpose
     and c.used_at is null
     and c.expires_at > now();
$$;

create function public.console_auth_record_key(
  p_member        uuid,
  p_credential_id bytea,
  p_public_key    bytea,
  p_counter       bigint,
  p_transports    text[],
  p_name          text,
  p_type          text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into console.keys (member_id, credential_id, public_key, counter, transports, name, type)
  values (p_member, p_credential_id, p_public_key, p_counter, coalesce(p_transports, '{}'), p_name, p_type::console.key_type)
  returning id;
$$;

create function public.console_auth_write_audit(
  p_environment   text,
  p_actor         uuid,
  p_actor_name    text,
  p_actor_role    text,
  p_key_id        uuid,
  p_session_label text,
  p_category      text,
  p_action        text,
  p_target        text,
  p_reason        text,
  p_result        text,
  p_address_hash  text,
  p_before        jsonb,
  p_after         jsonb
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select console.write_audit(
    p_environment, p_actor, p_actor_name, p_actor_role::console.member_role, p_key_id, p_session_label,
    p_category, p_action, p_target, p_reason, p_result::console.audit_result, p_address_hash, p_before, p_after
  );
$$;

-- Supabase's default privileges auto-grant EXECUTE on a new public-schema function to anon,
-- authenticated and service_role alike, exactly as the migrations that first created these five
-- named service_role in the revoke here too, for the same reason.
revoke all on function
  public.console_auth_new_challenge(uuid, uuid, text, text, bytea),
  public.console_auth_take_challenge(text, uuid, text),
  public.console_auth_read_challenge(text, uuid, text),
  public.console_auth_record_key(uuid, bytea, bytea, bigint, text[], text, text),
  public.console_auth_write_audit(text, uuid, text, text, uuid, text, text, text, text, text, text, text, jsonb, jsonb)
from public, anon, authenticated, service_role;

grant execute on function
  public.console_auth_new_challenge(uuid, uuid, text, text, bytea),
  public.console_auth_take_challenge(text, uuid, text),
  public.console_auth_read_challenge(text, uuid, text),
  public.console_auth_record_key(uuid, bytea, bytea, bigint, text[], text, text),
  public.console_auth_write_audit(text, uuid, text, text, uuid, text, text, text, text, text, text, text, jsonb, jsonb)
to service_role;
