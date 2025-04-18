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
const gravity = 0.15;
const terrainResolution = 5;
const maxPower = 100;
const minPower = 10;
const windChangeInterval = 6000;

// --- Game State ---
let level = 1;
let currentPlayer = 'player';
let projectile = null;
let secondaryProjectiles = [];
let particles = [];
let tanks = [];
let walls = [];
let terrainHeights = [];
let gameOver = false;
let currentPower = 50;
let windSpeed = 0;
let windChangeTimer = 0;
let lastTime = 0;
let assetsFullyLoaded = false; // Đổi tên biến cờ
let aiThinking = false;
let userInteracted = false; // Cờ theo dõi tương tác người dùng

// --- Ammo Data ---
const ammoTypes = {
    normal: { name: "Thường", damage: [25, 35], effect: null, radius: 5 },
    cluster: { name: "Chùm", damage: [10, 15], count: 4, spread: 40, effect: 'cluster', radius: 5 },
    heavy: { name: "Nặng", damage: [40, 55], effect: 'heavy_impact', radius: 7 },
};
let playerCurrentAmmo = 'normal';
let playerAmmoCounts = { normal: Infinity, cluster: 3, heavy: 2 };
let enemyCurrentAmmo = 'normal';

// --- Asset Variables ---
let imgTankBlue, imgTankRed, imgBarrel, imgBackground, imgExplosionSheet, imgWall, imgGround;
let audioContext;
let soundBuffers = {};
let musicSource = null;
let isMusicPlaying = false;

// --- Asset Loading Status ---
let loadedAssetStatus = {}; // Lưu trạng thái tải của từng asset

// --- Image Loading ---
function loadImage(src) {
    // Ghi nhớ trạng thái ban đầu là đang tải
    loadedAssetStatus[src] = 'loading';
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            loadedAssetStatus[src] = 'loaded'; // Đánh dấu đã tải thành công
            resolve(img);
        };
        img.onerror = (err) => {
            loadedAssetStatus[src] = 'error'; // Đánh dấu lỗi
            console.error(`ERROR: Failed to load image: ${src}`, err); // Log lỗi cụ thể hơn
            reject(new Error(`Failed to load image: ${src}`)); // Reject với Error object
        };
        img.src = src;
    });
}

// --- Audio Loading ---
function initAudio() {
    if (!userInteracted) {
        console.log("AudioContext deferred until user interaction.");
        return false; // Chưa cho phép init nếu chưa có tương tác
    }

    if (!audioContext && (window.AudioContext || window.webkitAudioContext)) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log(`AudioContext state: ${audioContext.state}`);
            // Nếu vẫn bị suspended (dù đã có tương tác), thử resume lại
            if (audioContext.state === 'suspended') {
                audioContext.resume().then(() => {
                    console.log('AudioContext resumed successfully.');
                }).catch(e => console.error('Error resuming AudioContext:', e));
            }
            return true;
        } catch (e) {
            console.error("Web Audio API is not supported or failed to initialize.", e);
            return false;
        }
    } else if (!audioContext) {
        console.warn("Web Audio API not supported.");
        return false;
    }
    // Nếu context đã tồn tại và đang suspended, thử resume
    if (audioContext.state === 'suspended') {
         audioContext.resume().catch(e => console.error('Error resuming existing AudioContext:', e));
    }
    return true; // Context đã tồn tại hoặc vừa init thành công
}


