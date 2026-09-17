import { CheckAgainSheet } from "@/components/pnr/result-check-again";
import { messages } from "@/messages";

export default function PnrNotFound() {
  const m = messages.states.notFoundPage;
  return <CheckAgainSheet title={m.pnrTitle} detail={m.pnrDetail} autoFocus />;
}
