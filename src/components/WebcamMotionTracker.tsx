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

    // --- INTEGRATED GAME PHYSICS & BOT LOGIC VARIABLES ---
    let shuttleX = 100;
    let shuttleY = 150;
    let vx = 5;
    let vy = -4;
    const gravity = 0.16; // Perfectly weighted gravity for high arches
    const netX = 320;     // Center point of our 640x480 resolution canvas

    // AI Bot racket positioning tracking properties
    let botX = 580;
    let botY = 240;

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
        // FIXED CDN LINKS: Direct paths targeting working asset files
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

          // Clear previous loop artifacts cleanly
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Apply Gravity vector acceleration
          vy += gravity;
          shuttleX += vx;
          shuttleY += vy;

          // --- FIXED AI BOT INTERCEPT ENGINE ---
          // The bot moves up/down smoothly to chase the shuttlecock once it crosses the net
          if (shuttleX > netX) {
            botY += (shuttleY - botY) * 0.15; // Smooth tracking ease multiplier
          } else {
            botY += (240 - botY) * 0.05;     // Return to base position
          }

          // Bound bot coordinates to active canvas court space
          if (botY < 100) botY = 100;
          if (botY > 400) botY = 400;

          // --- COLLISION MATRIX LOGIC ---
          // 1. AI Opponent Intercept Hit Rebound
          const distanceToBot = Math.sqrt(Math.pow(shuttleX - botX, 2) + Math.pow(shuttleY - botY, 2));
          if (distanceToBot < 25 && vx > 0) {
            vx = -6 - Math.random() * 2;   // Propels shuttle back with force toward user field
            vy = -5 - Math.random() * 2;   // HIGH ARC FORCE: Guarantees it sails over the net
          }

          // 2. Net Collision Protection Fallback Rule
          // If the ball falls near the net, simulate a fallback push to keep the presentation lively
          if (Math.abs(shuttleX - netX) < 15 && shuttleY > 260) {
            vy = -Math.abs(vy) * 1.6; // Injects massive upward lift to clear the center line mesh
            shuttleY = 250;
          }

          // 3. Court Floor & Boundary Rebounds
          if (shuttleY > 440) {
            vy = -Math.abs(vy) * 0.7; // Realistic floor bounce friction degradation
            shuttleY = 440;
          }
          if (shuttleX < 20) {
            vx = Math.abs(vx); // Simple boundary bouncing
          }
          if (shuttleX > 620) {
            vx = -Math.abs(vx);
          }

          // --- DRAWING GRAPHICS LAYER ---
          // Center Court Net Mesh
          ctx.strokeStyle = '#222222';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(netX, 480);
          ctx.lineTo(netX, 280);
          ctx.stroke();

          // AI Opponent Racket Identifier Dot
          ctx.fillStyle = '#E53E3E'; // Red color marker for enemy bot indicator
          ctx.beginPath();
          ctx.arc(botX, botY, 12, 0, 2 * Math.PI);
          ctx.fill();

          // Interactive Shuttlecock Core Particle
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

          if (results.poseLandmarks) {
            onTrackingStatusChange(true);
            setTrackerStatus('KINETIC TELEMETRY ACTIVE');

            const rightShoulder = results.poseLandmarks[12];
            const rightElbow = results.poseLandmarks[14];
            const rightWrist = results.poseLandmarks[16];

            if (rightShoulder && rightElbow && rightWrist) {
              // Draw tracking indicator connectors overlays
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
              ctx.lineWidth = 3;
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

                // --- HIGH ARCH PHYSICS CONTROLS ---
                if (isHandAboveShoulder && velocityDelta > (dynamicShoulderHeight * 0.40)) {
                  onStrokeDetected('smash');
                  // Rocket push velocity trajectory variables
                  shuttleX = 120; // Fires cleanly from your racket coordinate spot
                  shuttleY = 200;
                  vx = 9;   // Powerful linear speed forward
                  vy = -8;  // HIGH ARCH OVERRIDE: Launches it up and over the net cleanly
                  lastTriggerTime = currentTime;
                  yHistory.length = 0;
                } else if (isHandAboveShoulder && velocityDelta > (dynamicShoulderHeight * 0.12) && velocityDelta < (dynamicShoulderHeight * 0.30)) {
                  onStrokeDetected('drop');
                  shuttleX = 120;
                  shuttleY = 220;
                  vx = 5;
                  vy = -5;  // Graceful arc lift
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
          updatePhysicsLoop();
        }
      } catch (err) {
        console.error(err);
        setHasError(true);
        setTrackerStatus('CRITICAL RUNTIME BREAK DOWN INITIALIZING GRAPHICS.');
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
