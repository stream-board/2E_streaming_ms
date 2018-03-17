/** CONFIG **/
//var SIGNALING_SERVER = "ws://54.224.164.98:8444";
var SIGNALING_SERVER = "ws://localhost:8444";
var USE_AUDIO = true;
var USE_VIDEO = true;
var DEFAULT_CHANNEL = 'some-global-channel-name';
var MUTE_AUDIO_BY_DEFAULT = true;
/** You should probably use a different stun server doing commercial stuff **/
/** Also see: https://gist.github.com/zziuni/3741933 **/
var ICE_SERVERS = [
    {url:"stun:stun.l.google.com:19302"}
];

function initVars() {
    signaling_socket = null;   /* our socket.io connection to our webserver */
    local_media_stream = null; /* our own microphone / webcam */
    peers = {};                /* keep track of our peer connections, indexed by peer_id (aka socket.io id) */
    peer_media_elements = {};  /* keep track of our <video>/<audio> tags, indexed by peer_id */
    peer_html_videos = {};
    room_master = false;
    master = null;
    speakers = {};
    am_i_speaker = false;
}

var signaling_socket;   /* our socket.io connection to our webserver */
var local_media_stream; /* our own microphone / webcam */
var peers;                /* keep track of our peer connections, indexed by peer_id (aka socket.io id) */
var peer_media_elements;  /* keep track of our <video>/<audio> tags, indexed by peer_id */
var peer_html_videos;
var room_master;
var master;
var channel;
var speakers;
var am_i_speaker;

