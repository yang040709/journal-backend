import mongoose from "mongoose";
import logger from "../utils/logger";

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(
      process.env.MONGO_URI || "mongodb://127.0.0.1:27017/journal"
    );
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`MongoDB connect error: ${error}`);
    process.exit(1);
  }
};
