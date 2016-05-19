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
        function isNumeric(n) {
          return !isNaN(parseFloat(n)) && isFinite(n);
        }

        return isNumeric(x) && isNumeric(y)
            && 0 <= y && y < this.values.length
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

    checkWin() {
        let full = true;
        const winning = (prev, elem, i, arr) => {
            if (elem === -1) {
                full = false;
                return false;
            } else {
                return (i === 0) || (prev && (arr[i - 1] === elem))
            }
        }

        for (let row of this.values) {
            if (row.reduce(winning, true)) {
                return row[0];
            }
        }

        for (let x = 0; x < this.values[0].length; x++) {
            const col = new Array(this.values.length);
            for (let y = 0; y < this.values.length; y++) {
                col[y] = this.values[y][x];
            }

            if (col.reduce(winning, true)) {
                return col[0];
            }
        }

        const diagLen = Math.min(this.values[0].length, this.values.length);
        const diag1 = new Array(diagLen);
        const diag2 = new Array(diagLen);
        for (let i = 0; i < diagLen; i++) {
            diag1[i] = this.values[i][i];
            diag2[i] = this.values[diagLen - 1 - i][i];
        }

        if (diag1.reduce(winning, true)) {
            return diag1[0];
        }

        if (diag2.reduce(winning, true)) {
            return diag2[0];
        }

        return full ? -1 : null;
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

        // Ends the game.
        const endGame = (winner) => {
            p.map(pl => pl.emit('game end', winner)
                   .removeAllListeners('move')
                   .removeAllListeners('disconnect'));
            super.emit('game end');
        }

        // Begins the next turn.
        const nextTurn = () => {
            turn++;
            turn %= p.length;
            const pl = p[turn];
            const moveHandler = (x, y) => {
                if (board.move(x, y, turn)) {
                    // Move was successful
                    this.broadcast('board', board.values);
                    pl.emit('turn end', turn);

                    const winner = board.checkWin()
                    if (winner !== null) {
                        // End the game with the winner
                        endGame(winner);
                    } else {
                        nextTurn();
                    }
                } else {
                    // Let the same player move again
                    pl.once('move', moveHandler);
                }
            }

            pl.once('move', moveHandler);
            pl.emit('turn start', turn);
        }

        // End the game when a player disconnects
        p.map(pl => pl.on('disconnect', () => endGame(null)));

        // Start the game and begin the first turn.
        this.broadcast('game start')
        this.broadcast('board', board.values);
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

