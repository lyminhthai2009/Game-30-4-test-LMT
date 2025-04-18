// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const btnMoveLeft = document.getElementById('btn-move-left');
const btnMoveRight = document.getElementById('btn-move-right');
const btnAngleUp = document.getElementById('btn-angle-up');
const btnAngleDown = document.getElementById('btn-angle-down');
const btnPowerUp = document.getElementById('btn-power-up');
const btnPowerDown = document.getElementById('btn-power-down');
const btnFire = document.getElementById('btn-fire');
const powerDisplay = document.getElementById('power-display');
const levelDisplay = document.getElementById('level');
const turnDisplay = document.getElementById('turn');
const playerHealthDisplay = document.getElementById('player-health');
const enemyHealthDisplay = document.getElementById('enemy-health');
const windInfoDisplay = document.getElementById('wind-info');
const ammoSelect = document.getElementById('ammo-select');
const ammoCountDisplay = document.getElementById('ammo-count');
const btnToggleMusic = document.getElementById('btn-toggle-music');
const loadingScreen = document.getElementById('loading-screen');

// --- Game Constants ---
const canvasWidth = canvas.width;
const canvasHeight = canvas.height;
const gravity = 0.15; // Điều chỉnh trọng lực
const terrainResolution = 5; // Độ chi tiết địa hình
const maxPower = 100;
const minPower = 10;
const windChangeInterval = 6000; // ms

// --- Game State ---
let level = 1;
let currentPlayer = 'player';
let projectile = null;
let secondaryProjectiles = []; // For cluster bombs (basic handling)
let particles = [];
let tanks = [];
let walls = [];
let terrainHeights = [];
let gameOver = false;
let currentPower = 50;
let windSpeed = 0;
let windChangeTimer = 0;
let lastTime = 0;
let imagesLoaded = false;
let soundsLoaded = false;
let assetsLoaded = false; // Tổng hợp
let aiThinking = false;

// --- Ammo Data ---
const ammoTypes = {
    normal: { name: "Thường", damage: [25, 35], effect: null },
    cluster: { name: "Chùm", damage: [10, 15], count: 4, spread: 40, effect: 'cluster' },
    heavy: { name: "Nặng", damage: [40, 55], effect: 'heavy_impact', radius: 7 },
};
let playerCurrentAmmo = 'normal';
let playerAmmoCounts = { normal: Infinity, cluster: 3, heavy: 2 };
let enemyCurrentAmmo = 'normal'; // AI chỉ bắn đạn thường (cho đơn giản)

// --- Asset Variables ---
let imgTankBlue, imgTankRed, imgBarrel, imgBackground, imgExplosionSheet, imgWall, imgGround;
let audioContext;
let soundBuffers = {};
let musicSource = null;
let isMusicPlaying = false;

// --- Image Loading ---
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(`Failed to load image: ${src} - ${err}`);
        img.src = src;
    });
}

// --- Audio Loading ---
function initAudio() {
    if (!audioContext && (window.AudioContext || window.webkitAudioContext)) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            // Resume context if needed after user interaction
            if (audioContext.state === 'suspended') {
                const resumeAudio = () => {
                    audioContext.resume().then(() => {
                         console.log('AudioContext resumed successfully');
                         // Remove the event listener once resumed
                         document.removeEventListener('click', resumeAudio);
                         document.removeEventListener('touchstart', resumeAudio);
                    });
                };
                document.addEventListener('click', resumeAudio, { once: true });
                 document.addEventListener('touchstart', resumeAudio, { once: true });
            }
        } catch (e) {
            console.error("Web Audio API is not supported or failed to initialize.", e);
            return false;
        }
    } else if (!audioContext) {
         console.warn("Web Audio API not supported.");
         return false;
    }
    return true;
}

