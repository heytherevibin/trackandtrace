-- Module 06, Leads (third part): the board's one read.
--
-- Every lead in the pipeline as a card: the lead's id (what opens its record), its MASKED address,
-- its stage and when it entered it, its owner by name, and the one line about it. Reading the board
-- writes nothing, as reading the list writes nothing.
--
-- A card carries no address and neither the name nor the organisation a member typed: those are on
-- the record, behind the same Reveal and the same floor as everything else there.
--
-- Ordered as the board is drawn: by stage, New first, and within a stage the lead that has been
-- there longest first, so what has waited is what is seen.
create or replace function public.console_business_pipeline() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform console.require_role('support');
  return (
    select coalesce(jsonb_agg(
             jsonb_build_object('id', l.id, 'email', announcements.masked(l.email), 'stage', b.stage, 'stageSince', b.stage_since, 'ownerName', m.name, 'about', b.about)
             order by array_position(array['new', 'contacted', 'qualified', 'won', 'lost'], b.stage), b.stage_since, l.id), '[]'::jsonb)
      from console.business_leads b
      join console.leads() l on l.person_id = b.person_id or l.user_id = b.user_id
      -- A member who has been removed is nobody's owner, as on the record (console.business_of).
      left join console.members m on m.user_id = b.owner_id and m.status = 'active');
end $$;

revoke all on function public.console_business_pipeline() from public, anon, service_role;
grant execute on function public.console_business_pipeline() to authenticated;
