const canvas = document.querySelector('#arena');
const ctx = canvas.getContext('2d');

const p1HealthEl = document.querySelector('#p1Health');
const p2HealthEl = document.querySelector('#p2Health');
const p1RoundsEl = document.querySelector('#p1Rounds');
const p2RoundsEl = document.querySelector('#p2Rounds');
const timerTextEl = document.querySelector('#timerText');
const roundTextEl = document.querySelector('#roundText');
const messageEl = document.querySelector('#message');
const restartBtn = document.querySelector('#restartBtn');

const GROUND_Y = canvas.height - 70;
const ROUND_TIME = 60;
const MAX_ROUNDS_TO_WIN = 2;

const keys = {};
let lastTick = performance.now();
let roundTimer = ROUND_TIME;
let roundSecondsAccumulator = 0;
let roundOver = false;
let gameOver = false;

function createFighter(config) {
  return {
    name: config.name,
    x: config.x,
    y: GROUND_Y,
    width: 46,
    height: 106,
    color: config.color,
    outline: config.outline,
    face: config.face,
    hair: config.hair,
    top: config.top,
    pants: config.pants,
    speed: 235,
    velocityX: 0,
    velocityY: 0,
    jumpPower: 560,
    gravity: 1650,
    health: 100,
    roundsWon: 0,
    blockReduction: 0.45,
    isBlocking: false,
    facing: config.facing,
    controls: config.controls,
    attackCooldown: 0,
    hitStun: 0,
    wasAttackPressed: false,
    wasKickPressed: false,
    wasJumpPressed: false
  };
}

const p1 = createFighter({
  name: 'Player 1',
  x: 180,
  color: '#4a6a8a',
  outline: '#23384d',
  face: '#d8c1a7',
  hair: '#33241c',
  top: '#3a5572',
  pants: '#2c3138',
  facing: 1,
  controls: {
    left: 'KeyA',
    right: 'KeyD',
    jump: 'KeyW',
    punch: 'KeyF',
    kick: 'KeyG',
    block: 'KeyH'
  }
});

