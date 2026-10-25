import mongoose from 'mongoose';

export const roleEnum = { user: 'user', admin: 'admin' };

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    phone: { type: String, trim: true, default: '' },
    role: { type: String, enum: Object.values(roleEnum), default: roleEnum.user },
    isConfirmed: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    address: {
      streetAddress: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      country: { type: String, default: 'Egypt' },
      zipCode: { type: String, default: '' },
    },
    // product ids from productcatalogservice
    wishlist: { type: [String], default: [] },
  },
  { timestamps: true },
);

userSchema.index({ createdAt: -1 });

export const UserModel = mongoose.model('User', userSchema);
