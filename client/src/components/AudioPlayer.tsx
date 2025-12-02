import { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { filesApi, type SourceAudioInfo } from "../lib/api";
import toast from "react-hot-toast";

interface AudioPlayerProps {
  audioId: string;
  audioInfo?: SourceAudioInfo | null;
  onDownload?: () => void;
  className?: string;
}

export function AudioPlayer({
  audioId,
  audioInfo,
  onDownload,
  className,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(audioInfo?.duration || 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Load audio when play is clicked (lazy loading)
  const loadAudio = async () => {
    if (audioUrl) return; // Already loaded

    setIsLoading(true);
    setError(null);

    try {
      const response = await filesApi.getAudio(audioId);
      const blob = response.data as Blob;
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) {
        setError("Audio file not found (may have been deleted)");
      } else if (status === 403) {
        setError("Access denied to audio file");
      } else {
        setError("Failed to load audio");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayPause = async () => {
    if (!audioUrl) {
      await loadAudio();
    }

    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(() => {
          // Handle autoplay restrictions
          setError("Unable to play audio");
        });
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && audioRef.current.duration !== Infinity) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleDownload = async () => {
    try {
      const response = await filesApi.getAudio(audioId);
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = audioInfo?.filename || `audio-${audioId}.wav`;
      link.click();
      URL.revokeObjectURL(url);
      onDownload?.();
      toast.success("Audio downloaded");
    } catch {
      toast.error("Failed to download audio");
    }
  };

  if (error) {
    return (
      <div
        className={`flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg ${className}`}
      >
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div className={`bg-gray-100 rounded-lg p-4 ${className}`}>
      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          muted={isMuted}
        />
      )}

      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          onClick={handlePlayPause}
          disabled={isLoading}
          className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 flex-shrink-0"
          title="Play/Pause"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </button>

        {/* Progress Bar */}
        <div className="flex-1 flex flex-col gap-1">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            disabled={!audioUrl}
            className="w-full h-2 bg-gray-300 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed accent-blue-600"
            style={{
              background: duration
                ? `linear-gradient(to right, #3b82f6 ${
                    (currentTime / duration) * 100
                  }%, #d1d5db ${(currentTime / duration) * 100}%)`
                : "#d1d5db",
            }}
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Volume Toggle */}
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="p-2 text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <VolumeX className="h-5 w-5" />
          ) : (
            <Volume2 className="h-5 w-5" />
          )}
        </button>

        {/* Download Button */}
        <button
          onClick={handleDownload}
          className="p-2 text-gray-500 hover:text-blue-600 transition-colors flex-shrink-0"
          title="Download audio"
        >
          <Download className="h-5 w-5" />
        </button>
      </div>

      {/* Audio Info */}
      {audioInfo && (
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 flex-wrap">
          <span className="truncate max-w-xs" title={audioInfo.filename}>
            {audioInfo.filename}
          </span>
          <span className="flex-shrink-0">
            {(audioInfo.fileSize / 1024 / 1024).toFixed(2)} MB
          </span>
        </div>
      )}
    </div>
  );
}
