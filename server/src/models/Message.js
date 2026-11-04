import mongoose from 'mongoose';

export const MAX_MESSAGE_LENGTH = 2000;

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: MAX_MESSAGE_LENGTH },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ conversation: 1, createdAt: -1 });

messageSchema.set('toJSON', {
  versionKey: false,
  transform(_doc, ret) {
    return {
      id: String(ret._id),
      conversationId: String(ret.conversation),
      senderId: String(ret.sender),
      text: ret.text,
      createdAt: ret.createdAt,
    };
  },
});

export const Message = mongoose.model('Message', messageSchema);
