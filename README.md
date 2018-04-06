About
=====

Basado en https://github.com/anoek/webrtc-group-chat-example


Running
=======

For Signalign Server
```
docker-compose build
docker-compose up
```

For web client
```
docker-compose build
docker-compose up
```

## Socket Events
* join
  Triggers when a user joins a room. When it triggers:
  * Emits a message of type addPeer from the joined user to everyone in the room.
  * Emits a message of type addPeer from everyone in the room to the joined user.
  * If it's a new room, it adds the room to a dictionary that keeps track of the rooms created
  
* disconnect
  It triggers when client exits the room. When it triggers:
  * Emits a message of type removePeer from the joined user to everyone in the room.
  * Emits a message of type removePeer from everyone in the room to the joined user.
  * Emits a message of type roomDestroyed to everyone in the room.
  
* relayICECandidate
  Triggers when a client finds a valid ICE candidate for connect to other client. When it triggers:
  * Emits a message of type iceCandidate to the other client with the ICE candidate that it found.
  
* relaySessionDescription
  Triggers when a client sends an RTC offer to other client. When it triggers:
  * Emits a message of type sessionDescription, which sends local session desscription to the other client. When the session description is successfully added by the peer, the connection is all set.

* relayRoomMaster
  Triggers when a client tries asks who is the room master. When it triggers:
  * Emits a message of type roomMaster to the client who asked containing the room master id and a boolean that indicates whether the client who asked is the room master.
  
* relayAskForWord
  Triggers when a client asks for the word. When it triggers:
  * Emits a message of type askForWord to the room master that contains the id of the client who asked for the word.
   
* relayGiveWord
  Triggers when a room master gives the word to a client. When it triggers:
  * Adds the client id to a dictionary that keeps track of the clients that are allowed to talk in the room.
  * Emits a message of type giveWord to every client in the room to let them know that the client is allowed to talk.
 
* relayMuteAll
  Triggers when the room master mutes all clients. When it triggers:
  * Emits a message of type muteAll to every client in the room, so they know they must be muted now.
