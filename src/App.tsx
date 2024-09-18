import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import styled from "@emotion/styled";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
`;

const Video = styled.video`
  width: 50%;
  max-width: 600px;
  margin: 10px;
`;

const Button = styled.button`
  margin: 10px;
  padding: 10px 20px;
  font-size: 16px;
  cursor: pointer;
`;

const VideoChat: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peerConnection, setPeerConnection] =
    useState<RTCPeerConnection | null>(null);
  const [inQueue, setInQueue] = useState<boolean>(false);
  const [matched, setMatched] = useState<boolean>(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const newSocket = io("https://toktok-server.mcv.kr", {
      withCredentials: true,
    });
    setSocket(newSocket);

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      });

    return () => {
      newSocket.close();
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on("matched", ({ roomId: newRoomId }) => {
      setMatched(true);
      setInQueue(false);
      setRoomId(newRoomId);
      initializePeerConnection();
    });

    socket.on("offer", async ({ offer }) => {
      if (!peerConnection) return;
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("answer", { answer, roomId });
    });

    socket.on("answer", async ({ answer }) => {
      if (!peerConnection) return;
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    });

    socket.on("iceCandidate", async ({ candidate }) => {
      if (!peerConnection) return;
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on("partnerDisconnected", () => {
      if (peerConnection) {
        peerConnection.close();
      }
      setMatched(false);
      setRemoteStream(null);
    });

    return () => {
      socket.off("matched");
      socket.off("offer");
      socket.off("answer");
      socket.off("iceCandidate");
      socket.off("partnerDisconnected");
    };
  }, [socket, peerConnection, roomId]);

  const initializePeerConnection = async () => {
    const newPeerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    newPeerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit("iceCandidate", { candidate: event.candidate, roomId });
      }
    };

    newPeerConnection.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        newPeerConnection.addTrack(track, localStream);
      });
    }

    setPeerConnection(newPeerConnection);

    const offer = await newPeerConnection.createOffer();
    await newPeerConnection.setLocalDescription(offer);
    socket?.emit("offer", { offer, roomId });
  };

  const joinQueue = () => {
    setInQueue(true);
    socket?.emit("joinQueue");
  };

  const leaveQueue = () => {
    setInQueue(false);
    socket?.emit("leaveQueue");
  };

  const endChat = () => {
    if (peerConnection) {
      peerConnection.close();
    }
    setMatched(false);
    setRemoteStream(null);
    setRoomId(null);
  };

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log(remoteStream);
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <Container>
      <Video playsInline muted ref={localVideoRef} autoPlay />
      {matched && <Video playsInline ref={remoteVideoRef} autoPlay />}
      {!inQueue && !matched && <Button onClick={joinQueue}>Start Chat</Button>}
      {inQueue && <Button onClick={leaveQueue}>Leave Queue</Button>}
      {matched && <Button onClick={endChat}>End Chat</Button>}
    </Container>
  );
};

export default VideoChat;
