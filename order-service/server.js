const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const mongoose = require("mongoose");

const { connectRabbitMQ, getChannel } = require("../config/rabbitmq");
const connectDB = require("../config/mongo");
const { App } = require("../env/link");

const PROTO_PATH = __dirname + "/../protos/order.proto";
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const orderProto = grpc.loadPackageDefinition(packageDefinition).order;

const OrderSchema = new mongoose.Schema({
  item: String,
  quantity: Number,
  status: String,
});

const Order = mongoose.model("Order", OrderSchema);

async function createOrder(call, callback) {
  const { item, quantity } = call.request;
  const newOrder = new Order({ item, quantity, status: "Created" });
  await newOrder.save();

  // Publish to RabbitMQ
  const channel = getChannel();
  channel.assertExchange("orderExchange", "fanout", { durable: false });
  channel.publish(
    "orderExchange",
    "",
    Buffer.from(
      JSON.stringify({
        orderId: newOrder._id.toString(),
        item,
        quantity,
      })
    )
  );

  callback(null, {
    orderId: newOrder._id.toString(),
    confirmation: `Order for ${quantity} of ${item} confirmed`,
  });
}

async function getOrderStatus(call, callback) {
  const { orderId } = call.request;
  const order = await Order.findById(orderId);
  if (!order) {
    callback({ code: grpc.status.NOT_FOUND, message: "Order not found" });
  } else {
    callback(null, { status: order.status });
  }
}

const server = new grpc.Server();
server.addService(orderProto.OrderService.service, {
  createOrder,
  getOrderStatus,
});

server.bindAsync(
  `0.0.0.0:${App.orders}`,
  grpc.ServerCredentials.createInsecure(),
  (err, port) => {
    if (err) {
      console.error(`Server failed to bind: ${err.message}`);
      return; // Ensure the process exits if the server fails to bind
    }
    server.start();
    console.log(`Order service running on port ${port}`);
    connectDB();
    connectRabbitMQ();
  }
);