function loadAudio(url) {
    // Chỉ thử tải nếu audio context đã sẵn sàng (running)
    if (!audioContext || audioContext.state !== 'running') {
         loadedAssetStatus[url] = 'deferred'; // Đánh dấu là bị hoãn
         // Trả về một Promise sẽ resolve ngay lập tức với null
         // để không làm treo Promise.allSettled
         return Promise.resolve(null);
    }

    loadedAssetStatus[url] = 'loading';
    return fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for ${url}`);
            return response.arrayBuffer();
        })
        .then(arrayBuffer => {
            // Đảm bảo context còn tồn tại trước khi decode
            if (!audioContext) throw new Error("AudioContext destroyed before decoding.");
            return audioContext.decodeAudioData(arrayBuffer);
        })
        .then(decodedBuffer => {
            loadedAssetStatus[url] = 'loaded';
            return decodedBuffer; // Trả về buffer đã giải mã
        })
        .catch(error => {
            loadedAssetStatus[url] = 'error';
            console.error(`ERROR: Failed to load or decode audio ${url}:`, error);
            return null; // Quan trọng: Trả về null để Promise.allSettled không bị reject hoàn toàn
        });
}

// --- Load All Assets (Revised with Promise.allSettled) ---
async function loadAssets() {
    console.log("Starting asset loading...");
    loadingScreen.classList.add('visible');

    // Danh sách các assets cần tải
    const assetsToLoad = [
        { type: 'image', src: 'assets/images/tank_blue.png', target: 'imgTankBlue' },
        { type: 'image', src: 'assets/images/tank_red.png', target: 'imgTankRed' },
        { type: 'image', src: 'assets/images/barrel.png', target: 'imgBarrel' },
        { type: 'image', src: 'assets/images/background.png', target: 'imgBackground' },
        { type: 'image', src: 'assets/images/explosion_spritesheet.png', target: 'imgExplosionSheet' },
        // { type: 'image', src: 'assets/images/wall_texture.png', target: 'imgWall' },
        // { type: 'image', src: 'assets/images/ground_texture.png', target: 'imgGround' },
        { type: 'audio', src: 'assets/sounds/fire.wav', target: 'fire' },
        { type: 'audio', src: 'assets/sounds/explode.wav', target: 'explode' },
        { type: 'audio', src: 'assets/sounds/music.mp3', target: 'music' },
        { type: 'audio', src: 'assets/sounds/empty_click.wav', target: 'empty' }
    ];

    const promises = assetsToLoad.map(asset => {
        if (asset.type === 'image') {
            return loadImage(asset.src).then(img => ({ target: asset.target, data: img, status: 'fulfilled', src: asset.src }))
                                      .catch(error => ({ target: asset.target, reason: error, status: 'rejected', src: asset.src }));
        } else if (asset.type === 'audio') {
            // Tải audio chỉ được gọi KHI context sẵn sàng (sau tương tác)
            // Ở đây chỉ tạo promise, việc tải thực sự sẽ trong init/loadAudio
            return Promise.resolve({ target: asset.target, type: 'audio', src: asset.src, status: 'pending' }); // Đánh dấu là chờ xử lý audio
        }
        return Promise.resolve({ status: 'skipped' }); // Bỏ qua nếu type không đúng
    });

    // Đợi TẤT CẢ các promise hình ảnh hoàn thành (settle)
    console.log("Waiting for image promises...");
    const imageResults = await Promise.allSettled(promises.filter(p => p.then)); // Chỉ đợi promise thực sự

    let allImagesLoaded = true;
    imageResults.forEach((result, index) => {
         // Tìm lại thông tin asset gốc (hơi phức tạp do lọc promise)
         const originalAsset = assetsToLoad.find(a => a.src === result.value?.src || a.src === result.reason?.message?.includes(a.src));

         if (result.status === 'fulfilled' && result.value && result.value.data) {
             window[result.value.target] = result.value.data; // Gán ảnh vào biến toàn cục
             console.log(`Loaded: ${result.value.src}`);
         } else if (result.status === 'rejected') {
             allImagesLoaded = false;
             console.error(`Failed: ${originalAsset?.src || 'Unknown Image'} - Reason:`, result.reason);
             // Gán null hoặc ảnh placeholder nếu cần
             if (originalAsset) window[originalAsset.target] = null;
         } else if(result.value?.type === 'audio') {
             // Bỏ qua kết quả audio ở bước này
         } else {
              console.warn("Unexpected promise result:", result);
         }
    });

    console.log(`Image loading finished. All images OK: ${allImagesLoaded}`);
    assetsFullyLoaded = true; // Đánh dấu là có thể bắt đầu game (dù ảnh có lỗi)

    // --- Xử lý tải Audio SAU tương tác người dùng ---
    const tryLoadAudio = async () => {
         if (!userInteracted) return; // Chưa tương tác, không làm gì cả
         if (!initAudio()) { // Cố gắng khởi tạo/resume context
             console.warn("AudioContext still not ready. Cannot load audio yet.");
             return; // Không thể khởi tạo/resume, dừng lại
         }

         console.log("AudioContext ready, attempting to load audio files...");
         const audioAssets = assetsToLoad.filter(a => a.type === 'audio');
         const audioLoadPromises = audioAssets.map(asset =>
             loadAudio(asset.src).then(buffer => ({ target: asset.target, data: buffer, status: 'fulfilled', src: asset.src }))
                               .catch(error => ({ target: asset.target, reason: error, status: 'rejected', src: asset.src })) // Vẫn dùng catch ở đây
         );

         const audioResults = await Promise.allSettled(audioLoadPromises);

         audioResults.forEach(result => {
             if (result.status === 'fulfilled' && result.value && result.value.data) {
                 soundBuffers[result.value.target] = result.value.data;
                 console.log(`Loaded Audio: ${result.value.src}`);
             } else if (result.status === 'rejected') {
                  console.error(`Failed Audio: ${result.reason?.message?.includes('assets/sounds/') ? result.reason.message.split(' ').pop() : 'Unknown Audio'} - Reason:`, result.reason);
             }
         });
         console.log("Audio loading attempt finished.");
         // Không cần làm gì thêm, game đã chạy, âm thanh sẽ tự dùng nếu buffer tồn tại
    };

    // Gọi tryLoadAudio ngay nếu đã có tương tác, hoặc nó sẽ được gọi trong event listener tương tác
    if (userInteracted) {
        tryLoadAudio();
    } else {
        console.log("Audio loading deferred. Waiting for user interaction.");
        // Event listener để kích hoạt tải audio sẽ được thêm trong setupEventListeners
    }


    console.log("Asset loading process complete (game can start).");
    loadingScreen.classList.remove('visible'); // Ẩn màn hình loading
    startGameLogic(); // Bắt đầu logic game NGAY CẢ KHI có lỗi tải asset

}

// --- Sound Playback (kiểm tra context state) ---
function playSound(bufferName, volume = 1.0) {
    // Thử init/resume nếu cần và có tương tác
    if (userInteracted && (!audioContext || audioContext.state !== 'running')) {
        initAudio();
    }

    if (!audioContext || audioContext.state !== 'running' || !soundBuffers[bufferName]) {
        // console.log(`Skipping sound ${bufferName} - Audio not ready or buffer missing.`);
        return;
    }
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

// --- Toggle Music (kiểm tra context state) ---
function toggleMusic() {
    // Thử init/resume nếu cần và có tương tác
    if (userInteracted && (!audioContext || audioContext.state !== 'running')) {
        initAudio();
    }

    if (!audioContext || audioContext.state !== 'running' || !soundBuffers.music) {
        console.log("Cannot toggle music - Audio not ready or music buffer missing.");
        return;
    }

    if (isMusicPlaying) {
        if (musicSource) {
            try { musicSource.stop(); musicSource.disconnect(); } catch(e){}
        }
        isMusicPlaying = false;
        btnToggleMusic.textContent = "🎵 Tắt";
        btnToggleMusic.classList.remove('playing');
    } else {
        musicSource = audioContext.createBufferSource();
        musicSource.buffer = soundBuffers.music;
        musicSource.loop = true;
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
        musicSource.connect(gainNode).connect(audioContext.destination);
        try {
            musicSource.start(0);
            isMusicPlaying = true;
            btnToggleMusic.textContent = "🎵 Bật";
            btnToggleMusic.classList.add('playing');
        } catch(e) {
            console.error("Error starting music:", e);
            isMusicPlaying = false;
        }
    }
}


// --- Terrain Generation ---
function generateTerrain() {
    terrainHeights = [];
    let currentHeight = canvasHeight * (0.6 + Math.random() * 0.2);
    for (let x = 0; x <= canvasWidth; x += terrainResolution) {
        terrainHeights.push(currentHeight);
        let heightChange = (Math.random() - 0.48) * 12;
        currentHeight += heightChange;
        currentHeight = Math.max(canvasHeight * 0.3, Math.min(canvasHeight - 40, currentHeight));
    }
    if (terrainHeights.length * terrainResolution < canvasWidth + terrainResolution) {
         terrainHeights.push(currentHeight);
    }
    smoothTerrain(2);
}

function smoothTerrain(passes) {
    if (terrainHeights.length < 3) return;
    for (let p = 0; p < passes; p++) {
        let smoothed = [terrainHeights[0]];
        for (let i = 1; i < terrainHeights.length - 1; i++) {
            smoothed.push((terrainHeights[i - 1] + terrainHeights[i] * 1.5 + terrainHeights[i + 1]) / 3.5);
        }
        smoothed.push(terrainHeights[terrainHeights.length - 1]);
        terrainHeights = smoothed;
    }
}

function getTerrainHeightAt(x) {
    if (!terrainHeights || terrainHeights.length === 0) return canvasHeight - 50; // Fallback if not generated
    x = Math.max(0, Math.min(canvasWidth, x)); // Clamp x within bounds
    const index = Math.floor(x / terrainResolution);
    const nextIndex = Math.min(index + 1, terrainHeights.length - 1); // Ensure nextIndex is valid
    if (index === nextIndex) return terrainHeights[index]; // Avoid division by zero if x is exactly on the last point

    const x1 = index * terrainResolution;
    const y1 = terrainHeights[index];
    const x2 = nextIndex * terrainResolution;
    const y2 = terrainHeights[nextIndex];

    // Prevent division by zero if resolution leads to identical x values (shouldn't happen with current logic)
    if (x2 === x1) return y1;

    const t = (x - x1) / (x2 - x1);
    return y1 + (y2 - y1) * t;
}


function modifyTerrain(impactX, radius, depth) {
     if (!terrainHeights || terrainHeights.length === 0) return;
    console.log(`Modifying terrain at ${impactX.toFixed(0)} r=${radius} d=${depth}`);
    const startIndex = Math.max(0, Math.floor((impactX - radius) / terrainResolution));
    const endIndex = Math.min(terrainHeights.length - 1, Math.ceil((impactX + radius) / terrainResolution));

    for (let i = startIndex; i <= endIndex; i++) {
        const currentX = i * terrainResolution;
        const distFromImpact = Math.abs(currentX - impactX);
        if (distFromImpact < radius) {
            const craterDepthFactor = (Math.cos((distFromImpact / radius) * Math.PI) + 1) / 2;
            terrainHeights[i] += depth * craterDepthFactor;
            terrainHeights[i] = Math.min(canvasHeight + 50, terrainHeights[i]);
        }
    }
}

// --- Classes (Tank, Projectile, Wall, Particle - Giữ nguyên như trước, thêm kiểm tra ảnh) ---
class Tank {
    constructor(x, color, facingRight = true, isPlayer = false) {
        this.baseX = x;
        this.x = x;
        this.y = canvasHeight - 50;
        this.width = 70;
        this.height = 40;
        this.barrelPivotOffsetY = -this.height * 0.4;
        this.barrelLength = 35;
        this.angle = facingRight ? 45 : 135;
        this.color = color;
        this.health = 100;
        this.maxHealth = 100;
        this.facingRight = facingRight;
        this.isPlayer = isPlayer;
        // Gán ảnh trong constructor, sẽ là null nếu tải lỗi
        this.image = isPlayer ? imgTankBlue : imgTankRed;
        this.barrelImage = imgBarrel;
        this.moveSpeed = 150;
    }

    updatePositionOnTerrain() {
        this.y = getTerrainHeightAt(this.x);
    }

    draw() {
        // Kiểm tra ảnh trước khi vẽ
        if (!this.image) {
             // Vẽ hình chữ nhật thay thế nếu ảnh lỗi
             ctx.fillStyle = this.isPlayer ? 'blue' : 'red';
             ctx.fillRect(this.x - this.width / 2, this.y - this.height, this.width, this.height);
             console.warn(`Tank image missing for ${this.isPlayer ? 'player' : 'enemy'}. Drawing fallback.`);
             // Vẫn vẽ nòng và thanh máu
        } else {
             ctx.drawImage(this.image, this.x - this.width / 2, this.y - this.height, this.width, this.height);
        }


        // Vẽ nòng súng
        const angleRad = this.angle * (Math.PI / 180);
        const pivotX = this.x;
        const pivotY = this.y + this.barrelPivotOffsetY;

        ctx.save();
        ctx.translate(pivotX, pivotY);
        ctx.rotate(-angleRad);

        if (this.barrelImage) {
            const barrelDrawWidth = 45;
            const barrelDrawHeight = 12;
            ctx.drawImage(this.barrelImage, 0, -barrelDrawHeight / 2, barrelDrawWidth, barrelDrawHeight);
        } else {
            // Vẽ nòng thay thế
            ctx.fillStyle = 'grey';
            ctx.fillRect(0, -3, this.barrelLength, 6);
             // Chỉ log warning 1 lần để tránh spam console
             if (!window.loggedBarrelMissing) {
                  console.warn("Barrel image missing. Drawing fallback.");
                  window.loggedBarrelMissing = true;
             }
        }
        ctx.restore();

        // Vẽ thanh máu (luôn vẽ)
        const healthBarY = (this.image ? this.y - this.height : this.y - this.height - 5) - 10; // Điều chỉnh Y nếu vẽ fallback
        this.drawHealthBar(healthBarY);
    }

    drawHealthBar(yPos) {
        const barWidth = this.width * 0.8;
        const barHeight = 6;
        const barX = this.x - barWidth / 2;
        const healthPercent = Math.max(0, this.health / this.maxHealth);

        ctx.fillStyle = '#dc3545';
        ctx.fillRect(barX, yPos, barWidth, barHeight);
        ctx.fillStyle = '#28a745';
        ctx.fillRect(barX, yPos, barWidth * healthPercent, barHeight);
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, yPos, barWidth, barHeight);
    }

    move(direction, deltaTime) {
        const moveAmount = direction * this.moveSpeed * deltaTime;
        const newX = this.x + moveAmount;
        if (newX > this.width / 3 && newX < canvasWidth - this.width / 3) { // Chỉ kiểm tra biên X cơ bản
             const nextY = getTerrainHeightAt(newX);
             // Cho phép di chuyển nhưng cập nhật Y
             this.x = newX;
             this.y = nextY;
        }
    }

    aim(angleChange) {
        this.angle += angleChange;
        this.angle = Math.max(5, Math.min(175, this.angle));
    }

    getBarrelEnd() {
        const angleRad = this.angle * (Math.PI / 180);
        const pivotX = this.x;
        const pivotY = this.y + this.barrelPivotOffsetY;
        const endX = pivotX + this.barrelLength * Math.cos(angleRad);
        const endY = pivotY - this.barrelLength * Math.sin(angleRad);
        return { x: endX, y: endY };
    }

    takeDamage(amount) {
        this.health -= amount;
        this.health = Math.max(0, this.health);
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
        this.radius = ammoTypes[ammoType]?.radius || 5;

        const angleRad = angle * (Math.PI / 180);
        const initialSpeed = power * 0.18;
        this.vx = initialSpeed * Math.cos(angleRad);
        this.vy = -initialSpeed * Math.sin(angleRad);

        this.trailPoints = [{ x: this.x, y: this.y }];
        this.maxTrailLength = 20;
        this.life = 8;
    }

    update(deltaTime) {
        this.life -= deltaTime;
        if (this.life <= 0) return;

        this.vy += gravity * 10 * deltaTime;
        this.vx += windSpeed * 60 * deltaTime; // Wind affect
        this.x += this.vx * 60 * deltaTime;
        this.y += this.vy * 60 * deltaTime;

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
            const alpha = Math.max(0.1, Math.min(0.6, this.life / 2));
            ctx.strokeStyle = `rgba(255, 255, 200, ${alpha})`;
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
         if (this.life <= 0) return { collided: true, target: 'expired', projectile: this };

        const terrainY = getTerrainHeightAt(this.x);
        if (this.y + this.radius >= terrainY) {
            return { collided: true, target: 'ground', x: this.x, y: terrainY, projectile: this };
        }
        for (const wall of walls) {
            if (this.x > wall.x && this.x < wall.x + wall.width &&
                this.y > wall.y && this.y < wall.y + wall.height) {
                return { collided: true, target: wall, x: this.x, y: this.y, projectile: this };
            }
        }
        for (const tank of tanks) {
            if (tank !== this.ownerTank) {
                 const tankLeft = tank.x - tank.width / 2;
                 const tankRight = tank.x + tank.width / 2;
                 const tankTop = tank.y - tank.height;
                 const tankBottom = tank.y;
                 if (this.x + this.radius > tankLeft &&
                     this.x - this.radius < tankRight &&
                     this.y + this.radius > tankTop &&
                     this.y - this.radius < tankBottom)
                 {
                      return { collided: true, target: tank, x: this.x, y: this.y, projectile: this };
                 }
            }
        }
        if (this.x < -this.radius * 5 || this.x > canvasWidth + this.radius * 5) {
            return { collided: true, target: 'offscreen', projectile: this };
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
        this.color = '#A0522D';
     }
     draw() {
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
        const speed = 1 + Math.random() * 5;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed - Math.random() * 2;
        this.life = 0.4 + Math.random() * 0.8;
        this.radius = 1 + Math.random() * 3;
        this.baseColor = color || ['#FFA500', '#FF8C00', '#FF4500', '#FFD700'][Math.floor(Math.random() * 4)];
        this.gravityFactor = 0.5 + Math.random() * 0.5;
    }
    update(deltaTime) {
        this.life -= deltaTime;
        if (this.life <= 0) return;
        this.vy += gravity * 5 * this.gravityFactor * deltaTime;
        this.x += this.vx * 60 * deltaTime;
        this.y += this.vy * 60 * deltaTime;
        this.radius *= 0.96;
    }
    draw() {
        if (this.life <= 0 || this.radius < 0.5) return;
        ctx.globalAlpha = Math.max(0, Math.min(1, this.life * 1.5));
        ctx.fillStyle = this.baseColor;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
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

    // Load ammo state or set defaults
    playerAmmoCounts = loadedState?.playerAmmoCounts || { normal: Infinity, cluster: 3, heavy: 2 };
    playerCurrentAmmo = 'normal'; // Always start with normal selected
    updateAmmoSelect();

    // Generate terrain
    generateTerrain();

    // Create tanks (ensure images are assigned, even if null)
    tanks = [
        new Tank(150, 'blue', true, true),
        new Tank(canvasWidth - 150, 'red', false, false)
    ];

    // Apply loaded health
    if (loadedState) {
        tanks[0].health = loadedState.playerHealth !== undefined ? loadedState.playerHealth : 100;
    } else {
        tanks[0].health = 100;
    }
    tanks[0].maxHealth = 100;

    const enemyMaxHealth = 100 + (levelNum - 1) * 25;
    tanks[1].health = enemyMaxHealth;
    tanks[1].maxHealth = enemyMaxHealth;

    // Place tanks on terrain AFTER creating them
    tanks.forEach(tank => tank.updatePositionOnTerrain());

    playerHealthDisplay.textContent = tanks[0].health;
    enemyHealthDisplay.textContent = tanks[1].health;

    // Create walls
    walls = [];
    const wallX = canvasWidth / 2 - 30;
    const wallBottomY = getTerrainHeightAt(wallX + 30);
    const wallHeight = 60 + Math.random() * 60;
    // Ensure wall doesn't go below canvas bottom if terrain is very high
    const wallTopY = Math.max(0, wallBottomY - wallHeight);
    walls.push(new Wall(wallX, wallTopY, 60, wallBottomY - wallTopY)); // Adjust height based on top Y

    windChangeTimer = windChangeInterval; // Trigger wind change soon
    enableControls();
    aiThinking = false;
}

function updateAmmoSelect() {
    const currentSelection = ammoSelect.value; // Remember current selection
    ammoSelect.innerHTML = '';
    let foundSelected = false;
    for (const type in ammoTypes) {
        const count = playerAmmoCounts[type];
        if (count > 0 || count === Infinity) {
            const option = document.createElement('option');
            option.value = type;
            const countText = count === Infinity ? '(∞)' : `(${count})`;
            option.textContent = `${ammoTypes[type].name} ${countText}`;
            ammoSelect.appendChild(option);
            if (type === currentSelection) {
                 foundSelected = true;
            }
        }
    }
    // Reselect previous ammo if still available, otherwise default to normal
    if (foundSelected) {
         ammoSelect.value = currentSelection;
         playerCurrentAmmo = currentSelection;
    } else {
         ammoSelect.value = 'normal';
         playerCurrentAmmo = 'normal';
    }
    updateAmmoCountDisplay();
}

function updateAmmoCountDisplay() {
     const count = playerAmmoCounts[playerCurrentAmmo];
     ammoCountDisplay.textContent = count === Infinity ? '∞' : count;
}

function draw() {
    // Draw background (fallback color if image missing)
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    if (imgBackground) {
        ctx.drawImage(imgBackground, 0, 0, canvasWidth, canvasHeight);
    } else {
        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        if (!window.loggedBgMissing) { // Log warning only once
             console.warn("Background image missing. Drawing fallback color.");
             window.loggedBgMissing = true;
        }
    }

    // Draw Terrain
    ctx.fillStyle = '#228B22';
    ctx.strokeStyle = '#006400';
    ctx.lineWidth = 1;
    if (terrainHeights.length > 0) {
        ctx.beginPath();
        ctx.moveTo(0, canvasHeight);
        ctx.lineTo(0, terrainHeights[0]);
        for (let i = 1; i < terrainHeights.length; i++) {
            ctx.lineTo(i * terrainResolution, terrainHeights[i]);
        }
        ctx.lineTo(canvasWidth, terrainHeights[terrainHeights.length - 1]);
        ctx.lineTo(canvasWidth, canvasHeight);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // Draw Walls, Tanks, Projectiles, Particles
    walls.forEach(wall => wall.draw());
    tanks.forEach(tank => tank.draw());
    secondaryProjectiles.forEach(sp => sp.draw());
    if (projectile) projectile.draw();
    particles.forEach(p => p.draw());
}


function update(deltaTime) {
    if (gameOver || !assetsFullyLoaded) return; // Ensure assets attempted loading

    // Update Wind
    windChangeTimer += deltaTime * 1000;
    if (windChangeTimer >= windChangeInterval) {
        windChangeTimer = 0;
        windSpeed = (Math.random() - 0.5) * 0.15;
        if (Math.abs(windSpeed) < 0.01) windSpeed = 0.01 * Math.sign(windSpeed || 1);
        updateWindDisplay();
    }

    // Update Main Projectile
    let mainProjectileCollided = false;
    if (projectile) {
        projectile.update(deltaTime);
        const collision = projectile.checkCollision();
        if (collision.collided) {
            handleCollision(collision);
            mainProjectileCollided = true; // Mark main projectile as done
            // Don't nullify projectile here, handleCollision does it
        }
    }

    // Update Secondary Projectiles
    for (let i = secondaryProjectiles.length - 1; i >= 0; i--) {
        secondaryProjectiles[i].update(deltaTime);
        const collision = secondaryProjectiles[i].checkCollision();
        if (collision.collided) {
             handleCollision(collision);
             secondaryProjectiles.splice(i, 1); // Remove collided secondary
        } else if(secondaryProjectiles[i].life <= 0) {
             secondaryProjectiles.splice(i, 1); // Remove expired secondary
        }
    }

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(deltaTime);
        if (particles[i].life <= 0 || particles[i].radius < 0.5) {
            particles.splice(i, 1);
        }
    }

    // Switch turn ONLY if the main projectile finished its action this frame
    // AND there are no secondary projectiles left
    if (mainProjectileCollided && secondaryProjectiles.length === 0 && !gameOver) {
         setTimeout(switchTurn, 400); // Delay turn switch slightly
    }


    // AI Turn Logic
    if (currentPlayer === 'enemy' && !projectile && secondaryProjectiles.length === 0 && !aiThinking) {
        aiThinking = true;
        setTimeout(enemyAI, 1200 + Math.random() * 800);
    }
}

function handleCollision(collision) {
    const { target, x, y, projectile: proj } = collision; // Get the projectile that caused this collision
    if (!proj) return;

    const currentAmmoData = ammoTypes[proj.ammoType];
    const damageRange = currentAmmoData.damage;
    const damage = damageRange[0] + Math.floor(Math.random() * (damageRange[1] - damageRange[0] + 1));

    playSound('explode');

    const numParticles = 15 + Math.floor(Math.random() * 20);
    for (let i = 0; i < numParticles; i++) {
        particles.push(new Particle(x, y));
    }

    if (target instanceof Tank) {
        target.takeDamage(damage);
        checkWinCondition();
    } else if (target === 'ground') {
        if (currentAmmoData.effect === 'heavy_impact') {
            modifyTerrain(x, 35 + Math.random()*10, 18 + Math.random()*7); // Slightly bigger crater
        }
    } // Other target types (wall, offscreen, expired) don't need specific actions here

    // Handle cluster effect only for the MAIN projectile collision
    if (currentAmmoData.effect === 'cluster' && proj === projectile) {
        createClusterBombs(x, y, currentAmmoData.count, currentAmmoData.spread, proj.ownerTank);
    }

    // Nullify the main projectile if it was the one that collided
    if (proj === projectile) {
        projectile = null;
    }
    // Secondary projectiles are removed directly in the update loop when they collide
}

function createClusterBombs(x, y, count, spreadAngle, ownerTank) {
    console.log(`Creating ${count} cluster bombs`);
    for (let i = 0; i < count; i++) {
        const angleOffset = (Math.random() - 0.5) * spreadAngle;
        const initialAngle = 270 + angleOffset + (Math.random() - 0.5) * 30;
        const initialPower = 15 + Math.random() * 15;
        const bomb = new Projectile(x, y + 5, initialAngle, initialPower, ownerTank, 'normal');
        bomb.life = 1.5 + Math.random();
        secondaryProjectiles.push(bomb);
    }
}

function updateWindDisplay() {
    let direction = '';
    let strength = '';
    const absWind = Math.abs(windSpeed);
    if (absWind < 0.015) { // Smaller threshold for 'Không'
        direction = '--';
        strength = 'Không';
    } else {
        direction = windSpeed > 0 ? '→' : '←';
        if (absWind < 0.06) strength = 'Nhẹ';
        else if (absWind < 0.11) strength = 'Vừa';
        else strength = 'Mạnh';
    }
    windInfoDisplay.innerHTML = `${direction} ${strength}`;
}

function switchTurn() {
    if (gameOver) return;
    // Ensure no projectiles are active before switching
    if (projectile || secondaryProjectiles.length > 0) {
         console.log("Deferring turn switch, projectiles still active.");
         return;
    }

    if (currentPlayer === 'player') {
        currentPlayer = 'enemy';
        turnDisplay.textContent = "Đối Phương";
        disableControls();
    } else {
        currentPlayer = 'player';
        turnDisplay.textContent = "Người Chơi";
        enableControls();
        aiThinking = false;
    }
}

function enemyAI() {
    // Double check conditions before proceeding
    if (currentPlayer !== 'enemy' || projectile || secondaryProjectiles.length > 0 || gameOver) {
        aiThinking = false;
        return;
    }

    const enemy = tanks[1];
    const player = tanks[0];
    if(!enemy || !player) { aiThinking = false; return; } // Safety check

    const targetX = player.x + (Math.random() - 0.5) * player.width * 0.3;
    const targetY = player.y - player.height / 2;
    const dx = targetX - enemy.x;
    const dy = enemy.y - targetY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    let firePower = Math.max(minPower, Math.min(maxPower, 35 + distance * 0.12));
    let targetAngle = calculateOptimalAngle_Basic(enemy, targetX, targetY, firePower); // Basic calculation

    // Add error
    const maxAngleError = 25 / (level + 1);
    const angleError = (Math.random() - 0.5) * maxAngleError;
    targetAngle += angleError;
    const maxPowerError = 20 / (level + 1);
    firePower += (Math.random() - 0.5) * maxPowerError;
    firePower = Math.max(minPower, Math.min(maxPower, firePower));
    enemy.angle = Math.max(5, Math.min(175, targetAngle));

    console.log(`AI [Lvl ${level}] Aim: A=${enemy.angle.toFixed(1)} P=${firePower.toFixed(1)}`);

    // Fire (ensure AI doesn't fire if something changed)
    if (currentPlayer === 'enemy' && !projectile && !gameOver) {
        fire(enemy, firePower);
    }
    // aiThinking will be reset in switchTurn or if AI check fails next frame
}

function calculateOptimalAngle_Basic(tank, targetX, targetY, power) {
    const dx = targetX - tank.x;
    const dy = tank.y - targetY;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const distance = Math.sqrt(dx*dx + dy*dy);
    angle += distance / (power * 0.6 + 15); // Slightly adjusted heuristic
    return angle;
}

function fire(tank, power) {
    if (projectile || secondaryProjectiles.length > 0) return;

    const ammoTypeKey = tank.isPlayer ? playerCurrentAmmo : enemyCurrentAmmo;
    const ammoData = ammoTypes[ammoTypeKey];

    if (tank.isPlayer) {
        const currentCount = playerAmmoCounts[ammoTypeKey];
        if (currentCount === 0) {
            playSound('empty');
            return;
        }
        if (currentCount !== Infinity) {
            playerAmmoCounts[ammoTypeKey]--;
            updateAmmoCountDisplay();
            if (playerAmmoCounts[ammoTypeKey] === 0 && ammoTypeKey !== 'normal') {
                 // Update select immediately after count becomes 0
                 updateAmmoSelect();
                 // Force selection back to normal if the fired type is now empty
                 if(ammoSelect.value === ammoTypeKey) {
                     playerCurrentAmmo = 'normal';
                     ammoSelect.value = 'normal';
                     updateAmmoCountDisplay();
                 }
            }
        }
    }

    const barrelEnd = tank.getBarrelEnd();
    projectile = new Projectile(barrelEnd.x, barrelEnd.y, tank.angle, power, tank, ammoTypeKey);
    playSound('fire');

    if (tank.isPlayer) {
        disableControls();
    }
}

function checkWinCondition() {
    if (gameOver) return; // Already ended

    const player = tanks.find(t => t.isPlayer);
    const enemy = tanks.find(t => !t.isPlayer);
    if(!player || !enemy) return; // Safety check

    let gameEnded = false;
    let message = "";

    if (enemy.health <= 0) {
        message = `Chúc mừng! Bạn đã qua Level ${level}!`;
        gameEnded = true;
        saveGameState(); // Save before potentially increasing level
        level++; // Increase level for next setup
    } else if (player.health <= 0) {
        message = `Game Over! Bạn đã thua ở Level ${level}. Chơi lại từ Level 1.`;
        gameEnded = true;
        level = 1;
        localStorage.removeItem('tankDuelSaveData_v1'); // Clear save on loss
    }

    if (gameEnded) {
        gameOver = true;
        disableControls();
        console.log(message);
        setTimeout(() => {
            alert(message);
            // Pass null to setupLevel if resetting, otherwise pass loaded state
            const stateToLoad = player.health > 0 ? loadGameState() : null;
            setupLevel(level, stateToLoad);
        }, 1500);
    }
}

// --- Local Storage ---
function saveGameState() {
    const player = tanks.find(t => t.isPlayer);
    if (gameOver && player?.health <= 0) return; // Don't save if player lost

    const state = {
        level: level, // Save the *current* level player is on or just completed
        playerHealth: player ? player.health : 100,
        playerAmmoCounts: playerAmmoCounts,
    };
    try {
        localStorage.setItem('tankDuelSaveData_v1', JSON.stringify(state));
        console.log("Game state saved:", state);
    } catch (e) { console.error("Could not save game state:", e); }
}

function loadGameState() {
    try {
        const savedData = localStorage.getItem('tankDuelSaveData_v1');
        if (savedData) {
            const state = JSON.parse(savedData);
            console.log("Loaded game state:", state);
            if (typeof state.level === 'number' && state.level > 0) {
                 level = state.level; // Update global level
                 return state;
            }
        }
    } catch (e) {
        console.error("Could not load/parse game state:", e);
        localStorage.removeItem('tankDuelSaveData_v1');
    }
    level = 1; // Default to level 1 if no valid save
    return null;
}

// --- UI Control ---
function disableControls() { /* ... (giữ nguyên) ... */ }
function enableControls() { /* ... (giữ nguyên, kiểm tra gameOver) ... */ }
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
     // Only enable controls if it's the player's turn
     if (currentPlayer === 'player') {
         btnMoveLeft.disabled = false;
         btnMoveRight.disabled = false;
         btnAngleUp.disabled = false;
         btnAngleDown.disabled = false;
         btnPowerUp.disabled = false;
         btnPowerDown.disabled = false;
         btnFire.disabled = false;
         ammoSelect.disabled = false;
     } else {
         disableControls(); // Ensure disabled if not player's turn
     }
}


// --- Event Listeners ---
function setupEventListeners() {
    // Listener an toàn hơn
    const addSafeListener = (element, eventType, handler) => {
        if (element) {
            // Remove previous listener if any (to prevent duplicates if called multiple times)
            // element.removeEventListener(eventType, handler); // Might be too aggressive
            element.addEventListener(eventType, handler);

            // Touch equivalent for buttons
            if (element.tagName === 'BUTTON' && 'ontouchstart' in window) {
                 const touchHandler = (e) => {
                     e.preventDefault();
                     handler(e); // Call original handler
                     // Visual feedback
                     element.style.transition = 'transform 0.05s ease-out'; // Add transition for feedback
                     element.style.transform = 'scale(0.95)';
                     setTimeout(() => element.style.transform = 'scale(1)', 80);
                 };
                 // element.removeEventListener('touchstart', touchHandler); // Might be too aggressive
                 element.addEventListener('touchstart', touchHandler, { passive: false });
            }

        } else { console.warn(`Element not found for listener: ${element}`); }
    };

    addSafeListener(btnMoveLeft, 'click', () => { if (!btnMoveLeft.disabled) tanks[0].move(-1, 1 / 10); }); // Faster move per click
    addSafeListener(btnMoveRight, 'click', () => { if (!btnMoveRight.disabled) tanks[0].move(1, 1 / 10); });
    addSafeListener(btnAngleUp, 'click', () => { if (!btnAngleUp.disabled) tanks[0].aim(2); });
    addSafeListener(btnAngleDown, 'click', () => { if (!btnAngleDown.disabled) tanks[0].aim(-2); });
    addSafeListener(btnPowerUp, 'click', () => { /* ... (giữ nguyên) ... */ });
    addSafeListener(btnPowerDown, 'click', () => { /* ... (giữ nguyên) ... */ });
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
    addSafeListener(ammoSelect, 'change', (e) => { playerCurrentAmmo = e.target.value; updateAmmoCountDisplay(); });
    addSafeListener(btnToggleMusic, 'click', toggleMusic);

    // --- User Interaction Listener for Audio ---
    const handleFirstInteraction = () => {
        if (!userInteracted) {
            console.log("User interaction detected.");
            userInteracted = true;
            // Now that we have interaction, try to init/resume audio context
            // and THEN try loading the audio files
            if (initAudio()) { // If context is ready or resumed
                 // Find the audio loading function and call it
                 const tryLoadAudioFunc = window.tryLoadAudioDeferred; // Get the deferred function
                 if(tryLoadAudioFunc) {
                     tryLoadAudioFunc();
                 }
            }
            // Remove listeners after first interaction
            document.removeEventListener('click', handleFirstInteraction);
            document.removeEventListener('touchstart', handleFirstInteraction);
            document.removeEventListener('keydown', handleFirstInteraction); // Also listen for keydown
        }
    };

    document.addEventListener('click', handleFirstInteraction, { once: true });
    document.addEventListener('touchstart', handleFirstInteraction, { once: true });
     document.addEventListener('keydown', handleFirstInteraction, { once: true });

     // Store the audio loading function globally so the interaction handler can call it
     window.tryLoadAudioDeferred = async () => {
         console.log("Attempting deferred audio loading...");
         const audioAssets = assetsToLoad.filter(a => a.type === 'audio'); // Re-filter audio assets
         const audioLoadPromises = audioAssets.map(asset =>
             loadAudio(asset.src).then(buffer => ({ target: asset.target, data: buffer, status: 'fulfilled', src: asset.src }))
                               .catch(error => ({ target: asset.target, reason: error, status: 'rejected', src: asset.src }))
         );

         const audioResults = await Promise.allSettled(audioLoadPromises);

         audioResults.forEach(result => {
             if (result.status === 'fulfilled' && result.value && result.value.data) {
                 soundBuffers[result.value.target] = result.value.data;
                 console.log(`Deferred Loaded Audio: ${result.value.src}`);
             } else if (result.status === 'rejected') {
                 console.error(`Deferred Failed Audio: ${result.reason?.message?.includes('assets/sounds/') ? result.reason.message.split(' ').pop() : 'Unknown Audio'} - Reason:`, result.reason);
             }
         });
         console.log("Deferred audio loading attempt finished.");
         // Try to play music now if it wasn't playing
         // if (!isMusicPlaying && btnToggleMusic.textContent.includes("Tắt")) {
         //      toggleMusic();
         // }
     };

}

// --- Game Loop ---
function gameLoop(currentTime) {
    const now = performance.now();
    // Use a default delta time if lastTime is 0 (first frame)
    const deltaTime = lastTime === 0 ? (1 / 60) : Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (assetsFullyLoaded) { // Check the modified flag
        update(deltaTime);
        draw();
    } else {
         // Optional: Draw a simple loading message on canvas if needed
         // ctx.fillStyle = 'black'; ctx.fillRect(0,0,canvasWidth, canvasHeight);
         // ctx.fillStyle = 'white'; ctx.fillText("Waiting for assets...", 10, 30);
    }

    requestAnimationFrame(gameLoop);
}

// --- Start Game ---
function startGameLogic() {
    console.log("Starting Game Logic...");
    setupEventListeners(); // Setup listeners after DOM is ready
    const loadedState = loadGameState();
    setupLevel(level, loadedState);
    updateWindDisplay();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

// --- Initial Load ---
// Don't start game logic immediately, wait for loadAssets
console.log("Document Loaded. Initializing asset loading...");
loadAssets(); // Start loading assets
