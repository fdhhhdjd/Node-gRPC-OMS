const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const mongoose = require("mongoose");
const { connectRabbitMQ, getChannel } = require("../config/rabbitmq");
const connectDB = require("../config/mongo");
const { App } = require("../env/link");

const PROTO_PATH = __dirname + "/../protos/kitchen.proto";
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const kitchenProto = grpc.loadPackageDefinition(packageDefinition).kitchen;

const OrderSchema = new mongoose.Schema({
  item: String,
  quantity: Number,
  status: String,
});

const Order = mongoose.model("Order", OrderSchema);

async function prepareOrder(call, callback) {
  const { orderId } = call.request;
  const order = await Order.findById(orderId);
  if (!order) {
    callback({ code: grpc.status.NOT_FOUND, message: "Order not found" });
  } else {
    order.status = "Prepared";
    await order.save();
    callback(null, { status: "Prepared" });
  }
}

const server = new grpc.Server();
server.addService(kitchenProto.KitchenService.service, {
  prepareOrder,
});
server.bindAsync(
  `0.0.0.0:${App.kitchen}`,
  grpc.ServerCredentials.createInsecure(),
  async (error, port) => {
    if (error) {
      console.error(`Server error: ${error.message}`);
    } else {
      console.log(`Server bound on port: ${port}`);
      // Start the server
      server.start();
      await connectDB();
      await connectRabbitMQ();

      // Consume messages from RabbitMQ
      const channel = getChannel();
      channel.consume("kitchenQueue", async (msg) => {
        if (msg !== null) {
          const { orderId } = JSON.parse(msg.content.toString());
          const order = await Order.findById(orderId);
          if (order) {
            order.status = "Prepared";
            await order.save();
            console.log(`Order prepared: ${orderId}`);

            // Publish to Payment queue
            channel.publish(
              "orderDirectExchange",
              "payment",
              Buffer.from(JSON.stringify({ orderId, amount: 19.99 }))
            ); // Example amount
          }
          channel.ack(msg);
        }
      });
    }
  }
);
