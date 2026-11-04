import mongoose from 'mongoose';

export const YEAR_OPTIONS = [
  '1st year',
  '2nd year',
  '3rd year',
  '4th year',
  '5th year or later',
  'Postgraduate',
];

const userSchema = new mongoose.Schema(
  {
    firebaseUid: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    avatarUrl: { type: String, default: '' },
    authProvider: { type: String, required: true },
    college: { type: String, trim: true, maxlength: 150, default: '' },
    course: { type: String, trim: true, maxlength: 120, default: '' },
    year: { type: String, enum: [...YEAR_OPTIONS, ''], default: '' },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    profileCompletedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.virtual('isProfileComplete').get(function isProfileComplete() {
  return Boolean(this.profileCompletedAt);
});

userSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.firebaseUid;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
