import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "../../src/components/ToastProvider";
import ChatTranscriptMessage from "../../src/pages/ChatTranscriptMessage";
import type { ChatMessage } from "../../src/pages/ChatMessageTools";
import "../../src/index.css";
import "../../src/pages/ChatPage.css";

const base: ChatMessage = { id: "m1", authorUserId: "jordan", authorName: "Jordan", text: "First message", createdAt: "2026-11-20T15:00:00Z", updatedAt: "2026-11-20T15:00:00Z", version: 1, canReply: true, canEdit: true, canPin: true, pinVersion: 0, pinnedAt: null, pinnedByName: null, replyTo: null, reactions: [] };
const rows: ChatMessage[] = [base,
  { ...base, id: "m2", text: "A quick follow-up", createdAt: "2026-11-20T15:01:00Z" },
  { ...base, id: "m3", text: "One more detail", version: 2, createdAt: "2026-11-20T15:02:00Z" },
  { ...base, id: "m4", text: "A fresh header after five minutes", createdAt: "2026-11-20T15:07:00Z" },
  { ...base, id: "m5", authorUserId: "sam", authorName: "Sam", text: "Another person joins", createdAt: "2026-11-20T15:08:00Z" },
  { ...base, id: "m6", text: "Back to Jordan", createdAt: "2026-11-20T15:09:00Z" },
  { ...base, id: "m7", text: "A reply keeps its own header", replyTo: { id: "m5", authorName: "Sam", text: "Another person joins", version: 1, createdAt: "2026-11-20T15:08:00Z" }, createdAt: "2026-11-20T15:10:00Z" },
  { ...base, id: "m8", text: "A normal message after the reply", createdAt: "2026-11-20T15:11:00Z" },
  { ...base, id: "m9", text: "", canEdit: false, attachment: { fileName: "notes.txt", byteSize: 120, available: true }, createdAt: "2026-11-20T15:12:00Z" },
];
export function App() {
  const [messages, setMessages] = useState(rows), [action, setAction] = useState("");
  return <main className="creator-chat" style={{ display: "block", padding: 16, height: "100dvh", boxSizing: "border-box" }}>
    <h1 style={{ fontSize: 20 }}>Conversation</h1><output aria-live="polite">{action}</output>
    <div className="creator-chat-messages" role="log" aria-label="Messages" style={{ height: "calc(100dvh - 95px)", boxSizing: "border-box" }}>
      <div className="creator-chat-day"><span>November 20, 2026</span></div>
      {messages.map((message, index) => <ChatTranscriptMessage key={message.id} message={message} previous={messages[index - 1]} channelId="grouping-test"
        onReply={m => setAction(`Reply ${m.id}`)} onEdit={m => setAction(`Edit ${m.id}`)} onChanged={m => { setMessages(rows => rows.map(old => old.id === m.id ? m : old)); setAction(`Changed ${m.id}`); }} onOpen={id => setAction(`Open ${id}`)} onError={e => setAction(String(e))} />)}
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<ToastProvider><App /></ToastProvider>);
