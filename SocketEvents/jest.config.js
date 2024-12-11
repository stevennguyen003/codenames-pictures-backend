export default {
    testEnvironment: 'node',
    transform: {},
    transformIgnorePatterns: [
        'node_modules/(?!socket.io|socket.io-client)/'
    ]
};