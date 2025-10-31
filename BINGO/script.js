(function () {
    const playerGridEl = document.getElementById('playerGrid');
    const botGridEl = document.getElementById('botGrid');
    const autoFillBtn = document.getElementById('autoFillBtn');
    const submitBtn = document.getElementById('submitBtn');
    const newGameBtn = document.getElementById('newGameBtn');
    const startBtn = document.getElementById('startBtn');
    const availableEl = document.getElementById('availableNumbers'); // still referenced safely
    const lastActionEl = document.getElementById('lastAction');
    const statusText = document.getElementById('statusText');
    const turnIndicator = document.getElementById('turnIndicator');
    const playerBingoContainer = document.getElementById('playerBingoContainer');
    const botCardContainer = document.getElementById('botCardContainer');

    const playerLetterEls = [document.getElementById('pL0'), document.getElementById('pL1'), document.getElementById('pL2'), document.getElementById('pL3'), document.getElementById('pL4')];
    const botLetterEls = [document.getElementById('bL0'), document.getElementById('bL1'), document.getElementById('bL2'), document.getElementById('bL3'), document.getElementById('bL4')];

    const menuResetCard = document.getElementById('menuResetCard');
    const menuToggleBotReveal = document.getElementById('menuToggleBotReveal');
    const menuAbout = document.getElementById('menuAbout');

    const SIZE = 5;
    const MAX = SIZE * SIZE;

    let playerCard = null;
    let botCard = null;
    let playerX = [];
    let botX = [];
    let availableNumbers = [];
    let submitted = false;
    let gameStarted = false;
    let awaitingAck = false;
    let botPickValue = null;
    let activePicker = null;
    let playerLetters = [false, false, false, false, false];
    let botLetters = [false, false, false, false, false];
    let playerClaimedLines = new Set();
    let botClaimedLines = new Set();
    let nextPlayerLetterIndex = 0;
    let nextBotLetterIndex = 0;
    let gameOver = false;
    let botRevealForced = false;

    function makeNumbers1toN(n) { return Array.from({ length: n }, (_, i) => i + 1) }
    function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]] } }
    function chunk(arr, size) { const out = []; for (let i = 0; i < arr.length; i += size)out.push(arr.slice(i, i + size)); return out }
    function lineId(ln) { if (ln.type === 'row') return `row:${ln.index}`; if (ln.type === 'col') return `col:${ln.index}`; if (ln.type === 'diag') return `diag:${ln.which}`; return 'unknown' }

    function setGridColumns() { const css = `repeat(${SIZE}, 1fr)`; playerGridEl.style.gridTemplateColumns = css; botGridEl.style.gridTemplateColumns = css; }

    function renderPlayer() {
      setGridColumns(); playerGridEl.innerHTML = '';
      if (!playerCard) { createEmptyPlayer(); return; }
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const val = playerCard[r][c];
          const el = document.createElement('div');
          el.className = 'cell' + (val === null ? ' empty' : '') + (playerX[r][c] ? ' x' : '') + (isCellInAnyCompletedLine(playerClaimedLines, r, c) ? ' win-highlight' : '');
          el.textContent = val === null ? '' : (val === 0 ? 'FREE' : val);
          el.addEventListener('click', (e) => onPlayerCellClick(el, r, c, e));
          playerGridEl.appendChild(el);
        }
      }
    }

    function renderBot() {
      setGridColumns(); botGridEl.innerHTML = '';
      if (!botCard) { for (let i = 0; i < MAX; i++) { const el = document.createElement('div'); el.className = 'cell hidden'; el.textContent = ''; botGridEl.appendChild(el) } return; }
      const revealFull = gameStarted || gameOver || botRevealForced;
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const val = botCard[r][c];
          const revealed = revealFull || botX[r][c];
          const el = document.createElement('div');
          el.className = 'cell' + (botX[r][c] ? ' x' : '') + (revealed ? (isCellInAnyCompletedLine(botClaimedLines, r, c) ? ' win-highlight' : '') : ' hidden');
          el.textContent = val === 0 ? 'FREE' : val;
          botGridEl.appendChild(el);
        }
      }
    }

    // renderAvailable is kept but safe: checks for availableEl before using it
    function renderAvailable() {
      if (!availableEl) return;
      availableEl.innerHTML = '';
      for (const n of makeNumbers1toN(MAX)) {
        const el = document.createElement('div');
        const taken = !availableNumbers.includes(n);
        el.className = 'avail-badge' + (taken ? ' taken' : '');
        el.textContent = n;
        el.addEventListener('click', () => {
          if (taken) return;
          if (activePicker) { placeNumberAt(activePicker.r, activePicker.c, n); closeActivePicker(); }
        });
        availableEl.appendChild(el);
      }
    }

    function renderLetters() {
      for (let i = 0; i < 5; i++) {
        if (playerLetters[i]) playerLetterEls[i].classList.add('crossed'); else playerLetterEls[i].classList.remove('crossed');
        if (botLetters[i]) botLetterEls[i].classList.add('crossed'); else botLetterEls[i].classList.remove('crossed');
      }
      const all = playerLetters.every(Boolean);
      if (all && !gameOver) {
        if (!document.getElementById('playerBingoBtn')) {
          const btn = document.createElement('button'); btn.id = 'playerBingoBtn'; btn.className = 'bingo-btn'; btn.innerText = 'BINGO !';
          btn.addEventListener('click', () => { if (gameOver) return; announceWinner('Player'); });
          playerBingoContainer.appendChild(btn);
        }
      } else { const existing = document.getElementById('playerBingoBtn'); if (existing) existing.remove(); }
    }

    function renderAll() { renderPlayer(); renderBot(); renderAvailable(); renderLetters(); }

    function createEmptyPlayer() {
      playerCard = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));
      playerX = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false));
      botX = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false));
      availableNumbers = makeNumbers1toN(MAX);
      submitted = false; gameStarted = false; awaitingAck = false; botPickValue = null; activePicker = null;
      playerLetters = [false, false, false, false, false]; botLetters = [false, false, false, false, false];
      playerClaimedLines.clear(); botClaimedLines.clear(); nextPlayerLetterIndex = 0; nextBotLetterIndex = 0; gameOver = false;
      submitBtn._submitted = false; submitBtn.disabled = true; submitBtn.textContent = 'Submit Card';
      startBtn.textContent = 'Start'; startBtn.disabled = false; lastActionEl.textContent = '—'; turnIndicator.textContent = '';
      statusText.textContent = 'Pick numbers into your card using the picker. Submit when ready.'; playerBingoContainer.innerHTML = '';
      botCardContainer.classList.add('hidden-card');
      renderAll();
    }

    function generateBotCard() { const nums = makeNumbers1toN(MAX); shuffle(nums); botCard = chunk(nums, SIZE); botX = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false)); botCardContainer.classList.add('hidden-card'); }

    function openPicker(cellEl, r, c, event) {
      if (submitted) return;
      closeActivePicker();
      const picker = document.createElement('div'); picker.className = 'picker';
      const nums = makeNumbers1toN(MAX);
      for (const n of nums) {
        const taken = !availableNumbers.includes(n) && !(playerCard[r][c] === n);
        const btn = document.createElement('div'); btn.className = 'pbtn' + (taken ? ' disabled' : ''); btn.textContent = n;
        btn.addEventListener('click', () => { if (taken) return; placeNumberAt(r, c, n); closeActivePicker(); });
        picker.appendChild(btn);
      }
      const input = document.createElement('input'); input.type = 'number'; input.placeholder = 'Type number'; input.min = 1; input.max = MAX;
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { const v = Number(input.value); if (!v) { statusText.textContent = 'Enter a valid number.'; return; } if (playerCard[r][c] === v || availableNumbers.includes(v)) { placeNumberAt(r, c, v); closeActivePicker(); } else { statusText.textContent = 'Number not available or duplicate.' } } else if (ev.key === 'Escape') { closeActivePicker(); } });
      picker.appendChild(input);
      const removeBtn = document.createElement('div'); removeBtn.className = 'pbtn'; removeBtn.textContent = 'Clear';
      removeBtn.addEventListener('click', () => { const prev = playerCard[r][c]; if (Number.isInteger(prev) && prev >= 1 && prev <= MAX) availableNumbers.push(prev); playerCard[r][c] = null; initAvailable(); checkAutoSubmitEnable(); renderAll(); closeActivePicker(); });
      picker.appendChild(removeBtn);
      cellEl.appendChild(picker);
      activePicker = { cellEl, r, c, pickerEl: picker };
      input.focus();
    }
    function closeActivePicker() { if (activePicker) { try { activePicker.pickerEl.remove(); } catch (e) { } activePicker = null } }

    function placeNumberAt(r, c, n) {
      n = Number(n);
      if (!Number.isInteger(n) || n < 1 || n > MAX) { statusText.textContent = 'Number must be between 1 and ' + MAX + '.'; return; }
      const flat = playerCard.flat(); const existingIdx = flat.indexOf(n);
      if (existingIdx !== -1 && playerCard[r][c] !== n) { statusText.textContent = 'That number is already used on your card.'; return; }
      const prev = playerCard[r][c]; if (Number.isInteger(prev) && prev >= 1 && prev <= MAX) availableNumbers.push(prev);
      playerCard[r][c] = n; const idx = availableNumbers.indexOf(n); if (idx !== -1) availableNumbers.splice(idx, 1);
      initAvailable(); checkAutoSubmitEnable(); renderAll();
    }

    function initAvailable() { availableNumbers = makeNumbers1toN(MAX); if (playerCard) { for (const v of playerCard.flat()) { if (Number.isInteger(v) && v >= 1 && v <= MAX) { const idx = availableNumbers.indexOf(v); if (idx !== -1) availableNumbers.splice(idx, 1); } } } renderAvailable(); }
    function checkAutoSubmitEnable() { const allFilled = playerCard && playerCard.flat().every(x => (Number.isInteger(x) && x >= 1 && x <= MAX) || x === 0); submitBtn.disabled = !allFilled; }

    function onPlayerCellClick(cellEl, r, c, event) {
      const val = playerCard[r][c];
      if (!submitted) { openPicker(cellEl, r, c, event); return; }
      if (gameOver) return;
      if (awaitingAck) {
        if (val === botPickValue) {
          markPlayerXForNumber(val);
          lastActionEl.textContent = 'You acknowledged ' + val;
          awaitingAck = false; botPickValue = null;
          statusText.textContent = 'Your turn. Pick any number on your card.'; turnIndicator.textContent = 'Player turn';
          afterMarkingChecks('player'); renderAll();
        } else { statusText.textContent = 'Please click the same number the Bot chose: ' + botPickValue; }
        return;
      }
      if (!gameStarted) return;
      if (val === null) return;
      if (playerX[r][c]) return;
      playerX[r][c] = true; markBotXForNumber(val);
      lastActionEl.textContent = 'You picked ' + val;
      statusText.textContent = 'Bot will pick now.'; turnIndicator.textContent = 'Bot picking';
      afterMarkingChecks('player'); renderAll();
      setTimeout(() => botMakePick(), 500);
    }

    function markBotXForNumber(n) { for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (botCard && botCard[r][c] === n) botX[r][c] = true }
    function markPlayerXForNumber(n) { for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (playerCard[r][c] === n) playerX[r][c] = true }

    function botMakePick() {
      if (!botCard || gameOver) return;
      const candidates = [];
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) { const v = botCard[r][c]; if (!botX[r][c]) candidates.push(v) }
      if (candidates.length === 0) { statusText.textContent = 'Bot has no available picks left.'; return; }
      shuffle(candidates); const pick = candidates[0];
      markBotXForNumber(pick);
      botPickValue = pick; awaitingAck = true;
      lastActionEl.textContent = 'Bot chose ' + pick;
      statusText.textContent = 'Bot chose ' + pick + '. Click the same number on your card to acknowledge.';
      turnIndicator.textContent = 'Awaiting your ack';
      afterMarkingChecks('bot'); renderAll();
    }

    function collectCompletedLines(marked) {
      const n = SIZE; const lines = [];
      for (let r = 0; r < n; r++) if (marked[r].every(Boolean)) lines.push({ type: 'row', index: r });
      for (let c = 0; c < n; c++) { let ok = true; for (let r = 0; r < n; r++) if (!marked[r][c]) { ok = false; break } if (ok) lines.push({ type: 'col', index: c }) }
      let d1 = true; for (let i = 0; i < n; i++) if (!marked[i][i]) d1 = false; if (d1) lines.push({ type: 'diag', which: 1 });
      let d2 = true; for (let i = 0; i < n; i++) if (!marked[i][n - 1 - i]) d2 = false; if (d2) lines.push({ type: 'diag', which: 2 });
      return lines;
    }

    function isCellInAnyCompletedLine(claimedLinesSet, r, c) {
      for (const id of claimedLinesSet) {
        const parts = id.split(':');
        if (parts[0] === 'row') { const i = Number(parts[1]); if (i === r) return true }
        else if (parts[0] === 'col') { const j = Number(parts[1]); if (j === c) return true }
        else if (parts[0] === 'diag') { const which = Number(parts[1]); if (which === 1 && r === c) return true; if (which === 2 && r === SIZE - 1 - c) return true }
      }
      return false;
    }

    function awardLettersForNewLines(actor) {
      if (actor === 'player') {
        const lines = collectCompletedLines(playerX);
        for (const ln of lines) { const id = lineId(ln); if (playerClaimedLines.has(id)) continue; if (nextPlayerLetterIndex > 4) { playerClaimedLines.add(id); continue } playerClaimedLines.add(id); playerLetters[nextPlayerLetterIndex] = true; nextPlayerLetterIndex++; }
      } else {
        const lines = collectCompletedLines(botX);
        for (const ln of lines) { const id = lineId(ln); if (botClaimedLines.has(id)) continue; if (nextBotLetterIndex > 4) { botClaimedLines.add(id); continue } botClaimedLines.add(id); botLetters[nextBotLetterIndex] = true; nextBotLetterIndex++; }
      }
    }

    function afterMarkingChecks(actor) {
      if (gameOver) return;
      awardLettersForNewLines('player'); awardLettersForNewLines('bot');
      renderLetters();
      if (playerLetters.every(Boolean)) {
        announceWinner('Player');
        return;
      }
      if (botLetters.every(Boolean)) {
        announceWinner('Bot');
        return;
      }

    }

    function announceWinner(who) {
      gameOver = true;
      gameStarted = false;
      awaitingAck = false;

      const isPlayer = who === 'Player';
      const message = isPlayer ? 'You won! 🎉' : 'You lost! 😢';

      turnIndicator.textContent = message;
      statusText.textContent = message + ' Press New Game to play again.';
      lastActionEl.textContent = message;
      submitBtn.disabled = true;
      startBtn.disabled = true;

      const existing = document.getElementById('playerBingoBtn');
      if (existing) existing.disabled = true;

      botCardContainer.classList.remove('hidden-card');
      renderAll();

      // Show winner modal
      const modalBody = document.getElementById('winnerModalBody');
      modalBody.innerHTML = `<strong>${message}</strong>`;
      const winnerModal = new bootstrap.Modal(document.getElementById('winnerModal'));
      winnerModal.show();

      // Optional: Trigger confetti only if player wins
      if (isPlayer && typeof confetti === 'function') {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 }
        });
      }

      console.log('Winner announced:', message);
    }



    autoFillBtn.addEventListener('click', () => {
      const nums = makeNumbers1toN(MAX); shuffle(nums); playerCard = chunk(nums, SIZE);
      playerX = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false));
      initAvailable(); checkAutoSubmitEnable(); renderAll();
    });

    submitBtn.addEventListener('click', () => {
      if (submitBtn.disabled) return;
      if (!playerCard || !playerCard.flat().every(x => (Number.isInteger(x) && x >= 1 && x <= MAX) || x === 0)) { statusText.textContent = 'Invalid card. Fill all cells.'; return; }
      const vals = playerCard.flat().filter(v => v !== 0); const set = new Set(vals);
      if (set.size !== vals.length) { statusText.textContent = 'Duplicates detected. Fix before submit.'; return; }
      submitted = true; submitBtn._submitted = true; submitBtn.disabled = true; submitBtn.textContent = 'Card Submitted';
      statusText.textContent = 'Player card submitted. Click New Game to generate bot card. The bot card will remain hidden until the winner is announced.';
      closeActivePicker();
      botCardContainer.classList.add('hidden-card');
      renderAll();
    });

    newGameBtn.addEventListener('click', () => {
      // If game is over, fully reset everything
      if (gameOver) {
        createEmptyPlayer(); // resets player card and all state
        botCard = null;
        botX = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false));
        botLetters = [false, false, false, false, false];
        botClaimedLines.clear();
        nextBotLetterIndex = 0;
        botRevealForced = false;
        botCardContainer.classList.add('hidden-card');
        renderAll();
        statusText.textContent = 'Game reset. Fill your card and submit to begin.';
        return;
      }

      // If game not over, proceed with bot card generation
      if (!playerCard || !playerCard.flat().every(x => Number.isInteger(x) || x === 0)) {
        statusText.textContent = 'Fill and Submit your player card first.';
        return;
      }
      if (!submitted) {
        statusText.textContent = 'Submit your player card before generating bot.';
        return;
      }

      generateBotCard();
      playerX = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false));
      botX = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false));
      awaitingAck = false;
      botPickValue = null;
      gameStarted = false;
      startBtn.textContent = 'Start';
      lastActionEl.textContent = 'Bot generated';
      statusText.textContent = 'Bot generated. Press Start to begin turn-based picks.';
      playerLetters = [false, false, false, false, false];
      botLetters = [false, false, false, false, false];
      playerClaimedLines.clear();
      botClaimedLines.clear();
      nextPlayerLetterIndex = 0;
      nextBotLetterIndex = 0;
      gameOver = false;
      renderAll();
    });


    startBtn.addEventListener('click', () => {
      if (!playerCard || !submitted) { statusText.textContent = 'Submit your player card before starting.'; return; }
      if (!botCard) { statusText.textContent = 'Press New Game to generate bot card first.'; return; }
      if (gameOver) return;
      if (gameStarted) { gameStarted = false; startBtn.textContent = 'Start'; statusText.textContent = 'Paused'; turnIndicator.textContent = ''; return; }
      gameStarted = true; startBtn.textContent = 'Stop'; statusText.textContent = 'Game started. Your turn first.'; turnIndicator.textContent = 'Player turn'; renderAll();
    });

    // menu handling
    menuResetCard.addEventListener('click', () => { createEmptyPlayer(); statusText.textContent = 'Card reset'; });
    menuToggleBotReveal.addEventListener('click', () => { botRevealForced = !botRevealForced; menuToggleBotReveal.innerText = botRevealForced ? 'Hide Bot Card' : 'Show Bot Card'; renderAll(); });
    menuToggleBotReveal.innerText = 'Show Bot Card';
    menuAbout.addEventListener('click', () => { alert('Turn-based Bingo\nSequential letters B→I→N→G→O\nMenu: Reset Card, Toggle Bot Reveal, About'); });

    document.addEventListener('click', (e) => { if (!activePicker) return; if (activePicker.cellEl.contains(e.target)) return; closeActivePicker(); }, true);

    function initAvailable() { availableNumbers = makeNumbers1toN(MAX); if (playerCard) { for (const v of playerCard.flat()) { if (Number.isInteger(v) && v >= 1 && v <= MAX) { const idx = availableNumbers.indexOf(v); if (idx !== -1) availableNumbers.splice(idx, 1); } } } renderAvailable(); }
    function checkAutoSubmitEnable() { const allFilled = playerCard && playerCard.flat().every(x => (Number.isInteger(x) && x >= 1 && x <= MAX) || x === 0); submitBtn.disabled = !allFilled; }

    createEmptyPlayer();
    renderAll();

    window._bingoSeqState = () => ({ playerLetters, botLetters, claimedPlayer: Array.from(playerClaimedLines), claimedBot: Array.from(botClaimedLines), nextPlayerLetterIndex, nextBotLetterIndex });

  })();