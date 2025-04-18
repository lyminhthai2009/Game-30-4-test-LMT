// --- Lấy các phần tử HTML ---
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

// --- Cài đặt Game ---
const canvasWidth = canvas.width;
const canvasHeight = canvas.height;
const groundHeight = 50; // Độ cao của mặt đất
const gravity = 0.2; // Gia tốc trọng trường (ảnh hưởng độ cong parabol)

// --- Trạng thái Game ---
let level = 1;
let currentPlayer = 'player'; // 'player' hoặc 'enemy'
let projectile = null; // Lưu trữ thông tin viên đạn đang bay
let tanks = []; // Mảng chứa các xe tăng
let walls = []; // Mảng chứa các bức tường
let gameOver = false;
let currentPower = 50; // Lực bắn ban đầu
const maxPower = 100;
const minPower = 10;

// --- Lớp (Class) hoặc Đối tượng cho Xe tăng ---
class Tank {
    constructor(x, y, color, facingRight = true, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.width = 50;
        this.height = 20;
        this.turretWidth = 10;
        this.turretHeight = 25; // Chiều dài nòng súng
        this.angle = 45; // Góc bắn ban đầu (độ)
        this.color = color;
        this.health = 100;
        this.maxHealth = 100;
        this.facingRight = facingRight; // Hướng xe tăng (ảnh hưởng vị trí nòng)
        this.isPlayer = isPlayer;
    }

    draw() {
        // Vẽ thân xe
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.width / 2, this.y - this.height, this.width, this.height);

        // Vẽ nòng súng (dựa vào góc và hướng)
        const angleRad = this.angle * (Math.PI / 180); // Đổi độ sang radian
        const turretEndX = this.x + this.turretHeight * Math.cos(angleRad);
        const turretEndY = this.y - this.turretHeight * Math.sin(angleRad); // y ngược hướng

        ctx.strokeStyle = 'black';
        ctx.lineWidth = this.turretWidth;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(turretEndX, turretEndY);
        ctx.stroke();
        ctx.lineWidth = 1; // Reset độ dày nét vẽ

        // Vẽ thanh máu phía trên xe tăng
        this.drawHealthBar();
    }

    drawHealthBar() {
        const barWidth = this.width;
        const barHeight = 5;
        const barX = this.x - barWidth / 2;
        const barY = this.y - this.height - barHeight - 5; // Vị trí phía trên xe
        const healthPercent = this.health / this.maxHealth;

        ctx.fillStyle = 'red';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = 'lime';
        ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
        ctx.strokeStyle = 'black';
        ctx.strokeRect(barX, barY, barWidth, barHeight);
    }

    move(distance) {
        const newX = this.x + distance;
        // Giới hạn di chuyển trong màn hình và không qua tường
        if (newX > this.width / 2 && newX < canvasWidth - this.width / 2) {
             // Kiểm tra va chạm tường (sẽ thêm sau)
            this.x = newX;
        }
    }

    aim(angleChange) {
        this.angle += angleChange;
        // Giới hạn góc bắn (ví dụ: từ 0 đến 180 độ)
        if (this.angle > 180) this.angle = 180;
        if (this.angle < 0) this.angle = 0;
    }

    getBarrelEnd() {
        // Tính toán vị trí đầu nòng súng để đạn bay ra từ đó
        const angleRad = this.angle * (Math.PI / 180);
        const endX = this.x + this.turretHeight * Math.cos(angleRad);
        const endY = this.y - this.turretHeight * Math.sin(angleRad);
        return { x: endX, y: endY };
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health < 0) this.health = 0;
        // Cập nhật hiển thị máu trên HTML
        if (this.isPlayer) {
            playerHealthDisplay.textContent = this.health;
        } else {
            enemyHealthDisplay.textContent = this.health;
        }
    }
}

// --- Lớp cho Đạn ---
class Projectile {
    constructor(x, y, angle, power, ownerTank) {
        this.x = x;
        this.y = y;
        this.radius = 5;
        this.ownerTank = ownerTank; // Xe tăng nào bắn ra

        const angleRad = angle * (Math.PI / 180);
        this.vx = power * 0.2 * Math.cos(angleRad); // Tốc độ ban đầu theo trục x
        this.vy = -power * 0.2 * Math.sin(angleRad); // Tốc độ ban đầu theo trục y (âm vì y hướng xuống)
    }

