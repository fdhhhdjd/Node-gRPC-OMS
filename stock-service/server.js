const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const mongoose = require("mongoose");
const { connectRabbitMQ, getChannel } = require("../config/rabbitmq");
const connectDB = require("../config/mongo");
const { App } = require("../env/link");

const PROTO_PATH = __dirname + "/../protos/stock.proto";
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const stockProto = grpc.loadPackageDefinition(packageDefinition).stock;

const StockSchema = new mongoose.Schema({
  item: String,
  quantity: Number,
});

const Stock = mongoose.model("Stock", StockSchema);

async function checkStock(call, callback) {
  const { item } = call.request;
  const stock = await Stock.findOne({ item });
  if (!stock) {
    callback(null, { inStock: false, availableQuantity: 0 });
  } else {
    callback(null, {
      inStock: stock.quantity > 0,
      availableQuantity: stock.quantity,
    });
  }
}

const server = new grpc.Server();
server.addService(stockProto.StockService.service, { checkStock });
server.bindAsync(
  `0.0.0.0:${App.stock}`,
  grpc.ServerCredentials.createInsecure(),
  async (err, port) => {
    if (err) {
      console.error(`Server failed to bind: ${err.message}`);
    } else {
      await connectDB();
      await connectRabbitMQ(); // Wait for RabbitMQ connection and channel initialization
      console.log(`Stock service running on port ${port}`);

      const channel = getChannel();
      // Now consume messages from RabbitMQ using the initialized channel
      channel.consume("stockQueue", async (msg) => {
        if (msg !== null) {
          const { orderId, item, quantity } = JSON.parse(
            msg.content.toString()
          );

          const stock = await Stock.findOne({ item });
          if (stock && stock.quantity >= quantity) {
            stock.quantity -= quantity;
            await stock.save();
            console.log(`Stock updated for ${item}: ${quantity} deducted`);

            // Publish to Kitchen queue
            channel.publish(
              "orderDirectExchange",
              "kitchen",
              Buffer.from(JSON.stringify({ orderId, item, quantity }))
            );
          }
          channel.ack(msg);
        }
      });
    }
  }
);
