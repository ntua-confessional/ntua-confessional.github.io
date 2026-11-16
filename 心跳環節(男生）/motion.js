document.addEventListener("DOMContentLoaded", () => {
  const rhythmScene = document.getElementById("rhythmScene");
  const rhythmDialogueBox = document.getElementById("rhythmDialogueBox");
  const rhythmDialogueText = document.getElementById("rhythmDialogueText");
  const dialogueNextHint = document.getElementById("dialogueNextHint");

  const hudTrustCard = document.getElementById("hudTrustCard");
  const trustValueText = document.getElementById("trustValueText");
  const trustDeltaPop = document.getElementById("trustDeltaPop");
  const hudTimerCard = document.getElementById("hudTimerCard");
  const timerValueText = document.getElementById("timerValueText");

  const rhythmTrackArea = document.getElementById("rhythmTrackArea");
  const rhythmWaveLabel = document.getElementById("rhythmWaveLabel");
  const rhythmWavePips = document.getElementById("rhythmWavePips");
  const rhythmTimeFill = document.getElementById("rhythmTimeFill");
  const rhythmRedZone = document.getElementById("rhythmRedZone");
  const rhythmBeatFlash = document.getElementById("rhythmBeatFlash");
  const rhythmArrow = document.getElementById("rhythmArrow");
  const rhythmJudgment = document.getElementById("rhythmJudgment");

  const rhythmCharacterImg = document.getElementById("rhythmCharacterImg");
  const rhythmHeartBtn = document.getElementById("rhythmHeartBtn");
  const rhythmCandlesWrap = document.getElementById("rhythmCandlesWrap");
  const rhythmCandlesImg = document.getElementById("rhythmCandlesImg");
  const rhythmInstructionText = document.getElementById(
    "rhythmInstructionText",
  );
  const rhythmActionBtn = document.getElementById("rhythmActionBtn");

  const urlParams = new URLSearchParams(window.location.search);
  const selectedGender =
    urlParams.get("gender") || sessionStorage.getItem("selectedGender") || null;
  if (rhythmScene && selectedGender) {
    rhythmScene.setAttribute("data-gender", selectedGender);
  }

  // 素材檔名自動備援
  function setupImageFallback(imgEl, fallbacks, onFallbackApplied) {
    if (!imgEl) return;
    let index = 0;
    imgEl.addEventListener("error", () => {
      if (index < fallbacks.length) {
        const nextSrc = fallbacks[index++];
        imgEl.src = nextSrc;
        if (typeof onFallbackApplied === "function") {
          onFallbackApplied(nextSrc);
        }
      }
    });
  }

  setupImageFallback(
    rhythmCharacterImg,
    ["IMG_8962 2_2.jpg", "IMG_8962 2.png", "IMG_8962.png"],
    (src) => {
      if (src.toLowerCase().endsWith(".png")) {
        rhythmCharacterImg.classList.remove("is-black-bg");
      } else {
        rhythmCharacterImg.classList.add("is-black-bg");
      }
    },
  );
  setupImageFallback(rhythmCandlesImg, ["Candle_0.jpg", "Candle_0.svg"]);

  // =========================================
  // Web Audio 合成音效
  // =========================================
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function playTone(
    freq,
    duration,
    type = "sine",
    gainVal = 0.14,
    endFreqRatio = 0.55,
  ) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(30, freq * endFreqRatio),
      now + duration,
    );

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  // =========================================
  // 打字機效果控制器
  // =========================================
  const typewriter = (() => {
    let timerId = null;
    let isTyping = false;
    let fullText = "";
    let targetEl = null;
    let onDoneCallback = null;

    function stop() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      isTyping = false;
      if (targetEl) {
        targetEl.classList.remove("is-typing");
      }
    }

    function finishImmediately() {
      if (!isTyping) return false;
      stop();
      if (targetEl) {
        targetEl.textContent = fullText;
      }
      const cb = onDoneCallback;
      onDoneCallback = null;
      if (typeof cb === "function") cb();
      return true;
    }

    function start(el, text, speed = 46, onDone = null, withSound = true) {
      stop();
      if (!el) return;
      targetEl = el;
      fullText = text;
      onDoneCallback = onDone;
      isTyping = true;
      el.textContent = "";
      el.classList.add("is-typing");

      const chars = Array.from(text);
      let idx = 0;

      function step() {
        if (!isTyping) return;
        if (idx >= chars.length) {
          stop();
          const cb = onDoneCallback;
          onDoneCallback = null;
          if (typeof cb === "function") cb();
          return;
        }

        const ch = chars[idx++];
        el.textContent += ch;
        if (withSound && ch.trim() !== "" && idx % 2 === 1) {
          playTone(520, 0.03, "triangle", 0.03, 0.85);
        }

        const pauseExtra = "，。！？…、".includes(ch) ? 130 : 0;
        timerId = setTimeout(step, speed + pauseExtra);
      }

      step();
    }

    return {
      start,
      finishImmediately,
      stop,
      get active() {
        return isTyping;
      },
    };
  })();

  // =========================================
  // 遊戲數值與流程圖分支設定
  // 過：兩根蠟燭熄滅（7 -> 5 根燃燒）
  // 沒過：信任值 -15、三根蠟燭熄滅（7 -> 4 根燃燒）
  // =========================================
  const INITIAL_TRUST = 100;
  const TOTAL_CANDLES = 7;
  const PASS_EXTINGUISH_COUNT = 2; // 過：兩根蠟燭熄滅
  const FAIL_EXTINGUISH_COUNT = 3; // 沒過：三根蠟燭熄滅
  const TRUST_PENALTY = 15; // 沒過：信任值-15
  const TOTAL_TIME_LIMIT = 16.0; // 時間限制（秒）
  const HIT_TOLERANCE = 1.6; // 嚴格判定容錯（百分比）

  let phase = "intro-dialogue"; // intro-dialogue | rhythm | outro-dialogue
  let trustScore = INITIAL_TRUST;
  let remainingTime = TOTAL_TIME_LIMIT;
  let countdownRafId = null;
  let lastCountdownTick = 0;

  // 開場對話環節腳本
  const introScript = [
    "和您的對話令我感到懷疑。",
    "你的呼吸越來越急促……在主面前，你隱瞞了什麼？",
    "別試圖用言語掩飾了——讓我聽聽你真實的心跳聲吧。",
  ];
  let introLineIndex = 0;

  // 四階段高難度不規則心跳波形
  const waves = [
    {
      label: "第 1 階段心律：急促加速脈動",
      dialogue: "「和您的對話令我感到懷疑。」",
      zoneStart: 48,
      zoneWidth: 13,
      duration: 1750,
      cueTimes: [0.18, 0.36],
      curve(t) {
        return (0.45 * t + 0.55 * Math.pow(t, 2.2)) * 100;
      },
    },
    {
      label: "第 2 階段心律：驟停頓挫・突進",
      dialogue: "「……你的眼神為什麼在閃躲？」",
      zoneStart: 60,
      zoneWidth: 12,
      duration: 1950,
      cueTimes: [0.16, 0.48],
      curve(t) {
        if (t < 0.28) return (t / 0.28) * 38;
        if (t < 0.5) return 38 + ((t - 0.28) / 0.22) * 2;
        const k = (t - 0.5) / 0.5;
        return 40 + Math.pow(k, 1.25) * 60;
      },
    },
    {
      label: "第 3 階段心律：心律顫動・逆向回彈",
      dialogue: "「別想編造謊言，你的脈搏正在發抖！」",
      zoneStart: 42,
      zoneWidth: 11,
      duration: 2050,
      cueTimes: [0.2, 0.42, 0.55],
      curve(t) {
        if (t < 0.32) return (t / 0.32) * 34;
        if (t < 0.48) return 34 - ((t - 0.32) / 0.16) * 11;
        const k = (t - 0.48) / 0.52;
        return 23 + Math.pow(k, 1.35) * 77;
      },
    },
    {
      label: "第 4 階段心律：極限心悸・終局詰問",
      dialogue: "「案發當晚，你真的待在教堂裡嗎？！」",
      zoneStart: 66,
      zoneWidth: 10,
      duration: 1480,
      cueTimes: [0.14, 0.28, 0.42],
      curve(t) {
        const jitter = Math.sin(t * Math.PI * 3) * 0.025;
        return Math.min(100, Math.max(0, (t + jitter) * 100));
      },
    },
  ];

  // =========================================
  // 蠟燭動態控制（由右至左依序熄滅並飄煙）
  // =========================================
  let candleTimers = [];

  function clearCandleTimers() {
    candleTimers.forEach((id) => clearTimeout(id));
    candleTimers = [];
  }

  function resetCandles() {
    clearCandleTimers();
    if (!rhythmCandlesWrap) return;
    rhythmCandlesWrap.querySelectorAll(".candle-flame-slot").forEach((slot) => {
      slot.classList.remove("is-extinguished");
    });
  }

  function extinguishCandlesFromRight(count) {
    clearCandleTimers();
    if (!rhythmCandlesWrap) return;
    const clampedCount = Math.min(TOTAL_CANDLES, Math.max(0, count));
    for (let i = 0; i < clampedCount; i += 1) {
      const targetIndex = TOTAL_CANDLES - 1 - i; // 由最右側第 7 根（索引 6）往左依序熄滅
      const slot = rhythmCandlesWrap.querySelector(
        `.candle-flame-slot[data-candle-index="${targetIndex}"]`,
      );
      if (slot) {
        const timerId = setTimeout(() => {
          slot.classList.add("is-extinguished");
          playTone(190, 0.18, "sine", 0.06, 0.4);
        }, i * 220);
        candleTimers.push(timerId);
      }
    }
  }

  // =========================================
  // HUD 信任值與時間限制更新
  // =========================================
  function updateTrustUI(deducted = false) {
    if (trustValueText) {
      trustValueText.textContent = String(Math.max(0, trustScore));
    }
    if (deducted) {
      if (hudTrustCard) {
        hudTrustCard.classList.remove("is-damaged");
        void hudTrustCard.offsetWidth;
        hudTrustCard.classList.add("is-damaged");
      }
      if (trustDeltaPop) {
        trustDeltaPop.textContent = `-${TRUST_PENALTY}`;
        trustDeltaPop.classList.remove("is-popping");
        void trustDeltaPop.offsetWidth;
        trustDeltaPop.classList.add("is-popping");
      }
    }
  }

  function updateTimerUI() {
    const clamped = Math.max(0, remainingTime);
    if (timerValueText) {
      timerValueText.textContent = `${clamped.toFixed(1)}s`;
    }
    if (rhythmTimeFill) {
      const ratio = clamped / TOTAL_TIME_LIMIT;
      rhythmTimeFill.style.transform = `scaleX(${ratio})`;
      rhythmTimeFill.classList.toggle("is-urgent", clamped <= 5.0);
    }
    if (hudTimerCard) {
      hudTimerCard.classList.toggle("is-urgent", clamped <= 5.0);
    }
  }

  function startCountdown() {
    stopCountdown();
    lastCountdownTick = performance.now();

    function tick(now) {
      if (phase !== "rhythm") return;
      const dt = (now - lastCountdownTick) / 1000;
      lastCountdownTick = now;
      remainingTime = Math.max(0, remainingTime - dt);
      updateTimerUI();

      if (remainingTime <= 0) {
        rhythmController.handleFail("時間限制已到");
        return;
      }
      countdownRafId = requestAnimationFrame(tick);
    }

    countdownRafId = requestAnimationFrame(tick);
  }

  function stopCountdown() {
    if (countdownRafId !== null) {
      cancelAnimationFrame(countdownRafId);
      countdownRafId = null;
    }
  }

  // =========================================
  // 判定回饋特效（「完美通過」 / 「信任值-15」）
  // =========================================
  function showJudgment(text, isGood) {
    if (!rhythmJudgment) return;
    rhythmJudgment.textContent = text;
    rhythmJudgment.classList.remove("is-good", "is-bad");
    void rhythmJudgment.offsetWidth;
    rhythmJudgment.classList.add(isGood ? "is-good" : "is-bad");
  }

  // =========================================
  // 開場對話環節控制
  // =========================================
  function playIntroDialogueLine(index) {
    phase = "intro-dialogue";
    if (dialogueNextHint) dialogueNextHint.classList.remove("is-visible");
    if (rhythmDialogueBox) rhythmDialogueBox.classList.add("is-clickable");
    if (rhythmHeartBtn) rhythmHeartBtn.disabled = true;
    if (rhythmTrackArea) rhythmTrackArea.classList.add("is-standby");

    if (index === 0 && rhythmInstructionText) {
      rhythmInstructionText.textContent =
        "請先聆聽神父的對話（點擊對話框或按空白鍵繼續）。";
    }

    typewriter.start(rhythmDialogueText, introScript[index], 46, () => {
      if (dialogueNextHint) {
        dialogueNextHint.textContent =
          index < introScript.length - 1 ? "點擊繼續 ▾" : "開始心跳檢定 ▸";
        dialogueNextHint.classList.add("is-visible");
      }
    });
  }

  function advanceIntroDialogue() {
    if (phase !== "intro-dialogue") return;
    ensureAudio();

    if (typewriter.finishImmediately()) {
      return;
    }

    introLineIndex += 1;
    if (introLineIndex < introScript.length) {
      playIntroDialogueLine(introLineIndex);
    } else {
      if (dialogueNextHint) dialogueNextHint.classList.remove("is-visible");
      if (rhythmDialogueBox) rhythmDialogueBox.classList.remove("is-clickable");
      rhythmController.start();
    }
  }

  // =========================================
  // 不規則心跳節奏控制器
  // =========================================
  const rhythmController = (() => {
    let rafId = null;
    let stepTimers = [];
    let waveIndex = 0;
    let arrowPercent = 0;
    let activeZoneStart = 48;
    let activeZoneWidth = 13;
    let isSweepActive = false;
    let sweepStartTime = 0;
    let beatStepTriggered = [];

    function clearStepTimers() {
      stepTimers.forEach((id) => clearTimeout(id));
      stepTimers = [];
    }

    function triggerHeartbeatPulse() {
      playTone(92, 0.13, "sine", 0.24);
      if (rhythmHeartBtn) {
        rhythmHeartBtn.classList.add("is-beating");
        stepTimers.push(
          setTimeout(() => rhythmHeartBtn.classList.remove("is-beating"), 130),
        );
      }
      if (rhythmBeatFlash) {
        rhythmBeatFlash.classList.remove("is-pulsing");
        void rhythmBeatFlash.offsetWidth;
        rhythmBeatFlash.classList.add("is-pulsing");
      }
    }

    function updateWaveUI() {
      const current = waves[Math.min(waveIndex, waves.length - 1)];
      activeZoneWidth = current.zoneWidth;
      activeZoneStart = current.zoneStart;

      if (rhythmWaveLabel) rhythmWaveLabel.textContent = current.label;
      if (rhythmDialogueText) {
        typewriter.start(rhythmDialogueText, current.dialogue, 32, null, false);
      }
      if (rhythmRedZone) {
        rhythmRedZone.style.left = `${activeZoneStart}%`;
        rhythmRedZone.style.width = `${activeZoneWidth}%`;
      }
      if (rhythmWavePips) {
        const pips = rhythmWavePips.querySelectorAll(".wave-pip");
        pips.forEach((pip, idx) => {
          pip.classList.remove("is-current", "is-cleared");
          if (idx < waveIndex) pip.classList.add("is-cleared");
          else if (idx === waveIndex) pip.classList.add("is-current");
        });
      }
    }

    function startWaveSweep() {
      if (phase !== "rhythm") return;
      const current = waves[waveIndex];
      updateWaveUI();
      arrowPercent = 0;
      beatStepTriggered = current.cueTimes.map(() => false);
      if (rhythmArrow) {
        rhythmArrow.style.left = "0%";
        rhythmArrow.classList.remove("is-in-zone");
      }

      isSweepActive = true;
      sweepStartTime = performance.now();
      triggerHeartbeatPulse();

      function tick(now) {
        if (!isSweepActive || phase !== "rhythm") return;
        const elapsed = now - sweepStartTime;
        const t = Math.min(1, elapsed / current.duration);

        current.cueTimes.forEach((cueT, idx) => {
          if (!beatStepTriggered[idx] && t >= cueT) {
            beatStepTriggered[idx] = true;
            triggerHeartbeatPulse();
          }
        });

        arrowPercent = current.curve(t);
        if (rhythmArrow) {
          rhythmArrow.style.left = `${arrowPercent}%`;
          const inZone =
            arrowPercent >= activeZoneStart - HIT_TOLERANCE &&
            arrowPercent <= activeZoneStart + activeZoneWidth + HIT_TOLERANCE;
          rhythmArrow.classList.toggle("is-in-zone", inZone);
        }

        if (t >= 1) {
          isSweepActive = false;
          handleFail("錯過心跳節拍");
          return;
        }

        rafId = requestAnimationFrame(tick);
      }

      rafId = requestAnimationFrame(tick);
    }

    // 分支結算（過 -> 兩根蠟燭熄滅；沒過 -> 信任值-15、三根蠟燭熄滅）
    function finishBranch(isPassed, failReason = "") {
      phase = "outro-dialogue";
      isSweepActive = false;
      stopCountdown();
      clearStepTimers();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (rhythmHeartBtn) rhythmHeartBtn.disabled = true;

      if (isPassed) {
        // 【過】：兩根蠟燭熄滅
        playTone(659.25, 0.35, "triangle", 0.2, 1.15);
        extinguishCandlesFromRight(PASS_EXTINGUISH_COUNT);
        if (rhythmWaveLabel)
          rhythmWaveLabel.textContent = "檢定結果：過（兩根蠟燭熄滅）";

        typewriter.start(
          rhythmDialogueText,
          "「……看來只是我多心了。願主寬恕你的不安，請繼續告解吧。」",
          44,
        );
        if (rhythmInstructionText) {
          typewriter.start(
            rhythmInstructionText,
            `完美通過！兩根蠟燭熄滅，成功瞞過神父的懷疑（信任值：${trustScore}）。`,
            32,
            () => {
              if (rhythmActionBtn) {
                rhythmActionBtn.textContent = "繼續告解對話";
                rhythmActionBtn.dataset.mode = "continue";
                rhythmActionBtn.hidden = false;
              }
            },
            false,
          );
        }
      } else {
        // 【沒過】：信任值-15、三根蠟燭熄滅
        playTone(98, 0.45, "sawtooth", 0.2, 0.5);
        trustScore = Math.max(0, trustScore - TRUST_PENALTY);
        updateTrustUI(true);
        extinguishCandlesFromRight(FAIL_EXTINGUISH_COUNT);
        showJudgment("信任值-15", false);

        if (rhythmTrackArea) {
          rhythmTrackArea.classList.remove("is-shake");
          void rhythmTrackArea.offsetWidth;
          rhythmTrackArea.classList.add("is-shake");
        }
        if (rhythmScene) {
          rhythmScene.classList.add("is-miss-flash");
          stepTimers.push(
            setTimeout(
              () => rhythmScene.classList.remove("is-miss-flash"),
              360,
            ),
          );
        }

        if (rhythmWaveLabel) {
          rhythmWaveLabel.textContent = `檢定結果：沒過（${failReason}・三根蠟燭熄滅）`;
        }
        typewriter.start(
          rhythmDialogueText,
          "「劇烈的心跳與慌亂已經出賣了你……你根本不是無辜的！」",
          44,
        );
        if (rhythmInstructionText) {
          typewriter.start(
            rhythmInstructionText,
            `沒過（${failReason}）：信任值 -${TRUST_PENALTY}，三根蠟燭熄滅。`,
            32,
            () => {
              if (rhythmActionBtn) {
                rhythmActionBtn.textContent = "重新挑戰";
                rhythmActionBtn.dataset.mode = "retry";
                rhythmActionBtn.hidden = false;
              }
            },
            false,
          );
        }
      }
    }

    function handleFail(reason) {
      if (phase !== "rhythm") return;
      finishBranch(false, reason);
    }

    function handleHitAttempt() {
      if (phase !== "rhythm" || !isSweepActive) return;

      ensureAudio();
      isSweepActive = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      const isHit =
        arrowPercent >= activeZoneStart - HIT_TOLERANCE &&
        arrowPercent <= activeZoneStart + activeZoneWidth + HIT_TOLERANCE;

      if (isHit) {
        playTone(587.33, 0.28, "triangle", 0.18, 1.1);
        if (rhythmHeartBtn) {
          rhythmHeartBtn.classList.remove("is-hit-pop");
          void rhythmHeartBtn.offsetWidth;
          rhythmHeartBtn.classList.add("is-hit-pop");
          stepTimers.push(
            setTimeout(
              () => rhythmHeartBtn.classList.remove("is-hit-pop"),
              520,
            ),
          );
        }
        if (rhythmRedZone) {
          rhythmRedZone.classList.add("is-zone-hit");
          stepTimers.push(
            setTimeout(
              () => rhythmRedZone.classList.remove("is-zone-hit"),
              360,
            ),
          );
        }

        waveIndex += 1;
        updateWaveUI();
        showJudgment("完美通過", true);

        if (waveIndex >= waves.length) {
          stepTimers.push(setTimeout(() => finishBranch(true), 520));
          return;
        }

        stepTimers.push(
          setTimeout(() => {
            if (phase === "rhythm") startWaveSweep();
          }, 680),
        );
      } else {
        handleFail("未能抓準心律");
      }
    }

    return {
      start() {
        this.stop();
        ensureAudio();
        phase = "rhythm";
        waveIndex = 0;
        remainingTime = TOTAL_TIME_LIMIT;
        updateTimerUI();
        resetCandles();

        if (rhythmTrackArea) rhythmTrackArea.classList.remove("is-standby");
        if (rhythmHeartBtn) rhythmHeartBtn.disabled = false;
        if (rhythmActionBtn) rhythmActionBtn.hidden = true;
        if (rhythmInstructionText) {
          rhythmInstructionText.textContent =
            "請在箭頭指到紅色區域時點擊紅心（或按空白鍵）。";
        }

        startCountdown();
        stepTimers.push(setTimeout(() => startWaveSweep(), 380));
      },
      stop() {
        isSweepActive = false;
        stopCountdown();
        clearStepTimers();
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      },
      triggerHit() {
        handleHitAttempt();
      },
      handleFail,
    };
  })();

  // =========================================
  // 事件綁定
  // =========================================
  if (rhythmDialogueBox) {
    rhythmDialogueBox.addEventListener("click", (e) => {
      e.stopPropagation();
      if (phase === "intro-dialogue") {
        advanceIntroDialogue();
      }
    });
  }

  if (rhythmHeartBtn) {
    rhythmHeartBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (phase === "rhythm") {
        rhythmController.triggerHit();
      }
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") {
      if (phase === "intro-dialogue") {
        e.preventDefault();
        advanceIntroDialogue();
      } else if (phase === "rhythm" && e.code === "Space") {
        e.preventDefault();
        rhythmController.triggerHit();
      }
    }
  });

  if (rhythmActionBtn) {
    rhythmActionBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (rhythmActionBtn.dataset.mode === "retry") {
        trustScore = INITIAL_TRUST;
        updateTrustUI(false);
        resetCandles();
        introLineIndex = 0;
        rhythmActionBtn.hidden = true;
        playIntroDialogueLine(0);
      } else {
        window.dispatchEvent(
          new CustomEvent("rhythmBranchCompleted", {
            detail: {
              success: true,
              trustScore,
              litCandles: TOTAL_CANDLES - PASS_EXTINGUISH_COUNT,
              gender: selectedGender,
            },
          }),
        );
        if (window.parent !== window) {
          window.parent.postMessage(
            {
              type: "rhythmBranchCompleted",
              success: true,
              trustScore,
              litCandles: TOTAL_CANDLES - PASS_EXTINGUISH_COUNT,
            },
            "*",
          );
        }
      }
    });
  }

  // 啟動畫面與開場對話（初始 7 根蠟燭全亮）
  requestAnimationFrame(() => {
    if (rhythmScene) rhythmScene.classList.add("is-active");
    resetCandles();
    updateTrustUI(false);
    updateTimerUI();
    playIntroDialogueLine(0);
  });
});
