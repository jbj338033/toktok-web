import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import styled from "@emotion/styled";
import adapter from "webrtc-adapter";

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
  border: 1px solid black;
`;

const Button = styled.button`
  margin: 10px;
  padding: 10px 20px;
  font-size: 16px;
  cursor: pointer;
`;

const VideoChat: React.FC = () => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peerConnection, setPeerConnection] =
    useState<RTCPeerConnection | null>(null);
  const [inQueue, setInQueue] = useState<boolean>(false);
  const [matched, setMatched] = useState<boolean>(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null); // Use a ref for socket
  const roomIdRef = useRef<string | null>(null); // Ref for roomId

  useEffect(() => {
    console.log("WebRTC adapter version:", adapter.browserDetails.version);
    console.log("Browser:", adapter.browserDetails.browser);

    const newSocket = io("https://toktok-server.mcv.kr", {
      withCredentials: true,
    });
    socketRef.current = newSocket; // Set the socket in the ref

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
      if (peerConnection) {
        peerConnection.close();
      }
    };
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.on("matched", ({ roomId: newRoomId }) => {
      console.log("Matched with a partner, room ID:", newRoomId);
      setMatched(true);
      setInQueue(false);
      setRoomId(newRoomId);
      initializePeerConnection();
    });

    socket.on("offer", async ({ offer }) => {
      console.log("Received offer");
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

      try {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
        console.log("Remote answer set successfully");
      } catch (error) {
        console.error("Failed to set remote answer:", error);
      }
    });

    socket.on("iceCandidate", async ({ candidate }) => {
      console.log("Received ICE candidate");
      if (!peerConnection) return;
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on("partnerDisconnected", () => {
      console.log("Partner disconnected");
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
  }, [peerConnection, roomId]);

  const initializePeerConnection = async () => {
    console.log("Initializing peer connection");

    const newPeerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    newPeerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(
          `On Ice Candidate candidate: ${event.candidate}, roomId: ${roomIdRef.current}`
        );

        socketRef.current?.emit("iceCandidate", {
          candidate: event.candidate,
          roomId: roomIdRef.current, // Use the ref to get the latest roomId
        });
      } else {
        console.log("All ICE candidates have been sent.");
      }
    };

    newPeerConnection.ontrack = (event) => {
      console.log("Received remote track", event.track.kind);
      setRemoteStream(event.streams[0]);
    };

    newPeerConnection.oniceconnectionstatechange = () => {
      console.log(
        "ICE connection state:",
        newPeerConnection.iceConnectionState
      );
    };

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        newPeerConnection.addTrack(track, localStream);
      });
    }

    setPeerConnection(newPeerConnection);

    const offer = await newPeerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await newPeerConnection.setLocalDescription(offer);
    console.log("Sending offer");
    socketRef.current?.emit("offer", { offer, roomId: roomIdRef.current }); // Use the ref for roomId
  };

  const joinQueue = () => {
    console.log("Joining queue");
    setInQueue(true);
    socketRef.current?.emit("joinQueue"); // Use ref for socket
  };

  const leaveQueue = () => {
    console.log("Leaving queue");
    setInQueue(false);
    socketRef.current?.emit("leaveQueue"); // Use ref for socket
  };

  const endChat = () => {
    console.log("Ending chat");
    if (peerConnection) {
      peerConnection.close();
    }
    setMatched(false);
    setRemoteStream(null);
    setRoomId(null);
    socketRef.current?.emit("leaveRoom", { roomId }); // Use ref for socket
  };

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log("Setting remote stream to video element");
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    roomIdRef.current = roomId; // Sync roomId with roomIdRef
  }, [roomId]);

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
