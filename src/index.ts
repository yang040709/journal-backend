import dotenv from "dotenv";
import app from "./app";

import { connectDB } from "./config/db";

dotenv.config();

const PORT = process.env.PORT || 3000;

const init = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
  });
};

init();
