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

let users = []
const gameRooms = {};

io.on('connection', (socket) => {
    console.log('a user connected');

    // User provides nickname when joining the server
    socket.on("join server", (nickname) => {
      const user = {
        nickname,
        id: socket.id,
      };
      users.push(user);
      io.emit("new user", users);
    })

    // User joining or creating a room
    socket.on("join room", (roomName, nickname, cb) => {

      socket.join(roomName);

      // Creates room if no room round
      if (!gameRooms[roomName]) {
        gameRooms[roomName] = {
          users: [],
          gameLog: [],
        };
      }

      // Add the user to the room
      gameRooms[roomName].users.push({nickname, id: socket.id });
      // Allow user to see previous game log history if exists
      cb(gameRooms[roomName].gameLog, {
        success: true,
        users: gameRooms[roomName].users
      });

      // Notify the room that a new user has joined
      io.to(roomName).emit("user joined", {
        nickname,
        users: gameRooms[roomName].users,
      });

      console.log(`${nickname} joined room ${roomName}`);
    })
});

Hello(app);