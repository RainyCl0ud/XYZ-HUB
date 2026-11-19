import { createContext, useContext } from "react";
export const ChatMentionCountContext = createContext(0);
export const useChatMentionCount = () => useContext(ChatMentionCountContext);
export const refreshChatMentionCount = () => window.dispatchEvent(new Event("xyz-chat-unread-changed"));
