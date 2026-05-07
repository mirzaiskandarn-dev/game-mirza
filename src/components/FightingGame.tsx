/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LucideSword, LucideTrophy, LucideZap, LucideShield, LucideRotateCcw, LucideSettings, LucideArrowUp, LucideCrosshair } from 'lucide-react';

// --- Types & Constants ---

type FighterState = 'IDLE' | 'MOVE' | 'JUMP' | 'ATTACK_1' | 'ATTACK_2' | 'HIT' | 'BLOCK' | 'DEAD';

interface Character {
  name: string;
  color: string;
  weaponColor: string;
  weaponType: 'MELEE' | 'RANGED' | 'LONG_MELEE';
  attackRange: number;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  ownerId: string;
}

const CHARACTERS: Character[] = [
  { name: 'BLADE-X', color: '#00f2ff', weaponColor: '#ffffff', weaponType: 'MELEE', attackRange: 75 },
  { name: 'SHADOW-R', color: '#ff0055', weaponColor: '#ff0055', weaponType: 'MELEE', attackRange: 60 },
  { name: 'PULSE-G', color: '#00ff66', weaponColor: '#00ff66', weaponType: 'RANGED', attackRange: 400 },
  { name: 'VOLT-S', color: '#ffea00', weaponColor: '#ffea00', weaponType: 'LONG_MELEE', attackRange: 130 },
  { name: 'INFERNO-B', color: '#ff4400', weaponColor: '#ff4400', weaponType: 'RANGED', attackRange: 350 },
];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Fighter {
  id: 'PLAYER' | 'ENEMY';
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  energy: number;
  state: FighterState;
  direction: 1 | -1; // 1 for right, -1 for left
  isGrounded: boolean;
  attackCooldown: number;
  stateTimer: number;
  hasHit: boolean; 
  hitbox: Box | null;
  hurtbox: Box;
  color: string;
  weaponColor: string;
  // Animation props
  animFrame: number;
}

const CONSTANTS = {
  CANVAS_WIDTH: 1024,
  CANVAS_HEIGHT: 576,
  GRAVITY: 0.8,
  FRICTION: 0.85,
  MOVE_SPEED: 8,
  JUMP_FORCE: -22,
  STARTING_HEALTH: 100,
  ATTACK_COOLDOWN: 25, 
  GROUND_Y: 500,
};

// --- Helper Functions ---

const checkCollision = (box1: Box, box2: Box) => {
  return (
    box1.x < box2.x + box2.w &&
    box1.x + box1.w > box2.x &&
    box1.y < box2.y + box2.h &&
    box1.y + box1.h > box2.y
  );
};

// --- Main Component ---