function init() {
    console.log("Connecting to signaling server");
    initVars();
    signaling_socket = io(SIGNALING_SERVER);
    //signaling_socket = io();
    signaling_socket.on('connect', function() {
        console.log("Connected to signaling server");
        checkRoomMaster( channel );
        setup_local_media(function() {
            /* once the user has given us access to their
             * microphone/camcorder, join the channel and start peering up */
            channel = prompt("Please enter a name for your room: ", DEFAULT_CHANNEL);
            join_chat_channel(channel, {'whatever-you-want-here': 'stuff'});

        });
    });
    signaling_socket.on('disconnect', function() {
        console.log("Disconnected from signaling server");
        /* Tear down all of our peer connections and remove all the
         * media divs when we disconnect */
        for (peer_id in peer_media_elements) {
            peer_media_elements[peer_id].remove();
        }
        for (peer_id in peers) {
            peers[peer_id].close();
        }

        peers = {};
        peer_media_elements = {};
        peer_html_videos = {};
        initVars();
    });
    function join_chat_channel(channel, userdata) {
        signaling_socket.emit('join', {"channel": channel, "userdata": userdata});
    }
    function part_chat_channel(channel) {
        signaling_socket.emit('part', channel);
    }
    function checkRoomMaster(channel) {
        console.log( "masterNow: " + room_master );
        signaling_socket.emit('relayRoomMaster', channel);
    }

    /** 
    * When we join a group, our signaling server will send out 'addPeer' events to each pair
    * of users in the group (creating a fully-connected graph of users, ie if there are 6 people
    * in the channel you will connect directly to the other 5, so there will be a total of 15 
    * connections in the network). 
    */
    signaling_socket.on('addPeer', function(config) {
        console.log('Signaling server said to add peer:', config);
        var peer_id = config.peer_id;
        console.log( "allll" );
        console.log( config);
        speakers = config.speakers;
        console.log( "speakeeeers: ");
        console.log(config.is_speaker);
        am_i_speaker = config.is_speaker;
        if (peer_id in peers) {
            /* This could happen if the user joins multiple channels where the other peer is also in. */
            console.log("Already connected to peer ", peer_id);
            return;
        }
        var peer_connection = new RTCPeerConnection(
            {"iceServers": ICE_SERVERS},
            {"optional": [{"DtlsSrtpKeyAgreement": true}]} /* this will no longer be needed by chrome
                                                            * eventually (supposedly), but is necessary 
                                                            * for now to get firefox to talk to chrome */
        );
        peers[peer_id] = peer_connection;

        peer_connection.onicecandidate = function(event) {
            if (event.candidate) {
                signaling_socket.emit('relayICECandidate', {
                    'peer_id': peer_id, 
                    'ice_candidate': {
                        'sdpMLineIndex': event.candidate.sdpMLineIndex,
                        'candidate': event.candidate.candidate
                    }
                });
            }
        };
        peer_connection.onaddstream = function(event) {
            console.log("onAddStream", event);
            var remote_media = USE_VIDEO ? $("<video>") : $("<audio>");
            remote_media.attr("autoplay", "autoplay");
            if (MUTE_AUDIO_BY_DEFAULT) {
                remote_media.attr("muted", "true");
            }
            remote_media.attr("controls", "");
            remote_media.attr("id", peer_id);
            peer_media_elements[peer_id] = remote_media;
            $('body').append(remote_media);
            attachMediaStream(remote_media[0], event.stream);
            console.log( "speakers in css: " + am_i_speaker );
            console.log( "master in css: " + room_master);
            if( !(peer_id in speakers) && peer_id != master ){
                $('#' + peer_id).css( "border", "9px solid red" );
                //remote_media.getAudioTracks()[0].enabled = false;
            }if( !room_master ){
                $('#local_video').css( "border", "9px solid red" );
            }
        };

        /* Add our local stream */
        peer_connection.addStream(local_media_stream);

        /* Only one side of the peer connection should create the
         * offer, the signaling server picks one to be the offerer. 
         * The other user will get a 'sessionDescription' event and will
         * create an offer, then send back an answer 'sessionDescription' to us
         */
        if (config.should_create_offer) {
            console.log("Creating RTC offer to ", peer_id);
            peer_connection.createOffer(
                function (local_description) { 
                    console.log("Local offer description is: ", local_description);
                    peer_connection.setLocalDescription(local_description,
                        function() { 
                            signaling_socket.emit('relaySessionDescription', 
                                {'peer_id': peer_id, 'session_description': local_description});
                            console.log("Offer setLocalDescription succeeded"); 
                        },
                        function() { Alert("Offer setLocalDescription failed!"); }
                    );
                },
                function (error) {
                    console.log("Error sending offer: ", error);
                });
        }
    });


    /** 
     * Peers exchange session descriptions which contains information
     * about their audio / video settings and that sort of stuff. First
     * the 'offerer' sends a description to the 'answerer' (with type
     * "offer"), then the answerer sends one back (with type "answer").  
     */
    signaling_socket.on('sessionDescription', function(config) {
        console.log('Remote description received: ', config);
        var peer_id = config.peer_id;
        var peer = peers[peer_id];
        var remote_description = config.session_description;
        console.log(config.session_description);

        var desc = new RTCSessionDescription(remote_description);
        var stuff = peer.setRemoteDescription(desc, 
            function() {
                console.log("setRemoteDescription succeeded");
                if (remote_description.type == "offer") {
                    console.log("Creating answer");
                    peer.createAnswer(
                        function(local_description) {
                            console.log("Answer description is: ", local_description);
                            peer.setLocalDescription(local_description,
                                function() { 
                                    signaling_socket.emit('relaySessionDescription', 
                                        {'peer_id': peer_id, 'session_description': local_description});
                                    console.log("Answer setLocalDescription succeeded");
                                },
                                function() { Alert("Answer setLocalDescription failed!"); }
                            );
                        },
                        function(error) {
                            console.log("Error creating answer: ", error);
                            console.log(peer);
                        });
                }
            },
            function(error) {
                console.log("setRemoteDescription error: ", error);
            }
        );
        console.log("Description Object: ", desc);

    });

    /**
     * The offerer will send a number of ICE Candidate blobs to the answerer so they 
     * can begin trying to find the best path to one another on the net.
     */
    signaling_socket.on('iceCandidate', function(config) {
        var peer = peers[config.peer_id];
        var ice_candidate = config.ice_candidate;
        peer.addIceCandidate(new RTCIceCandidate(ice_candidate));
    });


    /**
     * When a user leaves a channel (or is disconnected from the
     * signaling server) everyone will recieve a 'removePeer' message
     * telling them to trash the media channels they have open for those
     * that peer. If it was this client that left a channel, they'll also
     * receive the removePeers. If this client was disconnected, they
     * wont receive removePeers, but rather the
     * signaling_socket.on('disconnect') code will kick in and tear down
     * all the peer sessions.
     */
    signaling_socket.on('removePeer', function(config) {
        console.log('Signaling server said to remove peer:', config);
        var peer_id = config.peer_id;
        if (peer_id in peer_media_elements) {
            peer_media_elements[peer_id].remove();
        }
        if (peer_id in peers) {
            peers[peer_id].close();
        }

        delete peers[peer_id];
        delete peer_media_elements[config.peer_id];
    });

    signaling_socket.on('roomMaster', function(config) {
        console.log('roomMaster: ', config);
        room_master = config.isRoomMaster;
	master = config.roomMaster;
    });

    signaling_socket.on('askForWord', function(config) {
        console.log('Asker: ', config.asker);
        var accept = document.createElement("BUTTON");
        var info = document.createTextNode("Dar la palabra a " + config.asker);
        accept.id = config.asker;
        accept.onclick = function giveWord() {
            signaling_socket.emit('relayGiveWord', {"channel": channel, "asker":config.asker});

            accept.parentNode.removeChild(accept);
        };
        accept.appendChild(info);
        $('body').append(accept);
    });

    signaling_socket.on('muteAll', function(config) {
        var my_peer_id = config.my_peer_id;
        master_id = config.master;
        speakers = {};
        setSpeakers( speakers, master_id, room_master );
        if (!room_master){
            console.log( "Muting localstream audio" );
            local_media_stream.getAudioTracks()[0].enabled = false;
            document.getElementById("muted").innerHTML = "Muted: True";
        }
    });

    signaling_socket.on('giveWord', function(config) {
        am_i_speaker = config.am_i_speaker;
        speakers = config.speakers;

        for (var speaker in speakers) {
            $('#' + speaker).css( "border", "" );
        }

        if( am_i_speaker ){
            local_media_stream.getAudioTracks()[0].enabled = true;
            $('#local_video').css( "border", "" );
            document.getElementById("muted").innerHTML = "Muted: False";
        }
    });

    signaling_socket.on('roomDestroyed', function(config) {
        document.body.innerHTML = '';
        var info = document.createTextNode("Tu sala ha cerrado");
        $('body').append(info);
        initVars();
    });

}




