import mongoose from 'mongoose';
import colors from 'colors';
import { DB_URI } from '../config/config.js';

export const connectDB = async () => {
  try {
    await mongoose.connect(DB_URI);
    console.log(colors.bgGreen(`MongoDB connected successfully 🚀`));
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};
