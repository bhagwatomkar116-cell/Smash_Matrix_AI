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
    const HISTORY_LIMIT = 8;
    let lastTriggerTime = 0;
    const COOLDOWN_MS = 600;

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
        // LOCKED VERSION CDNS: Forcing specific, isolated hand files to bypass face mesh overrides
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

        // Hard configuration restricting detection variables strictly to hands
        handsInstance.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.75,
          minTrackingConfidence: 0.75,
        });

        handsInstance.onResults((results: any) => {
          if (isUnmounted || !canvasRef.current) return;

          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Execute ONLY if hand landmarks are isolated in the current camera matrix frame
          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0]; // Isolate first tracked hand array

            // Pinpoint index markers for the 5 individual fingertips (4: Thumb, 8: Index, 12: Middle, 16: Ring, 20: Pinky)
            const wrist = landmarks[0];
            const thumbTip = landmarks[4];
            const indexTip = landmarks[8];
            const middleTip = landmarks[12];
            const ringTip = landmarks[16];
            const pinkyTip = landmarks[20];
            const fingertips = [thumbTip, indexTip, middleTip, ringTip, pinkyTip];

            // 1. Draw Geometric Connective Lines for Knuckle Strands
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            
            // Render structured connection traces manually to prevent global drawing conflicts
            const connections = [, [1,2], [2,3], [3,4],       // Thumb, [5,6], [6,7], [7,8],       // Index, [9,10], [10,11], [11,12],  // Middle, [13,14], [14,15], [15,16], // Ring, [17,18], [18,19], [19,20], // Pinky
              [13,17]                           // Palm base closure
            ];

            ctx.beginPath();
            connections.forEach(([start, end]) => {
              const startPt = landmarks[start];
              const endPt = landmarks[end];
              if (startPt && endPt) {
                ctx.moveTo(startPt.x * canvas.width, startPt.y * canvas.height);
                ctx.lineTo(endPt.x * canvas.width, endPt.y * canvas.height);
              }
            });
            ctx.stroke();

            // 2. Draw Sharp Individual Node Indicator Dots for All 21 Joints
            landmarks.forEach((joint: any) => {
              ctx.fillStyle = '#444444';
              ctx.beginPath();
              ctx.arc(joint.x * canvas.width, joint.y * canvas.height, 4, 0, 2 * Math.PI);
              ctx.fill();
            });

            // 3. Highlight the 5 Fingertips in Bright High-Contrast White
            fingertips.forEach((tip) => {
              if (tip) {
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(tip.x * canvas.width, tip.y * canvas.height, 6, 0, 2 * Math.PI);
                ctx.fill();
              }
            });

            // 4. Kinetic Stroke Vector Calculation Mechanics
            const currentWristY = wrist.y;
            wristYHistory.push(currentWristY);
            if (wristYHistory.length > HISTORY_LIMIT) wristYHistory.shift();

            const currentTime = Date.now();
            if (currentTime - lastTriggerTime > COOLDOWN_MS && wristYHistory.length >= 3) {
              const previousWristY = wristYHistory[wristYHistory.length - 3];
              const velocityDelta = currentWristY - previousWristY; 

              // Note: MediaPipe coordinates are inverted (0 at top of lens frame, 1 at bottom)
              const isHandElevated = indexTip.y < wrist.y;

              if (isHandElevated && velocityDelta > 0.06) {
                // Rapid downwards velocity sweep from an elevated hand position = SMASH
                onStrokeDetected('smash');
                lastTriggerTime = currentTime;
                wristYHistory.length = 0;
              } else if (velocityDelta > 0.02 && velocityDelta < 0.05) {
                // Controlled slower downward movement array curve loop = DROP SHOT
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
      {/* Absolute Telemetry Layer Header Status Indicator */}
      <div className="absolute top-3 left-3 bg-[#161616]/80 px-3 py-1 border border-[#333333] z-20 font-mono text-[10px] tracking-wider text-neutral-400 uppercase">
        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${hasError ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`}></span>
        {trackerStatus}
      </div>

      {/* Mirror Camera View Canvas Containers */}
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