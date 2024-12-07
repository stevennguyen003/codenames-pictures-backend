import express from "express";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import Hello from './Hello.js';

const app = express();
const port = 4000;
const server = app.listen(process.env.PORT || port);

app.use(cors({
    credentials: true,
    origin: ["http://localhost:3000"]
}));

const io = new SocketIOServer(server, {
    cors: {
      origin: "http://localhost:3000", // Allow requests from this origin, adjust when deployed
      methods: ["GET", "POST"]
    }
  });

io.on('connection', (socket) => {
    console.log('a user connected');

    // Emit a custom 'user connected' event to the client
    socket.emit('user connected');

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

Hello(app);