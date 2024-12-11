import { generateGameGrid, getRandomNumbers } from "./gridController.js";

describe('generateGameGrid', () => {
    // Test that the grid is generated with the correct number of cards
    test('generates a grid with 25 cards', () => {
        const gameGrid = generateGameGrid();
        expect(gameGrid).toHaveLength(25);
    });

    // Test card type distribution
    test('generates grid with correct card type distribution', () => {
        const gameGrid = generateGameGrid();

        const cardTypeCounts = gameGrid.reduce((acc, card) => {
            acc[card.type] = (acc[card.type] || 0) + 1;
            return acc;
        }, {});

        expect(cardTypeCounts).toEqual({
            red: 9,
            blue: 8,
            neutral: 7,
            assassin: 1
        });
    });

    // Test unique images
    test('generates grid with unique images', () => {
        const gameGrid = generateGameGrid();
        const uniqueImages = new Set(gameGrid.map(card => card.image));

        expect(uniqueImages.size).toBe(25);
    });

    // Test initial reveal status
    test('all cards are initially not revealed', () => {
        const gameGrid = generateGameGrid();
        const allUnrevealed = gameGrid.every(card => card.revealed === false);

        expect(allUnrevealed).toBe(true);
    });

    // Test image format
    test('images follow correct naming format', () => {
        const gameGrid = generateGameGrid();
        const correctImageFormat = gameGrid.every(card =>
            /^card-\d+\.jpg$/.test(card.image)
        );

        expect(correctImageFormat).toBe(true);
    });
});

// Utility function test
describe('getRandomNumbers', () => {
    // Tests random number helper
    test('generates unique numbers within range', () => {
        const randomNumbers = getRandomNumbers(1, 279, 25);

        expect(randomNumbers).toHaveLength(25);
        expect(new Set(randomNumbers).size).toBe(25);

        const allInRange = randomNumbers.every(num =>
            num >= 1 && num <= 279
        );
        expect(allInRange).toBe(true);
    });
});