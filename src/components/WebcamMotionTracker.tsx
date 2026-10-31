'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface WebcamMotionTrackerProps {
  onStrokeDetected: (strokeType: 'smash' | 'drop') => void;
  onTrackingStatusChange: (active: boolean) => void;
}

export default function WebcamMotionTracker({ onStrokeDetected, onTrackingStatusChange }: WebcamMotionTrackerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [trackerStatus, setTrackerStatus] = useState<string>('INITIALIZING ENGINE...');
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let cameraInstance: any = null;
    let poseInstance: any = null;
    let isUnmounted = false;
    let animationFrameId: number;

    // Movement History Tracking
    const yHistory: number[] = [];
    const HISTORY_LIMIT = 8;
    let lastTriggerTime = 0;
    const COOLDOWN_MS = 750;

    // --- INTEGRATED GAME PHYSICS VARIABLES ---
    let shuttleX = 100;
    let shuttleY = 150;
    let vx = 5;
    let vy = -4;
    const gravity = 0.15;
    const netX = 320; // Center point of our 640x480 resolution canvas

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
        setTrackerStatus('FETCHING SKELETAL DEPENDENCIES...');
        await loadScript('https://jsdelivr.net');
        await loadScript('https://jsdelivr.net');

        if (isUnmounted) return;

        const globalWindow = window as any;
        if (!globalWindow.Pose || !globalWindow.Camera) {
          throw new Error('MediaPipe libraries failed to compile.');
        }

        setTrackerStatus('ACQUIRING WEBCAM ENGINE FEED...');

        poseInstance = new globalWindow.Pose({
          locateFile: (file: string) => `https://jsdelivr.net{file}`,
        });

        poseInstance.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence: 0.70,
          minTrackingConfidence: 0.70,
        });

        // Dedicated 3D-Style Game Loop Canvas Renderer
        const updatePhysicsLoop = () => {
          if (isUnmounted || !canvasRef.current) return;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          // Apply Gravity vector acceleration
          vy += gravity;
          shuttleX += vx;
          shuttleY += vy;

          // FIX: Automated boundary checking forcing the shuttlecock over the center net coordinates
          if (Math.abs(shuttleX - netX) < 15 && shuttleY > 280) {
            // Net collision recovery safety backup override
            vy = -Math.abs(vy) * 1.5;
            shuttleY = 270;
          }

          // Wall and basic automated floor rebounds
          if (shuttleY > 440) {
            vy = -Math.abs(vy) * 0.8;
            shuttleY = 440;
          }
          if (shuttleX < 20 || shuttleX > 620) {
            vx = -vx;
          }

          // Draw the physical net wireframe lines
          ctx.strokeStyle = '#444444';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(netX, 480);
          ctx.lineTo(netX, 300); // Net peak height marker
          ctx.stroke();

          // Draw the floating interactive shuttlecock node particle
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(shuttleX, shuttleY, 8, 0, 2 * Math.PI);
          ctx.fill();

          animationFrameId = requestAnimationFrame(updatePhysicsLoop);
        };

        poseInstance.onResults((results: any) => {
          if (isUnmounted || !canvasRef.current || !videoRef.current) return;

          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (results.poseLandmarks) {
            onTrackingStatusChange(true);
            setTrackerStatus('KINETIC TELEMETRY ACTIVE');

            ctx.save();
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            const rightShoulder = results.poseLandmarks[12];
            const rightElbow = results.poseLandmarks[14];
            const rightWrist = results.poseLandmarks[16];

            if (rightShoulder && rightElbow && rightWrist) {
              // Draw skeletal link indicators
              ctx.strokeStyle = '#FFFFFF';
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.moveTo((1 - rightShoulder.x) * canvas.width, rightShoulder.y * canvas.height);
              ctx.lineTo((1 - rightElbow.x) * canvas.width, rightElbow.y * canvas.height);
              ctx.lineTo((1 - rightWrist.x) * canvas.width, rightWrist.y * canvas.height);
              ctx.stroke();

              yHistory.push(rightWrist.y);
              if (yHistory.length > HISTORY_LIMIT) yHistory.shift();

              const currentTime = Date.now();
              if (currentTime - lastTriggerTime > COOLDOWN_MS && yHistory.length >= 3) {
                const previousWristY = yHistory[yHistory.length - 3];
                const velocityDelta = rightWrist.y - previousWristY;
                const dynamicShoulderHeight = Math.abs(rightShoulder.y - rightElbow.y);

                const isHandAboveShoulder = rightWrist.y < rightShoulder.y;

                if (isHandAboveShoulder && velocityDelta > (dynamicShoulderHeight * 0.42)) {
                  onStrokeDetected('smash');
                  // FIXED VECTOR: Spike shuttle velocity at an upward trajectory path to clear the net easily
                  vx = 8;
                  vy = -6;
                  lastTriggerTime = currentTime;
                  yHistory.length = 0;
                } else if (isHandAboveShoulder && velocityDelta > (dynamicShoulderHeight * 0.12) && velocityDelta < (dynamicShoulderHeight * 0.30)) {
                  onStrokeDetected('drop');
                  vx = 4;
                  vy = -3;
                  lastTriggerTime = currentTime;
                  yHistory.length = 0;
                }
              }
            }
          } else {
            onTrackingStatusChange(false);
            setTrackerStatus('STAND IN CAMERA VIEW FRAME');
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
              if (videoRef.current && poseInstance) {
                await poseInstance.send({ image: videoRef.current });
              }
            },
            width: 640,
            height: 480,
          });

          await cameraInstance.start();
          updatePhysicsLoop(); // Fires up the corrected rendering canvas timeline
        }
      } catch (err) {
        console.error(err);
        setHasError(true);
        setTrackerStatus('CRITICAL FAILURE SETUP HARDWARE ENGINE PIPELINE.');
      }
    };

    initializeSystem();

    return () => {
      isUnmounted = true;
      cancelAnimationFrame(animationFrameId);
      if (cameraInstance && cameraInstance.stop) cameraInstance.stop();
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
      if (poseInstance && poseInstance.close) poseInstance.close();
    };
  }, [onStrokeDetected, onTrackingStatusChange]);

  return (
    <div className="w-full h-full min-h-[400px] bg-[#0c0c0c] flex flex-col items-center justify-center relative p-2 select-none">
      <div className="absolute top-3 left-3 bg-[#161616]/90 px-3 py-1 border border-[#333333] z-20 font-mono text-[10px] tracking-wider text-neutral-400">
        {trackerStatus}
      </div>
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} width={640} height={480} className={`w-full h-full object-cover transition-opacity duration-300 ${hasError ? 'opacity-20' : 'opacity-70'}`} />
    </div>
  );
}

declare global {
  interface Window {
    Pose: any;
    Camera: any;
  }
}
