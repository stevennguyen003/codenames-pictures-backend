
// Helper function to generate 25 unique random numbers
const getRandomNumbers = (min, max, count) => {
    const numbers = new Set();
    while (numbers.size < count) {
      const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;
      numbers.add(randomNumber);
    }
    return Array.from(numbers);
};


// Generating a new game grid
export const generateGameGrid = () => {
    // Generate 25 unique random card numbers
    const randomNumbers = getRandomNumbers(1, 279, 25);
    const randomImages = randomNumbers.map((num) => `card-${num}.jpg`);

    // Determine card types (9 red, 8 blue, 7 neutral, 1 assassin)
    const gridTypes = [
        ...Array(9).fill('red'),
        ...Array(8).fill('blue'),
        ...Array(7).fill('neutral'),
        'assassin'
    ];

    // Shuffle grid types
    const shuffledTypes = gridTypes.sort(() => 0.5 - Math.random());

    // Create grid with images and types
    const gameGrid = randomImages.map((image, index) => ({
        image,
        type: shuffledTypes[index],
        revealed: false
    }));

    // Calculate initial points
    const teamRedPoints = shuffledTypes.filter(type => type === 'red').length;
    const teamBluePoints = shuffledTypes.filter(type => type === 'blue').length;

    return { gameGrid, teamRedPoints, teamBluePoints };
};
