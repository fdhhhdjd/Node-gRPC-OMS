const express = require("express");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");
const { App, StripeKey } = require("../env/link");
const Stripe = require("stripe");
const stripe = Stripe(StripeKey.secretKey);

// Load proto files
const orderProtoPath = path.join(__dirname, "../protos/order.proto");
const stockProtoPath = path.join(__dirname, "../protos/stock.proto");
const kitchenProtoPath = path.join(__dirname, "../protos/kitchen.proto");
const paymentProtoPath = path.join(__dirname, "../protos/payment.proto");

const orderPackageDefinition = protoLoader.loadSync(orderProtoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const stockPackageDefinition = protoLoader.loadSync(stockProtoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const kitchenPackageDefinition = protoLoader.loadSync(kitchenProtoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const paymentPackageDefinition = protoLoader.loadSync(paymentProtoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const orderProto = grpc.loadPackageDefinition(orderPackageDefinition).order;
const stockProto = grpc.loadPackageDefinition(stockPackageDefinition).stock;
const kitchenProto = grpc.loadPackageDefinition(
  kitchenPackageDefinition
).kitchen;
const paymentProto = grpc.loadPackageDefinition(
  paymentPackageDefinition
).payment;

// Create gRPC clients
const orderClient = new orderProto.OrderService(
  `localhost:${App.orders}`,
  grpc.credentials.createInsecure()
);
const stockClient = new stockProto.StockService(
  `localhost:${App.stock}`,
  grpc.credentials.createInsecure()
);
const kitchenClient = new kitchenProto.KitchenService(
  `localhost:${App.kitchen}`,
  grpc.credentials.createInsecure()
);
const paymentClient = new paymentProto.PaymentService(
  `localhost:${App.payment}`,
  grpc.credentials.createInsecure()
);

const app = express();
app.use(express.json());

//* Orders
app.post("/createOrder", (req, res) => {
  const { item, quantity } = req.body;
  orderClient.createOrder({ item, quantity }, (error, response) => {
    if (error) {
      res.status(500).send(error);
    } else {
      res.send(response);
    }
  });
});

app.get("/orderStatus", (req, res) => {
  const { orderId } = req.query;
  orderClient.getOrderStatus({ orderId }, (error, response) => {
    if (error) {
      res.status(500).send(error);
    } else {
      res.send(response);
    }
  });
});

//* Stock
app.get("/checkStock", (req, res) => {
  const { item } = req.query;
  stockClient.checkStock({ item }, (error, response) => {
    if (error) {
      res.status(500).send(error);
    } else {
      console.log(response);
      res.send(response);
    }
  });
});

//* Kitchen
app.post("/prepareOrder", (req, res) => {
  const { orderId } = req.body;
  kitchenClient.prepareOrder({ orderId }, (error, response) => {
    if (error) {
      res.status(500).send(error);
    } else {
      res.send(response);
    }
  });
});

//* Payment
app.post("/processPayment", (req, res) => {
  const { orderId, amount } = req.body;
  paymentClient.processPayment({ orderId, amount }, (error, response) => {
    if (error) {
      res.status(500).send(error);
    } else {
      res.send(response);
    }
  });
});

app.post("/confirm-payment", async (req, res) => {
  const { orderId } = req.body;

  try {
    // Use a test token (from Stripe documentation)
    const testToken = "tok_visa"; // This represents a Visa card for testing

    // Create a PaymentMethod using the test token
    const paymentMethod = await stripe.paymentMethods.create({
      type: "card",
      card: {
        token: testToken,
      },
      billing_details: {
        name: "NGUYEN TIEN TAI",
      },
    });

    console.log("Payment Method ID:", paymentMethod.id);

    // Update the PaymentIntent with the created PaymentMethod
    await stripe.paymentIntents.update(orderId, {
      payment_method: paymentMethod.id,
    });

    // Confirm the PaymentIntent
    const paymentIntent = await stripe.paymentIntents.confirm(orderId);

    res.json({
      success: true,
      message: "Thanh toán thành công",
      paymentIntent,
    });
  } catch (error) {
    console.error("PaymentIntent confirmation failed:", error.message);
    res.status(400).json({
      success: false,
      message: "Thanh toán thất bại",
      error: error.message,
    });
  }
});

// Webhook
app.post("/webhook", (req, res) => {
  const event = req.body;
  // Handle the event
  switch (event.type) {
    case "payment_intent.succeeded":
      const paymentIntent = event.data.object;
      console.log(`PaymentIntent for ${paymentIntent.amount} was successful!`);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Gateway service running at http://localhost:${PORT}`);
});
