import { useEffect, useRef, useState, useCallback } from "react";
import useWebSocket from "react-use-websocket";
import { SignalData } from "../types/WebRTC";

const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
};

export const useWebRTC = (wsUrl: string) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitiator, setIsInitiator] = useState(false);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const matchReceived = useRef<boolean>(false);
  const connectionTimeout = useRef<NodeJS.Timeout | null>(null);

  const { sendMessage, lastMessage } = useWebSocket(wsUrl, {
    onOpen: () => console.log("WebSocket Connected"),
    onError: () => setError("WebSocket connection error"),
    shouldReconnect: () => true,
    reconnectAttempts: 5,
    reconnectInterval: 2000,
  });

  const cleanup = useCallback(() => {
    if (connectionTimeout.current) {
      clearTimeout(connectionTimeout.current);
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    matchReceived.current = false;
    setIsConnected(false);
    setIsInitiator(false);
    setRemoteStream(null);
  }, []);

  const restartConnection = useCallback(async () => {
    cleanup();
    createPeerConnection();
    if (isInitiator) {
      await createAndSendOffer();
    }
  }, [cleanup, isInitiator]);

  const createPeerConnection = useCallback(() => {
    if (peerConnection.current) {
      console.log("Closing existing peer connection");
      peerConnection.current.close();
    }

    try {
      console.log("Creating new peer connection");
      const pc = new RTCPeerConnection(configuration);

      // Set up connection monitoring
      pc.oniceconnectionstatechange = () => {
        console.log("ICE Connection State:", pc.iceConnectionState);
        if (
          pc.iceConnectionState === "failed" ||
          pc.iceConnectionState === "disconnected"
        ) {
          console.log(
            "ICE Connection failed or disconnected - attempting restart"
          );
          restartConnection();
        }
      };

      pc.onconnectionstatechange = () => {
        console.log("Connection State:", pc.connectionState);
        if (pc.connectionState === "connected") {
          console.log("Peer Connection established successfully");
          setIsConnected(true);
          // Clear any existing timeout
          if (connectionTimeout.current) {
            clearTimeout(connectionTimeout.current);
          }
        } else if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          console.log("Connection failed or disconnected - attempting restart");
          restartConnection();
        }
      };

      pc.ontrack = (event) => {
        console.log("Remote track received:", event.track.kind);
        if (event.streams && event.streams[0]) {
          console.log("Setting remote stream");
          setRemoteStream(event.streams[0]);

          event.track.onended = () => {
            console.log("Remote track ended");
          };

          event.track.onmute = () => {
            console.log("Remote track muted");
          };

          event.track.onunmute = () => {
            console.log("Remote track unmuted");
          };
        }
      };

      if (localStreamRef.current) {
        console.log("Adding local tracks to peer connection");
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      } else {
        console.warn("No local stream available when creating peer connection");
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("New ICE candidate:", event.candidate.type);
          const signal: SignalData = {
            type: "candidate",
            data: JSON.stringify(event.candidate),
          };
          sendMessage(JSON.stringify(signal));
        }
      };

      peerConnection.current = pc;

      // Set a timeout for connection establishment
      if (connectionTimeout.current) {
        clearTimeout(connectionTimeout.current);
      }
      connectionTimeout.current = setTimeout(() => {
        if (pc.connectionState !== "connected") {
          console.log("Connection timeout - attempting restart");
          restartConnection();
        }
      }, 10000); // 10 seconds timeout
    } catch (err) {
      console.error("Error creating peer connection:", err);
      setError("Failed to create peer connection");
    }
  }, [sendMessage, restartConnection]);

  const createAndSendOffer = async () => {
    if (!peerConnection.current) {
      console.error("No peer connection when trying to create offer");
      return;
    }

    try {
      console.log("Creating offer...");
      const offer = await peerConnection.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: true,
      });

      console.log("Setting local description...");
      await peerConnection.current.setLocalDescription(offer);

      const offerSignal: SignalData = {
        type: "offer",
        data: JSON.stringify(offer),
      };
      console.log("Sending offer signal...");
      sendMessage(JSON.stringify(offerSignal));
    } catch (err) {
      console.error("Error creating offer:", err);
      setError("Failed to create offer");
      restartConnection();
    }
  };

  useEffect(() => {
    const startLocalStream = async () => {
      try {
        console.log("Requesting user media");
        const constraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: true,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log("Got local stream with tracks:", stream.getTracks());

        // Configure video track for optimal performance
        stream.getVideoTracks().forEach((track) => {
          const settings = track.getSettings();
          console.log("Video track settings:", settings);
        });

        setLocalStream(stream);
        localStreamRef.current = stream;
      } catch (err) {
        setError("Failed to get local stream");
        console.error("Media error:", err);
      }
    };

    startLocalStream();
    return cleanup;
  }, [cleanup]);

  useEffect(() => {
    if (!lastMessage?.data) return;

    const signal: SignalData = JSON.parse(lastMessage.data);
    console.log("Received signal:", signal.type);

    const handleSignal = async () => {
      try {
        if (signal.type === "match" && !matchReceived.current) {
          matchReceived.current = true;
          setIsConnected(true);
          createPeerConnection();

          if (signal.data === "initiator") {
            setIsInitiator(true);
            console.log("I am initiator, creating offer");
            // Delay to ensure peer connection is fully set up
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await createAndSendOffer();
          } else {
            console.log("I am receiver, waiting for offer");
          }
        } else if (signal.type === "offer" && peerConnection.current) {
          console.log("Processing offer");
          const offer = JSON.parse(signal.data);

          try {
            await peerConnection.current.setRemoteDescription(
              new RTCSessionDescription(offer)
            );
            console.log("Set remote description success");

            const answer = await peerConnection.current.createAnswer();
            await peerConnection.current.setLocalDescription(answer);
            console.log("Created and set local description (answer)");

            const answerSignal: SignalData = {
              type: "answer",
              data: JSON.stringify(answer),
            };
            sendMessage(JSON.stringify(answerSignal));
            console.log("Sent answer");
          } catch (err) {
            console.error("Error during offer processing:", err);
            restartConnection();
          }
        } else if (signal.type === "answer" && peerConnection.current) {
          console.log("Processing answer");
          const answer = JSON.parse(signal.data);
          try {
            await peerConnection.current.setRemoteDescription(
              new RTCSessionDescription(answer)
            );
            console.log("Remote description set successfully");
          } catch (err) {
            console.error("Error setting remote description:", err);
            restartConnection();
          }
        } else if (signal.type === "candidate" && peerConnection.current) {
          console.log("Processing ICE candidate");
          const candidate = JSON.parse(signal.data);
          if (peerConnection.current.remoteDescription) {
            try {
              await peerConnection.current.addIceCandidate(
                new RTCIceCandidate(candidate)
              );
            } catch (err) {
              console.error("Error adding ICE candidate:", err);
            }
          }
        }
      } catch (err) {
        console.error("Signal error:", err);
        setError("Failed to process signaling message");
        restartConnection();
      }
    };

    handleSignal();
  }, [lastMessage, sendMessage, createPeerConnection, restartConnection]);

  // Expose connection status and streams
  return {
    localStream,
    remoteStream,
    isConnected,
    error,
    isInitiator,
  };
};
