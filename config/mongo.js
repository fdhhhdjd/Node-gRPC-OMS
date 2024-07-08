const mongoose = require("mongoose");
const { MongoDB } = require("../env/link");

const connectDB = async () => {
  try {
    const link = `mongodb://${MongoDB.username}:${MongoDB.password}@${MongoDB.host}:${MongoDB.port}/${MongoDB.db}`;
    await mongoose.connect(link, {});
    console.log("MongoDB connected successfully.");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1); // Exit process with failure
  }
};

module.exports = connectDB;
