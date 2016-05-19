const EventEmitter = require('events');
const path = require('path');
const flags = require('flags');
const express = require('express');
const app = express();

// Use gzip compression
app.use(require('compression')());

const http = require('http').Server(app);
const io = require('socket.io')(http);

class Board {
    constructor() {
        this.values = [
            [-1, -1, -1],
            [-1, -1, -1],
            [-1, -1, -1]
        ];
    }

    isValid(x, y) {
        return 0 <= y && y < this.values.length
            && 0 <= x && x < this.values[y].length
            && this.values[y][x] === -1;
    }

    move(x, y, val) {
        if (this.isValid(x, y)) {
            this.values[y][x] = val;
            return true;
        }

        return false;
    }
}


class Game extends EventEmitter {
    broadcast(event, data) {
        io.of('/tictactoe').to(this.id).emit(event, data);
    }

    constructor(p0, ...others) {
        super();

        this.id = p0.id;

        const p = [p0, ...others];
        const board = new Board();

        let turn = -1;

        // Make everyone else join the same room as p0
        others.map(pl => pl.join(this.id));

        const nextTurn = () => {
            this.broadcast('board', board.values);
            turn++;
            turn %= p.length;
            const pl = p[turn];
            const moveHandler = (x, y) => {
                if (board.move(x, y, turn)) {
                    nextTurn();
                } else {
                    pl.once('move', moveHandler);
                }
            }
            pl.once('move', moveHandler);
            pl.emit('your turn');
        }

        // End the game when a player disconnects
        const endGame = () => {
            p.map(pl => pl.emit('game end')
                   .removeAllListeners('move')
                   .removeAllListeners('disconnect'));
            super.emit('game end');
        }

        p.map(pl => pl.on('disconnect', endGame));

        this.broadcast('game start')
        nextTurn();
    }
}

let waiting = null;
const games = {}

io.of('/tictactoe').on('connection', p0 => {
    const disconnectHandler = () => waiting = null;

    if (waiting === null) {
        waiting = p0;
        p0.once('disconnect', disconnectHandler);
    } else {
        p0.removeListener('disconnect', disconnectHandler);
        const p1 = waiting;
        waiting = null;
        var game = new Game(p0, p1);
        game.on('game end', () => delete games[game.id]);
        games[game.id] = game;
    }
});


function serve(port) {
    http.listen(port,
                () => console.log(`tictactoe-server listening on *:${port}`));
}

if (require.main === module) {
    flags.defineInteger('port').setDefault(10101)
        .setDescription('The port on which to host the server.');
    flags.defineString('frontendDir')
        .setDescription('(Optional) The directory in which to look for'
                        + 'static frontend files. If not specified, no frontend'
                        + 'will be served.');
    flags.parse();

    const frontendDir = flags.get('frontendDir');
    if (frontendDir) {
        console.log('Using frontendDir ' + frontendDir);
        // set up frontend static file handler
        app.use('/', express.static(frontendDir));
    }

    serve(flags.get('port'));
}

module.exports = (port, frontendDir) => {
    if (!port) {
        throw new Error('no port specified');
    }

    if (frontendDir) {
        app.use('/', express.static(frontendDir));
    }

    serve(port);
}

