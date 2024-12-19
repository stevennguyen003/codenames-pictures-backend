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
        this.currentTurnData = data.currentTurnData || null;
        this.teamRedPoints = data.teamRedPoints || null;
        this.teamBluePoints = data.teamBluePoints || null;
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
            currentTurnData: serializedData.currentTurnData === 'null' ? null : (serializedData.currentTurnData ? JSON.parse(serializedData.currentTurnData) : null),
            teamRedPoints: serializedData.teamRedPoints === 'null' ? null : serializedData.teamRedPoints,
            teamBluePoints: serializedData.teamBluePoints === 'null' ? null : serializedData.teamBluePoints
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
            currentTurnData: this.currentTurnData === null ? 'null' : JSON.stringify(this.currentTurnData),
            teamRedPoints: this.teamRedPoints === null ? 'null' : this.teamRedPoints,
            teamBluePoints: this.teamBluePoints === null ? 'null' : this.teamBluePoints
        };
    }

    // Helper method to find spymaster for a team
    getSpymaster(teamColor) {
        const team = teamColor === 'red' ? this.teamRed : this.teamBlue;
        return team.find(user => user.role === 'spymaster');
    }

    // Helper method to get current turn
    getCurrentTurn() {
        return this.currentTurnData?.team || null;
    }

    // Helper method to set current turn
    setCurrentTurn(team, clue = null, clueNumber = null) {
        this.currentTurnData = {
            team,
            currentClue: clue,
            clueNumber: clueNumber,
            correctCardsClicked: 0,
            turnEnded: false
        };
    }
}
