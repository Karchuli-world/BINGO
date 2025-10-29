(function(){
  // Elements
  const playerGridEl = document.getElementById('playerGrid');
  const botGridEl = document.getElementById('botGrid');
  const autoFillBtn = document.getElementById('autoFillBtn');
  const submitBtn = document.getElementById('submitBtn');
  const newGameBtn = document.getElementById('newGameBtn');
  const startBtn = document.getElementById('startBtn');
  const availableEl = document.getElementById('availableNumbers');
  const calledEl = document.getElementById('called');
  const lastActionEl = document.getElementById('lastAction');
  const statusText = document.getElementById('statusText');
  const turnIndicator = document.getElementById('turnIndicator');
  const playerBingoContainer = document.getElementById('playerBingoContainer');

  const playerLetterEls = [document.getElementById('pL0'),document.getElementById('pL1'),document.getElementById('pL2'),document.getElementById('pL3'),document.getElementById('pL4')];
  const botLetterEls = [document.getElementById('bL0'),document.getElementById('bL1'),document.getElementById('bL2'),document.getElementById('bL3'),document.getElementById('bL4')];

  // Config
  const SIZE = 5;
  const MAX = SIZE * SIZE;

  // State
  let playerCard = null;
  let botCard = null;
  let playerX = [];
  let botX = [];
  let availableNumbers = [];
  let submitted = false;
  let gameStarted = false;
  let awaitingAck = false;
  let botPickValue = null;
  let history = [];
  let activePicker = null;
  // Letters tracked as booleans in order [B,I,N,G,O]
  let playerLetters = [false,false,false,false,false];
  let botLetters = [false,false,false,false,false];
  let playerClaimedLines = new Set(); // strings identifying which exact lines already counted for player
  let botClaimedLines = new Set();
  let nextPlayerLetterIndex = 0; // 0..4 award order for player
  let nextBotLetterIndex = 0;
  let gameOver = false;

  // Helpers
  function makeNumbers1toN(n){ return Array.from({length:n}, (_,i)=>i+1); }
  function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } }
  function chunk(arr, size){ const out=[]; for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; }
  function lineId(ln){ // deterministic id for a line object
    if(ln.type === 'row') return `row:${ln.index}`;
    if(ln.type === 'col') return `col:${ln.index}`;
    if(ln.type === 'diag') return `diag:${ln.which}`; // which 1 or 2
    return 'unknown';
  }

  // Renderers
  function renderPlayer(){
    playerGridEl.style.gridTemplateColumns = `repeat(${SIZE}, 1fr)`;
    playerGridEl.innerHTML = '';
    if(!playerCard){ createEmptyPlayer(); return; }
    for(let r=0;r<SIZE;r++){
      for(let c=0;c<SIZE;c++){
        const val = playerCard[r][c];
        const el = document.createElement('div');
        el.className = 'cell' + (val===null ? ' empty' : '') + (playerX[r][c] ? ' x' : '') + (isCellInAnyCompletedLine(playerClaimedLines, r, c) ? ' win-highlight' : '');
        el.textContent = val===null ? '' : (val===0 ? 'FREE' : val);
        el.addEventListener('click', (e)=> onPlayerCellClick(el, r, c, e));
        playerGridEl.appendChild(el);
      }
    }
  }

  function renderBot(){
    botGridEl.style.gridTemplateColumns = `repeat(${SIZE}, 1fr)`;
    botGridEl.innerHTML = '';
    if(!botCard){
      for(let i=0;i<MAX;i++){
        const el = document.createElement('div');
        el.className = 'cell hidden';
        el.textContent = '';
        botGridEl.appendChild(el);
      }
      return;
    }
    const revealFull = gameStarted;
    for(let r=0;r<SIZE;r++){
      for(let c=0;c<SIZE;c++){
        const val = botCard[r][c];
        const revealed = revealFull || botX[r][c];
        const el = document.createElement('div');
        el.className = 'cell' + (botX[r][c] ? ' x' : '') + (revealed ? (isCellInAnyCompletedLine(botClaimedLines, r, c) ? ' win-highlight' : '') : ' hidden');
        el.textContent = val===0? 'FREE' : val;
        botGridEl.appendChild(el);
      }
    }
  }

  function renderAvailable(){
    availableEl.innerHTML = '';
    for(const n of makeNumbers1toN(MAX)){
      const el = document.createElement('div');
      const taken = !availableNumbers.includes(n);
      el.className = 'avail-badge' + (taken? ' taken':'' );
      el.textContent = n;
      el.addEventListener('click', ()=> {
        if(taken) return;
        if(activePicker){
          placeNumberAt(activePicker.r, activePicker.c, n);
          closeActivePicker();
        }
      });
      availableEl.appendChild(el);
    }
  }

  function renderCalled(){
    calledEl.innerHTML = '';
    for(const item of history){
      const span = document.createElement('span');
      span.className = 'badge';
      span.textContent = item;
      calledEl.appendChild(span);
    }
  }

  function renderLetters(){
    for(let i=0;i<5;i++){
      if(playerLetters[i]) playerLetterEls[i].classList.add('crossed'); else playerLetterEls[i].classList.remove('crossed');
      if(botLetters[i]) botLetterEls[i].classList.add('crossed'); else botLetterEls[i].classList.remove('crossed');
    }
    // player bingo button appears when playerLetters all true and player hasn't already won
    const all = playerLetters.every(Boolean);
    if(all && !gameOver){
      if(!document.getElementById('playerBingoBtn')){
        const btn = document.createElement('button');
        btn.id = 'playerBingoBtn';
        btn.className = 'bingo-btn';
        btn.innerText = 'BINGO !';
        btn.addEventListener('click', ()=> {
          if(gameOver) return;
          announceWinner('Player');
        });
        playerBingoContainer.appendChild(btn);
      }
    } else {
      const existing = document.getElementById('playerBingoBtn');
      if(existing) existing.remove();
    }
  }

  function renderAll(){
    renderPlayer();
    renderBot();
    renderAvailable();
    renderCalled();
    renderLetters();
  }

  // Picker & game creation
  function createEmptyPlayer(){
    playerCard = Array.from({length:SIZE}, ()=>Array.from({length:SIZE}, ()=>null));
    playerX = Array.from({length:SIZE}, ()=>Array.from({length:SIZE}, ()=>false));
    botX = Array.from({length:SIZE}, ()=>Array.from({length:SIZE}, ()=>false));
    availableNumbers = makeNumbers1toN(MAX);
    submitted = false;
    gameStarted = false;
    awaitingAck = false;
    botPickValue = null;
    history = [];
    activePicker = null;
    playerLetters = [false,false,false,false,false];
    botLetters = [false,false,false,false,false];
    playerClaimedLines.clear();
    botClaimedLines.clear();
    nextPlayerLetterIndex = 0;
    nextBotLetterIndex = 0;
    gameOver = false;
    submitBtn._submitted = false;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submit Card';
    startBtn.textContent = 'Start';
    lastActionEl.textContent = '—';
    turnIndicator.textContent = '';
    statusText.textContent = 'Pick numbers into your card using the picker. Submit when ready.';
    playerBingoContainer.innerHTML = '';
    renderAll();
  }

  function generateBotCard(){
    const nums = makeNumbers1toN(MAX);
    shuffle(nums);
    botCard = chunk(nums, SIZE);
    botX = Array.from({length:SIZE}, ()=>Array.from({length:SIZE}, ()=>false));
  }

  function openPicker(cellEl, r, c, event){
    if(submitted) return;
    closeActivePicker();
    const picker = document.createElement('div');
    picker.className = 'picker';
    const nums = makeNumbers1toN(MAX);
    for(const n of nums){
      const taken = !availableNumbers.includes(n) && !(playerCard[r][c]===n);
      const btn = document.createElement('div');
      btn.className = 'pbtn' + (taken? ' disabled' : '');
      btn.textContent = n;
      btn.addEventListener('click', ()=> {
        if(taken) return;
        placeNumberAt(r,c,n);
        closeActivePicker();
      });
      picker.appendChild(btn);
    }
    const input = document.createElement('input');
    input.type = 'number';
    input.placeholder = 'Type number';
    input.min = 1; input.max = MAX;
    input.addEventListener('keydown', (ev)=> {
      if(ev.key === 'Enter'){
        const v = Number(input.value);
        if(!v){ statusText.textContent = 'Enter a valid number.'; return; }
        if(playerCard[r][c] === v || availableNumbers.includes(v)){
          placeNumberAt(r,c,v);
          closeActivePicker();
        } else {
          statusText.textContent = 'Number not available or duplicate.';
        }
      } else if(ev.key === 'Escape'){
        closeActivePicker();
      }
    });
    picker.appendChild(input);
    const removeBtn = document.createElement('div');
    removeBtn.className = 'pbtn';
    removeBtn.textContent = 'Clear';
    removeBtn.addEventListener('click', ()=> {
      const prev = playerCard[r][c];
      if(Number.isInteger(prev) && prev>=1 && prev<=MAX){
        availableNumbers.push(prev);
      }
      playerCard[r][c] = null;
      initAvailable();
      checkAutoSubmitEnable();
      renderAll();
      closeActivePicker();
    });
    picker.appendChild(removeBtn);
    cellEl.appendChild(picker);
    activePicker = {cellEl, r, c, pickerEl: picker};
    input.focus();
  }

  function closeActivePicker(){
    if(activePicker){
      try{ activePicker.pickerEl.remove(); } catch(e){}
      activePicker = null;
    }
  }

  function placeNumberAt(r,c,n){
    n = Number(n);
    if(!Number.isInteger(n) || n<1 || n>MAX){
      statusText.textContent = 'Number must be between 1 and ' + MAX + '.';
      return;
    }
    const flat = playerCard.flat();
    const existingIdx = flat.indexOf(n);
    if(existingIdx !== -1 && playerCard[r][c] !== n){
      statusText.textContent = 'That number is already used on your card.';
      return;
    }
    const prev = playerCard[r][c];
    if(Number.isInteger(prev) && prev>=1 && prev<=MAX){
      availableNumbers.push(prev);
    }
    playerCard[r][c] = n;
    const idx = availableNumbers.indexOf(n);
    if(idx !== -1) availableNumbers.splice(idx,1);
    initAvailable();
    checkAutoSubmitEnable();
    renderAll();
  }

  function initAvailable(){
    availableNumbers = makeNumbers1toN(MAX);
    if(playerCard){
      for(const v of playerCard.flat()){
        if(Number.isInteger(v) && v>=1 && v<=MAX){
          const idx = availableNumbers.indexOf(v);
          if(idx !== -1) availableNumbers.splice(idx,1);
        }
      }
    }
    renderAvailable();
  }

  function checkAutoSubmitEnable(){
    const allFilled = playerCard && playerCard.flat().every(x => (Number.isInteger(x) && x>=1 && x<=MAX) || x===0);
    submitBtn.disabled = !allFilled;
  }

  // Turn-based logic
  function onPlayerCellClick(cellEl, r, c, event){
    const val = playerCard[r][c];
    if(!submitted){
      openPicker(cellEl, r, c, event);
      return;
    }
    if(gameOver) return;
    if(awaitingAck){
      if(val === botPickValue){
        markPlayerXForNumber(val);
        history.push('Player ack ' + val);
        lastActionEl.textContent = 'You acknowledged ' + val;
        awaitingAck = false;
        botPickValue = null;
        statusText.textContent = 'Your turn. Pick any number on your card.';
        turnIndicator.textContent = 'Player turn';
        afterMarkingChecks('player');
        renderAll();
      } else {
        statusText.textContent = 'Please click the same number the Bot chose: ' + botPickValue;
      }
      return;
    }
    if(!gameStarted) return;
    if(val === null) return;
    if(playerX[r][c]) return;
    playerX[r][c] = true;
    markBotXForNumber(val);
    history.push('Player pick ' + val);
    lastActionEl.textContent = 'You picked ' + val;
    statusText.textContent = 'Bot will pick now.';
    turnIndicator.textContent = 'Bot picking';
    afterMarkingChecks('player');
    renderAll();
    setTimeout(()=> botMakePick(), 500);
  }

  function markBotXForNumber(n){
    for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
      if(botCard && botCard[r][c] === n){
        botX[r][c] = true;
      }
    }
  }
  function markPlayerXForNumber(n){
    for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
      if(playerCard[r][c] === n){
        playerX[r][c] = true;
      }
    }
  }

  function botMakePick(){
    if(!botCard || gameOver) return;
    const candidates = [];
    for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
      const v = botCard[r][c];
      if(!botX[r][c]) candidates.push(v);
    }
    if(candidates.length === 0){
      statusText.textContent = 'Bot has no available picks left.';
      return;
    }
    shuffle(candidates);
    const pick = candidates[0];
    markBotXForNumber(pick);
    botPickValue = pick;
    awaitingAck = true;
    history.push('Bot pick ' + pick);
    lastActionEl.textContent = 'Bot chose ' + pick;
    statusText.textContent = 'Bot chose ' + pick + '. Click the same number on your card to acknowledge.';
    turnIndicator.textContent = 'Awaiting your ack';
    afterMarkingChecks('bot');
    renderAll();
  }

  // Line detection: rows, cols, two diags
  function collectCompletedLines(marked){
    const n = SIZE;
    const lines = [];
    // rows
    for(let r=0;r<n;r++){
      if(marked[r].every(Boolean)){
        lines.push({type:'row', index:r});
      }
    }
    // cols
    for(let c=0;c<n;c++){
      let ok=true;
      for(let r=0;r<n;r++) if(!marked[r][c]){ ok=false; break; }
      if(ok) lines.push({type:'col', index:c});
    }
    // diag TL-BR
    let d1=true; for(let i=0;i<n;i++) if(!marked[i][i]) d1=false;
    if(d1) lines.push({type:'diag', which:1});
    // diag TR-BL
    let d2=true; for(let i=0;i<n;i++) if(!marked[i][n-1-i]) d2=false;
    if(d2) lines.push({type:'diag', which:2});
    return lines;
  }

  // Helper to see whether a cell belongs to any line that has been claimed for that side
  function isCellInAnyCompletedLine(claimedLinesSet, r, c){
    for(const id of claimedLinesSet){
      // id format: row:i, col:j, diag:1 or diag:2
      const parts = id.split(':');
      if(parts[0] === 'row'){
        const i = Number(parts[1]); if(i === r) return true;
      } else if(parts[0] === 'col'){
        const j = Number(parts[1]); if(j === c) return true;
      } else if(parts[0] === 'diag'){
        const which = Number(parts[1]);
        if(which === 1 && r === c) return true;
        if(which === 2 && r === SIZE-1-c) return true;
      }
    }
    return false;
  }

  // Award next letter in sequence for a new line (for player or bot)
  function awardLettersForNewLines(actor){
    if(actor === 'player'){
      const lines = collectCompletedLines(playerX);
      for(const ln of lines){
        const id = lineId(ln);
        if(playerClaimedLines.has(id)) continue; // already counted
        if(nextPlayerLetterIndex > 4) { playerClaimedLines.add(id); continue; } // already full
        // claim this line and award next letter
        playerClaimedLines.add(id);
        playerLetters[nextPlayerLetterIndex] = true;
        nextPlayerLetterIndex++;
      }
    } else { // bot
      const lines = collectCompletedLines(botX);
      for(const ln of lines){
        const id = lineId(ln);
        if(botClaimedLines.has(id)) continue;
        if(nextBotLetterIndex > 4) { botClaimedLines.add(id); continue; }
        botClaimedLines.add(id);
        botLetters[nextBotLetterIndex] = true;
        nextBotLetterIndex++;
      }
    }
  }

  // Run after marking step
  function afterMarkingChecks(actor){
    if(gameOver) return;
    // award letters for newly completed lines in sequence
    awardLettersForNewLines('player');
    awardLettersForNewLines('bot');

    renderLetters();

    // bot auto-win if it has all letters
    if(botLetters.every(Boolean)){
      announceWinner('Bot');
      return;
    }

    // player does NOT auto-win by a single line; they must press BINGO ! to claim
    // No immediate single-line auto-win in this mode
  }

  function announceWinner(who){
    gameOver = true;
    gameStarted = false;
    awaitingAck = false;
    turnIndicator.textContent = who + ' wins!';
    statusText.textContent = who + ' wins! Press New Game to play again.';
    lastActionEl.textContent = who + ' wins!';
    submitBtn.disabled = true;
    startBtn.disabled = true;
    const existing = document.getElementById('playerBingoBtn');
    if(existing) existing.disabled = true;
    renderAll();
  }

  // Controls wiring
  autoFillBtn.addEventListener('click', ()=> {
    const nums = makeNumbers1toN(MAX);
    shuffle(nums);
    playerCard = chunk(nums, SIZE);
    playerX = Array.from({length:SIZE}, ()=>Array.from({length:SIZE}, ()=>false));
    initAvailable();
    checkAutoSubmitEnable();
    renderAll();
  });

  submitBtn.addEventListener('click', ()=> {
    if(submitBtn.disabled) return;
    if(!playerCard || !playerCard.flat().every(x => (Number.isInteger(x) && x>=1 && x<=MAX) || x===0)){
      statusText.textContent = 'Invalid card. Fill all cells.';
      return;
    }
    const vals = playerCard.flat().filter(v=>v!==0);
    const set = new Set(vals);
    if(set.size !== vals.length){
      statusText.textContent = 'Duplicates detected. Fix before submit.';
      return;
    }
    submitted = true;
    submitBtn._submitted = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Card Submitted';
    statusText.textContent = 'Player card submitted. Click New Game to generate bot card.';
    closeActivePicker();
    renderAll();
  });

  newGameBtn.addEventListener('click', ()=> {
    if(!playerCard || !playerCard.flat().every(x => Number.isInteger(x) || x===0)){
      statusText.textContent = 'Fill and Submit your player card first.';
      return;
    }
    if(!submitted){
      statusText.textContent = 'Submit your player card before generating bot.';
      return;
    }
    generateBotCard();
    playerX = Array.from({length:SIZE}, ()=>Array.from({length:SIZE}, ()=>false));
    botX = Array.from({length:SIZE}, ()=>Array.from({length:SIZE}, ()=>false));
    history = [];
    awaitingAck = false;
    botPickValue = null;
    gameStarted = false;
    startBtn.textContent = 'Start';
    lastActionEl.textContent = 'Bot generated';
    statusText.textContent = 'Bot generated. Press Start to begin turn-based picks.';
    playerLetters = [false,false,false,false,false];
    botLetters = [false,false,false,false,false];
    playerClaimedLines.clear();
    botClaimedLines.clear();
    nextPlayerLetterIndex = 0;
    nextBotLetterIndex = 0;
    playerBingoContainer.innerHTML = '';
    gameOver = false;
    renderAll();
  });

  startBtn.addEventListener('click', ()=> {
    if(!playerCard || !submitted){ statusText.textContent = 'Submit your player card before starting.'; return; }
    if(!botCard){ statusText.textContent = 'Press New Game to generate bot card first.'; return; }
    if(gameOver) return;
    if(gameStarted){
      gameStarted = false;
      startBtn.textContent = 'Start';
      statusText.textContent = 'Paused';
      turnIndicator.textContent = '';
      return;
    }
    gameStarted = true;
    startBtn.textContent = 'Stop';
    statusText.textContent = 'Game started. Your turn first.';
    turnIndicator.textContent = 'Player turn';
    renderAll();
  });

  function checkAutoSubmitEnable(){
    const allFilled = playerCard && playerCard.flat().every(x => (Number.isInteger(x) && x>=1 && x<=MAX) || x===0);
    submitBtn.disabled = !allFilled;
  }

  // click outside picker closes it
  document.addEventListener('click', (e)=> {
    if(!activePicker) return;
    if(activePicker.cellEl.contains(e.target)) return;
    closeActivePicker();
  }, true);

  // init
  createEmptyPlayer();
  renderAll();

  // debug helper
  window._bingoSeqState = ()=> ({
    playerLetters, botLetters,
    claimedPlayer: Array.from(playerClaimedLines), claimedBot: Array.from(botClaimedLines),
    nextPlayerLetterIndex, nextBotLetterIndex
  });

})();