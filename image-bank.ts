import { CharacterPreset, PresetType } from './types';

// Procedurally generate high-quality SVG characters to guarantee immediate offline availability and sharp resolution
export function createHumanSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 480" width="300" height="480">
    <defs>
      <linearGradient id="skin" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fed7aa" />
        <stop offset="100%" stop-color="#fba471" />
      </linearGradient>
      <linearGradient id="armor" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38bdf8" />
        <stop offset="100%" stop-color="#0284c7" />
      </linearGradient>
      <linearGradient id="darkPlate" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#334155" />
        <stop offset="100%" stop-color="#0f172a" />
      </linearGradient>
      <linearGradient id="hair" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#eab308" />
        <stop offset="100%" stop-color="#ca8a04" />
      </linearGradient>
      <linearGradient id="pants" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#475569" />
        <stop offset="100%" stop-color="#1e293b" />
      </linearGradient>
    </defs>
    <!-- Shadow -->
    <ellipse cx="150" cy="460" rx="75" ry="12" fill="#090d16" opacity="0.4" />
    
    <!-- Left Leg (back) -->
    <g id="left_leg">
      <path d="M 125 240 Q 115 310 118 360 L 138 360 Q 138 310 145 240 Z" fill="url(#pants)" />
      <!-- Left Shin & Boot -->
      <path d="M 116 350 L 114 430 Q 110 445 95 448 L 136 448 Q 140 435 138 350 Z" fill="url(#darkPlate)" stroke="#0284c7" stroke-width="2" />
    </g>

    <!-- Right Leg (front) -->
    <g id="right_leg">
      <path d="M 155 240 Q 165 310 162 360 L 182 360 Q 185 310 175 240 Z" fill="url(#pants)" />
      <!-- Right Shin & Boot -->
      <path d="M 160 350 L 162 430 Q 160 445 150 448 L 195 448 Q 192 430 184 350 Z" fill="url(#darkPlate)" stroke="#0284c7" stroke-width="2" />
    </g>

    <!-- Pelvis / Belt -->
    <path d="M 115 220 L 185 220 L 175 255 L 125 255 Z" fill="url(#darkPlate)" stroke="#eab308" stroke-width="3" />
    <circle cx="150" cy="237" r="7" fill="#eab308" stroke="#ca8a04" stroke-width="2" />

    <!-- Left Arm (back) -->
    <g id="left_arm">
      <!-- Upper Arm -->
      <path d="M 105 130 Q 75 170 80 205 L 100 205 Q 98 170 120 135 Z" fill="url(#skin)" />
      <!-- Forearm & Hand -->
      <path d="M 80 200 Q 65 245 70 270 Q 75 285 85 285 Q 95 285 95 270 L 100 200 Z" fill="url(#skin)" />
      <rect x="75" y="195" width="26" height="20" rx="5" fill="url(#darkPlate)" stroke="#38bdf8" stroke-width="1.5" />
    </g>

    <!-- Torso & Chest Armor -->
    <g id="torso">
      <path d="M 110 120 Q 150 115 190 120 L 175 225 Q 150 230 125 225 Z" fill="url(#armor)" stroke="#0f172a" stroke-width="3" />
      <path d="M 125 135 L 150 175 L 175 135 Z" fill="#e0f2fe" opacity="0.6" />
      <path d="M 125 180 L 150 215 L 175 180 Z" fill="#0284c7" opacity="0.8" />
    </g>

    <!-- Right Arm (front) -->
    <g id="right_arm">
      <!-- Shoulder Pauldron -->
      <ellipse cx="190" cy="130" rx="18" ry="14" fill="url(#darkPlate)" stroke="#38bdf8" stroke-width="2.5" />
      <!-- Upper Arm -->
      <path d="M 185 135 Q 215 170 210 210 L 190 210 Q 192 170 175 135 Z" fill="url(#skin)" />
      <!-- Forearm & Hand -->
      <path d="M 210 205 Q 225 245 225 275 Q 220 288 208 288 Q 198 285 195 270 L 190 205 Z" fill="url(#skin)" />
      <rect x="190" y="200" width="24" height="20" rx="5" fill="url(#darkPlate)" stroke="#38bdf8" stroke-width="1.5" />
    </g>

    <!-- Neck -->
    <rect x="140" y="95" width="20" height="25" fill="url(#skin)" />

    <!-- Head -->
    <g id="head">
      <!-- Hair back -->
      <ellipse cx="150" cy="70" rx="38" ry="42" fill="url(#hair)" />
      <!-- Face -->
      <path d="M 122 65 Q 122 105 150 110 Q 178 105 178 65 Q 178 40 150 40 Q 122 40 122 65 Z" fill="url(#skin)" stroke="#ea580c" stroke-width="1" />
      <!-- Eyes -->
      <ellipse cx="138" cy="75" rx="4.5" ry="5" fill="#0f172a" />
      <ellipse cx="162" cy="75" rx="4.5" ry="5" fill="#0f172a" />
      <circle cx="140" cy="73" r="1.5" fill="#ffffff" />
      <circle cx="164" cy="73" r="1.5" fill="#ffffff" />
      <!-- Eyebrows -->
      <path d="M 132 66 Q 140 64 146 67" stroke="#854d0e" stroke-width="2.5" fill="none" stroke-linecap="round" />
      <path d="M 154 67 Q 160 64 168 66" stroke="#854d0e" stroke-width="2.5" fill="none" stroke-linecap="round" />
      <!-- Smile -->
      <path d="M 143 92 Q 150 97 157 92" stroke="#c2410c" stroke-width="2" fill="none" stroke-linecap="round" />
      <!-- Hair Front Bangs -->
      <path d="M 116 55 Q 130 65 140 50 Q 155 70 170 52 Q 185 62 184 45 Q 170 25 150 25 Q 130 25 116 55 Z" fill="url(#hair)" />
      <!-- Knight Circlet / Headband -->
      <path d="M 120 54 Q 150 48 180 54" stroke="#eab308" stroke-width="4" fill="none" />
      <circle cx="150" cy="51" r="4.5" fill="#38bdf8" />
    </g>
  </svg>`;
}

function createBipedSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450" width="300" height="450">
    <defs>
      <linearGradient id="robotBody" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#10b981" />
        <stop offset="100%" stop-color="#047857" />
      </linearGradient>
      <linearGradient id="robotDark" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e293b" />
        <stop offset="100%" stop-color="#0f172a" />
      </linearGradient>
      <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#34d399" />
        <stop offset="100%" stop-color="#065f46" />
      </linearGradient>
    </defs>
    <!-- Shadow -->
    <ellipse cx="150" cy="430" rx="80" ry="12" fill="#042f2e" opacity="0.4" />
    
    <!-- Left Leg -->
    <g id="biped_left_leg">
      <rect x="110" y="240" width="24" height="80" rx="10" fill="url(#robotDark)" stroke="#10b981" stroke-width="2" />
      <rect x="105" y="320" width="28" height="90" rx="12" fill="url(#robotBody)" />
      <path d="M 95 405 L 140 405 L 135 425 L 85 425 Z" fill="url(#robotDark)" />
    </g>

    <!-- Right Leg -->
    <g id="biped_right_leg">
      <rect x="165" y="240" width="24" height="80" rx="10" fill="url(#robotDark)" stroke="#10b981" stroke-width="2" />
      <rect x="165" y="320" width="28" height="90" rx="12" fill="url(#robotBody)" />
      <path d="M 155 405 L 200 405 L 210 425 L 150 425 Z" fill="url(#robotDark)" />
    </g>

    <!-- Pelvis -->
    <rect x="115" y="210" width="70" height="40" rx="15" fill="url(#robotDark)" stroke="#10b981" stroke-width="2" />

    <!-- Left Arm -->
    <g id="biped_left_arm">
      <circle cx="85" cy="140" r="14" fill="url(#robotDark)" stroke="#10b981" stroke-width="2" />
      <rect x="75" y="145" width="20" height="70" rx="8" fill="url(#robotBody)" />
      <circle cx="85" cy="225" r="12" fill="url(#robotDark)" />
      <rect x="75" y="230" width="20" height="60" rx="8" fill="url(#robotBody)" />
      <circle cx="85" cy="300" r="14" fill="url(#glow)" />
    </g>

    <!-- Torso -->
    <rect x="100" y="115" width="100" height="105" rx="24" fill="url(#robotBody)" stroke="#047857" stroke-width="4" />
    <!-- Core reactor -->
    <circle cx="150" cy="165" r="22" fill="#ecfdf5" stroke="#10b981" stroke-width="4" />
    <circle cx="150" cy="165" r="12" fill="#34d399" />

    <!-- Right Arm -->
    <g id="biped_right_arm">
      <circle cx="215" cy="140" r="14" fill="url(#robotDark)" stroke="#10b981" stroke-width="2" />
      <rect x="205" y="145" width="20" height="70" rx="8" fill="url(#robotBody)" />
      <circle cx="215" cy="225" r="12" fill="url(#robotDark)" />
      <rect x="205" y="230" width="20" height="60" rx="8" fill="url(#robotBody)" />
      <circle cx="215" cy="300" r="14" fill="url(#glow)" />
    </g>

    <!-- Head -->
    <g id="biped_head">
      <rect x="135" y="90" width="30" height="30" fill="url(#robotDark)" />
      <!-- Head Box -->
      <rect x="105" y="25" width="90" height="75" rx="20" fill="url(#robotBody)" stroke="#047857" stroke-width="3" />
      <!-- Visor -->
      <rect x="115" y="45" width="70" height="30" rx="10" fill="#0f172a" />
      <line x1="125" y1="60" x2="175" y2="60" stroke="#34d399" stroke-width="5" stroke-linecap="round" />
      <!-- Antenna -->
      <line x1="150" y1="25" x2="150" y2="8" stroke="#047857" stroke-width="4" />
      <circle cx="150" cy="8" r="7" fill="#fbbf24" stroke="#d97706" stroke-width="2" />
    </g>
  </svg>`;
}

function createQuadrupedSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 320" width="460" height="320">
    <defs>
      <linearGradient id="fur" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f97316" />
        <stop offset="100%" stop-color="#c2410c" />
      </linearGradient>
      <linearGradient id="belly" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#fff7ed" />
        <stop offset="100%" stop-color="#ffedd5" />
      </linearGradient>
      <linearGradient id="paws" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#431407" />
        <stop offset="100%" stop-color="#1c1917" />
      </linearGradient>
    </defs>
    <!-- Shadow -->
    <ellipse cx="230" cy="300" rx="140" ry="14" fill="#0f172a" opacity="0.35" />

    <!-- Tail -->
    <path d="M 80 160 Q 30 140 25 80 Q 55 110 90 140 Z" fill="url(#fur)" stroke="#9a3412" stroke-width="2" />
    <path d="M 25 80 Q 40 100 50 105 L 35 115 Z" fill="#ffffff" />

    <!-- Back Left Leg -->
    <g id="quad_back_left">
      <path d="M 120 160 Q 95 210 105 250 L 95 295 L 120 295 L 125 245 Q 135 210 140 165 Z" fill="#ea580c" opacity="0.85" />
    </g>

    <!-- Front Left Leg -->
    <g id="quad_front_left">
      <path d="M 290 160 Q 285 220 280 255 L 275 295 L 295 295 L 305 255 Q 310 215 315 165 Z" fill="#ea580c" opacity="0.85" />
    </g>

    <!-- Main Torso -->
    <path d="M 100 150 Q 200 120 310 140 Q 330 180 300 215 Q 200 230 110 200 Q 85 175 100 150 Z" fill="url(#fur)" stroke="#9a3412" stroke-width="3" />
    <!-- Chest / Belly fur -->
    <path d="M 130 185 Q 200 220 290 195 Q 260 170 200 165 Q 150 170 130 185 Z" fill="url(#belly)" />

    <!-- Back Right Leg (Foreground) -->
    <g id="quad_back_right">
      <path d="M 135 155 Q 110 210 120 250 L 115 295 L 140 295 L 145 245 Q 160 205 165 165 Z" fill="url(#fur)" stroke="#7c2d12" stroke-width="2" />
      <ellipse cx="127" cy="295" rx="14" ry="7" fill="url(#paws)" />
    </g>

    <!-- Front Right Leg (Foreground) -->
    <g id="quad_front_right">
      <path d="M 315 155 Q 315 215 310 250 L 305 295 L 325 295 L 335 250 Q 345 205 340 155 Z" fill="url(#fur)" stroke="#7c2d12" stroke-width="2" />
      <ellipse cx="317" cy="295" rx="13" ry="7" fill="url(#paws)" />
    </g>

    <!-- Neck & Head -->
    <g id="quad_head">
      <path d="M 285 145 Q 330 110 360 90 L 385 125 Q 340 160 305 170 Z" fill="url(#fur)" />
      <!-- Ears -->
      <polygon points="360,75 385,25 395,70" fill="url(#fur)" stroke="#7c2d12" stroke-width="2" />
      <polygon points="367,70 385,38 390,68" fill="#ffedd5" />
      <polygon points="340,85 355,38 370,80" fill="#c2410c" />
      <!-- Head core -->
      <ellipse cx="380" cy="100" rx="35" ry="28" fill="url(#fur)" />
      <!-- Snout & Nose -->
      <path d="M 395 95 L 440 112 Q 435 125 410 125 L 390 120 Z" fill="#ffedd5" stroke="#9a3412" stroke-width="1.5" />
      <circle cx="440" cy="112" r="5" fill="#1c1917" />
      <!-- Eye -->
      <ellipse cx="378" cy="92" rx="6" ry="7" fill="#1c1917" />
      <circle cx="380" cy="90" r="2" fill="#ffffff" />
    </g>
  </svg>`;
}

function createFishSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 260" width="450" height="260">
    <defs>
      <linearGradient id="fishBody" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#06b6d4" />
        <stop offset="50%" stop-color="#3b82f6" />
        <stop offset="100%" stop-color="#8b5cf6" />
      </linearGradient>
      <linearGradient id="finGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f43f5e" />
        <stop offset="100%" stop-color="#fb7185" />
      </linearGradient>
    </defs>
    <!-- Tail Fin -->
    <g id="fish_tail">
      <path d="M 120 130 Q 30 50 15 30 Q 50 120 20 130 Q 50 140 15 230 Q 30 210 120 130 Z" fill="url(#finGrad)" opacity="0.9" stroke="#fda4af" stroke-width="2" />
    </g>

    <!-- Dorsal Fin (Top) -->
    <path d="M 180 85 Q 220 20 290 35 Q 260 70 240 80 Z" fill="url(#finGrad)" opacity="0.85" />

    <!-- Ventral Fin (Bottom) -->
    <path d="M 210 170 Q 230 230 270 210 Q 255 180 245 170 Z" fill="url(#finGrad)" opacity="0.8" />

    <!-- Main Fish Body -->
    <path d="M 110 130 Q 180 60 330 85 Q 410 130 350 175 Q 180 200 110 130 Z" fill="url(#fishBody)" stroke="#0e7490" stroke-width="3" />

    <!-- Fish Scales pattern -->
    <g stroke="rgba(255, 255, 255, 0.25)" stroke-width="2" fill="none">
      <path d="M 200 100 Q 215 115 200 130" />
      <path d="M 220 110 Q 235 125 220 140" />
      <path d="M 240 100 Q 255 115 240 130" />
      <path d="M 260 110 Q 275 125 260 140" />
      <path d="M 280 100 Q 295 115 280 130" />
    </g>

    <!-- Pectoral Fin (Side) -->
    <path d="M 280 140 Q 230 170 210 200 Q 245 190 285 155 Z" fill="url(#finGrad)" stroke="#ffffff" stroke-width="1.5" />

    <!-- Eye -->
    <circle cx="345" cy="115" r="14" fill="#ffffff" stroke="#0891b2" stroke-width="2" />
    <circle cx="348" cy="115" r="7" fill="#0f172a" />
    <circle cx="351" cy="112" r="2.5" fill="#ffffff" />

    <!-- Mouth -->
    <path d="M 375 130 Q 365 135 375 140" stroke="#0e7490" stroke-width="3" fill="none" stroke-linecap="round" />
  </svg>`;
}

export function svgToDataUrl(svgString: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
}

export const DEFAULT_ARTWORK_URL = svgToDataUrl(createHumanSVG());

export const CHARACTER_PRESETS: CharacterPreset[] = [
  {
    id: 'human',
    name: 'Hero Adventurer',
    type: 'human',
    description: 'Humanoid character with head, torso, 2 arms, 2 legs, boots and armor.',
    imageUrl: svgToDataUrl(createHumanSVG()),
  },
  {
    id: 'biped',
    name: 'Mech Biped',
    type: 'biped',
    description: 'Stylized 2-legged robot with limb joints and energy core.',
    imageUrl: svgToDataUrl(createBipedSVG()),
  },
  {
    id: 'quadruped',
    name: 'Fox / Wolf Beast',
    type: 'quadruped',
    description: '4-legged animal with spine, front/back legs, paws, ears and tail.',
    imageUrl: svgToDataUrl(createQuadrupedSVG()),
  },
  {
    id: 'fish',
    name: 'Deep Sea Creature',
    type: 'fish',
    description: 'Aquatic creature with undulating spine, tail fin, and side fins.',
    imageUrl: svgToDataUrl(createFishSVG()),
  },
];
