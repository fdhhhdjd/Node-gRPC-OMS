const amqp = require("amqplib");
const { RabbitMQ } = require("../env/link");

let channel = null;

const connectRabbitMQ = async () => {
  try {
    const connection = await amqp.connect(RabbitMQ.url);
    const ch = await connection.createChannel();
    channel = ch;

    // Setup exchanges and queues
    await channel.assertExchange("orderExchange", "fanout", { durable: false });
    await channel.assertExchange("orderDirectExchange", "direct", {
      durable: false,
    });

    await channel.assertQueue("stockQueue", { durable: false });
    await channel.bindQueue("stockQueue", "orderExchange", "");

    await channel.assertQueue("kitchenQueue", { durable: false });
    await channel.bindQueue("kitchenQueue", "orderDirectExchange", "kitchen");

    await channel.assertQueue("paymentQueue", { durable: false });
    await channel.bindQueue("paymentQueue", "orderDirectExchange", "payment");

    console.log("RabbitMQ connected and channel setup completed");
  } catch (error) {
    console.error(
      "Failed to connect to RabbitMQ or setup channel:",
      error.message
    );
    // Implement reconnection logic here if necessary
  }
};

const getChannel = () => {
  if (!channel) {
    throw new Error("RabbitMQ channel not initialized");
  }
  return channel;
};

module.exports = { connectRabbitMQ, getChannel };
