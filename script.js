const LEVELS = {
  beginner: { rows: 9, cols: 9, mines: 10, label: "초급" },
  intermediate: { rows: 16, cols: 16, mines: 40, label: "중급" },
  expert: { rows: 16, cols: 30, mines: 99, label: "고급" },
};

const boardEl = document.querySelector("#board");
const statusEl = document.querySelector("#status");
const mineCountEl = document.querySelector("#mine-count");
const timerEl = document.querySelector("#timer");
const newGameBtn = document.querySelector("#new-game");
const levelButtons = document.querySelectorAll(".level");
const modeButtons = document.querySelectorAll(".mode");

let levelKey = "beginner";
let inputMode = "open";
let cells = [];
let started = false;
let gameOver = false;
let openedCount = 0;
let flaggedCount = 0;
let seconds = 0;
let timerId = null;

function createCell(row, col) {
  return {
    row,
    col,
    mine: false,
    open: false,
    flagged: false,
    neighborMines: 0,
  };
}

function resetGame(nextLevel = levelKey) {
  levelKey = nextLevel;
  const { rows, cols, mines } = LEVELS[levelKey];
  cells = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => createCell(row, col)),
  );
  started = false;
  gameOver = false;
  openedCount = 0;
  flaggedCount = 0;
  seconds = 0;
  clearInterval(timerId);
  timerId = null;
  statusEl.textContent = "첫 칸을 열어 게임을 시작하세요.";
  timerEl.textContent = "0";
  mineCountEl.textContent = String(mines);
  setActiveLevel();
  setActiveMode("open");
  renderBoard();
}

