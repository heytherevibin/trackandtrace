// One outbox, in services, so the console's letters and the traveller side's land in the same
// store and an end-to-end run does not have to know which sender produced one. The console keeps
// the name it has always imported.
export { outbox } from "@/services/email/outbox";
