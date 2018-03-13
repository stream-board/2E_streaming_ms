/**************/
/*** CONFIG ***/
/**************/
var PORT = 8443;


/*************/
/*** SETUP ***/
/*************/
var express = require('express');
var http = require('http');
var bodyParser = require('body-parser')
var main = express()
var server = http.createServer(main)
var io  = require('socket.io').listen(server);
//io.set('log level', 2);

server.listen(PORT, null, function() {
    console.log("Listening on port " + PORT);
});
//main.use(express.bodyParser());

main.get('/', function(req, res){ res.sendFile(__dirname + '/client.html'); });
main.get('/client.js', function(req, res){ res.sendFile(__dirname + '/client.js'); });
main.get('/local.txt', function(req, res){ res.sendFile(__dirname + '/local.txt'); });