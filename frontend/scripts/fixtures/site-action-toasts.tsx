import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { ToastProvider, useToast } from "../../src/components/ToastProvider";
import ChatChannelSettings from "../../src/pages/ChatChannelSettings";
import "../../src/index.css";
import "../../src/pages/ChatPage.css";

export function Modal({ onClose, nested = false }: { onClose: () => void; nested?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), toast = useToast();
  const [child, setChild] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="creator-chat-settings" aria-label={nested ? "Nested test dialog" : "Test dialog"} style={{ width: 440, padding: 24 }}>
    <p>{nested ? "Nested test dialog" : "Test dialog"}</p>
    <button type="button" onClick={() => toast.success(nested ? "Nested change saved." : "Dialog change saved.")}>Save dialog change</button>
    {!nested && <button type="button" onClick={() => setChild(true)}>Open nested dialog</button>}
    <button type="button" onClick={onClose}>Close test dialog</button>
    {child && <Modal nested onClose={() => setChild(false)} />}
  </dialog>;
}
export function App() {
  const toast = useToast(), [open, setOpen] = useState(false);
  return <div style={{ padding: 24 }}>
    <nav><Link to="/toast-ui">Channel settings</Link> <Link to="/toast-other">Another page</Link></nav>
    <button type="button" onClick={() => setOpen(true)}>Open test dialog</button>
    <button type="button" onClick={() => toast.success("Ordinary page saved.")}>Save page</button>
    <button type="button" onClick={() => toast.showToast({ message: "Timed confirmation.", duration: 500 })}>Show timed toast</button>
    {open && <Modal onClose={() => setOpen(false)} />}
    <Routes><Route path="/toast-ui" element={<div className="creator-chat"><ChatChannelSettings target={{ modelId: "workspace", channelId: "general", name: "General" }} onClose={() => {}} onSaved={async () => {}} onArchived={() => {}} /></div>} /><Route path="/toast-other" element={<h1>Another page</h1>} /></Routes>
  </div>;
}
createRoot(document.getElementById("root")!).render(<BrowserRouter><ToastProvider><App /></ToastProvider></BrowserRouter>);