    update() {
        // Áp dụng trọng lực
        this.vy += gravity;
        // Cập nhật vị trí
        this.x += this.vx;
        this.y += this.vy;
    }

    draw() {
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Kiểm tra va chạm (đơn giản)
    checkCollision() {
        // 1. Va chạm mặt đất
        if (this.y + this.radius >= canvasHeight - groundHeight) {
            return { collided: true, target: 'ground' };
        }

        // 2. Va chạm tường (nếu có)
        for (const wall of walls) {
             if (this.x > wall.x && this.x < wall.x + wall.width &&
                 this.y > wall.y && this.y < wall.y + wall.height) {
                 return { collided: true, target: wall };
             }
        }


        // 3. Va chạm xe tăng đối phương
        const targetTank = tanks.find(tank => tank !== this.ownerTank);
        if (targetTank) {
            const dx = this.x - targetTank.x;
            const dy = this.y - (targetTank.y - targetTank.height / 2); // Lấy tâm xe tăng gần đúng
            const distance = Math.sqrt(dx * dx + dy * dy);
            // Kiểm tra va chạm với bounding box đơn giản của xe tăng
             if (this.x > targetTank.x - targetTank.width / 2 &&
                 this.x < targetTank.x + targetTank.width / 2 &&
                 this.y > targetTank.y - targetTank.height &&
                 this.y < targetTank.y) {
                return { collided: true, target: targetTank };
             }
        }

        // 4. Ra khỏi màn hình (bên trái hoặc phải)
        if (this.x < 0 || this.x > canvasWidth) {
             return { collided: true, target: 'offscreen' };
        }


        return { collided: false, target: null };
    }
}

// --- Lớp Tường (đơn giản) ---
 class Wall {
     constructor(x, y, width, height) {
         this.x = x;
         this.y = y;
         this.width = width;
         this.height = height;
         this.color = '#A0522D'; // Màu nâu đất
     }

