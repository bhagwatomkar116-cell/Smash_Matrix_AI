'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface WebcamMotionTrackerProps {
  onStrokeDetected: (strokeType: 'smash' | 'drop') => void;
}

export default function WebcamMotionTracker({ onStrokeDetected }: WebcamMotionTrackerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [trackerStatus, setTrackerStatus] = useState<string>('LOADING HAND GEOMETRY SCRIPTS...');
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let cameraInstance: any = null;
    let handsInstance: any = null;
    let isUnmounted = false;

    // High sensitivity telemetry arrays
    const wristYHistory: number[] = [];
    const HISTORY_LIMIT = 8; // Tighter buffer for instantaneous reflex detection
    let lastTriggerTime = 0;
    const COOLDOWN_MS = 600; // Fast cooldown to match rapid sequential swings

    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
      });
    };

    const initializeSystem = async () => {
      try {
        setTrackerStatus('FETCHING HIGH-PRECISION HAND DATA PACKS...');
        // Swapped completely to MediaPipe Hands framework for individual finger parsing
        await loadScript('https://jsdelivr.net');
        await loadScript('https://jsdelivr.net');

        if (isUnmounted) return;

        const globalWindow = window as any;
        if (!globalWindow.Hands || !globalWindow.Camera) {
          throw new Error('MediaPipe Hands global namespaces failed to resolve.');
        }

        setTrackerStatus('CALIBRATING WEB CAMERA OVERLAY...');

        handsInstance = new globalWindow.Hands({
          locateFile: (file: string) => `https://jsdelivr.net{file}`,
        });

        // Fine-tuned configurations for ultra-high movement sensitivity
        handsInstance.setOptions({
          maxNumHands: 1,
          modelComplexity: 1, // 1 ensures fast frame processing with near zero processing delay
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.7,
        });

        handsInstance.onResults((results: any) => {
          if (isUnmounted || !canvasRef.current) return;

          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // If a hand is visible in the frame camera layer
          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];

            // 1. Identify all 21 key skeletal hand joint coordinate points
            const wrist = landmarks[0];
            const thumbTip = landmarks[4];
            const indexTip = landmarks[8];
            const middleTip = landmarks[12];
            const ringTip = landmarks[16];
            const pinkyTip = landmarks[20];
            const fingertips = [thumbTip, indexTip, middleTip, ringTip, pinkyTip];

            // 2. Render Full Skeletal Node Connection Map (The Human Look)
            if (globalWindow.drawConnectors && globalWindow.HAND_CONNECTIONS) {
              globalWindow.drawConnectors(ctx, landmarks, globalWindow.HAND_CONNECTIONS, {
                color: '#444444',
                lineWidth: 2,
              });
            } else {
              // Fallback custom procedural rendering if connectors script is omitted
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              landmarks.forEach((pt: any, idx: number) => {
                if (idx > 0 && idx % 4 !== 1) {
                  const prev = landmarks[idx - 1];
                  ctx.moveTo(prev.x * canvas.width, prev.y * canvas.height);
                  ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
                }
              });
              ctx.stroke();
            }

            // 3. Render High-Contrast White Dots on all 5 Individual Fingertips
            fingertips.forEach((tip) => {
              if (tip) {
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(tip.x * canvas.width, tip.y * canvas.height, 5, 0, 2 * Math.PI);
                ctx.fill();
              }
            });

            // Highlight the core movement tracking center (Wrist node)
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(wrist.x * canvas.width, wrist.y * canvas.height, 7, 0, 2 * Math.PI);
            ctx.fill();

            // 4. Kinetic Swing Calculation Mechanics
            const currentWristY = wrist.y;
            wristYHistory.push(currentWristY);
            if (wristYHistory.length > HISTORY_LIMIT) wristYHistory.shift();

            const currentTime = Date.now();
            if (currentTime - lastTriggerTime > COOLDOWN_MS && wristYHistory.length >= 3) {
              const previousWristY = wristYHistory[wristYHistory.length - 3];
              const velocityDelta = currentWristY - previousWristY; // Negative is UPWARDS, Positive is DOWNWARDS

              // Check index fingertip placement relative to the wrist base
              const isHandElevated = indexTip.y < wrist.y;

              if (isHandElevated && velocityDelta > 0.07) {
                // Whipping rapid downward movement from high stance = SMASH
                onStrokeDetected('smash');
                lastTriggerTime = currentTime;
                wristYHistory.length = 0;
              } else if (velocityDelta > 0.02 && velocityDelta < 0.05) {
                // Gentle, controlled trajectory drag loop = DROP SHOT
                onStrokeDetected('drop');
                lastTriggerTime = currentTime;
                wristYHistory.length = 0;
              }
            }
          }
        });

        if (videoRef.current) {
          activeStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, frameRate: { ideal: 30 } },
            audio: false,
          });
          videoRef.current.srcObject = activeStream;
          videoRef.current.play();

          cameraInstance = new globalWindow.Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current) {
                await handsInstance.send({ image: videoRef.current });
              }
            },
            width: 640,
            height: 480,
          });
          
          await cameraInstance.start();
          setTrackerStatus('KINETIC HAND ENGINE: ONLINE');
        }
      } catch (err) {
        console.error(err);
        setHasError(true);
        setTrackerStatus('CRITICAL FAILURE INITIALIZING DEVICE TELEMETRY LAYER.');
      }
    };

    initializeSystem();

    return () => {
      isUnmounted = true;
      if (cameraInstance && cameraInstance.stop) cameraInstance.stop();
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
      if (handsInstance && handsInstance.close) handsInstance.close();
    };
  }, [onStrokeDetected]);

  return (
    <div className="w-full h-full min-h-[400px] bg-[#0c0c0c] flex flex-col items-center justify-center relative p-2 select-none border border-[#222222]">
      {/* Dynamic Status Header */}
      <div className="absolute top-3 left-3 bg-[#161616]/80 px-3 py-1 border border-[#333333] z-20 font-mono text-[10px] tracking-wider text-neutral-400 uppercase">
        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${hasError ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`}></span>
        {trackerStatus}
      </div>

      {/* Mirror Camera Feed Windows */}
      <div className="w-full max-w-[580px] aspect-video bg-black border border-[#222222] relative overflow-hidden flex items-center justify-center">
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-cover scale-x-[-1] opacity-30"
        />
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="absolute top-0 left-0 w-full h-full object-cover scale-x-[-1] z-10 pointer-events-none"
        />
      </div>
    </div>
  );
}