export default function FightingGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'MENU' | 'CHAR_SELECT' | 'FIGHTING' | 'GAMEOVER'>('MENU');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [playerCharIdx, setPlayerCharIdx] = useState(0);
  const [enemyCharIdx, setEnemyCharIdx] = useState(1);
  
  // UI States (Synced from ref)
  const [playerHealth, setPlayerHealth] = useState(100);
  const [enemyHealth, setEnemyHealth] = useState(100);
  const [playerEnergy, setPlayerEnergy] = useState(100);
  const [enemyEnergy, setEnemyEnergy] = useState(100);
  
  // Mobile Control States
  const joystickActiveRef = useRef(false);
  const joystickPosRef = useRef({ x: 0, y: 0 });
  const [joystickUI, setJoystickUI] = useState({ x: 0, y: 0 }); // For visual only
  const [isJoystickActive, setIsJoystickActive] = useState(false);

  const joystickBaseRef = useRef<HTMLDivElement>(null);

  // Core Game State (Refs for performance)
  const playerRef = useRef<Fighter>({
    id: 'PLAYER', x: 200, y: 0, vx: 0, vy: 0, width: 50, height: 110,
    health: 100, maxHealth: 100, energy: 100, state: 'IDLE', direction: 1,
    isGrounded: false, attackCooldown: 0, stateTimer: 0, hasHit: false, hitbox: null, hurtbox: { x: 0, y: 0, w: 50, h: 110 },
    color: '#00f2ff', weaponColor: '#ffffff', animFrame: 0
  });

  const enemyRef = useRef<Fighter>({
    id: 'ENEMY', x: 750, y: 0, vx: 0, vy: 0, width: 50, height: 110,
    health: 100, maxHealth: 100, energy: 100, state: 'IDLE', direction: -1,
    isGrounded: false, attackCooldown: 0, stateTimer: 0, hasHit: false, hitbox: null, hurtbox: { x: 0, y: 0, w: 50, h: 110 },
    color: '#ff0055', weaponColor: '#f1c40f', animFrame: 0
  });

  const particlesRef = useRef<any[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const keys = useRef<{ [key: string]: boolean }>({});
  const shakeRef = useRef(0);

  // --- Input Handling ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      keys.current[code] = true;
      // Fallback for different keyboard layouts/environments
      if (e.key === 'a' || e.key === 'A') keys.current['KeyA'] = true;
      if (e.key === 'd' || e.key === 'D') keys.current['KeyD'] = true;
      if (e.key === 'w' || e.key === 'W') keys.current['KeyW'] = true;
      if (e.key === 's' || e.key === 'S') keys.current['KeyS'] = true;
      if (e.key === 'j' || e.key === 'J') keys.current['KeyJ'] = true;
      if (e.key === 'k' || e.key === 'K') keys.current['KeyK'] = true;
      if (e.key === 'l' || e.key === 'L') keys.current['KeyL'] = true;
      
      // Also map arrow keys
      if (e.key === 'ArrowLeft') keys.current['KeyA'] = true;
      if (e.key === 'ArrowRight') keys.current['KeyD'] = true;
      if (e.key === 'ArrowUp') keys.current['KeyW'] = true;
      if (e.key === 'ArrowDown') keys.current['KeyS'] = true;
      
      if (e.key === 'Enter') {
        if (gameState === 'MENU') setGameState('CHAR_SELECT');
        else if (gameState === 'CHAR_SELECT') startGame();
        else if (gameState === 'GAMEOVER') resetGame();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      keys.current[code] = false;
      if (e.key === 'a' || e.key === 'A') keys.current['KeyA'] = false;
      if (e.key === 'd' || e.key === 'D') keys.current['KeyD'] = false;
      if (e.key === 'w' || e.key === 'W') keys.current['KeyW'] = false;
      if (e.key === 's' || e.key === 'S') keys.current['KeyS'] = false;
      if (e.key === 'j' || e.key === 'J') keys.current['KeyJ'] = false;
      if (e.key === 'k' || e.key === 'K') keys.current['KeyK'] = false;
      if (e.key === 'l' || e.key === 'L') keys.current['KeyL'] = false;
      
      if (e.key === 'ArrowLeft') keys.current['KeyA'] = false;
      if (e.key === 'ArrowRight') keys.current['KeyD'] = false;
      if (e.key === 'ArrowUp') keys.current['KeyW'] = false;
      if (e.key === 'ArrowDown') keys.current['KeyS'] = false;
    };
    
    // Joystick Global Handlers
    const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      if (!joystickActiveRef.current) return;
      if (e.cancelable) e.preventDefault();
      
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const parent = joystickBaseRef.current;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const x = clientX - (rect.left + rect.width / 2);
      const y = clientY - (rect.top + rect.height / 2);
      const dist = Math.sqrt(x*x + y*y);
      const limit = 40;
      
      const limitedX = dist > limit ? (x/dist)*limit : x;
      const limitedY = dist > limit ? (y/dist)*limit : y;
      
      joystickPosRef.current = { x: limitedX, y: limitedY };
      setJoystickUI({ x: limitedX, y: limitedY });
    };

    const handleGlobalUp = () => {
      joystickActiveRef.current = false;
      setIsJoystickActive(false);
      joystickPosRef.current = { x: 0, y: 0 };
      setJoystickUI({ x: 0, y: 0 });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('touchmove', handleGlobalMove, { passive: false });
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchend', handleGlobalUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [gameState]);

  const startGame = () => {
    // Randomize enemy if desired, or just use selected
    const randomEnemyIdx = Math.floor(Math.random() * CHARACTERS.length);
    setEnemyCharIdx(randomEnemyIdx);

    // Setup characters
    const pChar = CHARACTERS[playerCharIdx];
    const eChar = CHARACTERS[randomEnemyIdx];
    
    playerRef.current.color = pChar.color;
    playerRef.current.weaponColor = pChar.weaponColor;
    playerRef.current.health = 100;
    playerRef.current.x = 200;
    playerRef.current.y = 0;
    playerRef.current.vx = 0;
    playerRef.current.vy = 0;
    playerRef.current.state = 'IDLE';
    
    enemyRef.current.color = eChar.color;
    enemyRef.current.weaponColor = eChar.weaponColor;
    enemyRef.current.health = 100;
    enemyRef.current.x = 750;
    enemyRef.current.y = 0;
    enemyRef.current.vx = 0;
    enemyRef.current.vy = 0;
    enemyRef.current.state = 'IDLE';

    setPlayerHealth(100);
    setEnemyHealth(100);
    setPlayerEnergy(0);
    setEnemyEnergy(0);
    playerRef.current.energy = 0;
    enemyRef.current.energy = 0;
    projectilesRef.current = [];
    setGameState('FIGHTING');
    setWinner(null);
    
    // Start countdown
    setCountdown(3);
  };

  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      const timer = setTimeout(() => setCountdown(null), 1000); // Keep "FIGHT!" on screen for a bit
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const resetGame = () => {
    projectilesRef.current = [];
    particlesRef.current = [];
    playerRef.current.health = 100;
    enemyRef.current.health = 100;
    playerRef.current.energy = 0;
    enemyRef.current.energy = 0;
    playerRef.current.stateTimer = 0;
    enemyRef.current.stateTimer = 0;
    playerRef.current.hasHit = false;
    enemyRef.current.hasHit = false;
    playerRef.current.x = 200;
    enemyRef.current.x = 750;
    playerRef.current.state = 'IDLE';
    enemyRef.current.state = 'IDLE';
    playerRef.current.vx = 0;
    enemyRef.current.vx = 0;
    setPlayerHealth(100);
    setEnemyHealth(100);
    setPlayerEnergy(0);
    setEnemyEnergy(0);
    setGameState('MENU');
  };

  const spawnProjectile = (f: Fighter) => {
    const char = (f.id === 'PLAYER') ? CHARACTERS[playerCharIdx] : CHARACTERS[enemyCharIdx];
    projectilesRef.current.push({
      x: f.direction === 1 ? f.x + f.width : f.x,
      y: f.y + 20,
      vx: f.direction * 15,
      vy: 0,
      radius: 6,
      color: char.weaponColor,
      ownerId: f.id
    });
  };

  // --- Action Trigger (Player & AI) ---
  const triggerAction = (f: Fighter, action: 'ATTACK' | 'BLOCK' | 'JUMP' | 'SPECIAL') => {
    if (gameState !== 'FIGHTING') return;
    if (f.state === 'HIT' || f.state === 'DEAD') return;
    const fChar = CHARACTERS[f.id === 'PLAYER' ? playerCharIdx : enemyCharIdx];

    if (action === 'JUMP' && f.isGrounded) {
       f.vy = CONSTANTS.JUMP_FORCE;
       f.state = 'JUMP';
    } else if (action === 'SPECIAL' && f.energy >= 50) {
       f.energy -= 50;
       f.state = 'ATTACK_2';
       f.stateTimer = 40;
       f.animFrame = 0;
       f.hasHit = false;
       createHitEffect(f.x + f.width/2, f.y + f.height/2, '#ffffff', 30);
       
       if (fChar.name === 'BLADE-X') {
         f.vx = f.direction * 40;
       } else if (fChar.name === 'INFERNO-B') {
         for(let i=0; i<10; i++) {
           projectilesRef.current.push({
             x: f.x + (Math.random()-0.5)*100, y: f.y, vx: (Math.random()-0.5)*10, vy: -15, 
             radius: 10, color: fChar.weaponColor, ownerId: f.id
           });
         }
       } else {
         spawnProjectile(f);
         spawnProjectile(f);
       }
    } else if (action === 'ATTACK' && f.attackCooldown === 0) {
       f.state = 'ATTACK_1';
       f.stateTimer = 18; // Slightly longer for clearer animation
       f.animFrame = 0;
       f.hasHit = false;
       f.attackCooldown = (fChar.weaponType === 'RANGED') ? 35 : CONSTANTS.ATTACK_COOLDOWN;
       
       if (fChar.weaponType === 'RANGED') {
         spawnProjectile(f);
       }
    } else if (action === 'BLOCK') {
       f.state = 'BLOCK';
       f.stateTimer = 30; // Block for 0.5s by default if button is tapped
       f.vx *= 0.2;
    }
  };

  const triggerMobileAction = (action: 'ATTACK' | 'BLOCK' | 'JUMP' | 'SPECIAL') => {
    triggerAction(playerRef.current, action);
  };

  // --- Combat Physics ---

  const applyCombat = (attacker: Fighter, target: Fighter) => {
    if (!attacker.hitbox) return;

    if (checkCollision(attacker.hitbox, target.hurtbox)) {
      attacker.hasHit = true;
      if (target.state === 'BLOCK' && (attacker.direction !== target.direction)) {
         target.health -= 1;
         createHitEffect(target.x + target.width / 2, target.y + target.height / 2, '#fff', 5);
         target.vx = attacker.direction * 8; 
         shakeRef.current = 5;
      } else {
         target.health -= 12;
         target.state = 'HIT';
         createHitEffect(target.x + target.width / 2, target.y + target.height / 2, target.color, 15);
         target.vx = attacker.direction * 22; 
         target.vy = -8;
         shakeRef.current = 15;
      }
      attacker.hitbox = null;
    }
  };

  const createHitEffect = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        radius: Math.random() * 5 + 2,
        life: 1.0,
        color
      });
    }
  };

  // --- Update Loop ---

  const updateFighter = (f: Fighter, other: Fighter, isPlayer: boolean, isCountingDown: boolean) => {
    const fChar = CHARACTERS[isPlayer ? playerCharIdx : enemyCharIdx];
    f.vx *= CONSTANTS.FRICTION;
    f.x += f.vx;
    f.y += f.vy;
    f.vy += CONSTANTS.GRAVITY;

    if (f.y + f.height >= CONSTANTS.GROUND_Y) {
      f.y = CONSTANTS.GROUND_Y - f.height;
      f.vy = 0;
      f.isGrounded = true;
    } else {
      f.isGrounded = false;
    }

    f.x = Math.max(0, Math.min(f.x, CONSTANTS.CANVAS_WIDTH - f.width));
    
    // Scale animation frame speed by horizontal movement intensity
    const moveIntensity = Math.abs(f.vx) / CONSTANTS.MOVE_SPEED;
    f.animFrame += 0.15 + (moveIntensity * 0.25); 

    if (f.attackCooldown > 0) f.attackCooldown--;
    if (f.stateTimer > 0) f.stateTimer--;
    if (f.energy < 100) f.energy += 0.12; // Slightly faster energy gain
    
    // Recovery from hit
    if (f.state === 'HIT' && f.isGrounded && Math.abs(f.vx) < 2) f.state = 'IDLE';

    // State Timer Expiry
    if (f.stateTimer === 0 && (f.state.startsWith('ATTACK') || f.state === 'BLOCK')) {
      f.state = f.isGrounded ? (Math.abs(f.vx) > 1 ? 'MOVE' : 'IDLE') : 'JUMP';
    }

    if (f.state !== 'HIT' && f.state !== 'DEAD' && !isCountingDown) {
      const isAttacking = f.state.startsWith('ATTACK');
      const isBlocking = f.state === 'BLOCK';
      
      if (isPlayer) {
        // Player Input
        const moveLeft = keys.current['KeyA'] || joystickPosRef.current.x < -8;
        const moveRight = keys.current['KeyD'] || joystickPosRef.current.x > 8;
        const jump = keys.current['KeyW'] || keys.current['Space'] || joystickPosRef.current.y < -22;
        const attack = keys.current['KeyJ'];
        const block = keys.current['KeyK'];
        const special = keys.current['KeyL'];

        let inputX = 0;
        if (moveRight) inputX = 1;
        else if (moveLeft) inputX = -1;
        
        // Analog adjustment for joystick with deadzone
        const joyX = joystickPosRef.current.x;
        if (Math.abs(joyX) > 8 && !keys.current['KeyA'] && !keys.current['KeyD']) {
          inputX = joyX / 40;
        }

        if (inputX !== 0 && !isBlocking && !isAttacking) {
          f.vx = inputX * CONSTANTS.MOVE_SPEED;
          f.direction = inputX > 0 ? 1 : -1;
          f.state = 'MOVE';
        } else if (!isAttacking && !isBlocking) {
          // If grounded and nearly stopped, go to idle
          if (f.isGrounded) {
             f.state = Math.abs(f.vx) > 0.5 ? 'MOVE' : 'IDLE';
          } else {
             f.state = 'JUMP';
          }
        }

        if (jump && f.isGrounded) triggerAction(f, 'JUMP');
        if (attack && f.attackCooldown === 0) triggerAction(f, 'ATTACK');
        if (special && f.energy >= 50) triggerAction(f, 'SPECIAL');
        if (block) triggerAction(f, 'BLOCK');
      } else {
        // AI Logic: Smarter and more active
        const dist = Math.abs(f.x - other.x);
        f.direction = (other.x > f.x) ? 1 : -1;
        const moveSpeed = CONSTANTS.MOVE_SPEED * 0.9;

        if (!isBlocking) {
          if (fChar.weaponType === 'RANGED') {
            if (dist < 250) {
              f.vx = -f.direction * moveSpeed;
              if (!isAttacking) f.state = 'MOVE';
            } else if (dist > 350) {
              f.vx = f.direction * moveSpeed;
              if (!isAttacking) f.state = 'MOVE';
            } else if (Math.random() > 0.98) {
              f.vx = (Math.random() - 0.5) * 10; // Jitter
            }
          } else {
            if (dist > fChar.attackRange + 10) {
              f.vx = f.direction * moveSpeed;
              if (!isAttacking) f.state = 'MOVE';
            } else if (dist < 20) {
              f.vx = -f.direction * moveSpeed;
              if (!isAttacking) f.state = 'MOVE';
            }
          }
        }

        if (!isAttacking) {
          if (f.energy >= 50 && dist < 350 && Math.random() > 0.99) {
            triggerAction(f, 'SPECIAL');
          } else if (other.state.startsWith('ATTACK') && dist < 150 && Math.random() > 0.6) {
            triggerAction(f, 'BLOCK');
          } else if (f.attackCooldown === 0) {
            const attackChance = fChar.weaponType === 'RANGED' ? 0.95 : 0.85;
            if (dist < fChar.attackRange + 40 && Math.random() > attackChance) {
              triggerAction(f, 'ATTACK');
            }
          }
        }
      }
    }

    // --- Kinetic Hitbox Management ---
    const currentState = f.state as string;
    if (currentState === 'ATTACK_1' && fChar.weaponType !== 'RANGED' && !f.hasHit) {
      f.hitbox = {
        x: f.direction === 1 ? f.x + f.width : f.x - fChar.attackRange,
        y: f.y + 10,
        w: fChar.attackRange,
        h: 60
      };
    } else if (currentState === 'ATTACK_2' && fChar.name === 'BLADE-X' && !f.hasHit) {
      f.hitbox = { x: f.x - 60, y: f.y - 20, w: f.width + 120, h: f.height + 40 };
    } else if (!currentState.startsWith('ATTACK')) {
      f.hitbox = null;
      f.hasHit = false;
    } else {
      f.hitbox = null;
    }

    f.hurtbox = { x: f.x, y: f.y, w: f.width, h: f.height };

    if (f.health <= 0) {
      f.health = 0; f.state = 'DEAD';
      setGameState('GAMEOVER');
      setWinner(isPlayer ? `SHADOW ${CHARACTERS[playerCharIdx].name}` : `FORGOTTEN ${CHARACTERS[enemyCharIdx].name}`);
    }
  };

  // --- Rendering Stickman (Lentur/Flexible) ---

  const drawStickman = (ctx: CanvasRenderingContext2D, f: Fighter) => {
    ctx.save();
    ctx.translate(f.x + f.width/2, f.y + f.height/2);
    const fChar = CHARACTERS[f.id === 'PLAYER' ? playerCharIdx : enemyCharIdx];
    
    // Ambient Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(0, f.height/2 + 8, 35, 10, 0, 0, Math.PI*2); ctx.fill();

    if (f.state === 'HIT') {
       ctx.translate((Math.random()-0.5)*20, (Math.random()-0.5)*20);
    }
    
    // Smooth Tilt
    const velocityTilt = f.vx * 0.02;
    ctx.rotate(velocityTilt);
    ctx.scale(f.direction, 1);

    const time = f.animFrame;
    const isHit = f.state === 'HIT';
    const color = isHit ? '#fff' : f.color;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10;

    // --- Character Specific Accessories ---
    if (fChar.name === 'INFERNO-B') {
      // Magma Horns & Lava Aura
      ctx.fillStyle = '#ff4400';
      ctx.beginPath(); ctx.moveTo(-10, -55); ctx.lineTo(-15, -85); ctx.lineTo(-5, -60); ctx.fill();
      ctx.beginPath(); ctx.moveTo(10, -55); ctx.lineTo(15, -85); ctx.lineTo(5, -60); ctx.fill();
      // Lava particles spawn
      if (Math.random() > 0.6) {
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath(); ctx.arc((Math.random()-0.5)*40, (Math.random()-0.5)*40 - 20, 3, 0, Math.PI*2); ctx.fill();
      }
      if (Math.random() > 0.8) createHitEffect(f.x + f.width/2, f.y + f.height, '#ff4400', 1);
    } else if (fChar.name === 'VOLT-S') {
      // Electric Halo
      ctx.strokeStyle = '#ffea00'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -75, 15, 5, 0, 0, Math.PI*2); ctx.stroke();
      if (Math.random() > 0.7) {
        ctx.beginPath(); ctx.moveTo(0, -75); ctx.lineTo((Math.random()-0.5)*40, -100); ctx.stroke();
      }
    } else if (fChar.name === 'SHADOW-R') {
      // Shadow Cape
      ctx.fillStyle = 'rgba(20,20,20,0.8)';
      ctx.beginPath(); ctx.moveTo(-10, -40); ctx.lineTo(-40 - Math.sin(time)*15, 20); ctx.lineTo(10, 30); ctx.fill();
    } else if (fChar.name === 'PULSE-G') {
      // Tech Glow
      ctx.fillStyle = '#00ff66';
      ctx.shadowBlur = 15; ctx.shadowColor = '#00ff66';
      ctx.fillRect(-18, -40, 8, 20);
      ctx.shadowBlur = 0;
    } else if (fChar.name === 'BLADE-X') {
      // White Scarf
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(0, -40); ctx.quadraticCurveTo(-20, -45, -50 - Math.sin(time*2)*15, -30); ctx.stroke();
    }

    // Head
    const bob = Math.sin(time * 3) * 3;
    ctx.beginPath(); ctx.arc(0, -50 + bob, 18, 0, Math.PI*2); ctx.fill();
    ctx.stroke();

    // Eyes
    ctx.fillStyle = isHit ? '#000' : '#fff';
    ctx.fillRect(10, -55 + bob, 6, 6);

    // Torso
    const torsoCurve = Math.sin(time) * 5;
    ctx.beginPath(); ctx.moveTo(0, -35 + bob); 
    ctx.quadraticCurveTo(torsoCurve, -10, 0, 15);
    ctx.stroke();

    // Movement animation (Dynamic based on velocity and state)
    const isMoving = Math.abs(f.vx) > 0.1;
    const moveIntensity = Math.abs(f.vx) / CONSTANTS.MOVE_SPEED;
    const legSwing = (f.isGrounded && isMoving) ? Math.sin(time * 6) * (20 + moveIntensity * 20) : 0;
    const armSwing = (f.isGrounded && isMoving) ? Math.cos(time * 6) * (15 + moveIntensity * 15) : 0;

    // Legs
    if (f.isGrounded) {
       // Support leg and moving leg logic
       ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(-8 + legSwing, 60); ctx.stroke();
       ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(8 - legSwing, 60); ctx.stroke();
    } else {
       // Jumping/Falling pose
       const jumpPose = f.vy < 0 ? -1 : 1;
       ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(-15, 35); ctx.lineTo(-25, 45 + jumpPose * 10); ctx.stroke();
       ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(20, 35); ctx.lineTo(30, 45 - jumpPose * 10); ctx.stroke();
    }

    // Arms / Weapon Action
    if (f.state === 'ATTACK_1') {
       ctx.lineWidth = 12;
       ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(50, 5); ctx.lineTo(80, -20); ctx.stroke();
       
       ctx.strokeStyle = f.weaponColor;
       ctx.lineWidth = 6;
       
       if (fChar.weaponType === 'RANGED') {
          ctx.beginPath(); ctx.moveTo(40, 10); ctx.lineTo(90, 10); ctx.stroke();
          ctx.beginPath(); ctx.arc(90, 10, 10, -1, 1); ctx.stroke();
       } else if (fChar.weaponType === 'LONG_MELEE') {
          ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(130, -10); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(110, -20); ctx.lineTo(130, -10); ctx.lineTo(110, 0); ctx.stroke();
       } else {
          ctx.beginPath(); ctx.moveTo(70, -10); ctx.lineTo(110, -50); ctx.stroke();
       }
       
       // Kinetic Energy Trail
       ctx.strokeStyle = fChar.weaponColor + '44';
       ctx.lineWidth = 14;
       ctx.beginPath(); ctx.arc(0, -20, 110, -0.7, 0.7); ctx.stroke();
    } else if (f.state === 'BLOCK') {
       ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(30, -5); ctx.lineTo(30, -45); ctx.stroke();
       
       // NEW HALF-CIRCLE SHIELD
       ctx.save();
       ctx.scale(1/f.direction, 1); // Face forward always
       const grad = ctx.createRadialGradient(40, -25, 0, 40, -25, 55);
       grad.addColorStop(0, f.weaponColor + '11');
       grad.addColorStop(1, f.weaponColor + '66');
       ctx.fillStyle = grad;
       ctx.strokeStyle = f.weaponColor;
       ctx.lineWidth = 4;
       ctx.beginPath();
       ctx.arc(40, -25, 55, -Math.PI/2, Math.PI/2);
       ctx.lineTo(40, -25);
       ctx.closePath();
       ctx.fill();
       ctx.stroke();
       ctx.restore();
    } else if (f.state === 'DEAD') {
       ctx.rotate(1.5);
    } else {
       ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(-20 - armSwing, 15); ctx.stroke();
       ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(20 + armSwing, 15); ctx.stroke();
    }

    ctx.restore();
  };

  const render = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    if (gameState === 'FIGHTING') {
      const isCountingDown = countdown !== null && countdown > 0;
      
      updateFighter(playerRef.current, enemyRef.current, true, isCountingDown);
      updateFighter(enemyRef.current, playerRef.current, false, isCountingDown);
      
      if (!isCountingDown) {
        applyCombat(playerRef.current, enemyRef.current);
        applyCombat(enemyRef.current, playerRef.current);
        
        // Update Projectiles
        projectilesRef.current = projectilesRef.current.filter(p => {
          p.x += p.vx;
          const target = p.ownerId === 'PLAYER' ? enemyRef.current : playerRef.current;
          if (target.state === 'DEAD') return false;
          const box = { x: p.x - p.radius, y: p.y - p.radius, w: p.radius*2, h: p.radius*2 };
          if (checkCollision(box, target.hurtbox)) {
            if (target.state === 'BLOCK') {
              target.health -= 2; createHitEffect(p.x, p.y, '#fff', 5);
            } else {
              target.health -= 8; target.state = 'HIT'; createHitEffect(p.x, p.y, p.color, 12);
              target.vx = p.vx > 0 ? 10 : -10; target.vy = -3;
            }
            return false;
          }
          return p.x > 0 && p.x < CONSTANTS.CANVAS_WIDTH;
        });
      }

      // Update UI (Direct read from refs)
      setPlayerHealth(playerRef.current.health);
      setEnemyHealth(enemyRef.current.health);
      setPlayerEnergy(playerRef.current.energy);
      setEnemyEnergy(enemyRef.current.energy);
    }

    ctx.save();
    if (shakeRef.current > 0) {
      ctx.translate((Math.random()-0.5)*shakeRef.current, (Math.random()-0.5)*shakeRef.current);
      shakeRef.current *= 0.9;
    }

    ctx.clearRect(0, 0, CONSTANTS.CANVAS_WIDTH, CONSTANTS.CANVAS_HEIGHT);
    
    // Background: Gritty Dojo with Depth
    ctx.fillStyle = '#080808'; 
    ctx.fillRect(0, 0, CONSTANTS.CANVAS_WIDTH, CONSTANTS.CANVAS_HEIGHT);
    
    // Grid/Perspective lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
    for(let i=0; i<CONSTANTS.CANVAS_WIDTH; i+=100) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, CONSTANTS.CANVAS_HEIGHT); ctx.stroke();
    }

    // Floor Plate
    ctx.fillStyle = '#111';
    ctx.fillRect(0, CONSTANTS.GROUND_Y, CONSTANTS.CANVAS_WIDTH, 100);
    ctx.strokeStyle = 'rgba(34,211,238,0.2)'; 
    ctx.strokeRect(0, CONSTANTS.GROUND_Y, CONSTANTS.CANVAS_WIDTH, 2);

    drawStickman(ctx, playerRef.current);
    drawStickman(ctx, enemyRef.current);

    // Draw Projectiles
    projectilesRef.current.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 10; ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Dynamic Particles
    particlesRef.current = particlesRef.current.filter(p => {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95;
      p.life -= 0.025;
      ctx.fillStyle = p.color; ctx.globalAlpha = p.life;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill();
      return p.life > 0;
    });

    ctx.globalAlpha = 1.0;
    ctx.restore();

    requestAnimationFrame(render);
  }, [gameState]);

  useEffect(() => {
    let frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [render]);

  // --- Virtual Joystick Trigger ---
  const handleJoystickStart = () => {
    joystickActiveRef.current = true;
    setIsJoystickActive(true);
  };

  return (
    <div className="relative w-full h-screen bg-[#050505] overflow-hidden flex flex-col items-center justify-center select-none touch-none">
      
      {/* HUD: Tactical Overlays */}
      <div className="absolute top-0 inset-x-0 p-6 flex justify-between z-40 pointer-events-none">
        {/* PLAYER 1 BAR */}
        <div className="w-[42%]">
          <div className="flex justify-between items-end mb-2">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 border-2 border-cyan-400 bg-cyan-900/30 flex items-center justify-center rounded-lg">
                   <LucideZap size={20} className="text-cyan-400 animate-pulse" />
                </div>
                <div>
                   <span className="text-white font-black italic tracking-tighter text-2xl block drop-shadow-[0_0_15px_rgba(34,211,238,0.6)]">{CHARACTERS[playerCharIdx].name}</span>
                   <span className="text-[10px] text-cyan-400/60 font-mono tracking-widest">{CHARACTERS[playerCharIdx].weaponType}</span>
                </div>
             </div>
             <span className="text-white/60 font-mono text-sm">{Math.ceil(playerHealth)}%</span>
          </div>
          <div className="h-4 bg-black/80 border border-white/20 rounded-full overflow-hidden backdrop-blur-xl p-0.5">
             <motion.div animate={{ width: `${playerHealth}%` }} className="h-full bg-cyan-500 rounded-full shadow-[0_0_20px_rgba(6,182,212,0.8)]" />
          </div>
          <div className="h-2 mt-1 bg-black/60 rounded-full overflow-hidden p-0.5 w-[60%]">
             <motion.div animate={{ width: `${playerEnergy}%` }} className="h-full bg-yellow-400 rounded-full shadow-[0_0_10px_yellow]" />
          </div>
        </div>
        
        {/* AI ENEMY BAR */}
        <div className="w-[42%] text-right">
          <div className="flex justify-between items-end mb-2">
             <span className="text-white/60 font-mono text-sm">{Math.ceil(enemyHealth)}%</span>
             <div className="flex items-center gap-3">
                <div>
                  <span className="text-pink-500 font-black italic tracking-tighter text-2xl block drop-shadow-[0_0_15px_rgba(236,72,153,0.6)]">{CHARACTERS[enemyCharIdx].name}</span>
                   <span className="text-[10px] text-pink-500/60 font-mono tracking-widest">{CHARACTERS[enemyCharIdx].weaponType}</span>
                </div>
                <div className="w-10 h-10 border-2 border-pink-500 bg-pink-900/30 flex items-center justify-center rounded-lg">
                   <LucideCrosshair size={20} className="text-pink-500 animate-pulse" />
                </div>
             </div>
          </div>
          <div className="h-4 bg-black/80 border border-white/20 rounded-full overflow-hidden backdrop-blur-xl p-0.5 flex justify-end">
             <motion.div animate={{ width: `${enemyHealth}%` }} className="h-full bg-pink-600 rounded-full shadow-[0_0_20px_rgba(236,72,153,0.8)]" />
          </div>
          <div className="h-2 mt-1 bg-black/60 rounded-full overflow-hidden p-0.5 w-[60%] ml-auto flex justify-end">
             <motion.div animate={{ width: `${enemyEnergy}%` }} className="h-full bg-yellow-600 rounded-full" />
          </div>
        </div>
      </div>

      {/* Arena Display Wrapper */}
      <div className="relative w-full max-w-[1024px] aspect-[16/9] shadow-[0_0_150px_rgba(0,0,0,1)] border-x border-white/5 bg-black">
        <canvas ref={canvasRef} width={CONSTANTS.CANVAS_WIDTH} height={CONSTANTS.CANVAS_HEIGHT} className="w-full h-full object-contain" />
        
        {/* Countdown Overlay */}
        <AnimatePresence>
          {countdown !== null && (
            <motion.div 
              key={countdown}
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-[60]"
            >
              <h2 className={`text-9xl font-black italic tracking-tighter ${countdown === 0 ? 'text-cyan-400' : 'text-white'} drop-shadow-[0_0_40px_rgba(255,255,255,0.5)]`}>
                {countdown === 0 ? 'FIGHT!' : countdown}
              </h2>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Combat Status Feed */}
        <AnimatePresence>
          {gameState === 'MENU' && (
             <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center z-50 text-center p-12">
                <motion.div initial={{scale:0.8, y:30}} animate={{scale:1, y:0}} className="relative">
                  <div className="absolute -inset-10 bg-cyan-500/10 blur-[100px] rounded-full animate-pulse" />
                  <h1 className="text-7xl font-black italic tracking-tighter text-white mb-4 uppercase drop-shadow-[0_0_30px_rgba(34,211,238,0.5)]">
                    MIRZA APEX BATTLE
                  </h1>
                  <p className="text-pink-500 font-bold tracking-[1em] mb-16 uppercase text-sm">
                    SHADOW SLASHER
                  </p>
                </motion.div>
                
                <div className="flex flex-col gap-6 w-full max-w-sm">
                   <button 
                    onClick={() => setGameState('CHAR_SELECT')} 
                    className="group relative px-12 py-5 bg-white text-black font-black uppercase tracking-widest hover:bg-cyan-400 transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                  >
                     PLAY SIMULATION
                  </button>
                  <button 
                    onClick={() => setShowInstructions(true)}
                    className="px-12 py-5 border border-white/10 text-white/40 font-black uppercase tracking-widest text-xs hover:text-white transition-all"
                  >
                    HOW TO PLAY
                  </button>
                </div>

                {showInstructions && (
                  <motion.div initial={{opacity:0, scale:0.9}} animate={{opacity:1, scale:1}} className="absolute inset-0 bg-black/95 z-[60] flex flex-col items-center justify-center p-10">
                    <h2 className="text-4xl font-black italic text-cyan-400 mb-8 tracking-widest">DRIVE PROTOCOL</h2>
                    <div className="grid grid-cols-2 gap-12 text-left mb-12 max-w-xl">
                      <div className="space-y-4">
                        <h3 className="text-pink-500 font-bold text-xs tracking-widest uppercase border-b border-pink-500/20 pb-2">Keyboard</h3>
                        <div className="text-white/60 font-mono text-[10px] space-y-2">
                          <p>[ WASD ] - MOVEMENT / JUMP</p>
                          <p>[ J ] - PRIMARY STRIKE</p>
                          <p>[ K ] - DEFENSIVE GUARD</p>
                          <p>[ L ] - ULTIMATE (50% ENERGY)</p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h3 className="text-cyan-500 font-bold text-xs tracking-widest uppercase border-b border-cyan-500/20 pb-2">Mobile</h3>
                        <div className="text-white/60 font-mono text-[10px] space-y-2">
                          <p>JOYSTICK - ANALOG DRIVE</p>
                          <p>PINK BUTTON - STRIKE</p>
                          <p>SHIELD - BLOCK</p>
                          <p>YELLOW BUTTON - ULTIMATE</p>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setShowInstructions(false)}
                      className="px-10 py-4 bg-cyan-500 text-black font-black uppercase text-xs tracking-widest hover:bg-white transition-all"
                    >
                      RETURN TO TERMINAL
                    </button>
                  </motion.div>
                )}
             </motion.div>
          )}

          {gameState === 'CHAR_SELECT' && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/95 backdrop-blur-3xl z-50 p-12 flex flex-col items-center">
               <h2 className="text-4xl font-black italic text-white mb-10 tracking-widest text-center">SELECT YOUR UNIT</h2>
               
               <div className="grid grid-cols-5 gap-6 w-full max-w-5xl mb-12">
                  {CHARACTERS.map((char, i) => (
                    <motion.button 
                      key={char.name}
                      whileHover={{ scale: 1.05, y: -5 }}
                      onClick={() => setPlayerCharIdx(i)}
                      className={`relative aspect-[3/4] border-2 transition-all p-4 flex flex-col justify-end text-left overflow-hidden rounded-xl cursor-pointer pointer-events-auto ${playerCharIdx === i ? 'border-cyan-400 bg-cyan-400/20 shadow-[0_0_40px_rgba(34,211,238,0.4)] scale-105' : 'border-white/10 bg-white/5 opacity-50 hover:opacity-100'}`}
                    >
                      <div className="absolute top-4 right-4 text-[8px] font-mono opacity-40">{i+1}</div>
                      <div className="relative z-10">
                        <div className="text-xs font-mono opacity-60 mb-1">{char.weaponType}</div>
                        <div className="text-xl font-black italic tracking-tighter text-white" style={{ color: playerCharIdx === i ? char.color : 'white' }}>{char.name}</div>
                      </div>
                      <div className="absolute -bottom-10 -right-10 w-32 h-32 blur-3xl opacity-20" style={{ backgroundColor: char.color }} />
                    </motion.button>
                  ))}
               </div>

               <div className="flex gap-8 items-center">
                  <div className="text-right">
                    <div className="text-[10px] text-white/30 uppercase tracking-[0.3em]">Ready for combat</div>
                    <div className="text-2xl font-black text-cyan-400 italic uppercase italic tracking-tighter">{CHARACTERS[playerCharIdx].name}</div>
                  </div>
                  <button 
                    onClick={startGame}
                    className="px-20 py-6 bg-cyan-500 text-black font-black uppercase tracking-widest shadow-[0_0_40px_rgba(6,182,212,0.4)] hover:scale-105 active:scale-95 transition-all"
                  >
                    INITIATE LINK
                  </button>
               </div>
            </motion.div>
          )}

          {gameState === 'GAMEOVER' && (
             <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center z-50 text-center p-12">
                <motion.div initial={{scale:0.9, y:30}} animate={{scale:1, y:0}}>
                  <h1 className="text-7xl font-black italic tracking-tighter text-white mb-4 uppercase drop-shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                    {winner}
                  </h1>
                  <p className="text-cyan-400 font-bold tracking-[0.8em] mb-16 uppercase text-sm opacity-80">
                    Simulation Terminated
                  </p>
                </motion.div>
                
                <div className="flex gap-6">
                  <button 
                    onClick={resetGame} 
                    className="px-12 py-6 bg-white text-black font-black uppercase tracking-widest hover:bg-cyan-400 transition-all active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                  >
                    MAIN MENU
                  </button>
                  <button 
                    onClick={() => { resetGame(); setGameState('CHAR_SELECT'); }}
                    className="px-12 py-6 border border-white text-white font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all active:scale-95"
                  >
                    CHANGE UNIT
                  </button>
                </div>
             </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* MOBILE CONTROL RIG */}
      <div className="fixed bottom-0 inset-x-0 h-[38%] p-10 flex justify-between items-end pointer-events-none z-50">
        
        {/* ANALOG MODULE */}
        <div className="flex flex-col items-center gap-4">
          <div 
            ref={joystickBaseRef}
            className="w-40 h-40 bg-white/5 border-4 border-white/10 rounded-full relative pointer-events-auto flex items-center justify-center shadow-inner backdrop-blur-lg"
            onMouseDown={handleJoystickStart}
            onTouchStart={handleJoystickStart}
          >
            <motion.div 
              animate={{ x: joystickUI.x, y: joystickUI.y }}
              transition={{ type: 'spring', damping: 15, stiffness: 200 }}
              className={`w-20 h-20 rounded-full border-4 ${isJoystickActive ? 'border-cyan-400 bg-cyan-400/20' : 'border-white/20 bg-white/5'} shadow-2xl flex items-center justify-center transition-colors`}
            >
              <div className="w-2 h-2 bg-white/40 rounded-full" />
            </motion.div>
            
            {/* Guide markers */}
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <div className="absolute top-1/2 left-4 right-4 h-px bg-white" />
              <div className="absolute left-1/2 top-4 bottom-4 w-px bg-white" />
            </div>
          </div>
          <span className="text-[10px] text-white/20 font-bold uppercase tracking-widest font-mono">D-PAD MODULE</span>
        </div>

        {/* COMBAT MATRIX */}
        <div className="flex items-end gap-10 pointer-events-auto pb-6">
           <div className="flex flex-col gap-6">
              <button 
                onMouseDown={() => triggerMobileAction('BLOCK')}
                onTouchStart={() => triggerMobileAction('BLOCK')}
                className="w-24 h-24 bg-black/40 border-2 border-white/20 rounded-3xl backdrop-blur-2xl flex flex-col items-center justify-center text-white active:bg-cyan-500 active:text-black transition-all shadow-xl hover:border-cyan-400/50 group"
              >
                <LucideShield size={32} className="group-active:scale-110 transition-transform" />
                <span className="text-[8px] mt-2 opacity-40 font-black tracking-tighter">GUARD</span>
              </button>
              
              <button 
                onMouseDown={() => triggerMobileAction('JUMP')}
                onTouchStart={() => triggerMobileAction('JUMP')}
                className="w-24 h-24 bg-black/40 border-2 border-white/20 rounded-3xl backdrop-blur-2xl flex flex-col items-center justify-center text-white active:bg-cyan-500 active:text-black transition-all shadow-xl hover:border-cyan-400/50 group"
              >
                <LucideArrowUp size={32} className="group-active:scale-110 transition-transform" />
                <span className="text-[8px] mt-2 opacity-40 font-black tracking-tighter">JUMP</span>
              </button>
           </div>

           <div className="flex flex-col items-center gap-4">
             <button 
                onMouseDown={() => triggerMobileAction('SPECIAL')}
                onTouchStart={() => triggerMobileAction('SPECIAL')}
                disabled={playerEnergy < 50}
                className={`w-28 h-12 rounded-full border-2 border-white/20 flex items-center justify-center font-black italic tracking-widest text-xs transition-all shadow-lg ${playerEnergy >= 50 ? 'bg-yellow-500 text-black animate-pulse' : 'bg-black/40 text-white/20 grayscale'}`}
              >
                ULTIMATE
              </button>

              <button 
                onMouseDown={() => triggerMobileAction('ATTACK')}
                onTouchStart={() => triggerMobileAction('ATTACK')}
                className="w-40 h-40 bg-pink-600 border-4 border-white/80 rounded-full flex flex-col items-center justify-center text-white shadow-[0_0_80px_rgba(236,72,153,0.5)] active:scale-90 active:bg-white active:text-pink-600 transition-all border-b-8 border-b-pink-900 group"
              >
                <LucideSword size={56} className="drop-shadow-lg group-active:rotate-12 transition-transform" />
                <span className="text-xs font-black tracking-[0.3em] mt-3 uppercase">Strike</span>
              </button>
           </div>
        </div>

      </div>

      {/* Decorative Gritty Borders */}
      <div className="fixed top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
      <div className="fixed bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-pink-500/20 to-transparent" />

    </div>
  );
}
