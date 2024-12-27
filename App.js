import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from 'redis';
import session from 'express-session';
import { RedisStore } from "connect-redis";
import { Server as SocketIOServer } from "socket.io";
import socketEvents from './SocketEvents/socketEvents.js';

const app = express();
const port = process.env.PORT || 4000;

// Redis Client
const redisClient = createClient({
  url: process.env.REDIS_URL
});

console.log('Connecting to Redis at:', process.env.REDIS_URL);

redisClient.on('error', (err) => console.log('Redis Client Error', err));

// Connect Redis Client
await redisClient.connect();

// Redis Session Store
const redisStore = new RedisStore({
  client: redisClient,
  prefix: 'codenames_session:',
});

// Middleware Setup
app.use(cors({
  credentials: true,
  origin: process.env.FRONTEND_URL
}));

// Session Middleware
app.use(session({
  store: redisStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
  }
}));

// Create HTTP Server
const server = app.listen(port);

// Socket.IO Setup
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Initialize socket event handling with Redis
socketEvents(io, redisClient);

console.log(`Server running on port ${port}`);