     draw() {
         ctx.fillStyle = this.color;
         ctx.fillRect(this.x, this.y, this.width, this.height);
         ctx.strokeStyle = 'black';
         ctx.strokeRect(this.x, this.y, this.width, this.height);
     }
 }


// --- Hàm Khởi tạo Level ---
function setupLevel(levelNum) {
    gameOver = false;
    projectile = null;
    currentPlayer = 'player';
    turnDisplay.textContent = "Người Chơi";
    levelDisplay.textContent = levelNum;

    // Reset hoặc tạo xe tăng
    tanks = [
        new Tank(100, canvasHeight - groundHeight, 'blue', true, true), // Player tank
        new Tank(canvasWidth - 100, canvasHeight - groundHeight, 'red', false, false) // Enemy tank
    ];

    // Điều chỉnh máu địch theo level
    const enemyHealth = 100 + (levelNum - 1) * 20; // Ví dụ: tăng 20 máu mỗi level
    tanks[1].health = enemyHealth;
    tanks[1].maxHealth = enemyHealth;


    // Reset hiển thị máu
    playerHealthDisplay.textContent = tanks[0].health;
    enemyHealthDisplay.textContent = tanks[1].health;


    // Tạo tường ngẫu nhiên hoặc theo thiết kế cho từng level
     walls = []; // Xóa tường cũ
     if (levelNum === 1) {
         walls.push(new Wall(canvasWidth / 2 - 25, canvasHeight - groundHeight - 100, 50, 100));
     } else if (levelNum === 2) {
          walls.push(new Wall(canvasWidth / 3 - 20, canvasHeight - groundHeight - 80, 40, 80));
          walls.push(new Wall(2* canvasWidth / 3 - 20, canvasHeight - groundHeight - 120, 40, 120));
     }
     // Thêm các cấu hình level khác...

    draw(); // Vẽ lại màn hình ban đầu
    enableControls();
}

// --- Hàm Vẽ Chính ---
function draw() {
    // 1. Xóa màn hình cũ
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // 2. Vẽ nền đất
    ctx.fillStyle = '#228B22'; // Màu cỏ xanh
    ctx.fillRect(0, canvasHeight - groundHeight, canvasWidth, groundHeight);

    // 3. Vẽ tường
     walls.forEach(wall => wall.draw());


    // 4. Vẽ xe tăng
    tanks.forEach(tank => tank.draw());

    // 5. Vẽ đạn (nếu có)
    if (projectile) {
        projectile.draw();
    }

    // 6. Vẽ đường ngắm dự kiến (Tùy chọn - Nâng cao)
    // drawTrajectoryPreview();

    // 7. Vẽ thông tin khác (nếu cần)
}

// --- Hàm Cập nhật Trạng thái Game (Game Loop) ---
function update() {
    if (gameOver) return; // Dừng cập nhật nếu game đã kết thúc

    // Chỉ cập nhật đạn nếu nó đang bay
    if (projectile) {
        projectile.update();
        const collision = projectile.checkCollision();

        if (collision.collided) {
            handleCollision(collision.target); // Xử lý va chạm
            projectile = null; // Đạn biến mất
             if (!gameOver) { // Chỉ chuyển lượt nếu game chưa kết thúc sau va chạm
                 switchTurn();
             }
        }
    }
     // Nếu là lượt địch và không có đạn đang bay -> AI bắn
     else if (currentPlayer === 'enemy') {
         // Thêm độ trễ nhỏ trước khi AI bắn để trông tự nhiên hơn
         setTimeout(enemyAI, 1000); // Chờ 1 giây rồi AI bắn
     }
}

// --- Hàm Xử lý Va chạm ---
function handleCollision(target) {
    console.log("Collided with:", target);
    if (target instanceof Tank) {
        target.takeDamage(25 + Math.floor(Math.random() * 11)); // Sát thương ngẫu nhiên 25-35
         // Hiệu ứng nổ nhỏ (ví dụ)
         drawExplosion(projectile.x, projectile.y);
        checkWinCondition();
    } else if (target === 'ground' || target instanceof Wall) {
        // Hiệu ứng nổ nhỏ trên mặt đất/tường
         drawExplosion(projectile.x, projectile.y);
    }
    // Các trường hợp khác ('offscreen') không cần xử lý đặc biệt
}

// --- Hàm Vẽ Vụ Nổ (Ví dụ đơn giản) ---
 function drawExplosion(x, y) {
     ctx.fillStyle = 'orange';
     ctx.beginPath();
     ctx.arc(x, y, 20, 0, Math.PI * 2); // Vòng tròn nổ lớn hơn
     ctx.fill();
     ctx.fillStyle = 'yellow';
     ctx.beginPath();
     ctx.arc(x, y, 10, 0, Math.PI * 2); // Vòng tròn nhỏ hơn bên trong
     ctx.fill();

     // Có thể dùng setTimeout để xóa vụ nổ sau 1 khoảng thời gian ngắn
     // Hoặc chỉ vẽ 1 lần và nó sẽ bị xóa ở frame tiếp theo
 }


// --- Hàm Chuyển Lượt ---
function switchTurn() {
    if (currentPlayer === 'player') {
        currentPlayer = 'enemy';
        turnDisplay.textContent = "Đối Phương";
        disableControls(); // Không cho người chơi điều khiển khi đến lượt địch
    } else {
        currentPlayer = 'player';
        turnDisplay.textContent = "Người Chơi";
        enableControls();
    }
}

// --- Hàm AI cho địch (Rất cơ bản) ---
function enemyAI() {
     if (currentPlayer !== 'enemy' || projectile || gameOver) return; // Đảm bảo đúng lượt và không có đạn bay

     const enemy = tanks[1];
     const player = tanks[0];

     // --- Logic AI đơn giản ---
     // 1. Tính toán góc sơ bộ (có thể không chính xác)
     const dx = player.x - enemy.x;
     const dy = enemy.y - player.y; // y ngược
     let targetAngle = Math.atan2(dy, dx) * (180 / Math.PI); // Góc radian sang độ
     // Điều chỉnh góc vì xe tăng địch quay mặt sang trái (nếu cần)

     // 2. Thêm độ lệch ngẫu nhiên vào góc và lực bắn
     const angleError = (Math.random() - 0.5) * 20 * (1 / level); // Giảm độ lỗi ở level cao
     const powerError = (Math.random() - 0.2) * 30 * (1 / level) ;

     enemy.angle = Math.max(10, Math.min(170, 90 + angleError)); // AI thường bắn góc cao hơn, giới hạn 10-170
     const firePower = Math.max(minPower, Math.min(maxPower, 60 + powerError)); // Lực bắn loanh quanh 60

     console.log(`AI aiming: Angle=${enemy.angle.toFixed(1)}, Power=${firePower.toFixed(1)}`);

     // 3. Bắn
     fire(enemy, firePower); // Gọi hàm bắn với lực đã tính
 }


// --- Hàm Bắn ---
function fire(tank, power) {
    if (projectile) return; // Chỉ bắn nếu không có đạn nào đang bay

    const barrelEnd = tank.getBarrelEnd();
    projectile = new Projectile(barrelEnd.x, barrelEnd.y, tank.angle, power, tank);

     // Nếu là người chơi bắn, tạm thời vô hiệu hóa nút bắn đến khi đạn kết thúc
     if (tank.isPlayer) {
         disableControls(); // Vô hiệu hóa tất cả các nút tạm thời
     }
}

// --- Hàm Kiểm tra Điều kiện Thắng/Thua ---
function checkWinCondition() {
    const player = tanks[0];
    const enemy = tanks[1];

    if (enemy.health <= 0) {
        // Người chơi thắng level
        gameOver = true;
        setTimeout(() => {
            alert(`Chúc mừng! Bạn đã qua Level ${level}!`);
            level++;
            setupLevel(level); // Bắt đầu level mới
        }, 500); // Chờ chút để người chơi thấy vụ nổ cuối
    } else if (player.health <= 0) {
        // Người chơi thua
        gameOver = true;
         setTimeout(() => {
             alert(`Game Over! Bạn đã thua ở Level ${level}.`);
             // Có thể reset về level 1 hoặc thêm nút chơi lại
             level = 1; // Reset về level 1
             setupLevel(level);
         }, 500);
    }
}

// --- Hàm Vô hiệu hóa/Kích hoạt Nút Điều khiển ---
function disableControls() {
    btnMoveLeft.disabled = true;
    btnMoveRight.disabled = true;
    btnAngleUp.disabled = true;
    btnAngleDown.disabled = true;
    btnPowerUp.disabled = true;
    btnPowerDown.disabled = true;
    btnFire.disabled = true;
}

function enableControls() {
     // Chỉ kích hoạt nếu đến lượt người chơi và game chưa kết thúc
     if (currentPlayer === 'player' && !gameOver) {
        btnMoveLeft.disabled = false;
        btnMoveRight.disabled = false;
        btnAngleUp.disabled = false;
        btnAngleDown.disabled = false;
        btnPowerUp.disabled = false;
        btnPowerDown.disabled = false;
        btnFire.disabled = false;
     } else {
         disableControls(); // Giữ các nút bị vô hiệu hóa nếu không phải lượt người chơi
     }
}


// --- Xử lý Input (Gắn sự kiện cho các nút) ---
btnMoveLeft.addEventListener('click', () => {
    if (currentPlayer === 'player') tanks[0].move(-10);
    draw(); // Vẽ lại sau khi di chuyển
});
btnMoveRight.addEventListener('click', () => {
    if (currentPlayer === 'player') tanks[0].move(10);
    draw();
});
btnAngleUp.addEventListener('click', () => {
    if (currentPlayer === 'player') tanks[0].aim(2); // Tăng góc 2 độ
    draw();
});
btnAngleDown.addEventListener('click', () => {
    if (currentPlayer === 'player') tanks[0].aim(-2); // Giảm góc 2 độ
    draw();
});

btnPowerUp.addEventListener('click', () => {
     if (currentPlayer === 'player') {
        currentPower = Math.min(maxPower, currentPower + 5);
        powerDisplay.textContent = currentPower;
     }
});

btnPowerDown.addEventListener('click', () => {
     if (currentPlayer === 'player') {
         currentPower = Math.max(minPower, currentPower - 5);
         powerDisplay.textContent = currentPower;
     }
});


btnFire.addEventListener('click', () => {
    if (currentPlayer === 'player') fire(tanks[0], currentPower);
});

// --- Khởi động Game Loop ---
function gameLoop() {
    update(); // Cập nhật trạng thái (vị trí đạn, AI...)
    draw(); // Vẽ lại mọi thứ lên canvas
    requestAnimationFrame(gameLoop); // Lặp lại cho frame tiếp theo
}

// --- Bắt đầu Game ---
setupLevel(level); // Thiết lập màn chơi đầu tiên
gameLoop(); // Bắt đầu vòng lặp game