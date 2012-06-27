/**
 * PUSH Notification server V 0.3
 * (c) Telefonica Digital, 2012 - All rights reserver
 * Fernando Rodríguez Sela <frsela@tid.es>
 * Guillermo Lopez Leal <gll@tid.es>
 */

// TODO: Error methods
// TODO: push_url_recover_method
// TODO: verify origin
// TODO: URL Parser based on regexp
// TODO: Replies to the 3rd. party server

var log = require("../common/logger.js").getLogger;
var WebSocketServer = require('websocket').server;
var http = require('http');
var crypto = require("../common/cryptography.js").getCrypto();
var dataManager = require("./datamanager.js").getDataManager();
var Connectors = require("./connectors/connector_base.js").getConnectorFactory();
var token = require("../common/token.js").getToken();
var msgBroker = require("../common/msgbroker.js").getMsgBroker();
var config = require("../config.js").NS_UA_WS;

function onMessage(message) {
  log.debug("Message data: " + JSON.stringify(message));
  message.nodeList.forEach(function (nodeData, i) {
    log.debug(" * Notifying node: " + i + ": " + JSON.stringify(nodeData));
    var nodeConnector = dataManager.getNode(nodeData);
    if(nodeConnector != false) {
      log.debug(" * Notifying message: " + message.message[0].payload);
      nodeConnector.notify(message.message[0].payload);
    } else {
      log.debug("error, No node found");
    }
  });
}

function onPushMessage(messageId) {
  log.debug("MB: " + messageId.body + " | Headers: " + messageId.headers['message-id']);
	// Recover message from the data store
	dataManager.getMessage(messageId.body.toString(), onMessage);
}

function server(ip, port) {
  this.ip = ip;
  this.port = port;
}

