// Точка входа: игровой цикл, ввод и отрисовка.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Нажатые клавиши
const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));

// Временный игрок — квадрат, которым можно управлять стрелками или WASD
const player = { x: 400, y: 225, size: 32, speed: 200, color: '#4caf50' };

function update(dt) {
  let dx = 0;
  let dy = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) dx -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) dx += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) dy -= 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) dy += 1;

  // Чтобы по диагонали не двигаться быстрее
  if (dx && dy) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }

  player.x += dx * player.speed * dt;
  player.y += dy * player.speed * dt;

  // Не выпускаем игрока за границы экрана
  const half = player.size / 2;
  player.x = Math.max(half, Math.min(canvas.width - half, player.x));
  player.y = Math.max(half, Math.min(canvas.height - half, player.y));
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = player.color;
  ctx.fillRect(
    player.x - player.size / 2,
    player.y - player.size / 2,
    player.size,
    player.size
  );

  ctx.fillStyle = '#aaa';
  ctx.font = '16px sans-serif';
  ctx.fillText('Стрелки или WASD — движение', 12, 24);
}

let lastTime = performance.now();

function loop(now) {
  // dt — время с прошлого кадра в секундах (ограничено, чтобы не «прыгать» после паузы вкладки)
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  update(dt);
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