/***********************/
/** Local media stuff **/
/***********************/
function setup_local_media(callback, errorback) {
    if (local_media_stream != null) {  /* ie, if we've already been initialized */
        if (callback) callback();
        return; 
    }
    /* Ask user for permission to use the computers microphone and/or camera, 
     * attach it to an <audio> or <video> tag if they give us access. */
    console.log("Requesting access to local audio / video inputs");


    navigator.getUserMedia = ( navigator.getUserMedia ||
           navigator.webkitGetUserMedia ||
           navigator.mozGetUserMedia ||
           navigator.msGetUserMedia);

    attachMediaStream = function(element, stream) {
        console.log('DEPRECATED, attachMediaStream will soon be removed.');
        element.srcObject = stream;
     };

    navigator.getUserMedia({"audio":USE_AUDIO, "video":USE_VIDEO},
        function(stream) { /* user accepted access to a/v */
            console.log("Access granted to audio/video");
            local_media_stream = stream;
            var local_media = USE_VIDEO ? $("<video>") : $("<audio>");
            local_media.attr("autoplay", "autoplay");
            local_media.attr("muted", "true"); /* always mute ourselves by default */
            local_media.attr("controls", "");
            local_media.attr( "id", "local_video" );
            var track = $("<track>");
            track.attr( "src", "local.txt" );
            local_media.append(track);
            $('body').append(local_media);
            attachMediaStream(local_media[0], stream);
            document.getElementById("muted").innerHTML = "Muted: False";
            console.log( "am_i_speaker: " + am_i_speaker );
                console.log( "am_i_master: " +room_master );
            if( !am_i_speaker && !room_master ){
                local_media_stream.getAudioTracks()[0].enabled = false;
                document.getElementById("muted").innerHTML = "Muted: True";
            }
            if (callback) callback();
        },
        function() { /* user denied access to a/v */
            console.log("Access denied for audio/video");
            alert("You chose not to provide access to the camera/microphone, demo will not work.");
            if (errorback) errorback();
        });
}
function amIMaster() {
    document.getElementById("demo").innerHTML = room_master;
}
function askForWord() {
    signaling_socket.emit('relayAskForWord', {"channel": channel});
}

function muteAll() {
    console.log( "Muting clients" );
    signaling_socket.emit('relayMuteAll', {"channel": channel});
}

function setSpeakers(speakers, master) {
    console.log( "rendering speakers" );
    if(!room_master)
        $('video').css( "border", "9px solid red" );
    else
        $('video').not('#local_video').css( "border", "9px solid red" );
    for( var speaker in speakers )
        $('#' + speaker).css( "border", "" );
    $('#' + master).css( "border", "" );
}
