// System keys are used ONLY when installing defaults. Runtime chat decisions
// use configured permissions and channel grants, including for custom roles.
export const CHAT_ROLE_DEFAULTS: Readonly<Record<string, readonly string[]>> = {
  OWNER: ["chat.access", "chat.areas.all", "chat.channels.all", "chat.channels.post_all", "chat.channels.manage", "chat.messages.send", "chat.messages.edit_own", "chat.trial_feedback.review", "chat.archives.view"],
  OPS_MANAGER: ["chat.access", "chat.areas.all", "chat.channels.all", "chat.channels.post_all", "chat.channels.manage", "chat.messages.send", "chat.messages.edit_own", "chat.trial_feedback.review"],
  MANAGER: ["chat.access", "chat.channels.all", "chat.channels.manage", "chat.messages.send", "chat.messages.edit_own", "chat.trial_feedback.review"],
  QC: ["chat.access", "chat.messages.send", "chat.messages.edit_own", "chat.trial_feedback.review"],
  CHATTER: ["chat.access", "chat.messages.send", "chat.messages.edit_own", "chat.trial_feedback.restricted"],
  TRIAL_CHATTER: ["chat.access", "chat.messages.send", "chat.messages.edit_own"],
  DEV: ["chat.access", "chat.areas.all", "chat.channels.all", "chat.trial_feedback.review", "chat.archives.view"],
};

export const STANDING_CHAT_ROLE_DEFAULTS: Readonly<Record<string, readonly string[]>> = {
  OWNER: ["chat.ordinary.access", "chat.private.all", "chat.private.general.review"],
  OPS_MANAGER: ["chat.ordinary.access", "chat.private.all"],
  MANAGER: ["chat.ordinary.access", "chat.private.staff.review", "chat.private.creator.review"],
  QC: ["chat.ordinary.access", "chat.private.staff.review"],
  CHATTER: ["chat.ordinary.access", "chat.private.staff"],
  TRIAL_CHATTER: ["chat.ordinary.access", "chat.private.staff"],
  DEV: ["chat.ordinary.access", "chat.private.all"],
  MODEL: ["chat.access", "chat.messages.send", "chat.messages.edit_own", "chat.private.creator"],
  ACCOUNTANT: ["chat.access", "chat.messages.send", "chat.messages.edit_own", "chat.private.accountant"],
  GENERAL_STAFF: ["chat.access", "chat.messages.send", "chat.messages.edit_own", "chat.private.general"],
};

export const CHAT_PERMISSION_DEFINITIONS = [
  ["access", "Access Chat", "Open creator chat areas permitted by assignments and channel grants."],
  ["areas.all", "Access All Creator Chat Areas", "Enter every creator's chat area without a staff assignment."],
  ["channels.all", "See All Ordinary Channels", "See every ordinary channel inside permitted creator areas."],
  ["channels.post_all", "Post in All Ordinary Channels", "Bypass ordinary channel posting grants inside permitted areas."],
  ["channels.manage", "Manage Ordinary Channels", "Create and rename channels and configure their role and named access."],
  ["messages.send", "Send Chat Messages", "Send text where a channel grants posting access."],
  ["messages.edit_own", "Edit Own Chat Messages", "Edit your own messages with full before-and-after audit history."],
  ["trial_feedback.restricted", "Restrict Trial Feedback", "Keep Chatter-only accounts out of Trial feedback, including named grants; the review permission takes priority."],
  ["trial_feedback.review", "Review Trial Feedback", "Allow higher-authority roles to read Trial feedback even when they also hold Chatter."],
  ["archives.view", "Read Archived Chat Areas", "Read frozen creator areas; this never permits posting in them."],
  ["ordinary.access", "Access Ordinary Creator Channels", "Join ordinary channels through assignments and grants. Creator, Accountant and General Staff defaults receive private chats only."],
  ["private.all", "Oversee Protected Chats", "Read creator, chatter/trial and accountant private chats across creators. General Staff private chats require separate Owner oversight."],
  ["private.general.review", "Oversee General Staff Private Chats", "Join General Staff private chats. Default: Owners only."],
  ["private.creator", "Receive Creator Private Chat", "Use the protected chat of the creator profile linked to your account."],
  ["private.creator.review", "Join Assigned Creator Private Chats", "Join the creator private chat while currently assigned to that creator. Default: Managers."],
  ["private.staff", "Receive Staff Private Chat", "Receive a separate private chat for each current creator assignment. Returning staff receive a new conversation."],
  ["private.staff.review", "Join Assigned Staff Private Chats", "Join staff private chats while currently assigned to that creator. Default: QCs and Managers."],
  ["private.accountant", "Receive Accountant Private Chat", "Receive an accountant chat outside creator operations areas."],
  ["private.general", "Receive General Staff Private Chat", "Receive a private chat with Owners outside creator areas."],
].map(([suffix, name, description]) => ({
  key: `chat.${suffix}`, name, description, pageKey: "chat", categoryKey: "chat",
  actionKey: suffix, requires: suffix === "access" ? [] : ["chat.access"],
}));
