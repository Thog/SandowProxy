var ConnectionManager = require("./connectionmanager"),
    mc = require("minecraft-protocol");

var connectionManager = new ConnectionManager();

var options = {
    motd: 'Sandow',
    'max-players': 3000,
    port: 25565,
    'online-mode': true,
};

var server = mc.createServer(options)


server.on("login", function (mcClient) {
    console.log("New connection: " + mcClient.username)
    connectionManager.connect(mcClient)
});