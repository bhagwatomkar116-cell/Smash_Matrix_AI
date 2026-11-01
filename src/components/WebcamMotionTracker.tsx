'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface WebcamMotionTrackerProps {
  onStrokeDetected: (strokeType: 'smash' | 'drop') => void;
  onTrackingStatusChange: (active: boolean) => void;
}

export default function WebcamMotionTracker({
  onStrokeDetected,
  onTrackingStatusChange,
}: WebcamMotionTrackerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [trackerStatus, setTrackerStatus] = useState<string>('INITIALIZING ENGINE...');
  const [hasError, setHasError] = useState<boolean>(false);

  // --- SCORE STATES ---
  const [playerScore, setPlayerScore] = useState<number>(0);
  const [botScore, setBotScore] = useState<number>(0);

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

    // --- SHARED GAME MATRIX VARIABLES ---
    const gameState = {
      shuttleX: 100,
      shuttleY: 150,
      vx: 5,
      vy: -4,
      botX: 580,
      botY: 240,
      latestLandmarks: null as any,
      isRoundActive: true, // Prevents multiple points scoring in a single frame
    };

    const gravity = 0.16;
    const netX = 320;

    // Helper to reset shuttle position for the next serve round
    const resetRound = (serveToPlayer: boolean) => {
      gameState.isRoundActive = true;
      if (serveToPlayer) {
        // Bot serves to player
        gameState.shuttleX = 560;
        gameState.shuttleY = 200;
        gameState.vx = -6;
        gameState.vy = -8;
      } else {
        // Player serves to bot
        gameState.shuttleX = 100;
        gameState.shuttleY = 200;
        gameState.vx = 6;
        gameState.vy = -8;
      }
    };

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
        
        // Official MediaPipe Production CDN Links
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

        // --- SINGLE UNIFIED RENDERING LOOP ---
        const updatePhysicsLoop = () => {
          if (isUnmounted || !canvasRef.current) return;

          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          // Clear Slate
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Step Physics Engine Calculations
          gameState.vy += gravity;
          gameState.shuttleX += gameState.vx;
          gameState.shuttleY += gameState.vy;

          // AI Intercept Behavior
          if (gameState.shuttleX > netX) {
            gameState.botY += (gameState.shuttleY - gameState.botY) * 0.15;
          } else {
            gameState.botY += (240 - gameState.botY) * 0.05;
          }

          if (gameState.botY < 100) gameState.botY = 100;
          if (gameState.botY > 400) gameState.botY = 400;

          // Collision Matrix: AI Opponent Rebound
          const distanceToBot = Math.sqrt(
            Math.pow(gameState.shuttleX - gameState.botX, 2) + 
            Math.pow(gameState.shuttleY - gameState.botY, 2)
          );
          if (distanceToBot < 25 && gameState.vx > 0 && gameState.isRoundActive) {
            gameState.vx = -7 - Math.random() * 2;
            gameState.vy = -7 - Math.random() * 2;
          }

          // Net Collision Logic
          const NET_TOP_Y = 280; 
          if (Math.abs(gameState.shuttleX - netX) <= Math.abs(gameState.vx) + 4) {
            if (gameState.shuttleY >= NET_TOP_Y) {
              gameState.vx = -gameState.vx * 0.3; 
              gameState.vy = 2; 
            }
          }

          // --- POINT SCORING SYSTEM LOGIC ---
          if (gameState.shuttleY >= 435 && gameState.isRoundActive) {
            gameState.isRoundActive = false; // Freeze scoring calculations for this frame

            if (gameState.shuttleX > netX) {
              // Shuttle landed on right side (Bot side) -> Player Scores!
              setPlayerScore((prev) => prev + 1);
              setTimeout(() => resetRound(false), 1500); // Serve next round from player side
            } else {
              // Shuttle landed on left side (Player side) -> Bot Scores!
              setBotScore((prev) => prev + 1);
              setTimeout(() => resetRound(true), 1500); // Serve next round from bot side
            }
          }

          // Side wall boundaries constraint scoring
          if (gameState.shuttleX < 10 && gameState.isRoundActive) {
            gameState.isRoundActive = false;
            setBotScore((prev) => prev + 1);
            setTimeout(() => resetRound(true), 1500);
          }
          if (gameState.shuttleX > 630 && gameState.isRoundActive) {
            gameState.isRoundActive = false;
            setPlayerScore((prev) => prev + 1);
            setTimeout(() => resetRound(false), 1500);
          }

          // Restrict floor boundaries visually
          if (gameState.shuttleY > 440) {
            gameState.vy = 0;
            gameState.shuttleY = 440;
          }

          // Render Kinetic Telemetry Skeletal Frame
          if (gameState.latestLandmarks) {
            const rightShoulder = gameState.latestLandmarks[12];
            const rightElbow = gameState.latestLandmarks[14];
            const rightWrist = gameState.latestLandmarks[16];

            if (rightShoulder && rightElbow && rightWrist) {
              ctx.strokeStyle = 'rgba(0, 255, 200, 0.7)';
              ctx.lineWidth = 4;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              
              ctx.beginPath();
              ctx.moveTo((1 - rightShoulder.x) * canvas.width, rightShoulder.y * canvas.height);
              ctx.lineTo((1 - rightElbow.x) * canvas.width, rightElbow.y * canvas.height);
              ctx.lineTo((1 - rightWrist.x) * canvas.width, rightWrist.y * canvas.height);
              ctx.stroke();
            }
          }

          // Render Court Net Line (height from ground up to y=280)
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(netX, 480);
          ctx.lineTo(netX, 280);
          ctx.stroke();

          // Render AI Bot
          ctx.fillStyle = '#E53E3E';
          ctx.beginPath();
          ctx.arc(gameState.botX, gameState.botY, 12, 0, 2 * Math.PI);
          ctx.fill();

          // Render Shuttlecock
          ctx.fillStyle = '#FFFF00';
          ctx.beginPath();
          ctx.arc(gameState.shuttleX, gameState.shuttleY, 8, 0, 2 * Math.PI);
          ctx.fill();

          animationFrameId = requestAnimationFrame(updatePhysicsLoop);
        };

        poseInstance.onResults((results: any) => {
          if (isUnmounted) return;

          if (results.poseLandmarks) {
            onTrackingStatusChange(true);
            setTrackerStatus('KINETIC TELEMETRY ACTIVE');
            gameState.latestLandmarks = results.poseLandmarks;

            const rightShoulder = results.poseLandmarks[12];
            const rightElbow = results.poseLandmarks[14];
            const rightWrist = results.poseLandmarks[16];

            if (rightShoulder && rightElbow && rightWrist) {
              yHistory.push(rightWrist.y);
              if (yHistory.length > HISTORY_LIMIT) yHistory.shift();

              const currentTime = Date.now();
              if (currentTime - lastTriggerTime > COOLDOWN_MS && yHistory.length >= 3) {
                const previousWristY = yHistory[yHistory.length - 3];
                const velocityDelta = rightWrist.y - previousWristY;
                const dynamicShoulderHeight = Math.abs(rightShoulder.y - rightElbow.y);
                const isHandAboveShoulder = rightWrist.y < rightShoulder.y;

                if (isHandAboveShoulder && velocityDelta > (dynamicShoulderHeight * 0.40)) {
                  onStrokeDetected('smash');
                  // FIXED PHYSICS VALUES FOR SMASH
                  gameState.shuttleX = 120;
                  gameState.shuttleY = 160; // Launch higher
                  gameState.vx = 11;        // Fast line drive speed forward
                  gameState.vy = -4;        // Direct downward angled trajectory clearing the net top (280)
                  lastTriggerTime = currentTime;
                  yHistory.length = 0;
                } else if (
                  isHandAboveShoulder &&
                  velocityDelta > (dynamicShoulderHeight * 0.12) &&
