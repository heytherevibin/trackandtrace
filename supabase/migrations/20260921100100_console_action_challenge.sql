-- Minting the challenge a per-action tap is bound to (spec §D, step 2).
--
-- The four fields go in as text and the digest is computed here, by the very
-- function console.use_tap() will use to recompute it. That is the point: a
-- digest computed in the server would be a second implementation of
-- console.action_digest's per-field hashing, and the day the two drifted,
-- every tap in the console would fail with "no tap for this action" and
-- nothing would say why.
create or replace function public.console_auth_new_action_challenge(
  p_member    uuid,
  p_session   uuid,
  p_challenge text,
  p_action    text,
  p_target    text,
  p_value     text,
  p_reason    text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at)
  values (
    p_member, p_session, 'action', p_challenge,
    console.action_digest(p_action, p_target, p_value, p_reason),
    now() + interval '5 minutes'
  )
  returning id;
$$;

-- Supabase's default privileges auto-grant EXECUTE on a new public-schema
-- function to anon, authenticated and service_role alike, so service_role is
-- named in the revoke too, even though it is the role granted back below.
revoke all on function public.console_auth_new_action_challenge(uuid, uuid, text, text, text, text, text)
from public, anon, authenticated, service_role;

grant execute on function public.console_auth_new_action_challenge(uuid, uuid, text, text, text, text, text)
to service_role;