server.prototype = {
  //////////////////////////////////////////////
  // Constructor
  //////////////////////////////////////////////

  init: function() {
    // Create a new HTTP Server
    this.server = http.createServer(this.onHTTPMessage.bind(this));
    this.server.listen(this.port, this.ip);
    log.info('HTTP push UA_WS server running on ' + this.ip + ":" + this.port);

    // Websocket init
    this.wsServer = new WebSocketServer({
      httpServer: this.server,
      keepalive: require('../config.js').NS_UA_WS.websocket_params.keepalive,
      keepaliveInterval: require('../config.js').NS_UA_WS.websocket_params.keepaliveInterval,
      dropConnectionOnKeepaliveTimeout: require('../config.js').NS_UA_WS.websocket_params.dropConnectionOnKeepaliveTimeout,
      keepaliveGracePeriod: require('../config.js').NS_UA_WS.websocket_params.keepaliveGracePeriod,
 
      // You should not use autoAcceptConnections for production
      // applications, as it defeats all standard cross-origin protection
      // facilities built into the protocol and the browser.  You should
      // *always* verify the connection's origin and decide whether or not
      // to accept it.
      autoAcceptConnections: false
    });

    this.wsServer.on('request', this.onWSRequest);

    // Register to my own Queue
    msgBroker.init(function() {
      log.debug("Connected to Message Broker");
      //msgBroker.subscribe(config.server_info.id, function(msg) { onPushMessage(msg); });
      msgBroker.subscribe("messages", function(msg) { onPushMessage(msg); });
    });
  },

  //////////////////////////////////////////////
  // HTTP callbacks
  //////////////////////////////////////////////
  onHTTPMessage: function(request, response) {
    log.debug((new Date()) + 'HTTP: Received request for ' + request.url);
    var url = this.parseURL(request.url);
    this.status = "";
    this.text = "";
    //response.writeHead(200, {"Content-Type": "text/plain", "access-control-allow-origin": "*"} );
    log.debug("HTTP: Parsed URL: " + JSON.stringify(url));
    switch(url.command) {
      case "token":
        this.text += token.get();
        this.status = 200;
        break;

      case "register":
        // We only accept application registration under the HTTP interface
        if(url.token != "app") {
          log.debug("HTTP: Only application registration under this interface");
          this.status = 404;
          break;
        }
        log.debug("HTTP: Application registration message");
        var appToken = crypto.hashSHA256(url.parsedURL.query.a);
        dataManager.registerApplication(appToken,url.parsedURL.query.n);
        this.status = 200;
        var baseURL = require('../config.js').NS_AS.publicBaseURL;
        this.text += (baseURL + "/notify/" + appToken);
        break;

      default:
        log.debug("HTTP: Command not recognized");
        this.status = 404;
    }

    // Close connection
    response.statusCode = this.status;
    response.setHeader("Content-Type", "text/plain");
    response.setHeader("access-control-allow-origin", "*");
    response.write(this.text);
    response.end();
  },

  //////////////////////////////////////////////
  // WebSocket callbacks
  //////////////////////////////////////////////
  onWSRequest: function(request) {
    ///////////////////////
    // WS Callbacks
    ///////////////////////
    this.onWSMessage = function(message) {
      if (message.type === 'utf8') {
        log.debug('WS: Received Message: ' + message.utf8Data);
        try {
          var query = JSON.parse(message.utf8Data);
        } catch(e) {
          log.debug("WS: Data received is not a valid JSON package");
          connection.sendUTF('{ "error": "Data received is not a valid JSON package" }');
          connection.close();
          return;
        }

        switch(query.command) {
        case "register/node":
          log.debug("WS: Node registration message");
          // Token verification
          if(!token.verify(query.data.token)) {
            log.debug("WS: Token not valid (Checksum failed)");
            connection.sendUTF('{ "error": "Token received is not accepted. Please get a valid one" }');
            connection.close();
            return;
          }
          var c = Connectors.getConnector(query.data, connection);
          dataManager.registerNode(query.data.token, c);
          break;

        case "register/app":
          log.debug("WS: Application registration message");
          dataManager.registerApplication(query.data.apptoken,query.data.nodetoken);
          var baseURL = require('./config.js').publicBaseURL;
          connection.sendUTF(baseURL + "/notify/" + query.data.apptoken);
          break;

        default:
          log.debug("WS: Command not recognized");
          connection.sendUTF('{ "error": "Command not recognized" }');
          connection.close();
        }
      } else if (message.type === 'binary') {
        // No binary data supported yet
        log.debug('WS: Received Binary Message of ' + message.binaryData.length + ' bytes');
        connection.sendUTF('{ "error": "Binary messages not yet supoprted" }');
        connection.close();
      }
    };

    this.onWSClose = function(reasonCode, description) {
      // TODO: De-register this node
      log.debug(' Peer ' + connection.remoteAddress + ' disconnected.');
    }

    /**
     * Verify origin in order to accept or reject connections
     */
    this.originIsAllowed = function(origin) {
      // TODO: put logic here to detect whether the specified origin is allowed.
      return true;
    }

    ///////////////////////
    // Websocket creation
    ///////////////////////
    if (!this.originIsAllowed(request.origin)) {
      // Make sure we only accept requests from an allowed origin
      request.reject();
      log.debug(' Connection from origin ' + request.origin + ' rejected.');
      return;
    }

    var connection = request.accept('push-notification', request.origin);
    log.debug(' Connection accepted.');
    connection.on('message', this.onWSMessage);
    connection.on('close', this.onWSClose);
  },

  ///////////////////////
  // Auxiliar methods
  ///////////////////////
  parseURL: function(url) {
    var urlparser = require('url');
    var data = {};
    data.parsedURL = urlparser.parse(url,true);
    var path = data.parsedURL.pathname.split("/");
    data.command = path[1];
    if(path.length > 2) {
      data.token = path[2];
    } else {
      data.token = data.parsedURL.query.token;
    }
    return data;
  }
};

// Exports
exports.server = server;