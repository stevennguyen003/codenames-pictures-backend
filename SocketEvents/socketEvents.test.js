import { createServer } from "node:http";
import { Server } from "socket.io";
import { io as ioc } from "socket.io-client";
import { generateGameGrid } from '../GridController/gridController.js';

// Import your socket events handler
import socketEvents from '../SocketEvents/socketEvents.js';

// Utility function to wait for an event
function waitFor(socket, event) {
  return new Promise((resolve) => {
    socket.once(event, resolve);
  });
}

describe("Codenames Game Socket Events", () => {
  let httpServer;
  let io;
  let clientSocket;
  let serverSocket;

  beforeAll((done) => {
    // Create HTTP server
    httpServer = createServer();
    
    // Initialize Socket.IO server
    io = new Server(httpServer);
    
    // Setup socket events
    socketEvents(io);

    // Start server
    httpServer.listen(() => {
      const port = httpServer.address().port;
      
      // Create client socket
      clientSocket = ioc(`http://localhost:${port}`, {
        forceNew: true
      });

      // Capture server socket on connection
      io.on("connection", (socket) => {
        serverSocket = socket;
      });

      // Proceed when client connects
      clientSocket.on("connect", done);
    });
  });

  afterAll(() => {
    io.close();
    clientSocket.disconnect();
  });

  // Test joining the server
  test("join server event", (done) => {
    const nickname = "TestPlayer";

    // Listen for new user event
    clientSocket.on("new user", (users) => {
      expect(users).toBeInstanceOf(Array);
      const matchingUser = users.find(user => user.nickname === nickname);
      expect(matchingUser).toBeTruthy();
      done();
    });

    // Emit join server event
    clientSocket.emit("join server", nickname);
  });

  // Test joining a room
  test("join room event", (done) => {
    const roomName = "TestRoom";
    const nickname = "TestPlayer";

    // Listen for callback
    clientSocket.emit("join room", roomName, nickname, (gameLog, roomInfo) => {
      expect(roomInfo.success).toBe(true);
      expect(roomInfo.spectators).toBeInstanceOf(Array);
      expect(roomInfo.spectators[0].nickname).toBe(nickname);
      done();
    });
  });

  // Test selecting a role
  test("select role event", (done) => {
    const roomName = "TestRoom";
    const nickname = "TestPlayer";
    const teamColor = "red";
    const roleType = "spymaster";

    clientSocket.emit("select role", roomName, nickname, teamColor, roleType, (response) => {
      expect(response.success).toBe(true);
      expect(response.teamRed).toBeInstanceOf(Array);
      const teamMember = response.teamRed.find(member => member.nickname === nickname);
      expect(teamMember).toBeTruthy();
      expect(teamMember.role).toBe(roleType);
      done();
    });
  });

  // Test starting the game
  test("start game event", (done) => {
    const roomName = "TestRoom";

    // Prepare room with valid team composition
    const setupTeams = () => {
      // Add spymasters and operators to both teams
      clientSocket.emit("select role", roomName, "RedSpymaster", "red", "spymaster", () => {
        clientSocket.emit("select role", roomName, "RedOperator", "red", "operator", () => {
          clientSocket.emit("select role", roomName, "BlueSpymaster", "blue", "spymaster", () => {
            clientSocket.emit("select role", roomName, "BlueOperator", "blue", "operator", () => {
              // Now start the game
              clientSocket.emit("start game", roomName, (response) => {
                expect(response.success).toBe(true);
                expect(response.gameGrid).toBeInstanceOf(Array);
                expect(response.gameGrid).toHaveLength(25);
                expect(['red', 'blue']).toContain(response.currentTurn);
                done();
              });
            });
          });
        });
      });
    };

    // Initial setup of the room
    clientSocket.emit("join room", roomName, "TestPlayer", setupTeams);
  });

  // Advanced test with acknowledgement
  test("game start with acknowledgement", async () => {
    const roomName = "AckTestRoom";

    // Prepare room with valid team composition
    await new Promise((resolve) => {
      clientSocket.emit("join room", roomName, "TestPlayer", resolve);
    });

    await new Promise((resolve) => {
      clientSocket.emit("select role", roomName, "RedSpymaster", "red", "spymaster", resolve);
    });

    await new Promise((resolve) => {
      clientSocket.emit("select role", roomName, "RedOperator", "red", "operator", resolve);
    });

    await new Promise((resolve) => {
      clientSocket.emit("select role", roomName, "BlueSpymaster", "blue", "spymaster", resolve);
    });

    await new Promise((resolve) => {
      clientSocket.emit("select role", roomName, "BlueOperator", "blue", "operator", resolve);
    });

    // Use emitWithAck for game start
    const response = await clientSocket.emitWithAck("start game", roomName);

    expect(response.success).toBe(true);
    expect(response.gameGrid).toBeInstanceOf(Array);
    expect(response.gameGrid).toHaveLength(25);
    expect(['red', 'blue']).toContain(response.currentTurn);
  });
});