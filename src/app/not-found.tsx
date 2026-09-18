import { CheckAgainSheet } from "@/components/pnr/result-check-again";
import { messages } from "@/messages";

export default function NotFound() {
  const m = messages.states.notFoundPage;
  return <CheckAgainSheet title={m.title} detail={m.detail} />;
}
