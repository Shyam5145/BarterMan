import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { verifyAccessToken } from '../middleware/auth.js';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';

/**
 * Real-time layer for chat. Messages are saved through the REST API; this server pushes
 * them to the people involved. Every connection joins a private room `user:<id>`.
 *
 * Server → client events:
 *   message:new        { conversation, message, clientId? }  conversation is shaped for the receiver
 *   conversation:read  { conversationId, readerId, readAt }
 *   unread:count       { total }
 *   typing             { conversationId, userId, isTyping }
 * Client → server events:
 *   typing             { conversationId, isTyping }
 */

let io = null;

const userRoom = (userId) => `user:${userId}`;

/** Sends an event to every open tab of one user. Does nothing before the socket server starts. */
export function emitToUser(userId, event, payload) {
  io?.to(userRoom(String(userId))).emit(event, payload);
}

export function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientUrls },
    // Small payloads only (typing events); messages go through the REST API.
    maxHttpBufferSize: 10_000,
  });

  // Same rules as the HTTP API: valid Firebase token, verified college email, and an account in MongoDB.
  io.use(async (socket, next) => {
    try {
      const identity = await verifyAccessToken(socket.handshake.auth?.token);
      const user = await User.findOne({ firebaseUid: identity.uid }).select('_id');
      if (!user) throw Object.assign(new Error('Your account is not set up yet.'), { data: { code: 'USER_NOT_FOUND' } });
      socket.data.userId = String(user._id);
      next();
    } catch (error) {
      const failure = new Error(error.message || 'Sign in to continue.');
      failure.data = { code: error.code ?? error.data?.code ?? 'UNAUTHENTICATED' };
      next(failure);
    }
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    socket.join(userRoom(userId));

    // conversationId → the other participant's id, so typing events skip the database after the first.
    const partners = new Map();

    async function partnerFor(conversationId) {
      if (partners.has(conversationId)) return partners.get(conversationId);
      if (!mongoose.isValidObjectId(conversationId)) return null;
      const conversation = await Conversation.findById(conversationId).select('buyer seller');
      const role = conversation?.roleOf(userId);
      const partner = role === 'buyer' ? String(conversation.seller) : role === 'seller' ? String(conversation.buyer) : null;
      if (partners.size > 200) partners.clear();
      partners.set(conversationId, partner);
      return partner;
    }

    socket.on('typing', async (payload) => {
      try {
        const conversationId = String(payload?.conversationId ?? '');
        const partner = await partnerFor(conversationId);
        if (!partner) return;
        emitToUser(partner, 'typing', { conversationId, userId, isTyping: Boolean(payload?.isTyping) });
      } catch (error) {
        console.error('Typing event failed:', error.message);
      }
    });
  });

  return io;
}
