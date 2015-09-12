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

var commands = [];

function Commander() {
}


function walk(currentDirPath, callback) {
    var fs = require('fs'), path = require('path');
    var files = fs.readdirSync(currentDirPath);
    files.forEach(function(name) {
        var filePath = path.join(currentDirPath, name);
        var stat = fs.statSync(filePath);
        if (stat.isFile()) {
            callback(filePath, name);
        } else if (stat.isDirectory()) {
            walk(filePath, callback);
        }
    });
}

load = function(addonsDir)
{
    var path = require("path");
    console.log("Commands: [LOADING]");
    walk(addonsDir , function(filePath, name)
    {
        var commandName = name.replace(".js", "");
        console.log("Commands: " + commandName + " loaded.");
        commands[commandName] = require(path.resolve(filePath));
    });
    console.log("Commands: [OK]");
};

reload = function(addonDir)
{
    console.log("Unloading commands...");
    walk(addonDir, function(filePath, name)
    {
        console.log("Unloading " + name);
        delete require.cache[require.resolve(filePath)];
    });
    commands = [];
    load(addonDir);
    console.log("Reload complete");
};

Commander.prototype.load = load;
Commander.prototype.reload = reload;
Commander.prototype.dispatchCommand = function(connectionManager, proxyPlayer, message)
{
    var args = message.split(" ");
    var command = commands[args[0].replace("/", "")];
    if (command != null)
    {
        command.onCommand(connectionManager, proxyPlayer, args);
        return true;
    }

    return false;
};

module.exports = Commander;