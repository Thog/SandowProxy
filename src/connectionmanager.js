/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2015, Thog
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 **/

var servers = {
    "fallback": {
        host: "localhost",
        port: 9945
    }
}

var commander = null;

var players = [],
    mc = require("minecraft-protocol"),
    states = mc.states;

function ConnectionManager(commandManager) {
    commander = commandManager;
}


ConnectionManager.prototype.connect = function (client) {
    players[client.uuid] = {
        clientConnection: client,
        currentServer: servers.fallback,
        serverConnection: mc.createClient({
            host: servers.fallback.host,
            port: servers.fallback.port,
            username: client.username,
            'online-mode': true,
            keepAlive: false
        })
    }


    var proxyPlayer = players[client.uuid];
    var brokenPackets = [/*0x04, 0x2f, 0x30*/];


    function onError() {
        console.log('Connection closed by client', '(' + proxyPlayer.currentServer.host + ')');
    }

    client.socket.addListener('error', onError)
    client.on('end', function () {
        console.log('Connection closed by client', '(' + proxyPlayer.currentServer.host + ')');
        if (!proxyPlayer.serverConnection.ended)
            proxyPlayer.serverConnection.end("End");
    });

    client.on('error', function () {
        console.log('Connection error by client', '(' + proxyPlayer.currentServer.host + ')');
        if (!proxyPlayer.serverConnection.ended)
            proxyPlayer.serverConnection.end("Error");
    });

    client.on('packet', function (packet) {
            if (!proxyPlayer.serverConnection.ended)
            {
                if (packet.id == 1 && packet.message != null && packet.message.indexOf("/") == 0 && commander.dispatchCommand(this, proxyPlayer, packet.message))
                {
                    return;
                }
                proxyPlayer.serverConnection.write(packet.id, packet);

            }

        }
    );

    proxyPlayer.serverConnection.on('packet', function (packet) {
        if (packet.state == states.PLAY && client.state == states.PLAY &&
            brokenPackets.indexOf(packet.id) === -1) {
            if (!client.ended)
                client.write(packet.id, packet);
            if (packet.id === 0x46) // Set compression
                client.compressionThreshold = packet.threshold;
        }
    });
    proxyPlayer.serverConnection.on('end', function () {
        console.log('Connection closed by server', '(' + proxyPlayer.currentServer.host + ')');
        if (!client.ended)
            client.end("End");
    });
    proxyPlayer.serverConnection.on('error', function (err) {
        console.log('Connection error by server', '(' + proxyPlayer.currentServer.host + ') ', err);
        console.log(err.stack);
        if (!client.ended)
            client.end("Error");
    });
}

module.exports = ConnectionManager;