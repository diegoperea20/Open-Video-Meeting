"use client";

import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { faker } from "@faker-js/faker";

import { IconButton, Badge, Input, Button } from "@mui/material";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import CallEndIcon from "@mui/icons-material/CallEnd";
import ChatIcon from "@mui/icons-material/Chat";

import styles from "@/app/styles/Video.module.css";

const server_url =
  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4001";
const MAX_CONNECTIONS = 10;

const Video = ({ url }) => {
  const [video, setVideo] = useState(false);
  const [audio, setAudio] = useState(false);
  const [screen, setScreen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [screenAvailable, setScreenAvailable] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [newMessages, setNewMessages] = useState(0);
  const [askForUsername, setAskForUsername] = useState(true);
  const [username, setUsername] = useState(faker.internet.userName());
  const [roomUrl, setRoomUrl] = useState(url || "");
  const [usernames, setUsernames] = useState({});
  const [remoteStreams, setRemoteStreams] = useState({});

  const [socket, setSocket] = useState(null);
  const [peers, setPeers] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const localVideoRef = useRef(null);
  const pendingCandidates = useRef({});

  useEffect(() => {
    getPermissions();
    const newSocket = io(server_url);
    setSocket(newSocket);
    setIsLoading(false);

    return () => {
      newSocket.close();
      Object.values(peers).forEach((peer) => peer.close());
      setPeers({});
    };
  }, []);

  useEffect(() => {
    if (url) {
      setRoomUrl(url);
    }
  }, [url]);

  useEffect(() => {
    if (!socket || !roomUrl) return;

    socket.emit("join-call", roomUrl, username);

    socket.on("user-joined", (id, clients, usernames) => {
      clients.forEach((clientId) => {
        if (clientId !== socket.id && !peers[clientId]) {
          createPeerConnection(clientId, socket, usernames[clientId]);
        }
      });
      setUsernames(usernames);
    });

    socket.on("user-left", (id) => {
      if (peers[id]) {
        peers[id].close();
        const newPeers = { ...peers };
        delete newPeers[id];
        setPeers(newPeers);
        setRemoteStreams((prevStreams) => {
          const newStreams = { ...prevStreams };
          delete newStreams[id];
          return newStreams;
        });
      }
    });

    socket.on("signal", (fromId, message) => {
      const peer = peers[fromId];
      if (peer) {
        handleSignal(peer, message, fromId);
      }
    });

    socket.on("chat-message", (data, sender, senderId) => {
      console.log("Received chat message:", data, sender, senderId);

      // Verificar si el mensaje ya existe para evitar duplicados
      const messageExists = messages.some(
        (msg) =>
          msg.data === data &&
          msg.sender === sender &&
          msg.senderId === senderId
      );

      if (!messageExists) {
        setNewMessages((n) => n + 1);
        setMessages((prev) => [...prev, { sender, data, senderId }]);
      }
    });

    return () => {
      ["user-joined", "user-left", "signal", "chat-message"].forEach((event) =>
        socket.off(event)
      );
    };
  }, [socket, roomUrl, peers, username]);

  const handleSignal = async (peer, message, fromId) => {
    const signal = JSON.parse(message);
    try {
      if (signal.sdp) {
        await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (signal.sdp.type === "offer") {
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit(
            "signal",
            fromId,
            JSON.stringify({ sdp: peer.localDescription })
          );
        }
        // Después de establecer la descripción remota, añadimos los candidatos ICE pendientes
        if (pendingCandidates.current[fromId]) {
          pendingCandidates.current[fromId].forEach((candidate) => {
            peer
              .addIceCandidate(new RTCIceCandidate(candidate))
              .catch((e) =>
                console.error("Error adding pending ICE candidate:", e)
              );
          });
          delete pendingCandidates.current[fromId];
        }
      } else if (signal.ice) {
        if (peer.remoteDescription) {
          await peer.addIceCandidate(new RTCIceCandidate(signal.ice));
        } else {
          // Si la descripción remota aún no está establecida, guardamos el candidato ICE para más tarde
          if (!pendingCandidates.current[fromId]) {
            pendingCandidates.current[fromId] = [];
          }
          pendingCandidates.current[fromId].push(signal.ice);
        }
      }
    } catch (e) {
      console.error("Error handling signal:", e);
    }
  };

  const createPeerConnection = (clientId, socket, remoteUsername) => {
    if (Object.keys(peers).length >= MAX_CONNECTIONS) {
      console.log("Máximo número de conexiones alcanzado");
      return;
    }

    console.log(
      `Creando conexión para ${clientId}. Total: ${
        Object.keys(peers).length + 1
      }`
    );

    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit(
          "signal",
          clientId,
          JSON.stringify({ ice: event.candidate })
        );
      }
    };

    peer.ontrack = (event) => {
      setRemoteStreams((prev) => ({
        ...prev,
        [clientId]: event.streams[0],
      }));
    };

    // Añadimos el usuario al peer connection
    peer.username = remoteUsername;

    if (localVideoRef.current && localVideoRef.current.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach((track) => {
        peer.addTrack(track, localVideoRef.current.srcObject);
      });
    } else {
      // Si no hay stream local, añadimos un stream vacío para que el recuadro de video se muestre
      const emptyStream = new MediaStream();
      emptyStream.getTracks().forEach((track) => {
        peer.addTrack(track, emptyStream);
      });
    }

    peer.onnegotiationneeded = () => {
      peer
        .createOffer()
        .then((offer) => peer.setLocalDescription(offer))
        .then(() => {
          socket.emit(
            "signal",
            clientId,
            JSON.stringify({ sdp: peer.localDescription })
          );
        })
        .catch((e) => console.error("Error during negotiation:", e));
    };

    setPeers((prevPeers) => ({
      ...prevPeers,
      [clientId]: peer,
    }));

    setUsernames((prevUsernames) => ({
      ...prevUsernames,
      [clientId]: remoteUsername,
    }));
  };

  const getPermissions = async () => {
    try {
      const videoPermission = await navigator.mediaDevices
        .getUserMedia({ video: true })
        .then(() => true)
        .catch(() => false);
      const audioPermission = await navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then(() => true)
        .catch(() => false);
      setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);

      if (videoPermission || audioPermission) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoPermission,
          audio: audioPermission,
        });
        window.localStream = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      }
    } catch (error) {
      console.error("Error getting permissions:", error);
      setError("Failed to get media permissions");
    }
  };

  const getUserMedia = async () => {
    try {
      if (
        (video && navigator.mediaDevices.getUserMedia) ||
        (audio && navigator.mediaDevices.getUserMedia)
      ) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video,
          audio,
        });
        getUserMediaSuccess(stream);
      } else if (localVideoRef.current && localVideoRef.current.srcObject) {
        stopTracks(localVideoRef.current.srcObject.getTracks());
      }
    } catch (error) {
      console.error("Error getting user media:", error);
      setError("Failed to get user media");
    }
  };

  const getUserMediaSuccess = (stream) => {
    if (window.localStream) {
      stopTracks(window.localStream.getTracks());
    }
    window.localStream = stream;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    Object.values(peers).forEach((peer) => {
      stream.getTracks().forEach((track) => {
        peer.addTrack(track, stream);
      });
    });
  };

  const stopTracks = (tracks) => {
    if (tracks) {
      tracks.forEach((track) => track.stop());
    }
  };

  const handleVideo = () => {
    setVideo(!video);
    getUserMedia();
  };

  const handleAudio = () => {
    setAudio(!audio);
    getUserMedia();
  };

  const handleScreen = async () => {
    if (!screen) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          cursor: true,
        });
        const screenTrack = stream.getTracks()[0];

        Object.values(peers).forEach((peer) => {
          peer
            .getSenders()
            .find((sender) => sender.track.kind === "video")
            .replaceTrack(screenTrack);
        });

        screenTrack.onended = () => {
          Object.values(peers).forEach((peer) => {
            peer
              .getSenders()
              .find((sender) => sender.track.kind === "video")
              .replaceTrack(window.localStream.getVideoTracks()[0]);
          });
          setScreen(false);
        };

        setScreen(true);
      } catch (err) {
        console.error("Error starting screen share:", err);
        setError("Failed to start screen sharing");
      }
    } else {
      window.localStream.getVideoTracks()[0].enabled = true;
      Object.values(peers).forEach((peer) => {
        peer
          .getSenders()
          .find((sender) => sender.track.kind === "video")
          .replaceTrack(window.localStream.getVideoTracks()[0]);
      });
      setScreen(false);
    }
  };

  const handleEndCall = () => {
    stopTracks(localVideoRef.current.srcObject.getTracks());
    Object.values(peers).forEach((peer) => peer.close());
    setPeers({});
    window.location.href = "/";
  };

  const handleMessage = (e) => setMessageInput(e.target.value);

  const sendMessage = () => {
    if (socket && messageInput.trim() !== "") {
      const messageData = {
        text: messageInput,
        sender: username,
        senderId: socket.id,
        timestamp: Date.now(),
      };
      socket.emit("chat-message", messageData);
      setMessageInput(""); // Limpiamos el input después de enviar el mensaje.
    }
  };

  const openChat = () => setShowModal(true);
  const closeChat = () => {
    setShowModal(false);
    setNewMessages(0);
  };

  const connect = () => {
    setAskForUsername(false);
    getUserMedia();
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <div>
      {askForUsername ? (
        <div style={{
          background: "#232323", width: "30%", height: "auto", padding: "20px", minWidth: "400px",borderRadius: '0.5rem',
          textAlign: "center", margin: "auto", marginTop: "100px"
        }}>
          <p
            style={{
              margin: 0,
              fontWeight: "600",
              color: "white",
              paddingRight: "50px",
              marginTop: "100px",
            }}
          >
            Set your username
          </p>
          <Input
            style={{ color: "white", background: "#232323" }}
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={connect}
            style={{ margin: "20px", fontWeight: "300" }}
          >
            Connect
          </Button>
        </div>
      ) : (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              background: "#232323",
              padding: "14px",
              gap: "20px",
            }}
          >
            <IconButton
              style={{ color: "#7d7d7d", background: "#2B2A2A" }}
              onClick={handleVideo}
            >
              {video ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>

            <IconButton
              style={{ color: "#f44336", background: "#2B2A2A" }}
              onClick={handleEndCall}
            >
              <CallEndIcon />
            </IconButton>

            <IconButton
              style={{ color: "#7d7d7d", background: "#2B2A2A" }}
              onClick={handleAudio}
            >
              {audio ? <MicIcon /> : <MicOffIcon />}
            </IconButton>

            {screenAvailable && (
              <IconButton
                style={{ color: "#7d7d7d", background: "#2B2A2A" }}
                onClick={handleScreen}
              >
                {screen ? <ScreenShareIcon /> : <StopScreenShareIcon />}
              </IconButton>
            )}

            <Badge
              badgeContent={newMessages}
              max={999}
              color="secondary"
              onClick={openChat}
            >
              <IconButton style={{ color: "#7d7d7d", background: "#2B2A2A" }}>
                <ChatIcon />
              </IconButton>
            </Badge>
          </div>

          {showModal && (
            <div
              style={{
                position: "fixed",
                right: "0",
                top: "0",
                bottom: "0",
                width: "300px",
                backgroundColor: "#3D3D3D",
                boxShadow: "-2px 0 5px rgba(0,0,0,0.1)",
                display: "flex",
                flexDirection: "column",
                zIndex: 1000,
                borderRadius: "10px 0 0 10px",
              }}
            >
              <div
                style={{
                  margin: "10px",
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  backgroundColor: "#232222",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px",
                    backgroundColor: "#232222",
                  }}
                >
                  <h5 style={{ margin: 0, fontSize: "18px" }}>Chat Room</h5>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={closeChat}
                    style={{
                      fontSize: "14px",
                      padding: "5px 10px",
                    }}
                  >
                    Close
                  </Button>
                </div>
                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "10px",
                    backgroundColor: "#232222",
                  }}
                >
                  {messages.length > 0 ? (
                    messages.map((item, index) => (
                      <div
                        key={index}
                        style={{ textAlign: "left", marginBottom: "10px" }}
                      >
                        <p style={{ wordBreak: "break-all", margin: 0 }}>
                          <b style={{ color: "#007bff" }}>{item.sender}</b>:{" "}
                          {item.data}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p style={{ textAlign: "center", color: "#666" }}>
                      No message yet
                    </p>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    padding: "10px",
                  }}
                >
                  <Input
                    placeholder="Message"
                    value={messageInput}
                    onChange={handleMessage}
                    style={{
                      flex: 1,
                      marginRight: "10px",
                      color: "white",
                      backgroundColor: "#332d2d",
                      borderRadius: "4px",
                      padding: "5px 10px",
                    }}
                  />
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={sendMessage}
                    style={{
                      fontSize: "14px",
                      padding: "5px 15px",
                    }}
                  >
                    Send
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className={styles.container}>
            <Input
              style={{
                color: "white",
                WebkitTextFillColor: "white",
                MozTextFillColor: "white",
                opacity: 1,
                backgroundColor: "transparent",
              }}
              value={window.location.href}
              inputProps={{
                style: {
                  color: "white",
                  WebkitTextFillColor: "white",
                  MozTextFillColor: "white",
                },
              }}
            />
            <Button
              style={{ background: "#2B2A2A" }}
              variant="contained"
              onClick={() =>
                navigator.clipboard.writeText(window.location.href)
              }
            >
              Copy invite link
            </Button>
            <div id="main" className={styles.flexContainer}>
              <div className={styles.videoContainer}>
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  className={styles.video}
                />
                <div className={styles.nameTag}>{username}</div>
              </div>
              {Object.entries(remoteStreams).map(([clientId, stream]) => (
                <div key={clientId} className={styles.videoContainer}>
                  <video
                    autoPlay
                    playsInline
                    ref={(el) => {
                      if (el) el.srcObject = stream;
                    }}
                    className={styles.video}
                  />
                  <div className={styles.nameTag}>
                    {usernames[clientId] || clientId}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Video;
