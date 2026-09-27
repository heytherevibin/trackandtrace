-- ---------------------------------------------------------------------------
-- The source's estimate is shown now, attributed. Say so on the columns.
--
-- `20260923100000` created these two columns with a comment that reads, in part:
-- "**Never rendered**: the live site promises confirmation odds are never shown".
-- That was true when it was written and is not any more. The migration file
-- itself is left alone — it is the record of what was decided that day, and an
-- applied migration rewritten after the fact is a record of nothing — so the
-- current rule goes where a reader inspecting the schema will actually find it:
-- on the columns.
--
-- What changed is "never rendered". What did not is the part that mattered:
-- **Trakline calculates no confirmation odds.** The figure is drawn in a column
-- named for whose estimate it is, and only where the source itself called it a
-- chance — its "Available" at 100 and "No More Booking" at 0 restate the status
-- and are not shown, because an echo drawn as a percentage reads as a forecast.
-- See `src/components/ui/service-estimate.ts`.
--
-- These columns keep their other job unchanged: they are the baseline a Trakline
-- model has to beat, which is why they were recorded before anything drew them.
-- ---------------------------------------------------------------------------

comment on column public.availability_observations.source_prediction is
  'The reservation service''s own confirmation estimate, verbatim. Four forms measured 2026-09-27: "N% Chance", "Low Chance", "Available" (the status restated at 100), "No More Booking" (the status restated at 0). Shown to travellers since 2026-09-27, attributed to the service and only where the service called it a chance; also the baseline a Trakline model has to beat.';

comment on column public.availability_observations.source_prediction_pct is
  'The figure behind source_prediction, 0-100. Recorded for every row; drawn only where source_prediction names a chance.';