const p2 = createFighter({
  name: 'Player 2',
  x: canvas.width - 220,
  color: '#7f4f3f',
  outline: '#4f2d22',
  face: '#d9b69a',
  hair: '#251811',
  top: '#6d3f31',
  pants: '#2b2e34',
  facing: -1,
  controls: {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    jump: 'ArrowUp',
    punch: 'KeyK',
    kick: 'KeyL',
    block: 'Semicolon'
  }
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function onGround(fighter) {
  return fighter.y >= GROUND_Y;
}

function attack(attacker, defender, attackType) {
  if (attacker.attackCooldown > 0 || roundOver || gameOver || attacker.hitStun > 0) {
    return;
  }

  const isKick = attackType === 'kick';
  const range = isKick ? 80 : 62;
  const baseDamage = isKick ? 16 : 10;
  const cooldown = isKick ? 0.65 : 0.4;
  const verticalReach = isKick ? 70 : 58;

  attacker.attackCooldown = cooldown;

  const distanceX = Math.abs((attacker.x + attacker.width / 2) - (defender.x + defender.width / 2));
  const distanceY = Math.abs((attacker.y - attacker.height / 2) - (defender.y - defender.height / 2));
  const isInFront = attacker.facing === 1 ? defender.x > attacker.x : defender.x < attacker.x;

  if (distanceX <= range && distanceY <= verticalReach && isInFront) {
    const blockedDamage = Math.round(baseDamage * defender.blockReduction);
    const damage = defender.isBlocking ? blockedDamage : baseDamage;

    defender.health = clamp(defender.health - damage, 0, 100);
    defender.hitStun = defender.isBlocking ? 0.08 : 0.16;

    const push = defender.isBlocking ? 22 : 40;
    defender.x += attacker.facing * push;
    defender.x = clamp(defender.x, 0, canvas.width - defender.width);

    if (defender.health <= 0) {
      endRound(attacker, `${attacker.name} wins by knockout!`);
    }
  }
}

function handleInput(fighter, enemy) {
  fighter.isBlocking = Boolean(keys[fighter.controls.block]) && onGround(fighter) && fighter.hitStun <= 0;
  const left = Boolean(keys[fighter.controls.left]);
  const right = Boolean(keys[fighter.controls.right]);
  const jumpPressed = Boolean(keys[fighter.controls.jump]);
  const attackPressed = Boolean(keys[fighter.controls.punch]);
  const kickPressed = Boolean(keys[fighter.controls.kick]);

  if (fighter.hitStun <= 0) {
    if (left === right || fighter.isBlocking) {
      fighter.velocityX = 0;
    } else {
      fighter.velocityX = left ? -fighter.speed : fighter.speed;
    }

    if (jumpPressed && !fighter.wasJumpPressed && onGround(fighter) && !fighter.isBlocking) {
      fighter.velocityY = -fighter.jumpPower;
    }

    if (attackPressed && !fighter.wasAttackPressed) {
      attack(fighter, enemy, 'punch');
    }

    if (kickPressed && !fighter.wasKickPressed) {
      attack(fighter, enemy, 'kick');
    }
  }

  fighter.wasJumpPressed = jumpPressed;
  fighter.wasAttackPressed = attackPressed;
  fighter.wasKickPressed = kickPressed;
}

function updateFighter(fighter, dt) {
  fighter.attackCooldown = Math.max(0, fighter.attackCooldown - dt);
  fighter.hitStun = Math.max(0, fighter.hitStun - dt);

  fighter.velocityY += fighter.gravity * dt;
  fighter.x += fighter.velocityX * dt;
  fighter.y += fighter.velocityY * dt;

  fighter.x = clamp(fighter.x, 0, canvas.width - fighter.width);

  if (fighter.y > GROUND_Y) {
    fighter.y = GROUND_Y;
    fighter.velocityY = 0;
  }
}

function updateFacing() {
  const p1Center = p1.x + p1.width / 2;
  const p2Center = p2.x + p2.width / 2;
  if (p1Center < p2Center) {
    p1.facing = 1;
    p2.facing = -1;
  } else {
    p1.facing = -1;
    p2.facing = 1;
  }
}

function updateHud() {
  p1HealthEl.style.width = `${p1.health}%`;
  p2HealthEl.style.width = `${p2.health}%`;
  p1RoundsEl.textContent = `Rounds: ${p1.roundsWon}`;
  p2RoundsEl.textContent = `Rounds: ${p2.roundsWon}`;
  timerTextEl.textContent = String(Math.max(0, Math.ceil(roundTimer)));
}

function drawBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#9dc4e5');
  sky.addColorStop(0.6, '#b8d1e6');
  sky.addColorStop(1, '#c6d8e5');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#6f6f72';
  ctx.fillRect(0, GROUND_Y - 12, canvas.width, 130);

  ctx.fillStyle = '#56585c';
  for (let i = 0; i < canvas.width; i += 70) {
    ctx.fillRect(i, GROUND_Y + 44, 42, 4);
  }

  ctx.fillStyle = '#e7e7e7';
  ctx.fillRect(0, GROUND_Y - 12, canvas.width, 3);
}

function drawFighter(fighter) {
  ctx.save();

  const centerX = fighter.x + fighter.width / 2;
  const baseY = fighter.y;
  const headRadius = 10;
  const facing = fighter.facing;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.beginPath();
  ctx.ellipse(centerX, baseY + 3, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = fighter.pants;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(centerX - 5, baseY - 30);
  ctx.lineTo(centerX - 7, baseY - 2);
  ctx.moveTo(centerX + 5, baseY - 30);
  ctx.lineTo(centerX + 7, baseY - 2);
  ctx.stroke();

  ctx.strokeStyle = fighter.top;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(centerX, baseY - 72);
  ctx.lineTo(centerX, baseY - 30);
  ctx.stroke();

  const guardLift = fighter.isBlocking ? -6 : 0;
  const leadArmReach = fighter.hitStun > 0 ? 5 : 14;
  ctx.strokeStyle = fighter.top;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(centerX - (7 * facing), baseY - 62);
  ctx.lineTo(centerX - (16 * facing), baseY - 42 + guardLift);
  ctx.moveTo(centerX + (7 * facing), baseY - 62);
  ctx.lineTo(centerX + (leadArmReach * facing), baseY - 40 + guardLift);
  ctx.stroke();

  ctx.strokeStyle = fighter.face;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(centerX, baseY - 82);
  ctx.lineTo(centerX, baseY - 76);
  ctx.stroke();

  ctx.fillStyle = fighter.face;
  ctx.beginPath();
  ctx.arc(centerX, baseY - 93, headRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = fighter.hair;
  ctx.beginPath();
  ctx.arc(centerX, baseY - 96, headRadius, Math.PI, 2 * Math.PI);
  ctx.fill();

  ctx.fillStyle = '#1d1d1d';
  const eyeOffsetX = 3 * facing;
  ctx.beginPath();
  ctx.arc(centerX + eyeOffsetX, baseY - 94, 1.3, 0, Math.PI * 2);
  ctx.arc(centerX - (2 * facing), baseY - 94, 1.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = fighter.outline;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(centerX, baseY - 93, headRadius, 0, Math.PI * 2);
  ctx.stroke();

  if (fighter.hitStun > 0) {
    ctx.strokeStyle = 'rgba(180, 40, 40, 0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, baseY - 93, headRadius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function draw() {
  drawBackground();
  drawFighter(p1);
  drawFighter(p2);
}

function resetFighters() {
  p1.x = 180;
  p1.y = GROUND_Y;
  p1.velocityX = 0;
  p1.velocityY = 0;
  p1.health = 100;
  p1.attackCooldown = 0;
  p1.hitStun = 0;
  p1.wasAttackPressed = false;
  p1.wasKickPressed = false;
  p1.wasJumpPressed = false;

  p2.x = canvas.width - 220;
  p2.y = GROUND_Y;
  p2.velocityX = 0;
  p2.velocityY = 0;
  p2.health = 100;
  p2.attackCooldown = 0;
  p2.hitStun = 0;
  p2.wasAttackPressed = false;
  p2.wasKickPressed = false;
  p2.wasJumpPressed = false;

  roundTimer = ROUND_TIME;
  roundSecondsAccumulator = 0;
  roundOver = false;
  roundTextEl.textContent = `Round ${p1.roundsWon + p2.roundsWon + 1}`;
  messageEl.textContent = 'Fight!';
}

function endRound(winner, reason) {
  if (roundOver || gameOver) return;
  roundOver = true;

  if (winner) {
    winner.roundsWon += 1;
  }

  messageEl.textContent = reason;

  if (p1.roundsWon >= MAX_ROUNDS_TO_WIN || p2.roundsWon >= MAX_ROUNDS_TO_WIN) {
    gameOver = true;
    const champion = p1.roundsWon > p2.roundsWon ? p1 : p2;
    messageEl.textContent = `${champion.name} wins the match! Press Restart Match.`;
    roundTextEl.textContent = 'Match Over';
    return;
  }

  window.setTimeout(() => {
    if (!gameOver) {
      resetFighters();
    }
  }, 1300);
}

function handleTimer(dt) {
  if (roundOver || gameOver) return;

  roundSecondsAccumulator += dt;
  while (roundSecondsAccumulator >= 1) {
    roundSecondsAccumulator -= 1;
    roundTimer -= 1;

    if (roundTimer <= 0) {
      const winner = p1.health === p2.health ? null : (p1.health > p2.health ? p1 : p2);
      if (!winner) {
        messageEl.textContent = 'Time up! Draw round.';
        roundOver = true;
        window.setTimeout(() => {
          if (!gameOver) {
            resetFighters();
          }
        }, 1200);
      } else {
        endRound(winner, `Time up! ${winner.name} takes the round.`);
      }
      break;
    }
  }
}

function gameLoop(now) {
  const dt = Math.min((now - lastTick) / 1000, 0.033);
  lastTick = now;

  handleInput(p1, p2);
  handleInput(p2, p1);

  if (!roundOver && !gameOver) {
    updateFighter(p1, dt);
    updateFighter(p2, dt);
    updateFacing();
  }

  handleTimer(dt);
  updateHud();
  draw();

  requestAnimationFrame(gameLoop);
}

function restartMatch() {
  p1.roundsWon = 0;
  p2.roundsWon = 0;
  gameOver = false;
  resetFighters();
  updateHud();
}

window.addEventListener('keydown', (event) => {
  keys[event.code] = true;
  if (['ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
    event.preventDefault();
  }
});

window.addEventListener('keyup', (event) => {
  keys[event.code] = false;
});

restartBtn.addEventListener('click', restartMatch);

resetFighters();
updateHud();
requestAnimationFrame((t) => {
  lastTick = t;
  gameLoop(t);
});
