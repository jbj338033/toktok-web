import { useEffect, useRef, useState, useCallback } from "react";
import useWebSocket from "react-use-websocket";
import { SignalData } from "../types/WebRTC";

const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
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

  const { sendMessage, lastMessage } = useWebSocket(wsUrl, {
    onOpen: () => console.log("WebSocket Connected"),
    onError: () => setError("WebSocket connection error"),
    shouldReconnect: () => true,
  });

  const createPeerConnection = useCallback(() => {
    if (peerConnection.current) {
      console.log("Peer connection already exists");
      return;
    }

    try {
      console.log("Creating peer connection");
      const pc = new RTCPeerConnection(configuration);

      if (localStreamRef.current) {
        console.log(
          "Initial adding of local tracks:",
          localStreamRef.current.getTracks()
        );
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      } else {
        console.warn("No local stream available when creating peer connection");
      }

      pc.ontrack = (event) => {
        console.log("Received remote track", event.streams[0]);
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

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

      pc.onconnectionstatechange = () => {
        console.log("Connection state changed:", pc.connectionState);
        if (pc.connectionState === "connected") {
          console.log("Peer Connection fully established!");
          setIsConnected(true);
        } else if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          console.log("Connection failed - cleaning up");
          pc.close();
          peerConnection.current = null;
          matchReceived.current = false;
          setIsConnected(false);
        }
      };

      peerConnection.current = pc;
    } catch (err) {
      console.error("Error creating peer connection:", err);
      setError("Failed to create peer connection");
    }
  }, [sendMessage]);

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
    }
  };

  useEffect(() => {
    const startLocalStream = async () => {
      try {
        console.log("Requesting user media");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        console.log("Got local stream with tracks:", stream.getTracks());
        setLocalStream(stream);
        localStreamRef.current = stream;
      } catch (err) {
        setError("Failed to get local stream");
        console.error("Media error:", err);
      }
    };
    startLocalStream();

    return () => {
      console.log("Cleaning up...");
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
      }
      matchReceived.current = false;
      setIsConnected(false);
      setIsInitiator(false);
    };
  }, []);

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
          }
        } else if (signal.type === "candidate" && peerConnection.current) {
          console.log("Processing ICE candidate");
          const candidate = JSON.parse(signal.data);
          if (peerConnection.current.remoteDescription) {
            await peerConnection.current.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          }
        }
      } catch (err) {
        console.error("Signal error:", err);
        setError("Failed to process signaling message");
      }
    };

    handleSignal();
  }, [lastMessage, sendMessage, createPeerConnection]);

  return { localStream, remoteStream, isConnected, error, isInitiator };
};
