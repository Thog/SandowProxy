/**
 * Created by Thog9 on 11/09/2015.
 */



var servers = {
    "fallback": {
        host: "localhost",
        port: 9945
    }
}

function ConnectionManager()
{
}



ConnectionManager.prototype.connect = function(client)
{
    var mc = require("minecraft-protocol"),
        states = mc.states;
    client.targetClient = mc.createClient({
        host: servers.fallback.host,
        port: servers.fallback.port,
        username: client.username,
        'online-mode': true,
        keepAlive: false
    });

    client.currentServer = servers.fallback;

    client.ended = false;
    client.targetClient.ended = false;
    var brokenPackets = [/*0x04, 0x2f, 0x30*/];


    client.on('end', function () {
        client.ended = true;
        console.log('Connection closed by client', '(' + client.currentServer.host + ')');
        if (!client.targetClient.ended)
            client.targetClient.end("End");
    });

    client.on('packet', function (packet) {
            if (!client.targetClient.ended)
                client.targetClient.write(packet.id, packet);
        }
    );

    client.targetClient.on('packet', function (packet) {
        if (packet.state == states.PLAY && client.state == states.PLAY &&
            brokenPackets.indexOf(packet.id) === -1) {
            if (!client.ended)
                client.write(packet.id, packet);
            if (packet.id === 0x46) // Set compression
                client.compressionThreshold = packet.threshold;
        }
    });
    client.targetClient.on('end', function () {
        client.targetClient.ended = true;
        console.log('Connection closed by server', '(' + client.currentServer.host + ')');
        if (!client.ended)
            client.end("End");
    });
    client.targetClient.on('error', function (err) {
        client.targetClient.ended = true;
        console.log('Connection error by server', '(' + client.currentServer.host + ') ', err);
        console.log(err.stack);
        if (!client.ended)
            client.end("Error");
    });
}

module.exports = ConnectionManager;