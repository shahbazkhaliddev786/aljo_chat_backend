export enum ESocketEvents {
  // Connection / Auth
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  AUTHENTICATE = 'authenticate',

  // Room management
  JOIN_CONVERSATION = 'join_conversation',
  LEAVE_CONVERSATION = 'leave_conversation',

  // Messaging
  SEND_MESSAGE = 'send_message',
  RECEIVE_MESSAGE = 'receive_message',
  MESSAGE_READ = 'message_read',
  MESSAGE_EDITED = 'message_edited',
  MESSAGE_DELETED = 'message_deleted',

  // Reactions
  ADD_REACTION = 'add_reaction',
  REMOVE_REACTION = 'remove_reaction',

  // Typing
  TYPING_START = 'typing_start',
  TYPING_STOP = 'typing_stop',

  // Group Calls
  GROUP_CALL_STARTED = 'group:call:started',
  GROUP_CALL_ENDED = 'group:call:ended',

  // User presence
  USER_ONLINE = 'user_online',
  USER_OFFLINE = 'user_offline'
}
