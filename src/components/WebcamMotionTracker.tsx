'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface WebcamMotionTrackerProps {
  onStrokeDetected: (strokeType: 'smash' | 'drop' | 'clear') => void;
  onHandMove?: (x: number, y: number) => void;
}

export default function WebcamMotionTracker({ onStrokeDetected, onHandMove }: WebcamMotionTrackerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [trackerStatus, setTrackerStatus] = useState<string>('INITIALIZING MEDIAPIPE 21-NODE MESH...');
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
    const COOLDOWN_MS = 550;

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
        setTrackerStatus('FETCHING MEDIAPIPE SKELETAL LIBS...');
        // Official CDN links for MediaPipe Camera Utils and Hands
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');

        if (isUnmounted) return;

        const globalWindow = window as any;
        if (!globalWindow.Hands || !globalWindow.Camera) {
          throw new Error('MediaPipe Hands global namespaces failed to resolve.');
        }

        setTrackerStatus('CALIBRATING 21-JOINT GEOMETRY...');

        handsInstance = new globalWindow.Hands({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        handsInstance.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.65,
          minTrackingConfidence: 0.65,
        });

        // 21-node hand bone connections
        const connections = [
          [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
          [0, 5], [5, 6], [6, 7], [7, 8],       // Index
          [9, 10], [10, 11], [11, 12],          // Middle
          [13, 14], [14, 15], [15, 16],         // Ring
          [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
          [5, 9], [9, 13], [13, 17]             // Palm web arc
        ];

        handsInstance.onResults((results: any) => {
          if (isUnmounted || !canvasRef.current) return;

          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];

            const wrist = landmarks[0];
            const thumbTip = landmarks[4];
            const indexTip = landmarks[8];
            const middleTip = landmarks[12];
            const ringTip = landmarks[16];
            const pinkyTip = landmarks[20];
            const fingertips = [thumbTip, indexTip, middleTip, ringTip, pinkyTip];

            // 1. Semi-transparent Palm Webbing
            ctx.fillStyle = 'rgba(0, 230, 118, 0.08)';
            ctx.beginPath();
            [0, 1, 5, 9, 13, 17].forEach((idx, i) => {
              const pt = landmarks[idx];
              if (i === 0) ctx.moveTo(pt.x * canvas.width, pt.y * canvas.height);
              else ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
            });
            ctx.closePath();
            ctx.fill();

            // 2. Draw Geometric Connective Lines for Knuckle Strands
            ctx.strokeStyle = '#00e676';
            ctx.lineWidth = 2;
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

            // 3. Draw Joint Indicators
            landmarks.forEach((joint: any) => {
              ctx.fillStyle = '#060a12';
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(joint.x * canvas.width, joint.y * canvas.height, 3.5, 0, 2 * Math.PI);
              ctx.fill();
              ctx.stroke();
            });

            // 4. Highlight Fingertips in Bright High-Contrast White
            fingertips.forEach((tip) => {
              if (tip) {
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(tip.x * canvas.width, tip.y * canvas.height, 5, 0, 2 * Math.PI);
                ctx.fill();
              }
            });

            // Pass Position
            if (onHandMove) {
              const normX = ((1 - wrist.x) - 0.5) * 2.2;
              const normY = (1 - wrist.y);
              onHandMove(normX, normY);
            }

            // 5. Kinetic Stroke Velocity Mechanics
            const currentWristY = wrist.y;
            wristYHistory.push(currentWristY);
            if (wristYHistory.length > HISTORY_LIMIT) wristYHistory.shift();

            const currentTime = Date.now();
            if (currentTime - lastTriggerTime > COOLDOWN_MS && wristYHistory.length >= 4) {
              const previousWristY = wristYHistory[wristYHistory.length - 4];
              const velocityDelta = currentWristY - previousWristY; 
              const isHandElevated = indexTip.y < wrist.y;

              if (isHandElevated && velocityDelta > 0.08) {
                // Downward whip from high stance = SMASH
                onStrokeDetected('smash');
                lastTriggerTime = currentTime;
                wristYHistory.length = 0;
              } else if (velocityDelta < -0.09) {
                // Upward lift = CLEAR
                onStrokeDetected('clear');
                lastTriggerTime = currentTime;
                wristYHistory.length = 0;
              } else if (velocityDelta > 0.03 && velocityDelta < 0.07 && isHandElevated) {
                // Controlled slower downward movement = DROP SHOT
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
              if (videoRef.current && handsInstance) {
                await handsInstance.send({ image: videoRef.current });
              }
            },
            width: 640,
            height: 480,
          });
          
          await cameraInstance.start();
          setTrackerStatus('21-NODE SKELETAL ENGINE: ONLINE');
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
  }, [onStrokeDetected, onHandMove]);

  return (
    <div className="w-full h-full min-h-[380px] bg-[#060911] flex flex-col items-center justify-center relative p-3 select-none border border-[#1a2333] rounded-lg">
      <div className="absolute top-3 left-3 bg-[#0d1422]/90 px-3 py-1 border border-[#212f45] z-20 font-mono text-[11px] tracking-wider text-neutral-300 uppercase rounded">
        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${hasError ? 'bg-red-500' : 'bg-emerald-400 animate-pulse'}`}></span>
        {trackerStatus}
      </div>

      <div className="w-full max-w-[580px] aspect-video bg-black border border-[#1a2333] rounded overflow-hidden relative flex items-center justify-center">
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
