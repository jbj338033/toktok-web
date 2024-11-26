import React, { useEffect, useRef, useState } from "react";
import { useWebRTC } from "../hooks/useWebRTC";
import {
  BsCameraVideo,
  BsCameraVideoOff,
  BsMic,
  BsMicMute,
  BsArrowsFullscreen,
  BsThreeDots,
} from "react-icons/bs";
import { IoClose } from "react-icons/io5";
import { RiSignalTowerFill } from "react-icons/ri";

const WS_URL = import.meta.env.VITE_WS_URL;

export const VideoChat: React.FC = () => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [, setIsFullscreen] = useState(false);

  const { localStream, remoteStream, isConnected, error } = useWebRTC(WS_URL);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => {
        document.addEventListener(
          "click",
          () => {
            remoteVideoRef.current?.play();
          },
          { once: true }
        );
      });
    }
  }, [remoteStream]);

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="relative min-h-screen bg-[#0A0A0A] text-white overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(45deg,#171717_25%,transparent_25%,transparent_75%,#171717_75%,#171717),linear-gradient(45deg,#171717_25%,transparent_25%,transparent_75%,#171717_75%,#171717)] bg-[length:60px_60px] bg-[position:0_0,30px_30px] opacity-20"></div>

        {/* Header */}
        <div className="relative z-10 p-6">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-4">
              <RiSignalTowerFill
                className={`h-5 w-5 ${
                  isConnected ? "text-emerald-400" : "text-amber-400"
                }`}
              />
              <span className="text-sm font-medium">
                {isConnected ? "Connected" : "Looking for peer..."}
              </span>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="p-2 hover:bg-white/5 rounded-full transition-colors"
            >
              <IoClose size={24} />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="relative z-10 px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Local Video */}
              <div
                className="relative aspect-video bg-neutral-900 rounded-3xl overflow-hidden 
                          ring-1 ring-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)]"
              >
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {!isVideoEnabled && (
                  <div
                    className="absolute inset-0 bg-neutral-900/90 backdrop-blur-sm 
                             flex flex-col items-center justify-center gap-3"
                  >
                    <BsCameraVideoOff size={32} className="text-neutral-400" />
                    <span className="text-sm text-neutral-400">Camera Off</span>
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-black/80 to-transparent">
                  <div className="absolute bottom-4 left-4 flex items-center gap-2">
                    <span className="px-3 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-sm">
                      You
                    </span>
                    {!isAudioEnabled && (
                      <span className="p-1.5 bg-red-500/80 backdrop-blur-md rounded-full">
                        <BsMicMute size={12} />
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Remote Video */}
              <div
                className="relative aspect-video bg-neutral-900 rounded-3xl overflow-hidden 
                          ring-1 ring-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)]"
              >
                {isConnected ? (
                  <>
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    {(!remoteStream ||
                      remoteStream.getTracks().length === 0) && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900/90 backdrop-blur-sm">
                        <div className="text-center space-y-4">
                          <div className="flex gap-1">
                            <div className="w-3 h-3 rounded-full bg-neutral-500 animate-bounce"></div>
                            <div className="w-3 h-3 rounded-full bg-neutral-500 animate-bounce [animation-delay:-.3s]"></div>
                            <div className="w-3 h-3 rounded-full bg-neutral-500 animate-bounce [animation-delay:-.5s]"></div>
                          </div>
                          <p className="text-sm text-neutral-400">
                            Waiting for peer's stream...
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-black/80 to-transparent">
                      <div className="absolute bottom-4 left-4">
                        <span className="px-3 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-sm">
                          Peer
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                      <RiSignalTowerFill
                        size={32}
                        className="text-neutral-400"
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-medium text-neutral-200 mb-2">
                        Waiting for connection
                      </p>
                      <p className="text-sm text-neutral-400">
                        Finding someone to chat with...
                      </p>
                    </div>
                    <div className="flex gap-1 mt-2">
                      <div className="w-2 h-2 rounded-full bg-neutral-600 animate-pulse"></div>
                      <div className="w-2 h-2 rounded-full bg-neutral-600 animate-pulse delay-150"></div>
                      <div className="w-2 h-2 rounded-full bg-neutral-600 animate-pulse delay-300"></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20">
          <div
            className="flex items-center gap-3 p-3 bg-white/5 backdrop-blur-xl rounded-2xl 
                      ring-1 ring-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)]"
          >
            <button
              onClick={toggleVideo}
              className={`p-4 rounded-xl transition-all ${
                isVideoEnabled
                  ? "bg-white/5 hover:bg-white/10"
                  : "bg-red-500/80 hover:bg-red-500"
              }`}
            >
              {isVideoEnabled ? (
                <BsCameraVideo size={20} />
              ) : (
                <BsCameraVideoOff size={20} />
              )}
            </button>

            <button
              onClick={toggleAudio}
              className={`p-4 rounded-xl transition-all ${
                isAudioEnabled
                  ? "bg-white/5 hover:bg-white/10"
                  : "bg-red-500/80 hover:bg-red-500"
              }`}
            >
              {isAudioEnabled ? <BsMic size={20} /> : <BsMicMute size={20} />}
            </button>

            <div className="w-px h-8 bg-white/10"></div>

            <button
              onClick={toggleFullscreen}
              className="p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all"
            >
              <BsArrowsFullscreen size={20} />
            </button>

            <button className="p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all">
              <BsThreeDots size={20} />
            </button>
          </div>
        </div>

        {/* Error Toast */}
        {error && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50">
            <div className="px-4 py-3 bg-red-500/90 backdrop-blur-sm rounded-lg text-sm">
              {error}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
