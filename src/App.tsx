import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import styled from "@emotion/styled";

const AppContainer = styled.div`
  text-align: center;
  padding: 20px;
  font-family: Arial, sans-serif;
  background-color: #f0f0f0;
  min-height: 100vh;
`;

const Title = styled.h1`
  color: #333;
  margin-bottom: 20px;
`;

const VideoContainer = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
`;

const Video = styled.video`
  width: 320px;
  height: 240px;
  margin: 0 10px;
  background-color: #000;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

const Button = styled.button`
  padding: 10px 20px;
  font-size: 16px;
  cursor: pointer;
  background-color: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  transition: background-color 0.3s;

  &:hover {
    background-color: #45a049;
  }

  &:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }
`;

const StatusText = styled.p`
  font-size: 18px;
  color: #666;
  margin-top: 10px;
`;

const App: React.FC = () => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isCalling, setIsCalling] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    socketRef.current = io("https://toktok-server.mcv.kr", {
      transports: ["websocket"],
      upgrade: false,
    });

    socketRef.current.on("matched", handleMatched);
    socketRef.current.on("signal", handleSignal);
    socketRef.current.on("peerDisconnected", handlePeerDisconnected);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      socketRef.current?.emit("join");
      setIsCalling(true);
      setError(null);
    } catch (error) {
      console.error("Error accessing media devices:", error);
      setError("카메라 접근 실패. 다른 탭에서 이미 사용 중일 수 있습니다.");
      // 폴백: 더미 비디오 스트림 생성
      const dummyStream = createDummyStream();
      setLocalStream(dummyStream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = dummyStream;
      }
      socketRef.current?.emit("join");
      setIsCalling(true);
    }
  };

  const createDummyStream = () => {
    const canvas = Object.assign(document.createElement("canvas"), {
      width: 640,
      height: 480,
    });
    const ctx = canvas.getContext("2d");
    setInterval(() => {
      if (ctx) {
        ctx.fillStyle = `rgb(${Math.floor(Math.random() * 255)}, ${Math.floor(
          Math.random() * 255
        )}, ${Math.floor(Math.random() * 255)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }, 1000);
    // @ts-ignore
    const stream = canvas.captureStream(30);
    return stream;
  };

  const handleMatched = async ({
    room,
    isInitiator,
  }: {
    room: string;
    isInitiator: boolean;
  }) => {
    console.log("Matched:", { room, isInitiator });
    const configuration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
      ],
    };
    peerConnectionRef.current = new RTCPeerConnection(configuration);

    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Sending ICE candidate");
        socketRef.current?.emit("signal", {
          room,
          signal: { ice: event.candidate },
        });
      }
    };

    peerConnectionRef.current.ontrack = (event) => {
      console.log("Received remote track", event.streams[0]);
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peerConnectionRef.current.oniceconnectionstatechange = () => {
      console.log(
        "ICE connection state:",
        peerConnectionRef.current?.iceConnectionState
      );
    };

    localStream?.getTracks().forEach((track) => {
      peerConnectionRef.current?.addTrack(track, localStream);
    });

    if (isInitiator) {
      console.log("Creating offer");
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      socketRef.current?.emit("signal", {
        room,
        signal: { sdp: peerConnectionRef.current.localDescription },
      });
    }

    setIsConnected(true);
    setIsCalling(false);
  };

  const handleSignal = async (signal: any) => {
    if (!peerConnectionRef.current) return;

    if (signal.sdp) {
      console.log("Received SDP:", signal.sdp.type);
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(signal.sdp)
      );
      if (signal.sdp.type === "offer") {
        console.log("Creating answer");
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socketRef.current?.emit("signal", {
          room: signal.room,
          signal: { sdp: peerConnectionRef.current.localDescription },
        });
      }
    } else if (signal.ice) {
      console.log("Received ICE candidate");
      await peerConnectionRef.current.addIceCandidate(
        new RTCIceCandidate(signal.ice)
      );
    }
  };

  const handlePeerDisconnected = () => {
    console.log("Peer disconnected");
    setIsConnected(false);
    setRemoteStream(null);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  return (
    <AppContainer>
      <Title>WebRTC 1:1 Random Video Chat</Title>
      <VideoContainer>
        <Video ref={localVideoRef} autoPlay muted playsInline controls />
        <Video ref={remoteVideoRef} autoPlay playsInline controls />
      </VideoContainer>
      {!isConnected && !isCalling && (
        <Button onClick={startCall}>Start Random Chat</Button>
      )}
      {isCalling && <StatusText>Waiting for a match...</StatusText>}
      {isConnected && <StatusText>Connected to a peer</StatusText>}
      {error && <StatusText style={{ color: "red" }}>{error}</StatusText>}
    </AppContainer>
  );
};

export default App;
