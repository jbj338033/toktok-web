import React, { useEffect, useRef } from "react";
import { useWebRTC } from "../hooks/useWebRTC";

const WS_URL = "ws://localhost:8080/signal"; // Update with your backend URL

export const VideoChat: React.FC = () => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const { localStream, remoteStream, isConnected, error } = useWebRTC(WS_URL);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-4">
      {error && <div className="text-red-500 mb-4">Error: {error}</div>}

      <div className="flex flex-wrap justify-center gap-4 w-full max-w-4xl">
        <div className="relative w-full md:w-[480px]">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full bg-black rounded-lg"
          />
          <div className="absolute bottom-2 left-2 text-white bg-black bg-opacity-50 px-2 py-1 rounded">
            You
          </div>
        </div>

        {isConnected && (
          <div className="relative w-full md:w-[480px]">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full bg-black rounded-lg"
            />
            <div className="absolute bottom-2 left-2 text-white bg-black bg-opacity-50 px-2 py-1 rounded">
              Stranger
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 text-white">
        {!isConnected ? "Waiting for connection..." : "Connected!"}
      </div>
    </div>
  );
};
