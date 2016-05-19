function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

const io = require('socket.io-client');
const socket = io('http://localhost:10101/tictactoe');

socket.on('game start', () => console.log('game start'));
socket.on('board', board => console.log(board));
socket.on('your turn', () => setTimeout(() => {
    const x = getRandomInt(0, 3);
    const y = getRandomInt(0, 3);
    socket.emit('move', x, y);
}, 3000));

