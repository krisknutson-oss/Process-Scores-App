import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Sparkles, X, Move } from 'lucide-react';

interface MovableMascotProps {
  onInteract?: () => void;
}

export function MovableMascot({ onInteract }: MovableMascotProps) {
  // Start near bottom right
  const [pos, setPos] = useState({ x: 40, y: 120 });
  const [step, setStep] = useState(24);
  const [isMinimized, setIsMinimized] = useState(false);
  const [facing, setFacing] = useState<'left' | 'right'>('right');
  const [isMoving, setIsMoving] = useState(false);
  const [speech, setSpeech] = useState<string>('Use arrow keys to move me!');
  const moveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle keyboard arrow controls
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't intercept arrow keys if user is typing inside an input or textarea
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      let dx = 0;
      let dy = 0;
      let newFacing = facing;

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        dx = -step;
        newFacing = 'left';
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        dx = step;
        newFacing = 'right';
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        dy = -step;
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        dy = step;
      } else {
        return;
      }

      // Prevent default page scroll if arrow keys are used for mascot
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
      }

      setFacing(newFacing);
      setIsMoving(true);
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
      moveTimerRef.current = setTimeout(() => setIsMoving(false), 200);

      setPos((prev) => {
        const maxX = Math.max(10, window.innerWidth - 140);
        const maxY = Math.max(10, window.innerHeight - 140);
        const nextX = Math.min(Math.max(10, prev.x + dx), maxX);
        const nextY = Math.min(Math.max(10, prev.y + dy), maxY);
        return { x: nextX, y: nextY };
      });

      const speechTips = [
        'Checking daily learning skills!',
        '4 = Exceeding, 3 = Consistent, 2 = Developing, 1 = Support',
        'Firestore automatically saves all scores!',
        'Great job keeping students accountable!'
      ];
      setSpeech(speechTips[Math.floor(Math.random() * speechTips.length)]);
    },
    [step, facing]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
    };
  }, [handleKeyDown]);

  const moveManual = (dx: number, dy: number, dir?: 'left' | 'right') => {
    if (dir) setFacing(dir);
    setIsMoving(true);
    if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
    moveTimerRef.current = setTimeout(() => setIsMoving(false), 200);

    setPos((prev) => {
      const maxX = Math.max(10, window.innerWidth - 140);
      const maxY = Math.max(10, window.innerHeight - 140);
      return {
        x: Math.min(Math.max(10, prev.x + dx), maxX),
        y: Math.min(Math.max(10, prev.y + dy), maxY)
      };
    });
  };

  if (isMinimized) {
    return (
      <button
        id="reopenMascotBtn"
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-20 right-4 z-40 bg-[#18191B] hover:bg-[#1F6F6B] text-white p-3 rounded-xl border-2 border-[#18191B] bold-shadow transition-all flex items-center gap-2 text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95"
        title="Open Mascot Companion"
      >
        <Sparkles className="w-4 h-4 text-[#5EEAD4]" />
        <span>Companion</span>
      </button>
    );
  }

  return (
    <div
      id="movableMascotContainer"
      className="fixed z-40 select-none transition-transform duration-75 ease-out"
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`
      }}
    >
      {/* Speech bubble */}
      <div className="relative mb-2">
        <div className="bg-white border-2 border-[#18191B] rounded-xl px-3.5 py-2 bold-shadow text-xs text-[#18191B] max-w-[210px] flex items-center justify-between gap-1.5 animate-fade-in">
          <span className="font-black truncate text-[11px]">{speech}</span>
          <button
            id="minimizeMascotBtn"
            onClick={() => setIsMinimized(true)}
            className="text-[#5C626A] hover:text-[#18191B] p-0.5 rounded cursor-pointer font-bold"
            title="Minimize"
          >
            <X className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
        </div>
        {/* Bubble pointer */}
        <div className="w-3 h-3 bg-white border-b-2 border-r-2 border-[#18191B] transform rotate-45 mx-auto -mt-2" />
      </div>

      {/* Mascot Graphic / Character */}
      <div
        className={`relative w-20 h-20 rounded-2xl bg-white border-2 border-[#18191B] bold-shadow p-1.5 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing transition-transform ${
          isMoving ? 'scale-110 -rotate-3' : 'scale-100'
        } ${facing === 'left' ? '-scale-x-100' : 'scale-x-100'}`}
        onClick={onInteract}
      >
        {/* Mascot SVG Character: Wisdom Owl / Process Checker Mascot */}
        <svg
          viewBox="0 0 64 64"
          className="w-full h-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Body */}
          <circle cx="32" cy="34" r="24" fill="#E8F2F0" stroke="#18191B" strokeWidth="2.5" />
          {/* Belly */}
          <ellipse cx="32" cy="38" rx="15" ry="16" fill="#FFFFFF" stroke="#18191B" strokeWidth="1.5" />
          {/* Eyes */}
          <circle cx="23" cy="28" r="7" fill="#FFFFFF" stroke="#18191B" strokeWidth="2" />
          <circle cx="41" cy="28" r="7" fill="#FFFFFF" stroke="#18191B" strokeWidth="2" />
          {/* Pupils */}
          <circle cx="24" cy="28" r="3.5" fill="#18191B" />
          <circle cx="40" cy="28" r="3.5" fill="#18191B" />
          <circle cx="22" cy="26" r="1.2" fill="#FFFFFF" />
          <circle cx="38" cy="26" r="1.2" fill="#FFFFFF" />
          {/* Beak */}
          <polygon points="32,32 27,38 37,38" fill="#D94826" stroke="#18191B" strokeWidth="1.5" />
          {/* Graduation / Scholar Cap */}
          <polygon points="32,8 54,15 32,22 10,15" fill="#18191B" stroke="#18191B" strokeWidth="1.5" />
          <path d="M20 18v8c0 4 5 7 12 7s12-3 12-7v-8" stroke="#18191B" strokeWidth="2" fill="#18191B" />
          <circle cx="32" cy="15" r="2" fill="#D94826" />
          <path d="M32 15l14 8v5" stroke="#D94826" strokeWidth="2" strokeLinecap="round" />
          {/* Feet */}
          <circle cx="26" cy="56" r="3" fill="#D94826" stroke="#18191B" strokeWidth="1.5" />
          <circle cx="38" cy="56" r="3" fill="#D94826" stroke="#18191B" strokeWidth="1.5" />
        </svg>

        {/* Floating badge */}
        <span className="absolute -bottom-2.5 bg-[#18191B] text-white text-[9px] font-mono-jb font-black px-2 py-0.5 rounded-md border-2 border-white bold-shadow-sm">
          CHECKER
        </span>
      </div>

      {/* Directional Pad Controls */}
      <div className="mt-3 bg-white border-2 border-[#18191B] rounded-xl p-1.5 bold-shadow flex flex-col items-center gap-1 w-24 mx-auto">
        <button
          id="mascotMoveUpBtn"
          onClick={() => moveManual(0, -step)}
          className="p-1.5 rounded-md bg-[#F6F5F0] hover:bg-[#18191B] hover:text-white text-[#18191B] border border-[#18191B] transition active:scale-95 cursor-pointer"
          title="Move Up (Arrow Up)"
        >
          <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
        <div className="flex items-center gap-1.5">
          <button
            id="mascotMoveLeftBtn"
            onClick={() => moveManual(-step, 0, 'left')}
            className="p-1.5 rounded-md bg-[#F6F5F0] hover:bg-[#18191B] hover:text-white text-[#18191B] border border-[#18191B] transition active:scale-95 cursor-pointer"
            title="Move Left (Arrow Left)"
          >
            <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
          <div className="text-[9px] font-mono-jb text-[#18191B] font-black flex items-center justify-center">
            <Move className="w-3 h-3 text-[#1F6F6B] stroke-[2.5]" />
          </div>
          <button
            id="mascotMoveRightBtn"
            onClick={() => moveManual(step, 0, 'right')}
            className="p-1.5 rounded-md bg-[#F6F5F0] hover:bg-[#18191B] hover:text-white text-[#18191B] border border-[#18191B] transition active:scale-95 cursor-pointer"
            title="Move Right (Arrow Right)"
          >
            <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
        </div>
        <button
          id="mascotMoveDownBtn"
          onClick={() => moveManual(0, step)}
          className="p-1.5 rounded-md bg-[#F6F5F0] hover:bg-[#18191B] hover:text-white text-[#18191B] border border-[#18191B] transition active:scale-95 cursor-pointer"
          title="Move Down (Arrow Down)"
        >
          <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
}
