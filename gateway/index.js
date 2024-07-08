const express = require("express");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");
const { App } = require("../env/link");

// Load proto files
const orderProtoPath = path.join(__dirname, "../protos/order.proto");
const orderPackageDefinition = protoLoader.loadSync(orderProtoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const orderProto = grpc.loadPackageDefinition(orderPackageDefinition).order;

// Create gRPC clients
const orderClient = new orderProto.OrderService(
  `localhost:${App.orders}`,
  grpc.credentials.createInsecure()
);

const app = express();
app.use(express.json());

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Gateway service running at http://localhost:${PORT}`);
});
