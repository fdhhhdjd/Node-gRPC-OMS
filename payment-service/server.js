const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const mongoose = require("mongoose");
const Stripe = require("stripe");
const { connectRabbitMQ, getChannel } = require("../config/rabbitmq");
const connectDB = require("../config/mongo");
const { App, StripeKey } = require("../env/link");

const PROTO_PATH = __dirname + "/../protos/payment.proto";
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const paymentProto = grpc.loadPackageDefinition(packageDefinition).payment;

const stripe = Stripe(StripeKey.secretKey);

const OrderSchema = new mongoose.Schema({
  item: String,
  quantity: Number,
  status: String,
});

const Order = mongoose.model("Order", OrderSchema);

const PaymentSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: true,
  },
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  paymentIntentId: { type: String, required: true },
  status: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const Payment = mongoose.model("Payment", PaymentSchema);

async function processPayment(call, callback) {
  const { orderId, amount } = call.request;
  const order = await Order.findById(orderId);
  if (!order) {
    callback({ code: grpc.status.NOT_FOUND, message: "Order not found" });
  } else {
    console.log(Math.round(amount * 100));
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // amount in cents
        currency: "usd",
        payment_method_types: ["card"],
      });
      order.status = "Paid";
      await order.save();
      console.log("Payment Intent ID:", paymentIntent.id);
      callback(null, { status: "Payment successful" });
    } catch (error) {
      callback({ code: grpc.status.INTERNAL, message: error.message });
    }
  }
}

const server = new grpc.Server();
server.addService(paymentProto.PaymentService.service, { processPayment });
server.bindAsync(
  `0.0.0.0:${App.payment}`,
  grpc.ServerCredentials.createInsecure(),
  async (err, port) => {
    if (err) {
      console.error(`Server failed to bind: ${err.message}`);
      return;
    }
    server.start();
    console.log(`Payment service running on port ${port}`);
    // Connect to DB and RabbitMQ
    await connectDB();
    await connectRabbitMQ();

    // Consume messages from RabbitMQ after the server has started
    const channel = getChannel();
    channel.consume("paymentQueue", async (msg) => {
      if (msg !== null) {
        const { orderId, amount } = JSON.parse(msg.content.toString());
        const order = await Order.findById(orderId);
        if (!order) {
          console.error("Order not found");
        } else {
          try {
            const paymentIntent = await stripe.paymentIntents.create({
              amount: Math.round(amount * 100), // amount in cents
              currency: "usd",
              payment_method_types: ["card"],
            });
            order.status = "Paid";
            await order.save();

            // Save payment details
            const payment = new Payment({
              orderId: order._id,
              amount: amount,
              currency: "usd",
              paymentIntentId: paymentIntent.id,
              status: "created",
            });
            await payment.save();
            console.log("Payment Intent ID:", paymentIntent.id);
            console.log(`Payment processed for order: ${orderId}`);
          } catch (error) {
            console.error(`Payment failed: ${error.message}`);
          }
        }
        channel.ack(msg);
      }
    });
  }
);
