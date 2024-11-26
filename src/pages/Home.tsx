import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import {
  BiVideo,
  BiVideoOff,
  BiMicrophone,
  BiMicrophoneOff,
  BiHeart,
  BiX,
} from "react-icons/bi";

interface RTCSignalData {
  sdp: RTCSessionDescriptionInit;
  target: string;
}

const RandomChat: React.FC = () => {
  const [isMatching, setIsMatching] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isLiked, setIsLiked] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const currentPartner = useRef<string | null>(null);

  useEffect(() => {
    socketRef.current = io(
      "https://substantial-adore-imds-2813ad36.koyeb.app",
      {
        secure: true,
      }
    );

    setupSocketListeners();

    return () => {
      socketRef.current?.disconnect();
      stopLocalStream();
    };
  }, []);

  const setupSocketListeners = () => {
    if (!socketRef.current) return;

    socketRef.current.on("offer", handleOffer);
    socketRef.current.on("answer", handleAnswer);
    socketRef.current.on("candidate", handleCandidate);
    socketRef.current.on("matchFound", handleMatchFound);
    socketRef.current.on("partnerDisconnected", handlePartnerDisconnected);
  };

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStream.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      return null;
    }
  };

  const stopLocalStream = () => {
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop());
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
  };

  const createPeerConnection = (partnerId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
          urls: "turn:43.203.120.136:3478",
          username: "toktok",
          credential: "toktok1234!",
        },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit("candidate", {
          candidate: event.candidate,
          target: partnerId,
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (
        pc.iceConnectionState === "disconnected" ||
        pc.iceConnectionState === "failed"
      ) {
        handlePartnerDisconnected();
      }
    };

    peerConnection.current = pc;
    return pc;
  };

  const handleMatchFound = async ({ partnerId }: { partnerId: string }) => {
    currentPartner.current = partnerId;
    setIsMatching(false);
    setIsChatting(true);

    const pc = await createPeerConnection(partnerId);
    const stream = localStream.current || (await startLocalStream());

    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit("offer", { sdp: offer, target: partnerId });
      } catch (error) {
        console.error("Error creating offer:", error);
        handlePartnerDisconnected();
      }
    }
  };

  const handleOffer = async (data: RTCSignalData) => {
    currentPartner.current = data.target;
    const pc = createPeerConnection(data.target);

    const stream = localStream.current || (await startLocalStream());
    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit("answer", {
        sdp: answer,
        target: data.target,
      });
      setIsChatting(true);
    } catch (error) {
      console.error("Error handling offer:", error);
      handlePartnerDisconnected();
    }
  };

  const handleAnswer = async (data: RTCSignalData) => {
    if (peerConnection.current) {
      try {
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(data.sdp)
        );
      } catch (error) {
        console.error("Error setting remote description:", error);
      }
    }
  };

  const handleCandidate = ({
    candidate,
  }: {
    candidate: RTCIceCandidateInit;
  }) => {
    if (peerConnection.current) {
      try {
        peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    }
  };

  const handlePartnerDisconnected = () => {
    setIsChatting(false);
    setIsLiked(false);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
  };

  const startMatching = async () => {
    if (!localStream.current) {
      const stream = await startLocalStream();
      if (!stream) return;
    }
    setIsMatching(true);
    socketRef.current?.emit("findMatch");
  };

  const skipPartner = () => {
    if (currentPartner.current) {
      socketRef.current?.emit("skipPartner", {
        target: currentPartner.current,
      });
    }
    handlePartnerDisconnected();
    startMatching();
  };

  const toggleVideo = () => {
    if (localStream.current) {
      const videoTrack = localStream.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
      }
    }
  };

  return (
    <div className="w-screen h-screen bg-slate-900">
      <div className="flex flex-col h-full p-6">
        {/* Remote Video Container */}
        <div className="relative flex-1 rounded-2xl overflow-hidden bg-black/20 mb-6">
          <video
            ref={remoteVideoRef}
            className="w-full h-full object-cover"
            playsInline
            autoPlay
          />

          {isMatching && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 z-10">
              <div className="w-10 h-10 border-4 border-white/10 border-l-white rounded-full animate-spin" />
              <span className="text-white text-lg font-medium">
                Finding someone to chat with...
              </span>
            </div>
          )}
        </div>

        {/* Local Video Container */}
        <div className="absolute top-10 right-10 w-60 h-44 rounded-xl overflow-hidden shadow-lg transition-transform hover:scale-105">
          <video
            ref={localVideoRef}
            className="w-full h-full object-cover"
            playsInline
            autoPlay
            muted
          />
          {!isVideoEnabled && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80">
              <BiVideoOff className="w-6 h-6 text-white/80" />
              <span className="text-white/80 text-sm">Video Off</span>
            </div>
          )}
        </div>

        {/* Control Bar */}
        <div className="flex justify-between items-center p-6 bg-slate-900/80 backdrop-blur rounded-2xl">
          {/* Left Controls */}
          <div className="flex gap-4">
            <button
              onClick={toggleVideo}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all
                ${
                  isVideoEnabled
                    ? "bg-white/10 hover:bg-white/20"
                    : "bg-red-500 hover:bg-red-600"
                }`}
            >
              {isVideoEnabled ? (
                <BiVideo className="w-5 h-5 text-white" />
              ) : (
                <BiVideoOff className="w-5 h-5 text-white" />
              )}
            </button>
            <button
              onClick={toggleAudio}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all
                ${
                  isAudioEnabled
                    ? "bg-white/10 hover:bg-white/20"
                    : "bg-red-500 hover:bg-red-600"
                }`}
            >
              {isAudioEnabled ? (
                <BiMicrophone className="w-5 h-5 text-white" />
              ) : (
                <BiMicrophoneOff className="w-5 h-5 text-white" />
              )}
            </button>
          </div>

          {/* Right Controls */}
          <div className="flex gap-4 items-center">
            <button
              onClick={() => setIsLiked(!isLiked)}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all
                ${
                  isLiked
                    ? "bg-pink-500 hover:bg-pink-600"
                    : "bg-white/10 hover:bg-white/20"
                }`}
            >
              <BiHeart className="w-5 h-5 text-white" />
            </button>

            {!isMatching && !isChatting && (
              <button
                onClick={startMatching}
                className="h-12 px-6 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 
                  text-white font-semibold hover:from-blue-600 hover:to-blue-700 
                  transition-all hover:-translate-y-0.5"
              >
                Start Matching
              </button>
            )}

            {isChatting && (
              <button
                onClick={skipPartner}
                className="h-12 px-6 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 
                  text-white font-semibold hover:from-blue-600 hover:to-blue-700 
                  transition-all hover:-translate-y-0.5"
              >
                Next
              </button>
            )}

            {isMatching && (
              <button
                onClick={() => setIsMatching(false)}
                className="w-12 h-12 rounded-full flex items-center justify-center 
                  bg-red-500 hover:bg-red-600 transition-all"
              >
                <BiX className="w-5 h-5 text-white" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RandomChat;
