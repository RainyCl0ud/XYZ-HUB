import type { ComponentProps } from "react";
import { CENTRAL_TIME_ZONE } from "../lib/central-time";
import { isMessageContinuation } from "../lib/chat-message-grouping";
import { ChatMessageContent, type ChatMessage } from "./ChatMessageTools";

const clock = new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: false });
const timestamp = new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL_TIME_ZONE, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" });

export default function ChatTranscriptMessage({ previous, highlighted, ...props }: ComponentProps<typeof ChatMessageContent> & { previous?: ChatMessage; highlighted?: boolean }) {
  const m = props.message;
  const grouped = isMessageContinuation(previous, m);
  return <article className={`creator-chat-message ${grouped ? "is-grouped" : "is-group-start"} ${m.deleted ? "is-deleted-message" : ""} ${m.announcement ? "is-announcement" : ""} ${!m.deleted && (m.replyTo || m.replyUnavailable) ? "has-reply" : ""} ${highlighted ? "is-jump-highlight" : ""}`}
    data-chat-message-id={m.id} aria-label={`Message by ${m.authorName}, ${timestamp.format(new Date(m.createdAt))}`}>
    {grouped ? <time className="creator-chat-group-time" dateTime={m.createdAt} tabIndex={0}
      title={timestamp.format(new Date(m.createdAt))} aria-label={`Sent ${timestamp.format(new Date(m.createdAt))}`}>{clock.format(new Date(m.createdAt))}</time>
      : <div className="creator-chat-avatar" aria-hidden="true">{m.authorName.slice(0, 1).toUpperCase()}</div>}
    <ChatMessageContent {...props} compact={grouped} />
  </article>;
}
