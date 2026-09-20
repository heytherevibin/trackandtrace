-- Closes the one remaining gap in this plan's own Global Constraint --
-- "every function: revoke all on function ... from public, anon,
-- authenticated, service_role" -- against three functions that were never
-- given any explicit grant at all, and so still carry the default PUBLIC
-- EXECUTE a freshly created function gets. All three are internal: called
-- only from within other security-definer functions in this schema, or
-- invoked automatically by trigger machinery, never directly by any role, so
-- nothing is granted back.
revoke all on function
  console.scrub(text),
  console.audit_refuse_update(),
  console.audit_only_purge_old()
from public, anon, authenticated, service_role;
