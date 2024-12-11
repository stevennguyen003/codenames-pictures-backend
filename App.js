import express from "express";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import socketEvents from './SocketEvents/socketEvents.js';

const app = express();
const port = 4000;
const server = app.listen(process.env.PORT || port);

app.use(cors({
  credentials: true,
  origin: ["http://localhost:3000"]
}));

const io = new SocketIOServer(server, {
  cors: {
    origin: "http://localhost:3000", // Allow requests from this origin
    methods: ["GET", "POST"]
  },
  // pingInterval: 25000,   // Interval to send a ping (in ms)
  // pingTimeout: 60000,    // Time before disconnect if no ping response (in ms)
  // transports: ['websocket'], // Use WebSocket transport for better stability
});


// Initialize socket event handling
socketEvents(io);

console.log(`Server running on port ${port}`);