// src/hooks/useWebRTC.ts
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

  const { sendMessage, lastMessage } = useWebSocket(wsUrl, {
    onOpen: () => console.log("WebSocket Connected"),
    onError: () => setError("WebSocket connection error"),
    shouldReconnect: () => true,
  });

  const createPeerConnection = useCallback(() => {
    try {
      const pc = new RTCPeerConnection(configuration);

      // Add local tracks to peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // Handle incoming tracks
      pc.ontrack = (event) => {
        console.log("Received remote track");
        setRemoteStream(new MediaStream(event.streams[0].getTracks()));
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const signal: SignalData = {
            type: "candidate",
            data: JSON.stringify(event.candidate),
          };
          sendMessage(JSON.stringify(signal));
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("ICE Connection State:", pc.iceConnectionState);
      };

      peerConnection.current = pc;
    } catch (err) {
      console.error("Error creating peer connection:", err);
      setError("Failed to create peer connection");
    }
  }, [sendMessage]);

  useEffect(() => {
    const startLocalStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
        localStreamRef.current = stream;
      } catch (err) {
        setError("Failed to get local stream");
        console.error(err);
      }
    };
    startLocalStream();

    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      peerConnection.current?.close();
    };
  }, []);

  const createAndSendOffer = async () => {
    try {
      const offer = await peerConnection.current!.createOffer();
      await peerConnection.current!.setLocalDescription(offer);
      const offerSignal: SignalData = {
        type: "offer",
        data: JSON.stringify(offer),
      };
      sendMessage(JSON.stringify(offerSignal));
    } catch (err) {
      console.error("Error creating offer:", err);
      setError("Failed to create offer");
    }
  };

  useEffect(() => {
    if (!lastMessage?.data) return;

    const signal: SignalData = JSON.parse(lastMessage.data);
    console.log("Received signal:", signal.type);

    const handleSignal = async () => {
      try {
        if (signal.type === "match") {
          setIsConnected(true);
          // 새로운 피어 커넥션 생성
          createPeerConnection();

          // 첫 번째로 매칭된 사용자가 offer를 보냄
          if (signal.data === "initiator") {
            setIsInitiator(true);
            console.log("I am initiator, creating offer");
            // 약간의 지연을 주어 피어 커넥션이 완전히 설정되도록 함
            setTimeout(() => {
              createAndSendOffer();
            }, 1000);
          } else {
            console.log("I am receiver, waiting for offer");
          }
        } else if (signal.type === "offer" && peerConnection.current) {
          console.log("Processing offer");
          const offer = JSON.parse(signal.data);
          await peerConnection.current.setRemoteDescription(
            new RTCSessionDescription(offer)
          );

          const answer = await peerConnection.current.createAnswer();
          await peerConnection.current.setLocalDescription(answer);

          const answerSignal: SignalData = {
            type: "answer",
            data: JSON.stringify(answer),
          };
          sendMessage(JSON.stringify(answerSignal));
        } else if (signal.type === "answer" && peerConnection.current) {
          console.log("Processing answer");
          const answer = JSON.parse(signal.data);
          if (peerConnection.current.signalingState !== "stable") {
            await peerConnection.current.setRemoteDescription(
              new RTCSessionDescription(answer)
            );
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