function loadAudio(url) {
    if (!audioContext) return Promise.resolve(null); // Fail silently if no context
    return fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for ${url}`);
            return response.arrayBuffer();
        })
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
        .catch(error => {
            console.error(`Error loading or decoding audio ${url}:`, error);
            return null; // Return null on error so Promise.all doesn't fail completely
        });
}

// --- Load All Assets ---
async function loadAssets() {
    loadingScreen.classList.add('visible'); // Show loading
    initAudio(); // Try to initialize audio context early

    const imagePromises = [
        loadImage('assets/images/tank_blue.png').then(img => imgTankBlue = img),
        loadImage('assets/images/tank_red.png').then(img => imgTankRed = img),
        loadImage('assets/images/barrel.png').then(img => imgBarrel = img),
        loadImage('assets/images/background.png').then(img => imgBackground = img),
        loadImage('assets/images/explosion_spritesheet.png').then(img => imgExplosionSheet = img), // Load spritesheet
        // loadImage('assets/images/wall_texture.png').then(img => imgWall = img), // Optional
        // loadImage('assets/images/ground_texture.png').then(img => imgGround = img), // Optional
    ];

    const audioPromises = audioContext ? [
        loadAudio('assets/sounds/fire.wav').then(buffer => { if(buffer) soundBuffers.fire = buffer; }),
        loadAudio('assets/sounds/explode.wav').then(buffer => { if(buffer) soundBuffers.explode = buffer; }),
        loadAudio('assets/sounds/music.mp3').then(buffer => { if(buffer) soundBuffers.music = buffer; }),
        loadAudio('assets/sounds/empty_click.wav').then(buffer => { if(buffer) soundBuffers.empty = buffer; }) // Optional
    ] : [];

    try {
        await Promise.all([...imagePromises, ...audioPromises]);
        imagesLoaded = true;
        soundsLoaded = !!audioContext && Object.keys(soundBuffers).length > 0; // Check if any sound loaded
        assetsLoaded = true;
        console.log("Assets loaded. Images:", imagesLoaded, "Sounds:", soundsLoaded);
        // Game Initialization happens after assets are loaded
        startGameLogic();
    } catch (error) {
        console.error("Failed to load some assets:", error);
        loadingScreen.textContent = "Lỗi tải tài nguyên!";
        // Handle error - maybe show a message and stop
    } finally {
         // Hide loading screen slightly delayed to avoid flash
         setTimeout(() => loadingScreen.classList.remove('visible'), 300);
    }
}
// --- Sound Playback ---
function playSound(bufferName, volume = 1.0) {
    if (!soundsLoaded || !soundBuffers[bufferName] || !audioContext || audioContext.state !== 'running') return;
    try {
        const source = audioContext.createBufferSource();
        source.buffer = soundBuffers[bufferName];
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
        source.connect(gainNode).connect(audioContext.destination);
        source.start(0);
    } catch (e) {
        console.error("Error playing sound:", bufferName, e);
    }
}

function toggleMusic() {
    if (!soundsLoaded || !soundBuffers.music || !audioContext) return;

    if (audioContext.state === 'suspended') {
         audioContext.resume().then(toggleMusic); // Try resuming then play
         return;
    }

    if (isMusicPlaying) {
        if (musicSource) {
            try { musicSource.stop(); } catch(e){} // Stop can throw if already stopped
        }
        isMusicPlaying = false;
        btnToggleMusic.textContent = "🎵 Tắt";
        btnToggleMusic.classList.remove('playing');
    } else {
        musicSource = audioContext.createBufferSource();
        musicSource.buffer = soundBuffers.music;
        musicSource.loop = true;
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(0.25, audioContext.currentTime); // Lower volume for bg music
        musicSource.connect(gainNode).connect(audioContext.destination);
        try {
             musicSource.start(0);
             isMusicPlaying = true;
             btnToggleMusic.textContent = "🎵 Bật";
             btnToggleMusic.classList.add('playing');
        } catch(e) {
             console.error("Error starting music:", e);
             isMusicPlaying = false; // Failed to start
        }
    }
}


// --- Terrain ---
function generateTerrain() {
    terrainHeights = [];
    let currentHeight = canvasHeight * (0.6 + Math.random() * 0.2); // Start lower down
    for (let x = 0; x <= canvasWidth; x += terrainResolution) {
        terrainHeights.push(currentHeight);
        let heightChange = (Math.random() - 0.48) * 12; // Favor flatter/slight rise
        currentHeight += heightChange;
        currentHeight = Math.max(canvasHeight * 0.3, Math.min(canvasHeight - 40, currentHeight));
    }
    if (terrainHeights.length * terrainResolution < canvasWidth + terrainResolution) {
         terrainHeights.push(currentHeight); // Ensure last point
    }
    smoothTerrain(2);
}

function smoothTerrain(passes) {
    if (terrainHeights.length < 3) return;
    for (let p = 0; p < passes; p++) {
        let smoothed = [terrainHeights[0]];
        for (let i = 1; i < terrainHeights.length - 1; i++) {
            smoothed.push((terrainHeights[i - 1] + terrainHeights[i] * 1.5 + terrainHeights[i + 1]) / 3.5); // Weighted smooth
        }
        smoothed.push(terrainHeights[terrainHeights.length - 1]);
        terrainHeights = smoothed;
    }
}

function getTerrainHeightAt(x) {
    if (x < 0 || x > canvasWidth || terrainHeights.length === 0) return canvasHeight;
    const index = Math.max(0, Math.min(terrainHeights.length - 2, Math.floor(x / terrainResolution))); // Clamp index
    const x1 = index * terrainResolution;
    const y1 = terrainHeights[index];
    const x2 = (index + 1) * terrainResolution;
    const y2 = terrainHeights[index + 1];
    const t = Math.max(0, Math.min(1, (x - x1) / (x2 - x1))); // Clamp t [0, 1]
    return y1 + (y2 - y1) * t;
}

function modifyTerrain(impactX, radius, depth) {
     if (terrainHeights.length === 0) return;
    console.log(`Modifying terrain at ${impactX.toFixed(0)} r=${radius} d=${depth}`);
    const startIndex = Math.max(0, Math.floor((impactX - radius) / terrainResolution));
    const endIndex = Math.min(terrainHeights.length - 1, Math.ceil((impactX + radius) / terrainResolution));

    for (let i = startIndex; i <= endIndex; i++) {
        const currentX = i * terrainResolution;
        const distFromImpact = Math.abs(currentX - impactX);
        if (distFromImpact < radius) {
            // Cosine-based crater shape for smoother edges
            const craterDepthFactor = (Math.cos((distFromImpact / radius) * Math.PI) + 1) / 2; // 1 at center, 0 at edge
            terrainHeights[i] += depth * craterDepthFactor;
            terrainHeights[i] = Math.min(canvasHeight + 50, terrainHeights[i]); // Allow digging slightly below view
        }
    }
    // smoothTerrain(1); // Optionally smooth again after modification
}


// --- Classes ---
class Tank {
    constructor(x, color, facingRight = true, isPlayer = false) {
        this.baseX = x; // Store initial X for reset if needed
        this.x = x;
        this.y = canvasHeight - 50; // Initial placeholder Y
        this.width = 70; // Match image size estimation
        this.height = 40;
        this.barrelPivotOffsetY = -this.height * 0.4; // Y offset for barrel pivot from tank bottom center
        this.barrelLength = 35;
        this.angle = facingRight ? 45 : 135;
        this.color = color; // Fallback color
        this.health = 100;
        this.maxHealth = 100;
        this.facingRight = facingRight;
        this.isPlayer = isPlayer;
        this.image = isPlayer ? imgTankBlue : imgTankRed;
        this.barrelImage = imgBarrel;
        this.moveSpeed = 150; // Pixels per second for movement
    }

    updatePositionOnTerrain() {
        this.y = getTerrainHeightAt(this.x);
    }

    draw() {
        if (!assetsLoaded || !this.image) return; // Don't draw if assets not ready

        const drawX = this.x - this.width / 2;
        const drawY = this.y - this.height; // Draw image with bottom at this.y

        // Draw tank body
        ctx.drawImage(this.image, drawX, drawY, this.width, this.height);

        // Draw barrel
        const angleRad = this.angle * (Math.PI / 180);
        const pivotX = this.x;
        const pivotY = this.y + this.barrelPivotOffsetY;

        ctx.save();
        ctx.translate(pivotX, pivotY);
        ctx.rotate(-angleRad); // Negative because Y is inverted in canvas

        if (this.barrelImage) {
            const barrelDrawWidth = 45;
            const barrelDrawHeight = 12;
            ctx.drawImage(this.barrelImage, 0, -barrelDrawHeight / 2, barrelDrawWidth, barrelDrawHeight);
        } else { // Fallback drawing
            ctx.fillStyle = 'grey';
            ctx.fillRect(0, -3, this.barrelLength, 6);
        }
        ctx.restore();

        this.drawHealthBar(drawY - 10); // Draw health bar above the tank image
    }

    drawHealthBar(yPos) {
        const barWidth = this.width * 0.8;
        const barHeight = 6;
        const barX = this.x - barWidth / 2;
        const healthPercent = Math.max(0, this.health / this.maxHealth);

        ctx.fillStyle = '#dc3545'; // Red background
        ctx.fillRect(barX, yPos, barWidth, barHeight);
        ctx.fillStyle = '#28a745'; // Green fill
        ctx.fillRect(barX, yPos, barWidth * healthPercent, barHeight);
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, yPos, barWidth, barHeight);
    }

    move(direction, deltaTime) { // Direction: -1 for left, 1 for right
        const moveAmount = direction * this.moveSpeed * deltaTime;
        const newX = this.x + moveAmount;
        const nextY = getTerrainHeightAt(newX);

        // Simple slope check: prevent moving up walls that are too steep
        const slope = Math.abs(nextY - this.y) / Math.abs(moveAmount || 1); // Avoid division by zero
         const maxSlope = 1.5; // Adjust allowed steepness

        // Boundary check and slope check
        if (newX > this.width / 3 && newX < canvasWidth - this.width / 3 && slope <= maxSlope) {
            this.x = newX;
            this.y = nextY; // Update Y position based on new terrain height
        }
    }


    aim(angleChange) {
        this.angle += angleChange;
        this.angle = Math.max(5, Math.min(175, this.angle)); // Clamp angle
    }

    getBarrelEnd() {
        const angleRad = this.angle * (Math.PI / 180);
        const pivotX = this.x;
        const pivotY = this.y + this.barrelPivotOffsetY;
        const endX = pivotX + this.barrelLength * Math.cos(angleRad);
        const endY = pivotY - this.barrelLength * Math.sin(angleRad); // Y is inverted
        return { x: endX, y: endY };
    }

    takeDamage(amount) {
        this.health -= amount;
        this.health = Math.max(0, this.health); // Prevent negative health
        // Update UI
        if (this.isPlayer) {
            playerHealthDisplay.textContent = this.health;
        } else {
            enemyHealthDisplay.textContent = this.health;
        }
    }
}

class Projectile {
    constructor(x, y, angle, power, ownerTank, ammoType = 'normal') {
        this.x = x;
        this.y = y;
        this.ownerTank = ownerTank;
        this.ammoType = ammoType;
        this.radius = ammoTypes[ammoType]?.radius || 5; // Use specific radius or default

        const angleRad = angle * (Math.PI / 180);
        const initialSpeed = power * 0.18; // Adjust speed factor
        this.vx = initialSpeed * Math.cos(angleRad);
        this.vy = -initialSpeed * Math.sin(angleRad); // Negative Y for up

        this.trailPoints = [{ x: this.x, y: this.y }];
        this.maxTrailLength = 20;
        this.life = 8; // Max lifespan in seconds
    }

    update(deltaTime) {
        this.life -= deltaTime;
        if (this.life <= 0) return; // Stop updating if expired

        // Physics Update
        this.vy += gravity * 10 * deltaTime; // Gravity
        this.vx += windSpeed * 60 * deltaTime; // Wind
        this.x += this.vx * 60 * deltaTime;
        this.y += this.vy * 60 * deltaTime;

        // Update Trail
        this.trailPoints.push({ x: this.x, y: this.y });
        if (this.trailPoints.length > this.maxTrailLength) {
            this.trailPoints.shift();
        }
    }

    draw() {
        if (this.life <= 0) return;

        // Draw Trail
        if (this.trailPoints.length > 1) {
            ctx.beginPath();
            ctx.moveTo(this.trailPoints[0].x, this.trailPoints[0].y);
            for (let i = 1; i < this.trailPoints.length; i++) {
                ctx.lineTo(this.trailPoints[i].x, this.trailPoints[i].y);
            }
            const alpha = Math.max(0.1, Math.min(0.6, this.life / 2)); // Fade trail slightly over life
            ctx.strokeStyle = `rgba(255, 255, 200, ${alpha})`; // Yellowish trail
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Draw Projectile
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    checkCollision() {
         if (this.life <= 0) return { collided: true, target: 'expired' }; // Expired check

        // 1. Terrain Collision
        const terrainY = getTerrainHeightAt(this.x);
        if (this.y + this.radius >= terrainY) {
            return { collided: true, target: 'ground', x: this.x, y: terrainY };
        }

        // 2. Wall Collision
        for (const wall of walls) {
            if (this.x > wall.x && this.x < wall.x + wall.width &&
                this.y > wall.y && this.y < wall.y + wall.height) {
                return { collided: true, target: wall, x: this.x, y: this.y };
            }
        }

        // 3. Tank Collision
        for (const tank of tanks) {
            if (tank !== this.ownerTank) { // Don't collide with self
                 // Simple AABB collision check (Axis-Aligned Bounding Box)
                 const tankLeft = tank.x - tank.width / 2;
                 const tankRight = tank.x + tank.width / 2;
                 const tankTop = tank.y - tank.height; // Image top Y
                 const tankBottom = tank.y; // Image bottom Y (approx ground)

                 if (this.x + this.radius > tankLeft &&
                     this.x - this.radius < tankRight &&
                     this.y + this.radius > tankTop &&
                     this.y - this.radius < tankBottom)
                 {
                      return { collided: true, target: tank, x: this.x, y: this.y };
                 }
            }
        }

        // 4. Offscreen Check
        if (this.x < -this.radius * 5 || this.x > canvasWidth + this.radius * 5) {
            return { collided: true, target: 'offscreen' };
        }

        return { collided: false };
    }
}
class Wall {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = '#A0522D'; // Brown color
    }
    draw() {
         // Optional: Use wall texture image if loaded
         // if (imgWall) { ... } else { ... }
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
    }
}

class Particle {
     constructor(x, y, color = null) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 5; // Slower particles overall
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed - Math.random() * 2; // Tend to fly up slightly initially
        this.life = 0.4 + Math.random() * 0.8; // Shorter lifespan
        this.radius = 1 + Math.random() * 3;
        this.baseColor = color || ['#FFA500', '#FF8C00', '#FF4500', '#FFD700'][Math.floor(Math.random() * 4)]; // Orange/Red/Yellow
        this.gravityFactor = 0.5 + Math.random() * 0.5; // Vary gravity effect
     }

     update(deltaTime) {
        this.life -= deltaTime;
        if (this.life <= 0) return;
        this.vy += gravity * 5 * this.gravityFactor * deltaTime; // Gravity affects particles too
        this.x += this.vx * 60 * deltaTime;
        this.y += this.vy * 60 * deltaTime;
        this.radius *= 0.96; // Shrink slightly faster
     }

     draw() {
        if (this.life <= 0 || this.radius < 0.5) return;
        ctx.globalAlpha = Math.max(0, Math.min(1, this.life * 1.5)); // Fade out based on life
        ctx.fillStyle = this.baseColor;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0; // Reset alpha
     }
}


// --- Game Logic Functions ---
function setupLevel(levelNum, loadedState = null) {
    console.log(`Setting up Level ${levelNum}`);
    gameOver = false;
    projectile = null;
    secondaryProjectiles = [];
    particles = [];
    currentPlayer = 'player';
    turnDisplay.textContent = "Người Chơi";
    levelDisplay.textContent = levelNum;
    currentPower = 50;
    powerDisplay.textContent = currentPower;

    // Load state or set defaults
    if (loadedState) {
        playerAmmoCounts = loadedState.playerAmmoCounts || { normal: Infinity, cluster: 3, heavy: 2 };
    } else {
        playerAmmoCounts = { normal: Infinity, cluster: 3, heavy: 2 };
    }
    updateAmmoSelect(); // Update dropdown based on loaded/default counts

    // Generate terrain first
    generateTerrain();

    // Create tanks
    tanks = [
        new Tank(150, 'blue', true, true),
        new Tank(canvasWidth - 150, 'red', false, false)
    ];

    // Apply loaded health if available, otherwise set defaults
    if (loadedState) {
        tanks[0].health = loadedState.playerHealth !== undefined ? loadedState.playerHealth : 100;
    } else {
        tanks[0].health = 100;
    }
    tanks[0].maxHealth = 100; // Max health player is always 100?

    // Set enemy health based on level
    const enemyMaxHealth = 100 + (levelNum - 1) * 25;
    tanks[1].health = enemyMaxHealth;
    tanks[1].maxHealth = enemyMaxHealth;

    // Place tanks on the generated terrain
    tanks.forEach(tank => tank.updatePositionOnTerrain());

    // Update health UI
    playerHealthDisplay.textContent = tanks[0].health;
    enemyHealthDisplay.textContent = tanks[1].health;

    // Create walls (example: one in the middle)
    walls = [];
    const wallX = canvasWidth / 2 - 30;
    const wallBottomY = getTerrainHeightAt(wallX + 30);
    const wallHeight = 60 + Math.random() * 60;
    walls.push(new Wall(wallX, wallBottomY - wallHeight, 60, wallHeight));

    // Reset wind (trigger immediate change on first update)
    windChangeTimer = windChangeInterval;

    enableControls();
    aiThinking = false; // Reset AI state
}

function updateAmmoSelect() {
    // Update the options in the dropdown based on available ammo
    ammoSelect.innerHTML = ''; // Clear existing options
    for (const type in ammoTypes) {
        const count = playerAmmoCounts[type];
        if (count > 0 || count === Infinity) {
            const option = document.createElement('option');
            option.value = type;
            const countText = count === Infinity ? '(∞)' : `(${count})`;
            option.textContent = `${ammoTypes[type].name} ${countText}`;
            ammoSelect.appendChild(option);
        }
    }
    // Set selected value and update count display
    ammoSelect.value = playerCurrentAmmo;
    updateAmmoCountDisplay();
}

function updateAmmoCountDisplay() {
     const count = playerAmmoCounts[playerCurrentAmmo];
     ammoCountDisplay.textContent = count === Infinity ? '∞' : count;
}


function draw() {
    if (!assetsLoaded) return; // Don't draw anything until assets are ready

    // 1. Clear or Draw Background
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    if (imgBackground) {
        ctx.drawImage(imgBackground, 0, 0, canvasWidth, canvasHeight);
    } else {
        ctx.fillStyle = '#87CEEB'; // Fallback sky blue
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // 2. Draw Terrain
    ctx.fillStyle = '#228B22'; // Green
    ctx.strokeStyle = '#006400'; // Darker green border
    ctx.lineWidth = 1;
    if (terrainHeights.length > 0) {
        ctx.beginPath();
        ctx.moveTo(0, canvasHeight);
        ctx.lineTo(0, terrainHeights[0]);
        for (let i = 1; i < terrainHeights.length; i++) {
             // Smoother curve using quadraticCurveTo (optional, can affect collision accuracy)
            // const xc = (i * terrainResolution + (i - 1) * terrainResolution) / 2;
            // const yc = (terrainHeights[i] + terrainHeights[i-1]) / 2;
            // ctx.quadraticCurveTo((i-1)*terrainResolution, terrainHeights[i-1], xc, yc);
            ctx.lineTo(i * terrainResolution, terrainHeights[i]);
        }
        ctx.lineTo(canvasWidth, terrainHeights[terrainHeights.length - 1]);
        ctx.lineTo(canvasWidth, canvasHeight);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else { // Fallback flat ground if terrain failed
         ctx.fillRect(0, canvasHeight - 50, canvasWidth, 50);
    }


    // 3. Draw Walls
    walls.forEach(wall => wall.draw());

    // 4. Draw Tanks
    tanks.forEach(tank => tank.draw());

    // 5. Draw Secondary Projectiles (basic)
    secondaryProjectiles.forEach(sp => sp.draw());

    // 6. Draw Main Projectile
    if (projectile) {
        projectile.draw();
    }

    // 7. Draw Particles
    particles.forEach(p => p.draw());

}

function update(deltaTime) {
    if (gameOver || !assetsLoaded) return;

    // Update Wind
    windChangeTimer += deltaTime * 1000;
    if (windChangeTimer >= windChangeInterval) {
        windChangeTimer = 0;
        const oldWind = windSpeed;
        windSpeed = (Math.random() - 0.5) * 0.15; // Slightly stronger wind range
        // Prevent wind from being exactly zero too often
        if (Math.abs(windSpeed) < 0.01) windSpeed = 0.01 * Math.sign(oldWind || 1);
        updateWindDisplay();
    }

    // Update Main Projectile
    if (projectile) {
        projectile.update(deltaTime);
        const collision = projectile.checkCollision();
        if (collision.collided) {
            handleCollision(collision); // Pass full collision object
            projectile = null; // Remove projectile AFTER handling collision
            if (!gameOver) {
                 // Delay turn switch slightly to allow effects to show
                 setTimeout(switchTurn, 500);
            }
        }
    }

    // Update Secondary Projectiles (basic - remove if expired)
     for (let i = secondaryProjectiles.length - 1; i >= 0; i--) {
         secondaryProjectiles[i].update(deltaTime);
          const collision = secondaryProjectiles[i].checkCollision();
         if (collision.collided) {
              handleCollision(collision); // Secondary bombs also cause effects
              secondaryProjectiles.splice(i, 1);
         } else if(secondaryProjectiles[i].life <= 0) {
              secondaryProjectiles.splice(i, 1);
         }
     }


    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(deltaTime);
        if (particles[i].life <= 0 || particles[i].radius < 0.5) {
            particles.splice(i, 1);
        }
    }

    // AI Turn Logic
    if (currentPlayer === 'enemy' && !projectile && secondaryProjectiles.length === 0 && !aiThinking) {
        aiThinking = true; // Set flag
        // Add delay before AI calculates and fires
        setTimeout(enemyAI, 1200 + Math.random() * 800); // 1.2 - 2 second delay
    }
}

function handleCollision(collision) {
     const { target, x, y } = collision; // Destructure collision object
     const proj = collision.projectile || projectile; // Use the projectile that caused collision (for secondary)
     if (!proj) return; // Safety check

    const currentAmmoData = ammoTypes[proj.ammoType];
    const damageRange = currentAmmoData.damage;
    const damage = damageRange[0] + Math.floor(Math.random() * (damageRange[1] - damageRange[0] + 1));

    console.log(`Collision with ${typeof target === 'string' ? target : target.constructor.name} by ${proj.ammoType}`);
    playSound('explode');

    // Create particles at collision point
    const numParticles = 20 + Math.floor(Math.random() * 25);
    for (let i = 0; i < numParticles; i++) {
        particles.push(new Particle(x, y));
    }

    // Handle target-specific actions
    if (target instanceof Tank) {
        target.takeDamage(damage);
        // Add small "hit" particles on the tank
         for (let i = 0; i < 5; i++) { particles.push(new Particle(x, y, 'white')); }
        checkWinCondition();
    } else if (target === 'ground') {
        // Potentially modify terrain for heavy impacts
        if (currentAmmoData.effect === 'heavy_impact') {
            modifyTerrain(x, 30 + Math.random()*10, 15 + Math.random()*5); // Radius, Depth
        }
    } else if (target instanceof Wall) {
         // Maybe damage the wall or just stop
    }

    // Handle special ammo effects (after main impact)
    if (currentAmmoData.effect === 'cluster' && proj === projectile) { // Only main projectile creates cluster
        createClusterBombs(x, y, currentAmmoData.count, currentAmmoData.spread, proj.ownerTank);
    }

     // Important: If this was the main projectile, set it to null
     if (proj === projectile) {
         projectile = null;
     }
}

function createClusterBombs(x, y, count, spreadAngle, ownerTank) {
    console.log(`Creating ${count} cluster bombs`);
    for (let i = 0; i < count; i++) {
        const angleOffset = (Math.random() - 0.5) * spreadAngle;
        // Tend to spread outwards and slightly downwards from impact point
        const initialAngle = 270 + angleOffset + (Math.random() - 0.5) * 30;
        const initialPower = 15 + Math.random() * 15; // Low power for spread

        // Create secondary projectiles and add to their own list
        const bomb = new Projectile(x, y + 5, initialAngle, initialPower, ownerTank, 'normal'); // Cluster bombs are normal damage
        bomb.life = 1.5 + Math.random(); // Shorter life for cluster bombs
        secondaryProjectiles.push(bomb);
    }
}

function updateWindDisplay() {
    let direction = '';
    let strength = '';
    if (Math.abs(windSpeed) < 0.02) {
        direction = '--';
        strength = 'Không';
    } else {
        direction = windSpeed > 0 ? '→' : '←'; // Right or Left arrow
        const absWind = Math.abs(windSpeed);
        if (absWind < 0.05) strength = 'Nhẹ';
        else if (absWind < 0.1) strength = 'Vừa';
        else strength = 'Mạnh';
    }
    windInfoDisplay.innerHTML = `${direction} ${strength}`;
}

function switchTurn() {
    if (gameOver) return; // Don't switch if game is over

    if (currentPlayer === 'player') {
        currentPlayer = 'enemy';
        turnDisplay.textContent = "Đối Phương";
        disableControls();
    } else {
        currentPlayer = 'player';
        turnDisplay.textContent = "Người Chơi";
        enableControls();
        aiThinking = false; // Reset AI flag
    }
     // Reset power for next turn? Or keep it? For now, keep it.
     // currentPower = 50;
     // powerDisplay.textContent = currentPower;
}

function enemyAI() {
    if (currentPlayer !== 'enemy' || projectile || secondaryProjectiles.length > 0 || gameOver) {
         aiThinking = false; // Ensure flag is reset if AI shouldn't act
         return;
    }

    const enemy = tanks[1];
    const player = tanks[0];

    // 1. Target Estimation (slightly random)
    const targetX = player.x + (Math.random() - 0.5) * player.width * 0.3;
    const targetY = player.y - player.height / 2;

    // 2. Power Estimation (based on distance)
    const dx = targetX - enemy.x;
    const dy = enemy.y - targetY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    let firePower = Math.max(minPower, Math.min(maxPower, 35 + distance * 0.12));

    // 3. Angle Calculation (Placeholder - VERY BASIC)
    // This needs a proper physics calculation or iterative approach for accuracy
    let targetAngle = calculateOptimalAngle_Basic(enemy, targetX, targetY, firePower);

    // 4. Add Error based on Level (less error at higher levels)
    const maxAngleError = 25 / (level + 1); // Less error as level increases
    const angleError = (Math.random() - 0.5) * maxAngleError;
    targetAngle += angleError;

    // Also add some error to power
    const maxPowerError = 20 / (level + 1);
    firePower += (Math.random() - 0.5) * maxPowerError;
    firePower = Math.max(minPower, Math.min(maxPower, firePower));

    // Clamp final angle
    enemy.angle = Math.max(5, Math.min(175, targetAngle));

    console.log(`AI [Lvl ${level}] Aim: A=${enemy.angle.toFixed(1)} P=${firePower.toFixed(1)} Dist=${distance.toFixed(0)}`);

    // 5. Fire after a short aiming delay
    setTimeout(() => {
        // Double check conditions before firing, in case something changed
        if (currentPlayer === 'enemy' && !projectile && !gameOver) {
             fire(enemy, firePower);
        }
         aiThinking = false; // Reset flag after attempting to fire
    }, 300 + Math.random() * 400); // 0.3 - 0.7 second aiming pause
}

// Basic angle calculation - Needs improvement!
function calculateOptimalAngle_Basic(tank, targetX, targetY, power) {
    const dx = targetX - tank.x;
    const dy = tank.y - targetY;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI); // Geometric angle
    // Very rough adjustment based on distance and power (needs physics)
    const distance = Math.sqrt(dx*dx + dy*dy);
    angle += distance / (power * 0.5 + 10); // Higher angle for longer shots/lower power
    return angle;
}


function fire(tank, power) {
    if (projectile || secondaryProjectiles.length > 0) return; // Prevent firing if projectile exists

    const ammoTypeKey = tank.isPlayer ? playerCurrentAmmo : enemyCurrentAmmo;
    const ammoData = ammoTypes[ammoTypeKey];

    // Check ammo count for player
    if (tank.isPlayer) {
        const currentCount = playerAmmoCounts[ammoTypeKey];
        if (currentCount === 0) {
            console.log("Out of ammo:", ammoData.name);
            playSound('empty'); // Play empty click sound
            return; // Don't fire
        }
        if (currentCount !== Infinity) {
            playerAmmoCounts[ammoTypeKey]--;
            updateAmmoCountDisplay();
            // If that was the last one, maybe switch back to normal?
             if (playerAmmoCounts[ammoTypeKey] === 0 && ammoTypeKey !== 'normal') {
                 // Remove the option from select or just visually update count
                 updateAmmoSelect(); // Rebuild select to remove empty option
                 playerCurrentAmmo = 'normal'; // Switch back to normal
                 ammoSelect.value = 'normal';
                 updateAmmoCountDisplay();
             }
        }
    }

    const barrelEnd = tank.getBarrelEnd();
    projectile = new Projectile(barrelEnd.x, barrelEnd.y, tank.angle, power, tank, ammoTypeKey);

    playSound('fire');

    if (tank.isPlayer) {
        disableControls(); // Disable controls after player fires
    }
}

function checkWinCondition() {
    const player = tanks[0];
    const enemy = tanks[1];
    let gameEnded = false;

    if (enemy.health <= 0) {
        console.log("Player Wins Level!");
        gameOver = true;
        gameEnded = true;
        saveGameState(); // Save progress
        setTimeout(() => {
            alert(`Chúc mừng! Bạn đã qua Level ${level}!`);
            level++;
            setupLevel(level, loadGameState()); // Load state which now includes the new level
        }, 1500); // Longer delay to see explosion
    } else if (player.health <= 0) {
        console.log("Player Loses!");
        gameOver = true;
        gameEnded = true;
        // Optional: Clear save game on loss?
        // localStorage.removeItem('tankDuelSaveData');
        setTimeout(() => {
            alert(`Game Over! Bạn đã thua ở Level ${level}. Chơi lại từ Level 1.`);
            level = 1; // Reset level
            localStorage.removeItem('tankDuelSaveData'); // Clear save on full loss
            setupLevel(level); // Setup level 1 (no saved state)
        }, 1500);
    }

     if (gameEnded) {
         disableControls(); // Ensure controls stay disabled
     }
}

// --- Local Storage ---
function saveGameState() {
    if (gameOver && tanks[0]?.health <= 0) return; // Don't save if player just lost

    const state = {
        level: level,
        playerHealth: tanks.length > 0 ? tanks[0].health : 100,
        playerAmmoCounts: playerAmmoCounts,
        // Add other things to save if needed (e.g., player position?)
    };
    try {
        localStorage.setItem('tankDuelSaveData_v1', JSON.stringify(state)); // Added version
        console.log("Game state saved:", state);
    } catch (e) {
        console.error("Could not save game state:", e);
    }
}

function loadGameState() {
    try {
        const savedData = localStorage.getItem('tankDuelSaveData_v1');
        if (savedData) {
            const state = JSON.parse(savedData);
            console.log("Loaded game state:", state);
            // Basic validation
            if (typeof state.level === 'number' && state.level > 0) {
                 level = state.level; // Update global level from save
                 return state;
            }
        }
    } catch (e) {
        console.error("Could not load or parse game state:", e);
         localStorage.removeItem('tankDuelSaveData_v1'); // Clear corrupted data
    }
    level = 1; // Reset level if load fails
    return null; // Return null if no valid save data
}


// --- UI Control ---
function disableControls() {
    btnMoveLeft.disabled = true;
    btnMoveRight.disabled = true;
    btnAngleUp.disabled = true;
    btnAngleDown.disabled = true;
    btnPowerUp.disabled = true;
    btnPowerDown.disabled = true;
    btnFire.disabled = true;
    ammoSelect.disabled = true;
}

function enableControls() {
    if (gameOver) {
        disableControls();
        return;
    }
    btnMoveLeft.disabled = false;
    btnMoveRight.disabled = false;
    btnAngleUp.disabled = false;
    btnAngleDown.disabled = false;
    btnPowerUp.disabled = false;
    btnPowerDown.disabled = false;
    btnFire.disabled = false;
    ammoSelect.disabled = false;
}

// --- Event Listeners ---
function setupEventListeners() {
    const addSafeListener = (element, eventType, handler) => {
        if (element) {
            element.addEventListener(eventType, handler);
            // Add touchstart equivalent for mobile buttons
            if (['click'].includes(eventType) && 'ontouchstart' in window) {
                element.addEventListener('touchstart', (e) => {
                     e.preventDefault(); // IMPORTANT: Prevent default touch behavior (scroll, zoom)
                     handler(e); // Call the same handler
                     // Optional: Add visual feedback for touch
                     element.style.transform = 'scale(0.95)';
                     setTimeout(() => element.style.transform = 'scale(1)', 100);
                }, { passive: false }); // passive: false needed for preventDefault
            }
        } else {
            console.warn(`Element not found for listener: ${eventType}`);
        }
    };

    addSafeListener(btnMoveLeft, 'click', () => { if (!btnMoveLeft.disabled) tanks[0].move(-1, 1/15); /* Move smaller amount per click */ });
    addSafeListener(btnMoveRight, 'click', () => { if (!btnMoveRight.disabled) tanks[0].move(1, 1/15); });
    addSafeListener(btnAngleUp, 'click', () => { if (!btnAngleUp.disabled) tanks[0].aim(2); });
    addSafeListener(btnAngleDown, 'click', () => { if (!btnAngleDown.disabled) tanks[0].aim(-2); });
    addSafeListener(btnPowerUp, 'click', () => {
        if (!btnPowerUp.disabled) {
            currentPower = Math.min(maxPower, currentPower + 5);
            powerDisplay.textContent = currentPower;
        }
    });
    addSafeListener(btnPowerDown, 'click', () => {
        if (!btnPowerDown.disabled) {
            currentPower = Math.max(minPower, currentPower - 5);
            powerDisplay.textContent = currentPower;
        }
    });
    addSafeListener(btnFire, 'click', () => { if (!btnFire.disabled) fire(tanks[0], currentPower); });
    addSafeListener(ammoSelect, 'change', (e) => {
        playerCurrentAmmo = e.target.value;
        updateAmmoCountDisplay();
    });
    addSafeListener(btnToggleMusic, 'click', toggleMusic);

    // Initial audio context unlock attempt on first interaction
    const unlockAudio = () => {
         if(initAudio() && audioContext.state === 'suspended') {
              audioContext.resume().then(() => console.log('Audio ready on interaction.'));
         }
         document.body.removeEventListener('click', unlockAudio);
         document.body.removeEventListener('touchstart', unlockAudio);
    };
    document.body.addEventListener('click', unlockAudio, { once: true });
    document.body.addEventListener('touchstart', unlockAudio, { once: true });

}


// --- Game Loop ---
function gameLoop(currentTime) {
    // Calculate deltaTime
    const deltaTime = Math.min(0.05, (currentTime - lastTime) / 1000); // Clamp deltaTime to prevent large jumps
    lastTime = currentTime;

    if (assetsLoaded) {
        update(deltaTime);
        draw();
    }

    requestAnimationFrame(gameLoop);
}

// --- Start Game ---
function startGameLogic() {
    console.log("Starting Game Logic...");
    setupEventListeners();
    const loadedState = loadGameState(); // Load saved state (updates global 'level')
    setupLevel(level, loadedState); // Setup the level using global 'level' and loaded state
    updateWindDisplay(); // Initial wind display
    lastTime = performance.now(); // Set initial time for game loop
    requestAnimationFrame(gameLoop); // Start the loop
    // Optional: Try starting music automatically (might be blocked)
    // setTimeout(toggleMusic, 1000);
}

// Load assets, which will then call startGameLogic
loadAssets();
