-- Spec §D: "Every later key starts with a tap of an existing key." That tap is
-- an assertion, and the registration that follows it is a separate ceremony
-- with its own challenge. They must be distinguishable in the database:
-- sharing one purpose would let a caller take the challenge minted for the tap
-- and spend it on navigator.credentials.create() instead, registering a key
-- with no tap at all.
--
-- This lives alone in its own migration because a new enum value may not be
-- used in the same transaction that adds it. Nothing else belongs in this file.
alter type console.challenge_purpose add value if not exists 'add_key_tap';
