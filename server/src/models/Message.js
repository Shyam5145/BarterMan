import mongoose from 'mongoose';

export const MAX_MESSAGE_LENGTH = 2000;

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: MAX_MESSAGE_LENGTH },
    /** Set on messages posted by an offer action, so the chat can show them as offer cards. */
    offer: {
      type: new mongoose.Schema(
        {
          id: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer', required: true },
          /** offer | counter | accepted | rejected | withdrawn | counter_accepted | counter_declined */
          event: { type: String, required: true },
          amount: { type: Number, required: true },
          note: { type: String, default: '' },
        },
        { _id: false },
      ),
      default: undefined,
    },
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
      ...(ret.offer
        ? { offer: { id: String(ret.offer.id), event: ret.offer.event, amount: ret.offer.amount, note: ret.offer.note ?? '' } }
        : {}),
    };
  },
});

export const Message = mongoose.model('Message', messageSchema);
