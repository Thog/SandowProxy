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

var players = [],
    mc = require("minecraft-protocol"),
    states = mc.states,
    packetBlacklist = [/*0x04, 0x2f, 0x30*/],
    instance = null;

function ConnectionManager() {
}

ConnectionManager.prototype.redirect = function (sender, serverName) {

    instance = this;

    if (instance.servers[serverName] == null) {
        sender.clientConnection.write("chat", {
            message: JSON.stringify({
                extra: [{"color": "red", text: serverName + " not found!"}],
                text: ""
            })
        });
        return;
    } else if (instance.servers[serverName] == sender.currentServer) {
        sender.clientConnection.write("chat", {
            message: JSON.stringify({
                extra: [{"color": "red", text: "You are already connected to this server!"}],
                text: ""
            })
        });
        return;
    }

    sender.isRedirecting = true;
    sender.serverConnection.removeAllListeners("end");
    sender.serverConnection.end("Redirectng");
    sender.serverConnection.socket.end();

    var targetServer = instance.servers[serverName];
    sender.serverConnection = mc.createClient({
        host: targetServer.host,
        port: targetServer.port,
        username: sender.clientConnection.username,
        'online-mode': true,
        keepAlive: false
    });

    setupProxyClient(sender.serverConnection);
    sender.serverConnection.on("login", function (packet) {

        // Dimension switcher
        sender.clientConnection.write("respawn", {dimension: 1, difficulty: 0, gameMode: 0, levelType: "default"});

        // Real data for client
        sender.clientConnection.write("respawn", {
            dimension: packet.dimension,
            difficulty: packet.difficulty,
            gameMode: packet.gameMode,
            levelType: packet.levelType
        });

        // Fix GameMode (TODO: Find why respawn packet is bugged)
        sender.clientConnection.write("game_state_change", {reason: 3, gameMode: packet.gameMode})
    });
    sender.isRedirecting = false;
    sender.currentServer = targetServer;
};

ConnectionManager.prototype.exit = function () {
    for (var username in players) {
        var proxyPlayer = players[username];
        proxyPlayer.serverConnection.end("Stopping")
    }
    ;
    process.exit()
};

ConnectionManager.prototype.players = players;

function onServerPacket(packet) {
    var proxyPlayer = players[this.username];

    var client = proxyPlayer.clientConnection;
    if ((packet.state == states.PLAY && client.state == states.PLAY &&
        packetBlacklist.indexOf(packet.id) === -1) || (proxyPlayer.isRedirecting)) {
        if (packet.reason != null && proxyPlayer.isRedirecting) {
            return;
        }
        // Don't send kick packet to player if he is not on the fallback (redirection to the fallback)
        else if (packet.reason != null && proxyPlayer.currentServer.name != "fallback" && !proxyPlayer.isRedirecting) {
            return;
        }
        var clientPacketName = mc.packetNames[client.state]["toClient"][packet.id];

        if (!client.ended && clientPacketName) {
            client.write(packet.id, packet);
        }

        if (packet.id === 0x46) // Set compression
            client.compressionThreshold = packet.threshold;
    }
}

function onServerError(err) {

    var proxyPlayer = players[this.username];
    var client = proxyPlayer.clientConnection;

    console.log('Connection error by server', '(' + proxyPlayer.currentServer.host + ":" + proxyPlayer.currentServer.port + ') ', err);
    console.log(err.stack);

    if (!client.ended && !proxyPlayer.isRedirecting && proxyPlayer.currentServer.name != "fallback") {
        proxyPlayer.clientConnection.write("chat", {
            message: JSON.stringify({
                extra: [{
                    "color": "red",
                    text: "The server you were previously on went down, you have been connected to the fallback server"
                }],
                text: ""
            })
        });
        instance.redirect(proxyPlayer, "fallback");
        return;
    }

    if (!client.ended)
        client.end("Error");
}

function onServerConnectionEnd() {

    var proxyPlayer = players[this.username];
    var client = proxyPlayer.clientConnection;

    console.log('Connection closed by server', '(' + proxyPlayer.currentServer.host + ":" + proxyPlayer.currentServer.port + ')');


    if (!client.ended && !proxyPlayer.isRedirecting && proxyPlayer.currentServer.name != "fallback") {
        proxyPlayer.clientConnection.write("chat", {
            message: JSON.stringify({
                extra: [{
                    "color": "red",
                    text: "The server you were previously on went down, you have been connected to the fallback server"
                }],
                text: ""
            })
        });
        instance.redirect(proxyPlayer, "fallback");
        return;
    }

    if (!client.ended && !proxyPlayer.isRedirecting)
        client.end("End");
}


function setupProxyClient(serverConnection) {
    serverConnection.on('packet', onServerPacket);
    serverConnection.on('end', onServerConnectionEnd);
    serverConnection.on('error', onServerError)
}

ConnectionManager.prototype.connect = function (client) {
    if (instance == null) {
        instance = this;
    }

    players[client.username] = {
        isRedirecting: false,
        clientConnection: client,
        currentServer: instance.servers.fallback,
        serverConnection: mc.createClient({
            host: instance.servers.fallback.host,
            port: instance.servers.fallback.port,
            username: client.username,
            'online-mode': true,
            keepAlive: false
        })
    };

    var proxyPlayer = players[client.username];

    function onError() {
        console.log('Connection closed by client', '(' + proxyPlayer.currentServer.host + ')');
    }

    client.socket.addListener('error', onError);
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
            if (!proxyPlayer.serverConnection.ended) {
                if (packet.id == 1 && packet.message != null && packet.message.indexOf("/") == 0 && instance.proxy.getCommander().dispatchCommand(instance, proxyPlayer, packet.message)) {
                    return;
                }

                var serverPacketName = mc.packetNames[client.state]["toServer"][packet.id];
                if (!serverPacketName || proxyPlayer.serverConnection.state != client.state)
                    return;

                proxyPlayer.serverConnection.write(packet.id, packet);

            }

        }
    );

    setupProxyClient(proxyPlayer.serverConnection)
};

module.exports = ConnectionManager;