function setActiveLevel() {
  levelButtons.forEach((button) => {
    const active = button.dataset.level === levelKey;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setActiveMode(nextMode) {
  inputMode = nextMode;
  modeButtons.forEach((button) => {
    const active = button.dataset.mode === inputMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderBoard() {
  const { rows, cols } = LEVELS[levelKey];
  const gap = 3;
  const maxShellWidth = 1440;
  const outerPadding = window.innerWidth <= 640 ? 20 : 36;
  const shellChrome = window.innerWidth <= 640 ? 42 : 52;
  const verticalChrome = window.innerWidth <= 640 ? 220 : 190;
  const availableWidth = Math.min(window.innerWidth - outerPadding, maxShellWidth) - shellChrome;
  const availableHeight = window.innerHeight - verticalChrome;
  const sizeByWidth = Math.floor((availableWidth - gap * (cols - 1)) / cols);
  const sizeByHeight = Math.floor((availableHeight - gap * (rows - 1)) / rows);
  const size = Math.max(20, Math.min(42, sizeByWidth, sizeByHeight));

  boardEl.style.setProperty("--cols", cols);
  boardEl.style.setProperty("--cell-size", `${size}px`);
  boardEl.innerHTML = "";

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = cells[row][col];
      const button = document.createElement("button");
      button.type = "button";
      button.className = getCellClass(cell);
      button.dataset.row = String(row);
      button.dataset.col = String(col);
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", getCellLabel(cell));
      button.textContent = getCellText(cell);
      boardEl.append(button);
    }
  }
}

function getCellClass(cell) {
  const classes = ["cell"];
  if (cell.open) classes.push("open");
  if (cell.flagged) classes.push("flagged");
  if (cell.mine) classes.push("mine");
  if (cell.open && cell.neighborMines > 0) classes.push(`n${cell.neighborMines}`);
  return classes.join(" ");
}

function getCellText(cell) {
  if (cell.flagged) return "⚑";
  if (!cell.open) return "";
  if (cell.mine) return "✹";
  return cell.neighborMines ? String(cell.neighborMines) : "";
}

function getCellLabel(cell) {
  if (cell.flagged) return "깃발 표시됨";
  if (!cell.open) return "닫힌 칸";
  if (cell.mine) return "지뢰";
  if (cell.neighborMines) return `주변 지뢰 ${cell.neighborMines}개`;
  return "빈 칸";
}

function placeMines(safeRow, safeCol) {
  const { rows, cols, mines } = LEVELS[levelKey];
  const blocked = new Set(getNeighbors(safeRow, safeCol, true).map(keyOf));
  let placed = 0;

  while (placed < mines) {
    const row = Math.floor(Math.random() * rows);
    const col = Math.floor(Math.random() * cols);
    const cell = cells[row][col];
    if (cell.mine || blocked.has(keyOf({ row, col }))) continue;
    cell.mine = true;
    placed += 1;
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells[row][col].neighborMines = getNeighbors(row, col).filter(
        (neighbor) => cells[neighbor.row][neighbor.col].mine,
      ).length;
    }
  }
}

function getNeighbors(row, col, includeSelf = false) {
  const { rows, cols } = LEVELS[levelKey];
  const neighbors = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (!includeSelf && rowOffset === 0 && colOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;
      if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) continue;
      neighbors.push({ row: nextRow, col: nextCol });
    }
  }
  return neighbors;
}

function keyOf({ row, col }) {
  return `${row}:${col}`;
}

function openCell(row, col) {
  if (gameOver) return;
  const cell = cells[row][col];
  if (cell.open || cell.flagged) return;

  if (!started) {
    started = true;
    placeMines(row, col);
    startTimer();
    statusEl.textContent = "지뢰를 피해 모든 칸을 여세요.";
  }

  cell.open = true;
  openedCount += 1;

  if (cell.mine) {
    endGame(false);
    return;
  }

  if (cell.neighborMines === 0) {
    floodOpen(row, col);
  }

  checkWin();
  renderBoard();
}

function floodOpen(row, col) {
  const queue = getNeighbors(row, col);
  while (queue.length) {
    const { row: nextRow, col: nextCol } = queue.shift();
    const cell = cells[nextRow][nextCol];
    if (cell.open || cell.flagged || cell.mine) continue;

    cell.open = true;
    openedCount += 1;

    if (cell.neighborMines === 0) {
      queue.push(...getNeighbors(nextRow, nextCol));
    }
  }
}

function toggleFlag(row, col) {
  if (gameOver) return;
  const cell = cells[row][col];
  if (cell.open) return;

  cell.flagged = !cell.flagged;
  flaggedCount += cell.flagged ? 1 : -1;
  mineCountEl.textContent = String(LEVELS[levelKey].mines - flaggedCount);
  renderBoard();
}

function chordOpen(row, col) {
  if (gameOver) return;
  const cell = cells[row][col];
  if (!cell.open || cell.neighborMines === 0) return;

  const neighbors = getNeighbors(row, col);
  const flags = neighbors.filter((neighbor) => cells[neighbor.row][neighbor.col].flagged).length;
  if (flags !== cell.neighborMines) return;

  neighbors.forEach((neighbor) => openCell(neighbor.row, neighbor.col));
}

function startTimer() {
  timerId = setInterval(() => {
    seconds += 1;
    timerEl.textContent = String(seconds);
  }, 1000);
}

function checkWin() {
  const { rows, cols, mines } = LEVELS[levelKey];
  if (openedCount !== rows * cols - mines) return;
  endGame(true);
}

function endGame(won) {
  gameOver = true;
  clearInterval(timerId);
  timerId = null;

  cells.flat().forEach((cell) => {
    if (cell.mine) cell.open = true;
  });

  statusEl.textContent = won
    ? `성공했습니다. 기록은 ${seconds}초입니다.`
    : "지뢰를 밟았습니다. 새 게임으로 다시 시작하세요.";
  renderBoard();
}

boardEl.addEventListener("click", (event) => {
  const target = event.target.closest(".cell");
  if (!target) return;
  const row = Number(target.dataset.row);
  const col = Number(target.dataset.col);
  const cell = cells[row][col];
  if (inputMode === "flag" && !cell.open) {
    toggleFlag(row, col);
    return;
  }
  if (cell.open) {
    chordOpen(row, col);
  } else {
    openCell(row, col);
  }
});

boardEl.addEventListener("contextmenu", (event) => {
  const target = event.target.closest(".cell");
  if (!target) return;
  event.preventDefault();
  toggleFlag(Number(target.dataset.row), Number(target.dataset.col));
});

newGameBtn.addEventListener("click", () => resetGame());

levelButtons.forEach((button) => {
  button.addEventListener("click", () => resetGame(button.dataset.level));
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveMode(button.dataset.mode));
});

window.addEventListener("resize", renderBoard);

resetGame();
