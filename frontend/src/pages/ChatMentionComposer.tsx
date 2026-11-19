import { forwardRef, useId, useImperativeHandle, useRef, useState, type TextareaHTMLAttributes } from "react";
import { rebaseMentions, type ChatMention } from "../lib/chat-mentions";

type Member = { id: string; name: string; role: string; canView?: boolean };
type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string; mentions: ChatMention[]; members: Member[];
  onChange: (value: string, mentions: ChatMention[]) => void;
};

const ChatMentionComposer = forwardRef<HTMLTextAreaElement, Props>(function ChatMentionComposer({ value, mentions, members, onChange, onKeyDown, ...props }, ref) {
  const field = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => field.current!, []);
  const [caret, setCaret] = useState(0), [active, setActive] = useState(0), [dismissed, setDismissed] = useState("");
  const listId = useId();
  const match = value.slice(0, caret).match(/(?:^|[\s(])@([^@\n]{0,80})$/);
  const query = match?.[1].trim().toLocaleLowerCase();
  const queryKey = `${value}:${caret}`;
  const options = query !== undefined && dismissed !== queryKey ? members.filter(m => m.canView !== false && m.name.toLocaleLowerCase().includes(query)).slice(0, 8) : [];
  const selected = Math.min(active, Math.max(0, options.length - 1));
  const choose = (member: Member) => {
    if (!match || !field.current) return;
    const start = caret - match[1].length - 1, label = "@" + member.name;
    const text = value.slice(0, start) + label + " " + value.slice(caret);
    if (text.length > (props.maxLength ?? 8000)) return;
    const next = rebaseMentions(value, text, mentions);
    next.push({ userId: member.id, start, end: start + label.length });
    onChange(text, next.sort((a,b) => a.start - b.start));
    const position = start + label.length + 1;
    setDismissed(`${text}:${position}`); setCaret(position); setActive(0);
    requestAnimationFrame(() => { field.current?.focus(); field.current?.setSelectionRange(position, position); });
  };
  return <div className="creator-chat-mention-composer">
    {!!options.length && <div className="creator-chat-mention-suggestions" id={listId} role="listbox" aria-label="Mention a conversation member">
      <small>Members of this conversation</small>
      {options.map((member, index) => <button type="button" role="option" aria-selected={index === selected} id={`${listId}-${index}`} key={member.id}
        onPointerDown={event => event.preventDefault()} onClick={() => choose(member)}><strong>{member.name}</strong><span>{member.role}</span></button>)}
    </div>}
    <textarea {...props} ref={field} value={value} aria-autocomplete="list" aria-controls={options.length ? listId : undefined} aria-expanded={!!options.length}
      aria-activedescendant={options.length ? `${listId}-${selected}` : undefined}
      onSelect={event => setCaret(event.currentTarget.selectionStart)}
      onChange={event => { onChange(event.target.value, rebaseMentions(value, event.target.value, mentions)); setCaret(event.target.selectionStart); setActive(0); }}
      onKeyDown={event => {
        if (options.length && !event.nativeEvent.isComposing && !event.shiftKey) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive((selected + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length); return; }
          if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); choose(options[selected]); return; }
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDismissed(queryKey); return; }
        }
        onKeyDown?.(event);
      }} />
  </div>;
});
export default ChatMentionComposer;
