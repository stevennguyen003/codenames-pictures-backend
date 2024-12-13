export class RoomData {

    // Empty constructor for creating a new class
    constructor(data = {}) {
        this.users = data.users || [];
        this.gameLog = data.gameLog || [];
        this.teamRed = data.teamRed || [];
        this.teamBlue = data.teamBlue || [];
        this.spectators = data.spectators || [];
        this.gameGrid = data.gameGrid || null;
        this.gameStarted = data.gameStarted || false;
        this.currentTurn = data.currentTurn || null;
        this.currentTurnData = data.currentTurnData || null;
        this.teamRedPoints = data.teamRedPoints || 0;
        this.teamBluePoints = data.teamBluePoints || 0;
    }

    // Deserialization
    static fromSerialized(serializedData) {
        return new RoomData({
            users: JSON.parse(serializedData.users || '[]'),
            gameLog: JSON.parse(serializedData.gameLog || '[]'),
            teamRed: JSON.parse(serializedData.teamRed || '[]'),
            teamBlue: JSON.parse(serializedData.teamBlue || '[]'),
            spectators: JSON.parse(serializedData.spectators || '[]'),
            gameGrid: serializedData.gameGrid === 'null' ? null : (serializedData.gameGrid ? JSON.parse(serializedData.gameGrid) : null),
            gameStarted: serializedData.gameStarted === 'true',
            currentTurn: serializedData.currentTurn === 'null' ? null : serializedData.currentTurn,
            currentTurnData: serializedData.currentTurnData === 'null' ? null : (serializedData.currentTurnData ? JSON.parse(serializedData.currentTurnData) : null),
            teamRedPoints: parseInt(serializedData.teamRedPoints || '0', 10),
            teamBluePoints: parseInt(serializedData.teamBluePoints || '0', 10)
        });
    }

    // Serialization
    serialize() {
        return {
            users: JSON.stringify(this.users),
            gameLog: JSON.stringify(this.gameLog),
            teamRed: JSON.stringify(this.teamRed),
            teamBlue: JSON.stringify(this.teamBlue),
            spectators: JSON.stringify(this.spectators),
            gameGrid: this.gameGrid === null ? 'null' : JSON.stringify(this.gameGrid),
            gameStarted: this.gameStarted ? 'true' : 'false',
            currentTurn: this.currentTurn === null ? 'null' : this.currentTurn,
            currentTurnData: this.currentTurnData === null ? 'null' : JSON.stringify(this.currentTurnData),
            teamRedPoints: this.teamRedPoints.toString(),
            teamBluePoints: this.teamBluePoints.toString()
        };
    }

    // Helper method to find spymaster for a team
    getSpymaster(teamColor) {
        const team = teamColor === 'red' ? this.teamRed : this.teamBlue;
        return team.find(user => user.role === 'spymaster');
    }
}
