// 新增 Web Audio 音效時，請使用 context 並將音源連接至 output。
const gameAudio = (() => {
  const button = document.getElementById("soundControl");
  let context = null;
  let output = null;
  let enabled = true;

  function createAudio() {
    if (context) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Web Audio is not supported");
    const newContext = new AudioContextClass();
    const newOutput = newContext.createGain();
    newOutput.gain.value = enabled ? 1 : 0;
    newOutput.connect(newContext.destination);
    context = newContext;
    output = newOutput;
  }

  // 瀏覽器通常要求先有使用者操作，才能啟動音訊。
  function startDefaultAudio() {
    window.removeEventListener("pointerdown", startDefaultAudio, true);
    window.removeEventListener("keydown", startDefaultAudio, true);
    if (!enabled) return;
    try {
      createAudio();
      context.resume().then(() => {
        if (context.state !== "running") throw new Error("Audio context did not resume");
      }).catch(reportStartError);
    } catch (error) {
      reportStartError(error);
    }
  }

  function reportStartError(error) {
    console.error("無法啟用音效", error);
    if (!enabled) return;
    enabled = false;
    if (output) output.gain.setValueAtTime(0, context.currentTime);
    button.setAttribute("aria-pressed", "false");
    button.textContent = "無法啟用音效，請重試";
  }

  window.addEventListener("pointerdown", startDefaultAudio, true);
  window.addEventListener("keydown", startDefaultAudio, true);

  button.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.code === "Enter") event.stopPropagation();
  });

  button.addEventListener("click", async () => {
    if (enabled) {
      enabled = false;
      if (output) output.gain.setValueAtTime(0, context.currentTime);
    } else {
      button.disabled = true;
      try {
        createAudio();
        await context.resume();
        if (context.state !== "running") throw new Error("Audio context did not resume");
        enabled = true;
        output.gain.setValueAtTime(1, context.currentTime);
      } catch (error) {
        console.error("無法啟用音效", error);
        button.textContent = "無法啟用音效，請重試";
        button.disabled = false;
        return;
      }
      button.disabled = false;
    }
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "音效：開" : "音效：關";
  });

  return {
    get context() { return enabled ? context : null; },
    get output() { return output; },
    resume() {
      if (enabled && context && context.state === "suspended") {
        context.resume().catch((error) => console.error("無法恢復音效", error));
      }
    },
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  // 開場至警告頁：快取節點、管理場景狀態與共用動畫計時器。
  const introScene = document.getElementById("introScene");
  const logoSvg = document.getElementById("logoSvg");
  const candelSvg = document.getElementById("candelSvg");
  const enterText = document.getElementById("enterText");

  const characterScene = document.getElementById("characterScene");
  const pcBoy = document.getElementById("pcBoy");
  const pcGirl = document.getElementById("pcGirl");
  const genderBar = document.getElementById("genderBar");

  const nextScene = document.getElementById("nextScene");
  const candlfireImg = document.getElementById("candlfireImg");
  const confessionTitleImg = document.getElementById("confessionTitleImg");
  const startConfessionBtn = document.getElementById("startConfessionBtn");

  const confessionRoomScene = document.getElementById("confessionRoomScene");
  const memoParallaxScene = document.getElementById("memoParallaxScene");
  const memoImg = document.getElementById("memoImg");
  const briefingPanel = document.getElementById("briefingPanel");
  const briefingStory = document.getElementById("briefingStory");
  const briefingGoal = document.getElementById("briefingGoal");
  const briefingReminder = document.getElementById("briefingReminder");
  const briefingNextBtn = document.getElementById("briefingNextBtn");

  const howToPlayScene = document.getElementById("howToPlayScene");
  const howtoCandles = document.getElementById("howtoCandles");
  const howtoStartPrompt = document.getElementById("howtoStartPrompt");
  const specialHowToScene = document.getElementById("specialHowToScene");
  const specialHowtoPrompt = document.getElementById("specialHowtoPrompt");

  const warningScene = document.getElementById("warningScene");
  const warningCandelfireImg = document.getElementById("warningCandelfireImg");
  const warningSparksCanvas = document.getElementById("warningSparksCanvas");
  const startGameBtn = document.getElementById("startGameBtn");

  let timers = [];
  let isTransitioning = false;
  let isSelectingGender = false;
  let isStartingConfession = false;
  let isEnteringHowTo = false;
  let isEnteringWarning = false;

  const getSavedGender = () => {
    try {
      return sessionStorage.getItem("selectedGender") || null;
    } catch {
      return null;
    }
  };

  const saveSelectedGender = (gender) => {
    if (!gender) return;
    try {
      sessionStorage.setItem("selectedGender", gender);
    } catch {
      // 忽略無法寫入的情況（例如隱私模式）
    }
  };

  const syncSceneGender = (scene) => {
    if (scene && selectedGender) {
      scene.setAttribute("data-gender", selectedGender);
    }
  };

  let selectedGender = getSavedGender();

  let memoParallaxInstance = null;
  let candleDemoTimer = null;

  let typewriterChars = [];
  let isTypingBriefing = false;
  let isBriefingDone = false;

  // 警告頁：依燭火位置產生星火，並支援視窗調整與滑鼠風向。
  const sparksController = (() => {
    if (!warningSparksCanvas) {
      return { start() {}, stop() {} };
    }

    const ctx = warningSparksCanvas.getContext("2d");
    let animId = null;
    let width = 0;
    let height = 0;
    let particles = [];
    let windX = 0;
    let targetWindX = 0;

    // 對應背景六處燭火的相對位置
    const flameOrigins = [
      { x: 0.22, y: 0.08 },
      { x: 0.396, y: 0.16 },
      { x: 0.456, y: 0.52 },
      { x: 0.551, y: 0.52 },
      { x: 0.594, y: 0.16 },
      { x: 0.766, y: 0.08 },
    ];

    const palette = [
      { core: "255, 250, 210", glow: "255, 196, 92" },
      { core: "255, 224, 145", glow: "255, 148, 56" },
      { core: "255, 190, 110", glow: "238, 102, 44" },
    ];

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      warningSparksCanvas.width = width * dpr;
      warningSparksCanvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function createSpark(initialScatter = false) {
      const fromCandle = Math.random() < 0.55;
      let startX;
      let startY;

      if (fromCandle) {
        const origin =
          flameOrigins[Math.floor(Math.random() * flameOrigins.length)];
        startX = origin.x * width + (Math.random() - 0.5) * 46;
        startY = origin.y * height + (Math.random() - 0.5) * 24;
      } else {
        startX = Math.random() * width;
        startY = initialScatter
          ? Math.random() * height
          : height + Math.random() * 60;
      }

      const color = palette[Math.floor(Math.random() * palette.length)];
      const maxLife = 160 + Math.random() * 220;

      return {
        x: startX,
        y: startY,
        vx: (Math.random() - 0.5) * 0.45,
        vy: -(0.45 + Math.random() * 1.35),
        size: 1.2 + Math.random() * 2.8,
        maxAlpha: 0.45 + Math.random() * 0.55,
        life: initialScatter ? Math.random() * maxLife : 0,
        maxLife,
        swayFreq: 0.015 + Math.random() * 0.025,
        swayAmp: 0.25 + Math.random() * 0.65,
        twinkleFreq: 0.05 + Math.random() * 0.08,
        phase: Math.random() * Math.PI * 2,
        color,
      };
    }

    function initParticles() {
      const count = Math.min(75, Math.max(42, Math.floor(width / 22)));
      particles = Array.from({ length: count }, () => createSpark(true));
    }

    function render() {
      ctx.clearRect(0, 0, width, height);
      windX += (targetWindX - windX) * 0.04;
      targetWindX *= 0.96;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.life += 1;

        if (p.life >= p.maxLife || p.y < -30 || p.x < -40 || p.x > width + 40) {
          particles[i] = createSpark(false);
          continue;
        }

        const progress = p.life / p.maxLife;
        const fadeIn = Math.min(1, progress * 6);
        const fadeOut = 1 - Math.pow(progress, 1.8);
        const twinkle =
          0.72 + 0.28 * Math.sin(p.life * p.twinkleFreq + p.phase);
        const alpha = p.maxAlpha * fadeIn * fadeOut * twinkle;

        const sway = Math.sin(p.life * p.swayFreq + p.phase) * p.swayAmp;
        p.x += p.vx + sway + windX * (0.4 + p.size * 0.2);
        p.y += p.vy;

        const glowRadius = p.size * 4.4;
        const grad = ctx.createRadialGradient(
          p.x,
          p.y,
          0,
          p.x,
          p.y,
          glowRadius,
        );
        grad.addColorStop(0, `rgba(${p.color.core}, ${alpha})`);
        grad.addColorStop(0.35, `rgba(${p.color.glow}, ${alpha * 0.65})`);
        grad.addColorStop(1, `rgba(${p.color.glow}, 0)`);

        ctx.beginPath();
        ctx.fillStyle = grad;
        ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // 星火核心亮點
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.color.core}, ${Math.min(1, alpha * 1.25)})`;
        ctx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    }

    window.addEventListener("resize", () => {
      if (animId !== null) resize();
    });

    if (warningScene) {
      warningScene.addEventListener("mousemove", (e) => {
        const normX = (e.clientX / Math.max(1, width) - 0.5) * 2;
        targetWindX = normX * 0.85;
      });
    }

    return {
      start() {
        if (animId !== null) return;
        resize();
        initParticles();
        animId = requestAnimationFrame(render);
      },
      stop() {
        if (animId !== null) {
          cancelAnimationFrame(animId);
          animId = null;
        }
        ctx.clearRect(0, 0, width, height);
      },
    };
  })();

  // 前情提要：將文字拆成逐字動畫節點，並控制播放、跳過與重設。
  function prepareBriefingTypewriter() {
    const blocks = [briefingStory, briefingGoal, briefingReminder].filter(
      Boolean,
    );
    typewriterChars = [];

    blocks.forEach((block, blockIdx) => {
      const childNodes = Array.from(block.childNodes);
      const fragment = document.createDocumentFragment();
      let pendingPause = blockIdx > 0 ? 360 : 0;

      childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const cleaned = node.textContent.replace(/\r?\n\s*/g, "");
          Array.from(cleaned).forEach((ch) => {
            const span = document.createElement("span");
            span.className = "tw-char";
            span.textContent = ch;
            if (pendingPause > 0) {
              span.dataset.pause = String(pendingPause);
              pendingPause = 0;
            }
            fragment.appendChild(span);
            typewriterChars.push(span);
          });
        } else if (node.nodeName === "BR") {
          fragment.appendChild(document.createElement("br"));
          pendingPause = Math.max(pendingPause, 220);
        }
      });

      block.innerHTML = "";
      block.appendChild(fragment);
    });
  }

  prepareBriefingTypewriter();

  function resetBriefingTypewriter() {
    isTypingBriefing = false;
    isBriefingDone = false;
    typewriterChars.forEach((span) => {
      span.classList.remove("is-typed", "is-current");
    });
    if (briefingNextBtn) {
      briefingNextBtn.classList.remove("is-visible");
    }
  }

  function finishBriefingTypewriter() {
    isTypingBriefing = false;
    isBriefingDone = true;
    typewriterChars.forEach((span) => {
      span.classList.add("is-typed");
      span.classList.remove("is-current");
    });
    if (briefingNextBtn) {
      briefingNextBtn.classList.add("is-visible");
    }
  }

  function startBriefingTypewriter() {
    resetBriefingTypewriter();
    if (!typewriterChars.length) {
      finishBriefingTypewriter();
      return;
    }

    isTypingBriefing = true;
    let idx = 0;

    function typeNextChar() {
      if (!isTypingBriefing) return;

      if (idx > 0) {
        typewriterChars[idx - 1].classList.remove("is-current");
      }

      if (idx >= typewriterChars.length) {
        finishBriefingTypewriter();
        return;
      }

      const currentSpan = typewriterChars[idx];
      currentSpan.classList.add("is-typed", "is-current");
      idx += 1;

      const nextSpan = typewriterChars[idx];
      const extraPause =
        nextSpan && nextSpan.dataset.pause ? Number(nextSpan.dataset.pause) : 0;
      const charDelay = 48 + extraPause;

      timers.push(setTimeout(typeNextChar, charDelay));
    }

    timers.push(setTimeout(typeNextChar, 450));
  }

  // 前情提要與背景素材：初始化視差效果，並在圖片載入失敗時依序嘗試備援。
  if (memoParallaxScene && typeof Parallax !== "undefined") {
    memoParallaxInstance = new Parallax(memoParallaxScene, {
      relativeInput: true,
      clipRelativeInput: false,
      hoverOnly: false,
      scalarX: 14,
      scalarY: 14,
      frictionX: 0.1,
      frictionY: 0.1,
    });
  }

  // 圖檔名稱自動備援（兼容不同版本後綴或副檔名）
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

  setupImageFallback(candlfireImg, ["img_candlfire_4.0.png"]);
  setupImageFallback(confessionTitleImg, [
    "img_confession start_10.1_3.png",
    "img_confession start_10.1_2.png",
    "img_confession start_10.1.png",
  ]);
  setupImageFallback(
    memoImg,
    ["Group 3_2.png", "Group 3.png", "Group 3.jpg"],
    (src) => {
      if (src.toLowerCase().endsWith(".png")) {
        memoImg.classList.remove("is-jpg-fallback");
      } else {
        memoImg.classList.add("is-jpg-fallback");
      }
    },
  );
  setupImageFallback(
    warningCandelfireImg,
    ["img_candelfire_5.0.png", "img_candelfire_5.0.jpg"],
    (src) => {
      if (src.toLowerCase().endsWith(".jpg")) {
        warningCandelfireImg.classList.add("is-jpg-fallback");
      } else {
        warningCandelfireImg.classList.remove("is-jpg-fallback");
      }
    },
  );

  function clearTimers() {
    timers.forEach((id) => clearTimeout(id));
    timers = [];
  }

  // 場景流程：統一重設狀態，並依序切換角色、前情提要、教學與警告頁。
  function resetIntro() {
    clearTimers();
    isTransitioning = false;
    isSelectingGender = false;
    isStartingConfession = false;
    isEnteringHowTo = false;
    isEnteringWarning = false;
    selectedGender = null;

    if (candleDemoTimer) {
      clearInterval(candleDemoTimer);
      candleDemoTimer = null;
    }

    introScene.classList.add("is-active");
    characterScene.classList.remove("is-active");

    if (nextScene) {
      nextScene.classList.remove("is-active");
    }

    if (startConfessionBtn) {
      startConfessionBtn.classList.remove("is-clicked");
    }

    if (confessionRoomScene) {
      confessionRoomScene.classList.remove("is-active");
      confessionRoomScene.removeAttribute("data-gender");
    }

    if (howToPlayScene) {
      howToPlayScene.classList.remove("is-active", "is-revealed");
    }

    if (specialHowToScene) {
      specialHowToScene.classList.remove("is-active", "is-revealed");
    }

    if (howtoCandles) {
      howtoCandles
        .querySelectorAll(".mini-candle")
        .forEach((c) => c.classList.remove("is-out"));
    }

    if (warningScene) {
      warningScene.classList.remove("is-active");
      warningScene.removeAttribute("data-gender");
    }

    sparksController.stop();

    if (startGameBtn) {
      startGameBtn.classList.remove("is-pressed");
    }

    resetBriefingTypewriter();

    pcBoy.style.transition = "none";
    pcBoy.classList.remove("is-visible", "is-selected");
    pcGirl.style.transition = "none";
    pcGirl.classList.remove("is-visible", "is-selected");

    if (genderBar) {
      genderBar.style.transition = "none";
      genderBar.classList.remove("is-visible");
    }

    if (logoSvg) {
      logoSvg.style.transition = "none";
      logoSvg.classList.remove("is-animated", "is-dimmed");
      logoSvg.querySelectorAll(".draw-path").forEach((path) => {
        const length = path.getTotalLength();
        path.style.transition = "none";
        path.style.strokeDasharray = length;
        path.style.strokeDashoffset = length;
      });
    }

    if (candelSvg) {
      candelSvg.style.transition = "none";
      candelSvg.classList.remove("is-visible", "is-lit", "is-boosted");
    }

    if (enterText) {
      enterText.style.transition = "none";
      enterText.classList.remove("is-visible");
    }
  }

  // 入口頁：播放開場動畫與燭火、文字進場
  function playIntroSequence() {
    resetIntro();

    requestAnimationFrame(() => {
      timers.push(
        setTimeout(() => {
          // 1. 「告解室」線條描繪並填滿原色
          const paths = logoSvg.querySelectorAll(".draw-path");
          paths.forEach((path, index) => {
            path.getBoundingClientRect();
            const delay = (index * 0.05).toFixed(2);
            path.style.transition = `stroke-dashoffset 1.6s cubic-bezier(0.4, 0, 0.2, 1) ${delay}s, fill-opacity 0.8s ease ${Number(delay) + 1.1}s, stroke-width 0.8s ease ${Number(delay) + 1.1}s`;
            path.style.strokeDashoffset = "0";
          });

          requestAnimationFrame(() => {
            logoSvg.classList.add("is-animated");
          });

          // 2. 約 2.2 秒後：「告解室」淡化退入背景，中央燭台緩緩浮現
          timers.push(
            setTimeout(() => {
              logoSvg.style.transition = "";
              logoSvg.classList.add("is-dimmed");

              candelSvg.style.transition = "";
              candelSvg.classList.add("is-visible");
            }, 2200),
          );

          // 3. 約 3.0 秒後：三支蠟燭點亮發光
          timers.push(
            setTimeout(() => {
              candelSvg.classList.add("is-lit");
            }, 3000),
          );

          // 4. 約 3.4 秒後：「點火進入遊戲」浮現於前景
          timers.push(
            setTimeout(() => {
              enterText.style.transition = "";
              enterText.classList.add("is-visible");
            }, 3400),
          );
        }, 60),
      );
    });
  }

  // 第二頁：角色選擇頁，雙人同步淡入後顯示性別選擇框
  function enterCharacterPage() {
    if (isTransitioning) return;
    isTransitioning = true;
    clearTimers();

    candelSvg.classList.add("is-boosted");
    introScene.classList.remove("is-active");

    timers.push(
      setTimeout(() => {
        characterScene.classList.add("is-active");

        // 雙人同步淡入
        requestAnimationFrame(() => {
          pcBoy.style.transition = "";
          pcBoy.classList.add("is-visible");
          pcGirl.style.transition = "";
          pcGirl.classList.add("is-visible");
        });

        // 雙人進場後，底部性別選擇列淡入
        timers.push(
          setTimeout(() => {
            if (genderBar) {
              genderBar.style.transition = "";
              genderBar.classList.add("is-visible");
            }
          }, 1450),
        );
      }, 650),
    );
  }

  // 第二頁：點擊角色後，存入 selectedGender 並切至開始告解頁
  function selectCharacterAndNext(gender) {
    if (isSelectingGender) return;
    const targetChar = gender === "male" ? pcBoy : pcGirl;
    if (!targetChar.classList.contains("is-visible")) return;

    isSelectingGender = true;
    selectedGender = gender;
    saveSelectedGender(gender);

    // 鎖定所選角色的 hover 狀態（維持背光與替換圖）
    targetChar.classList.add("is-selected");

    timers.push(
      setTimeout(() => {
        characterScene.classList.remove("is-active");

        timers.push(
          setTimeout(() => {
            if (nextScene) {
              nextScene.classList.add("is-active");
            }
          }, 450),
        );
      }, 380),
    );
  }

  // 第三頁：開始告解，切到前情提要頁並啟動打字機
  function enterConfessionRoom() {
    if (isStartingConfession) return;
    if (!nextScene || !nextScene.classList.contains("is-active")) return;

    isStartingConfession = true;

    if (startConfessionBtn) {
      startConfessionBtn.classList.add("is-clicked");
    }

    timers.push(
      setTimeout(() => {
        nextScene.classList.remove("is-active");

        timers.push(
          setTimeout(() => {
            if (confessionRoomScene) {
              syncSceneGender(confessionRoomScene);
              confessionRoomScene.classList.add("is-active");

              if (memoParallaxInstance) {
                memoParallaxInstance.enable();
                memoParallaxInstance.updateDimensions();
              }

              startBriefingTypewriter();
            }
          }, 450),
        );
      }, 320),
    );
  }

  // 第五頁：蠟燭示範動畫，模擬熄滅與復燃
  function startCandleDemoLoop() {
    if (!howtoCandles) return;
    const candles = Array.from(howtoCandles.querySelectorAll(".mini-candle"));
    if (candles.length < 7) return;

    if (candleDemoTimer) clearInterval(candleDemoTimer);

    candleDemoTimer = setInterval(() => {
      if (!howToPlayScene || !howToPlayScene.classList.contains("is-active"))
        return;

      candles[6].classList.add("is-out");
      timers.push(
        setTimeout(() => {
          candles[5].classList.add("is-out");
        }, 450),
      );
      timers.push(
        setTimeout(() => {
          candles[5].classList.remove("is-out");
          candles[6].classList.remove("is-out");
        }, 2400),
      );
    }, 5200);
  }

  // 第四頁：點擊下一步，切入操作教學頁
  function enterHowToPlayPage() {
    if (isEnteringHowTo) return;
    if (
      !confessionRoomScene ||
      !confessionRoomScene.classList.contains("is-active")
    )
      return;

    isEnteringHowTo = true;
    confessionRoomScene.classList.remove("is-active");

    if (memoParallaxInstance) {
      memoParallaxInstance.disable();
    }

    timers.push(
      setTimeout(() => {
        if (howToPlayScene) {
          howToPlayScene.classList.remove("is-revealed");
          howToPlayScene.classList.add("is-active");
          startCandleDemoLoop();
        }
      }, 450),
    );
  }

  // 第五頁：進入特殊環節操作教學。
  function enterSpecialHowToPage() {
    if (!howToPlayScene || !howToPlayScene.classList.contains("is-active"))
      return;

    if (candleDemoTimer) {
      clearInterval(candleDemoTimer);
      candleDemoTimer = null;
    }

    howToPlayScene.classList.remove("is-active");

    timers.push(
      setTimeout(() => {
        specialHowToScene.classList.remove("is-revealed");
        specialHowToScene.classList.add("is-active");
      }, 450),
    );
  }

  // 特殊環節教學後進入第六頁警告畫面並啟動星火動畫。
  function enterWarningPage() {
    if (isEnteringWarning || !specialHowToScene.classList.contains("is-active"))
      return;

    isEnteringWarning = true;
    specialHowToScene.classList.remove("is-active");

    timers.push(
      setTimeout(() => {
        if (warningScene) {
          syncSceneGender(warningScene);
          warningScene.classList.add("is-active");
          sparksController.start();
        }
      }, 450),
    );
  }

  // 綁定開場到警告頁的按鈕、角色、教學互動事件。
  playIntroSequence();

  const flameHits = candelSvg.querySelectorAll(".flame-hit");
  [enterText, ...flameHits].forEach((target) => {
    target.addEventListener("mouseenter", () => {
      candelSvg.classList.add("is-boosted");
    });
    target.addEventListener("mouseleave", () => {
      if (!isTransitioning) {
        candelSvg.classList.remove("is-boosted");
      }
    });
  });

  // 首頁入口按鈕：點擊進入角色選擇頁
  enterText.addEventListener("click", (e) => {
    e.stopPropagation();
    enterCharacterPage();
  });

  flameHits.forEach((flame) => {
    flame.addEventListener("click", (e) => {
      if (!candelSvg.classList.contains("is-lit")) return;
      e.stopPropagation();
      enterCharacterPage();
    });
  });

  // 開場頁空白處點擊可重新播放 intro 動畫
  introScene.addEventListener("click", () => {
    if (!isTransitioning) {
      playIntroSequence();
    }
  });

  // 男角色點擊：存入 male，進入下一場景
  pcBoy.addEventListener("click", () => {
    selectCharacterAndNext("male");
  });

  // 女角色點擊：存入 female，進入下一場景
  pcGirl.addEventListener("click", () => {
    selectCharacterAndNext("female");
  });

  // 開始告解按鈕：進入前情提要頁
  if (startConfessionBtn) {
    startConfessionBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      enterConfessionRoom();
    });
  }

  // 打字過程中點擊右側文字區塊可立即顯示完整句子與 next 按鈕
  if (briefingPanel) {
    briefingPanel.addEventListener("click", (e) => {
      if (isTypingBriefing && !isBriefingDone) {
        e.stopPropagation();
        finishBriefingTypewriter();
      }
    });
  }

  // 前情提要下一步：進入操作說明頁
  if (briefingNextBtn) {
    briefingNextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      enterHowToPlayPage();
    });
  }

  // 第五頁：點擊蠟燭可手動切換熄滅/點燃
  if (howtoCandles) {
    howtoCandles.querySelectorAll(".mini-candle").forEach((candle) => {
      candle.addEventListener("click", (e) => {
        if (e.button === 0 && howToPlayScene.classList.contains("is-active")) {
          candle.classList.toggle("is-out");
        }
      });
    });
  }

  // 第一次點擊顯示全部內容，之後點擊提示進入下一頁。
  if (howToPlayScene) {
    howToPlayScene.addEventListener("click", (e) => {
      if (e.button !== 0 || !howToPlayScene.classList.contains("is-active")) return;
      if (!howToPlayScene.classList.contains("is-revealed")) {
        howToPlayScene.classList.add("is-revealed");
      } else if (howtoStartPrompt && howtoStartPrompt.contains(e.target)) {
        enterSpecialHowToPage();
      }
    });
  }

  if (specialHowToScene) {
    specialHowToScene.addEventListener("click", (e) => {
      if (e.button !== 0 || !specialHowToScene.classList.contains("is-active")) return;
      if (!specialHowToScene.classList.contains("is-revealed")) {
        specialHowToScene.classList.add("is-revealed");
      } else if (specialHowtoPrompt && specialHowtoPrompt.contains(e.target)) {
        enterWarningPage();
      }
    });
  }

  // 第六頁：點擊「開始遊戲」按鈕進入正式告解對話
  if (startGameBtn) {
    startGameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startGameBtn.classList.add("is-pressed");
      saveSelectedGender(selectedGender);
      console.log("正式開始遊戲，已選性別：", selectedGender);
      // 從第六頁進入第七頁 
      enterQuestionScene();
    });
  }
  
  // 題目互動：快取頁面節點，並共用樣板建立記分板與心跳畫面的燭火。

  // 第七頁的整體場景
  const questionScene = document.getElementById("questionScene");
  const rhythmIntroScene = document.getElementById("rhythmIntroScene");
  const rhythmIntroHint = document.getElementById("rhythmIntroHint");
  const excuseIntroScene = document.getElementById("excuseIntroScene");
  const excuseIntroHint = document.getElementById("excuseIntroHint");
  const rhythmScene = document.getElementById("rhythmScene");
  const excuseScene = document.getElementById("excuseScene");
  const questionStage = questionScene.querySelector(".question-stage");
  const questionEmbers = document.getElementById("questionEmbers");
  const questionNpcLeft = document.getElementById("questionNpcLeft");
  const questionNpcRight = document.getElementById("questionNpcRight");

  for (let i = 0; i < 80; i++) {
    const ember = document.createElement("span");
    const rise = i < 50 ? 20 + Math.random() * 20
      : i < 72 ? 40 + Math.random() * 28
      : 68 + Math.random() * 22;
    const duration = 5 + Math.random() * 4;
    const x = (i % 2 === 0 ? 0.5 : 90.5) + Math.random() * 9;
    ember.className = "question-ember";
    ember.style.setProperty("--x", `${x}%`);
    ember.style.setProperty("--size", `${1.2 + Math.random() * 2}px`);
    ember.style.setProperty("--rise", `${rise}%`);
    ember.style.setProperty("--drift", `${(Math.random() - .5) * 24}px`);
    ember.style.setProperty("--duration", `${duration}s`);
    ember.style.setProperty("--delay", `${-duration * ((i * 17 % 80) / 80)}s`);
    questionEmbers.appendChild(ember);
  }

  // NPC 對話框容器
  const questionDialogues = document.getElementById("questionDialogues");

  // 四個選項的面板
  const questionChoicePanel = document.getElementById("questionChoicePanel");
  const questionScoreboard = document.getElementById("questionScoreboard");

  rhythmIntroScene.addEventListener("click", (event) => {
    if (
      rhythmIntroHint.classList.contains("is-visible") &&
      !rhythmIntroHint.contains(event.target)
    ) {
      return;
    }
    window.dispatchEvent(new Event("advanceRhythmIntroDialogue"));
  });

  excuseIntroScene.addEventListener("click", (event) => {
    if (
      excuseIntroHint.classList.contains("is-visible") &&
      !excuseIntroHint.contains(event.target)
    ) {
      return;
    }
    window.dispatchEvent(new Event("advanceExcuseIntroDialogue"));
  });

  const candleSlotsTemplate = document.getElementById("candleSlotsTemplate");
  const rhythmCandlesWrap = document.getElementById("rhythmCandlesWrap");
  const excuseCandlesWrap = document.getElementById("excuseCandlesWrap");

  function renderCandleSlots(container, isScoreboard = false) {
    if (!container || !candleSlotsTemplate) return;

    const slots = candleSlotsTemplate.content.cloneNode(true);
    if (isScoreboard) {
      slots.querySelectorAll(".candle-flame-slot").forEach((slot) => {
        slot.classList.add("scoreboard-flame");
        slot.setAttribute("aria-hidden", "true");
      });
    }
    container.appendChild(slots);
  }

  renderCandleSlots(questionScoreboard, true);
  renderCandleSlots(rhythmCandlesWrap);
  renderCandleSlots(excuseCandlesWrap);

  const scoreboardFlames = questionScoreboard
    ? Array.from(questionScoreboard.querySelectorAll(".scoreboard-flame"))
    : [];

  // 取得所有選項按鈕
  const questionButtons = Array.from(
    document.querySelectorAll(".question-choice"),
  );

  // 五題結束後的完成畫面
  const questionFinish = document.getElementById("questionFinish");

  // 重新開始按鈕
  const questionRestartBtn = document.getElementById("questionRestartBtn");

  function syncQuestionDialogueBounds() {
    const stageBounds = questionStage.getBoundingClientRect();
    const choiceBounds = questionChoicePanel.getBoundingClientRect();
    questionDialogues.style.bottom = `${stageBounds.bottom - choiceBounds.top}px`;
  }

  window.addEventListener("resize", syncQuestionDialogueBounds);

  // 五題流程：保存題目索引、對話進度、答案、扣分與防重複點擊狀態。

  // 目前題目索引，0 代表第一題
  let questionIndex = 0;
  let questionDialogueIndex = 0;

  // 防止玩家連續點擊造成重複選擇
  let questionLocked = false;

  // 儲存對話動畫的計時器
  let questionTimers = [];

  // 記錄玩家在五題中選擇的答案
  // 0 = 第一個選項
  // 1 = 第二個選項
  // 2 = 第三個選項
  // 3 = 第四個選項
  const questionAnswers = [];
  let extinguishedCandleCount = 0;
  let hasTriggeredRhythmEvent = false;
  let hasTriggeredExcuseEvent = false;

  // 題目資料：每題包含依序顯示的對話、最多四個選項，以及會扣分的選項索引（從 0 開始）。

  const questionData = [
    //  第一題
    {
      dialogues: [
        {
          side: "left",
          text: "願長夜聆聽你的言語，亦寬恕你的罪行。",
        },
        {
          side: "right",
          text: "……日安，神父",
        },
        {
          side: "right",
          text: "我已許久沒有進行告解，請幫助我。",
        },
        {
          side: "right",
          text: "（沉默）",
        },
        {
          side: "left",
          text: "若不知從何說起，便談談近日發生的事吧。",
        },
        {
          side: "right",
          text: "請原諒我的生疏，這是我第一次來此傾訴——昨日，我赴了奈克的邀約。",
        },
        {
          side: "left",
          text: "你們在何時相約？",
        },
        {
          side: "right",
          text: "我們在＿＿＿＿時，於鎮中央見面。打算邊吃邊談些生意。",
        },
      ],

      choices: ["12:00 a.m", "01:00 p.m", "02:00 p.m", "03:00 p.m"],
      penaltyChoiceIndex: 3,
    },

    //  第二題
    {
      dialogues: [
        {
          side: "right",
          text: "如今鎮上人人自危，誰也不願成為下一個目標。",
        },
        {
          side: "left",
          text: "那麼，就說說你的生意吧。",
        },
        {
          side: "right",
          text: "您也對這些感興趣嗎？好的，不過請先容我說完這部分。",
        },
        {
          side: "right",
          text: "我跟奈克相談甚歡，後來去了酒吧，也許是因為命案的緣故，店裡實在冷清的很。",
        },
        {
          side: "left",
          text: "你們在哪裡談生意呢？",
        },
        {
          side: "right",
          text: "我們在酒吧的＿＿＿＿，談了一些買賣，我對這筆交易感到滿意。",
        },
      ],

      choices: ["舞池區", "附近小巷", "包廂裡", "吧檯座位"],
      penaltyChoiceIndex: 1,
    },

    //  第三題
    {
      dialogues: [
        {
          side: "right",
          text: "您想知道交易內容？",
        },
        {
          side: "right",
          text: "如您所願，既然我來到此處，自然不會有所隱瞞。",
        },
        {
          side: "right",
          text: "如今鎮上因命案戒備森嚴，許多東西都受到管制。",
        },
        {
          side: "left",
          text: "你買了甚麼呢？",
        },
        {
          side: "right",
          text: "不過是家用的＿＿＿＿。"
        },
      ],

      choices: ["鋸子", "菜刀", "斧頭", "小刀"],
      penaltyChoiceIndex: 2,
    },

    //  第四題
    {
      dialogues: [
        {
          side: "left",
          text: "(沉默)",
        },
        {
          side: "right",
          text: "我對於在您面前撒謊感到抱歉，請原諒我———準確而言，是用來防身的。",
        },
        {
          side: "right",
          text: "我實在太擔心兇手會再度出現，因此，即使鎮上現在對刀械管制森嚴，我也必須這麼做。",
        },
        {
          side: "left",
          text: "你在酒吧除了談生意之外，還做了甚麼？",
        },
        {
          side: "right",
          text: "……神父，您這是在懷疑我嗎？",
        },
        {
          side: "right",
          text: "……罷了，我會回答您，我記得我還曾與酒吧內的＿＿＿＿交談過幾句。",
        },
      ],

      choices: ["泰德(服務生)", "湯姆(酒保)", "梅茲(商人)", "道卡茲(酒客)"],
      penaltyChoiceIndex: 1,
    },

    //  第五題
    {
      dialogues: [
        {
          side: "right",
          text: "他是個十足有趣的人，似乎對鎮上的一且瞭如指掌，即使我和他並不太熟悉，但他依舊知無不言。",
        },
        {
          side: "left",
          text: "你是否知道，你的行蹤與警方推測的兇手路線重疊？",
        },
        {
          side: "left",
          text: "甚至有人反應，目擊你出現在案發現場。",
        },
        {
          side: "right",
          text: "我？這不可能！並且就我所知，案發地點並未公開？",
        },
        {
          side: "right",
          text: "喔、不，您讓我開始擔憂自身的安危了。",
        },
        {
          side: "left",
          text: "那麼，你後來又去了哪裡？",
        },
        {
          side: "right",
          text: "我最後去了＿＿＿＿。",
        },
      ],

      choices: ["巷口", "住家", "旅店", "麵包店"],
      penaltyChoiceIndex: 0,
    },
  ];

  // 清理題目延遲動畫，避免換題後舊計時器繼續更新畫面。
  function clearQuestionTimers() {
    questionTimers.forEach(clearTimeout);

    questionTimers = [];
  }

  function resetQuestionScore() {
    extinguishedCandleCount = 0;
    scoreboardFlames.forEach((flame) =>
      flame.classList.remove("is-extinguished"),
    );
    if (questionScoreboard) {
      questionScoreboard.setAttribute(
        "aria-label",
        `蠟燭記分板，${scoreboardFlames.length}根燭火全亮`,
      );
    }
  }

  function extinguishNextCandle() {
    const flame =
      scoreboardFlames[scoreboardFlames.length - 1 - extinguishedCandleCount];
    if (!flame) return;

    flame.classList.add("is-extinguished");
    extinguishedCandleCount++;
    questionScoreboard.setAttribute(
      "aria-label",
      `蠟燭記分板，剩餘${scoreboardFlames.length - extinguishedCandleCount}根燭火`,
    );
  }

  function showQuestionChoices() {
    questionChoicePanel.classList.add("is-ready");
    questionButtons.forEach((button) => {
      button.disabled = button.hidden;
    });
  }

  function showNextQuestionDialogue() {
    const data = questionData[questionIndex];
    const dialogue = data.dialogues[questionDialogueIndex];
    if (!dialogue) return;

    questionDialogueIndex++;

    const isRightSpeaking = dialogue.side === "right";
    if (questionNpcLeft) {
      questionNpcLeft.src = isRightSpeaking
        ? "./images/bg/F_eyes.PNG"
        : "./images/bg/F_close.PNG";
    }
    if (questionNpcRight) {
      const playerFolder = selectedGender === "female" ? "PC_G" : "PC_B";
      const playerExpression = isRightSpeaking ? "close" : "open";
      questionNpcRight.src = `./images/${playerFolder}/PC_${playerExpression}.PNG`;
    }

    const bubble = document.createElement("div");
    bubble.className =
      "question-bubble " + (dialogue.side === "right" ? "right" : "left");
    bubble.textContent = dialogue.text;
    if (/[＿_]{2,}/.test(dialogue.text)) {
      bubble.classList.add("is-fill-in");
    }

    questionDialogues.appendChild(bubble);
    questionDialogues.scrollTop = questionDialogues.scrollHeight;

    if (questionDialogueIndex === data.dialogues.length) {
      showQuestionChoices();
    }
  }

  // 顯示題目、更新選項，並播放第一段對話。
  function renderQuestion() {
    // 清除上一題尚未執行的動畫
    clearQuestionTimers();

    // 解鎖題目
    questionLocked = false;

    // 取得目前題目的資料
    const data = questionData[questionIndex];
    questionDialogueIndex = 0;

    // 清空上一題的 NPC 對話
    questionDialogues.replaceChildren();

    // 先隱藏選項
    questionChoicePanel.classList.remove("is-ready");

    // 更新四個選項按鈕
    questionButtons.forEach((button, index) => {
      // 更換按鈕文字
      button.querySelector(".question-choice-text").textContent = data.choices[index] || "";

      // 沒有文字的選項不顯示
      button.hidden = !data.choices[index];

      // 對話播放期間不能點擊
      button.disabled = true;
    });

    syncQuestionDialogueBounds();

    if (data.dialogues.length === 0) {
      showQuestionChoices();
    } else {
      showNextQuestionDialogue();
    }
  }

  // 從警告頁初始化並進入五題互動。
  function enterQuestionScene() {
    // 如果找不到第七頁，停止執行
    if (!questionScene) return;

    const isFemaleCharacter = selectedGender === "female";
    if (questionNpcRight) {
      questionNpcRight.src = isFemaleCharacter
        ? "./images/PC_G/PC_open.PNG"
        : "./images/PC_B/PC_open.PNG";
      questionNpcRight.alt = isFemaleCharacter ? "女角色" : "男角色";
    }

    // 停止第六頁的星火動畫
    sparksController.stop();

    // 隱藏原本第六頁
    warningScene.classList.remove("is-active");

    // 顯示第七頁
    questionScene.classList.add("is-active", "is-entering");
    syncSceneGender(rhythmScene);

    // 從第一題開始
    questionIndex = 0;
    hasTriggeredRhythmEvent = false;
    hasTriggeredExcuseEvent = false;

    // 清空上一次的答案
    questionAnswers.length = 0;
    resetQuestionScore();

    // 隱藏完成畫面
    questionFinish.hidden = true;

    clearQuestionTimers();
    questionLocked = true;
    questionDialogues.replaceChildren();
    questionChoicePanel.classList.remove("is-ready");
    questionButtons.forEach((button) => { button.disabled = true; });

    if (!questionNpcRight || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishQuestionEntrance();
    }
  }

  function finishQuestionEntrance() {
    if (!questionScene.classList.contains("is-entering")) return;
    questionScene.classList.remove("is-entering");
    renderQuestion();
  }

  ["animationend", "animationcancel"].forEach((eventName) => {
    questionScene.addEventListener(eventName, (event) => {
      if (event.target === questionNpcRight && event.animationName === "questionNpcRightEntrance") {
        finishQuestionEntrance();
      }
    });
  });

  // 玩家作答、處理扣分與特殊環節分支。
  function continueQuestionnaire() {
    if (questionIndex < questionData.length) {
      renderQuestion();
    } else {
      questionChoicePanel.classList.remove("is-ready");
      questionDialogues.replaceChildren();
      questionFinish.hidden = false;
      window.dispatchEvent(
        new CustomEvent("questionnaireCompleted", {
          detail: {
            remainingCandles: scoreboardFlames.length - extinguishedCandleCount,
            gender: selectedGender === "female" ? "female" : "male",
          },
        }),
      );
      console.log("五題選擇紀錄：", questionAnswers);
    }
  }

  function startExcuseBranchIfReady() {
    if (
      !excuseScene ||
      !excuseIntroScene ||
      hasTriggeredExcuseEvent ||
      extinguishedCandleCount !== 5
    ) {
      return false;
    }

    hasTriggeredExcuseEvent = true;
    syncSceneGender(excuseScene);
    excuseIntroScene.classList.add("is-active");
    window.dispatchEvent(new Event("startExcuseIntroDialogue"));
    return true;
  }

  window.addEventListener("rhythmBranchCompleted", (event) => {
    rhythmScene.classList.remove("is-active");
    if (event.detail && event.detail.success === false) {
      extinguishNextCandle();
    }
    if (startExcuseBranchIfReady()) return;
    continueQuestionnaire();
  });

  window.addEventListener("excuseBranchCompleted", (event) => {
    excuseScene.classList.remove("is-active");
    if (event.detail && event.detail.success === false) {
      extinguishNextCandle();
    }
    continueQuestionnaire();
  });

  function chooseQuestion(index) {
    // 防止重複點擊
    if (questionLocked || questionButtons[index].disabled) {
      return;
    }

    // 鎖定目前題目
    questionLocked = true;

    let startRhythmAfterAnswer = false;
    let startExcuseAfterAnswer = false;
    if (index === questionData[questionIndex].penaltyChoiceIndex) {
      extinguishNextCandle();
      if (!hasTriggeredRhythmEvent && extinguishedCandleCount === 2) {
        hasTriggeredRhythmEvent = true;
        startRhythmAfterAnswer = true;
      } else if (
        !hasTriggeredExcuseEvent &&
        extinguishedCandleCount === 5
      ) {
        startExcuseAfterAnswer = true;
      }
    }

    // 儲存玩家選擇的答案
    questionAnswers.push(index);

    // 暫時停用所有按鈕
    questionButtons.forEach((button) => {
      button.disabled = true;
    });

    // 被選擇的按鈕變色
    questionButtons[index].classList.add("is-selected");

    // ===== 延遲後進入下一題 =====

    questionTimers.push(
      setTimeout(() => {
        // 還原按鈕顏色
        questionButtons[index].classList.remove("is-selected");

        // 題目進度加一
        questionIndex++;

        if (startRhythmAfterAnswer) {
          syncSceneGender(rhythmScene);
          rhythmIntroScene.classList.add("is-active");
          window.dispatchEvent(new Event("startRhythmIntroDialogue"));
          return;
        }

        if (startExcuseAfterAnswer) {
          startExcuseBranchIfReady();
          return;
        }

        continueQuestionnaire();
      }, 450),
    );
  }

  // 題目、對話推進與重玩的事件綁定。
  questionButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
      chooseQuestion(index);
    });
  });

  questionStage.addEventListener("click", () => {
    if (!questionScene.classList.contains("is-active") || questionLocked) {
      return;
    }

    const data = questionData[questionIndex];
    if (data && questionDialogueIndex < data.dialogues.length) {
      showNextQuestionDialogue();
    }
  });

  if (questionRestartBtn) {
    questionRestartBtn.addEventListener("click", () => {
      // 回到第一題
      questionIndex = 0;

      // 清除之前的答案
      questionAnswers.length = 0;
      resetQuestionScore();
      hasTriggeredRhythmEvent = false;
      hasTriggeredExcuseEvent = false;

      // 隱藏完成畫面
      questionFinish.hidden = true;

      // 重新顯示第一題
      renderQuestion();
    });
  }

});

// 心跳檢定：控制對話、音效、節奏判定、燭火結果與角色素材。
document.addEventListener("DOMContentLoaded", () => {
  const rhythmScene = document.getElementById("rhythmScene");
  const rhythmIntroScene = document.getElementById("rhythmIntroScene");
  const rhythmIntroDialogueBoxes = [
    document.getElementById("rhythmIntroDialogueBox1"),
    document.getElementById("rhythmIntroDialogueBox2"),
  ];
  const rhythmIntroDialogueTexts = [
    document.getElementById("rhythmIntroDialogueText1"),
    document.getElementById("rhythmIntroDialogueText2"),
  ];
  const rhythmIntroDialogueNextHint = document.getElementById(
    "rhythmIntroDialogueNextHint",
  );
  const rhythmIntroHint = document.getElementById("rhythmIntroHint");
  const excuseIntroScene = document.getElementById("excuseIntroScene");
  const excuseIntroDialogueBoxes = [
    document.getElementById("excuseIntroDialogueBox1"),
    document.getElementById("excuseIntroDialogueBox2"),
  ];
  const excuseIntroDialogueTexts = [
    document.getElementById("excuseIntroDialogueText1"),
    document.getElementById("excuseIntroDialogueText2"),
  ];
  const excuseIntroDialogueNextHint = document.getElementById(
    "excuseIntroDialogueNextHint",
  );
  const excuseIntroHint = document.getElementById("excuseIntroHint");
  const rhythmDialogueText = document.getElementById("rhythmDialogueText");
  const dialogueNextHint = document.getElementById("dialogueNextHint");
  
  const rhythmTrackArea = document.getElementById("rhythmTrackArea");
  const rhythmWaveLabel = document.getElementById("rhythmWaveLabel");
  const rhythmWavePips = document.getElementById("rhythmWavePips");
  const rhythmEcg = document.getElementById("rhythmEcg");
  const rhythmEcgWindow = document.getElementById("rhythmEcgWindow");
  const rhythmEcgTrace = document.getElementById("rhythmEcgTrace");
  const rhythmEcgCursor = document.getElementById("rhythmEcgCursor");
  const rhythmEcgDot = document.getElementById("rhythmEcgDot");
  const rhythmJudgment = document.getElementById("rhythmJudgment");

  const rhythmCharacterImg = document.getElementById("rhythmCharacterImg");
  const rhythmCandlesWrap = document.getElementById("rhythmCandlesWrap");
  const rhythmCandlesImg = document.getElementById("rhythmCandlesImg");
  const rhythmInstructionBox = document.getElementById("rhythmInstructionBox");
  const rhythmInstructionText = document.getElementById(
    "rhythmInstructionText",
  );
  const rhythmActionBtn = document.getElementById("rhythmActionBtn");

  let selectedGender = rhythmScene
    ? rhythmScene.getAttribute("data-gender")
    : "male";

  function alignRhythmCandlesWithInstructionBox() {
    if (!rhythmCandlesWrap || !rhythmInstructionBox) return;

    const boxRect = rhythmInstructionBox.getBoundingClientRect();
    // The right edge of the left drip and holder baseline in IMG_8976.PNG.
    const leftDripRight = 182 / 1920;
    const holderBottom = 766 / 1080;
    const scale = 0.75;
    const imageHeight = (boxRect.width * 9) / 16;

    rhythmCandlesWrap.style.width = `${boxRect.width}px`;
    rhythmCandlesWrap.style.height = `${imageHeight}px`;
    rhythmCandlesWrap.style.transformOrigin = "top left";
    rhythmCandlesWrap.style.transform = `scale(${scale})`;
    rhythmCandlesWrap.style.left =
      `${boxRect.left - boxRect.width * leftDripRight * scale}px`;
    rhythmCandlesWrap.style.top =
      `${boxRect.top - imageHeight * holderBottom * scale}px`;
  }

  window.addEventListener("resize", alignRhythmCandlesWithInstructionBox);
  if (rhythmInstructionBox && typeof ResizeObserver !== "undefined") {
    new ResizeObserver(alignRhythmCandlesWithInstructionBox).observe(
      rhythmInstructionBox,
    );
  }

  function configureRhythmAssets() {
    const isFemaleCharacter = selectedGender === "female";
    const characterSrc = isFemaleCharacter
      ? "./images/PC_G/PC_heart.PNG"
      : "./images/PC_B/PC_heart.PNG";

    if (rhythmCharacterImg) {
      rhythmCharacterImg.src = characterSrc;
    }

    if (rhythmCandlesImg) {
      rhythmCandlesImg.src = "./images/bg/IMG_8976.PNG";
    }
  }
  // =========================================
  // Web Audio 合成音效
  // =========================================
  function ensureAudio() {
    gameAudio.resume();
  }

  function playTone(
    freq,
    duration,
    type = "sine",
    gainVal = 0.14,
    endFreqRatio = 0.55,
  ) {
    const audioCtx = gameAudio.context;
    if (!audioCtx || audioCtx.state !== "running") return;
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
    gain.connect(gameAudio.output);
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
  // 沒過：三根蠟燭熄滅（7 -> 4 根燃燒）
  // =========================================
  const TOTAL_CANDLES = 7;
  const PASS_EXTINGUISH_COUNT = 2;
  const FAIL_EXTINGUISH_COUNT = 3;
  const HIT_TOLERANCE = 1.6;

  let phase = "inactive";

  const introScript = [
    "和您的對話令我感到懷疑。",
    "你的呼吸越來越急促……在主面前，你隱瞞了什麼？",
    "別試圖用言語掩飾了——讓我聽聽你真實的心跳聲吧。",
  ];
  const rhythmIntroDialogueScript = [
    "為何您呼吸急促，似乎緊張了？",
    "您的反應令我感到懷疑",
  ];
  const excuseIntroDialogueScript = rhythmIntroDialogueScript;
  let rhythmIntroDialogueIndex = 0;
  let excuseIntroDialogueIndex = 0;
  let introLineIndex = 0;

  const waves = [
    {
      label: "第 1 階段心律",
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
      label: "第 2 階段心律",
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
      label: "第 3 階段心律",
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
      label: "第 4 階段心律",
      dialogue: "「案發當晚，你真的待在教堂裡嗎？」",
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

  function extinguishCandlesFromRight(count, immediate = false) {
    clearCandleTimers();
    if (!rhythmCandlesWrap) return;
    const clampedCount = Math.min(TOTAL_CANDLES, Math.max(0, count));
    for (let i = 0; i < clampedCount; i += 1) {
      const targetIndex = TOTAL_CANDLES - 1 - i;
      const slot = rhythmCandlesWrap.querySelector(
        `.candle-flame-slot[data-candle-index="${targetIndex}"]`,
      );
      if (slot && !slot.classList.contains("is-extinguished")) {
        if (immediate) {
          slot.classList.add("is-extinguished");
          continue;
        }
        const timerId = setTimeout(() => {
          slot.classList.add("is-extinguished");
          playTone(190, 0.18, "sine", 0.06, 0.4);
        }, i * 220);
        candleTimers.push(timerId);
      }
    }
  }

  // =========================================
  // 判定回饋特效（通過或失誤）
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
    if (rhythmInstructionBox)
      rhythmInstructionBox.classList.add("is-clickable");
    if (rhythmTrackArea) rhythmTrackArea.classList.add("is-standby");

    if (index === 0 && rhythmInstructionText) {
      rhythmInstructionText.textContent =
        "請先聆聽神父的對話（點擊下方方框或按空白鍵繼續）。";
    }

    typewriter.start(rhythmDialogueText, introScript[index], 46, () => {
      if (dialogueNextHint) {
        dialogueNextHint.textContent =
          index < introScript.length - 1
            ? "點擊下方方框繼續 ▾"
            : "點擊下方方框開始檢定 ▸";
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
      if (rhythmInstructionBox)
        rhythmInstructionBox.classList.remove("is-clickable");
      rhythmController.start();
    }
  }

  function playRhythmIntroDialogue(index) {
    const box = rhythmIntroDialogueBoxes[index];
    const text = rhythmIntroDialogueTexts[index];
    if (!box || !text) return;

    rhythmIntroDialogueIndex = index;
    if (rhythmIntroHint) rhythmIntroHint.classList.remove("is-visible");
    if (rhythmIntroDialogueNextHint) {
      rhythmIntroDialogueNextHint.classList.remove("is-visible");
    }
    box.classList.add("is-visible");

    typewriter.start(text, rhythmIntroDialogueScript[index], 46, () => {
      if (index === 0) {
        if (rhythmIntroDialogueNextHint) {
          rhythmIntroDialogueNextHint.classList.add("is-visible");
        }
        return;
      }
      if (!rhythmIntroHint) return;
      rhythmIntroHint.textContent = "點擊繼續";
      rhythmIntroHint.classList.add("is-visible");
    });
  }

  window.addEventListener("startRhythmIntroDialogue", () => {
    typewriter.stop();
    rhythmIntroDialogueBoxes.forEach((box) => {
      if (box) box.classList.remove("is-visible");
    });
    rhythmIntroDialogueTexts.forEach((text) => {
      if (text) text.textContent = "";
    });
    if (rhythmIntroDialogueNextHint) {
      rhythmIntroDialogueNextHint.classList.remove("is-visible");
    }
    rhythmIntroDialogueIndex = 0;
    if (rhythmIntroHint) {
      rhythmIntroHint.textContent = "點擊繼續";
      rhythmIntroHint.classList.remove("is-visible");
    }
    playRhythmIntroDialogue(0);
  });

  window.addEventListener("advanceRhythmIntroDialogue", () => {
    if (!rhythmIntroScene || !rhythmIntroScene.classList.contains("is-active")) {
      return;
    }
    if (typewriter.finishImmediately()) return;

    if (rhythmIntroDialogueIndex < rhythmIntroDialogueScript.length - 1) {
      playRhythmIntroDialogue(rhythmIntroDialogueIndex + 1);
      return;
    }

    rhythmIntroScene.classList.remove("is-active");
    window.dispatchEvent(new Event("startRhythmBranch"));
  });

  function playExcuseIntroDialogue(index) {
    const box = excuseIntroDialogueBoxes[index];
    const text = excuseIntroDialogueTexts[index];
    if (!box || !text) return;

    excuseIntroDialogueIndex = index;
    excuseIntroHint.classList.remove("is-visible");
    excuseIntroDialogueNextHint.classList.remove("is-visible");
    box.classList.add("is-visible");

    typewriter.start(text, excuseIntroDialogueScript[index], 46, () => {
      if (index === 0) {
        excuseIntroDialogueNextHint.classList.add("is-visible");
        return;
      }
      excuseIntroHint.textContent = "點擊繼續";
      excuseIntroHint.classList.add("is-visible");
    });
  }

  window.addEventListener("startExcuseIntroDialogue", () => {
    typewriter.stop();
    excuseIntroDialogueBoxes.forEach((box) => {
      if (box) box.classList.remove("is-visible");
    });
    excuseIntroDialogueTexts.forEach((text) => {
      if (text) text.textContent = "";
    });
    excuseIntroDialogueNextHint.classList.remove("is-visible");
    excuseIntroDialogueIndex = 0;
    excuseIntroHint.textContent = "點擊繼續";
    excuseIntroHint.classList.remove("is-visible");
    playExcuseIntroDialogue(0);
  });

  window.addEventListener("advanceExcuseIntroDialogue", () => {
    if (!excuseIntroScene.classList.contains("is-active")) return;
    if (typewriter.finishImmediately()) return;

    if (excuseIntroDialogueIndex < excuseIntroDialogueScript.length - 1) {
      playExcuseIntroDialogue(excuseIntroDialogueIndex + 1);
      return;
    }

    excuseIntroScene.classList.remove("is-active");
    window.dispatchEvent(new Event("startExcuseBranch"));
  });

  // =========================================
  // 不規則心跳節奏控制器
  // =========================================
  const rhythmController = (() => {
    let rafId = null;
    let stepTimers = [];
    let waveIndex = 0;
    let scanPercent = 0;
    let activeZoneStart = 48;
    let activeZoneWidth = 13;
    let isSweepActive = false;
    let sweepStartTime = 0;
    let trace = [];
    let pendingPeaks = [];
    let wavePeaks = [];
    let waveStrengths = [];
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const beatShape = [[-27, 0], [-18, 5], [-12, 0], [-6, -11], [0, 53],
      [9, -21], [17, 0], [31, 10], [46, 0]];

    function drawTrace(peaks, amplitude, now = 0) {
      function baselineAt(x) {
        if (!now) return 76;
        return 76 + Math.sin(x / 115 - now / 230) * 2.8 +
          Math.sin(x / 48 - now / 430) * 1.2;
      }

      trace = [[0, baselineAt(0)]];
      peaks.forEach((peak, index) => {
        const base = Array.isArray(amplitude) ? amplitude[index] : amplitude;
        const strength = now ? base * (1 + Math.sin(now / 180 - index * .92) * .21) : base;
        beatShape.forEach(([offset, height]) => {
          const x = peak * 10 + offset;
          if (x > 0 && x < 1000) trace.push([x, baselineAt(x) - height * strength]);
        });
      });
      trace.push([1000, baselineAt(1000)]);
      rhythmEcgTrace?.setAttribute("points", trace.map(point =>
        point.map(value => value.toFixed(2)).join(",")).join(" "));
    }

    function drawAmbientTrace(now) {
      const stable = rhythmEcg?.classList.contains("is-stable");
      if (phase === "rhythm" && wavePeaks.length) {
        drawTrace(wavePeaks, waveStrengths, now);
        positionScan(scanPercent);
        return;
      }

      const scrolling = motionPreference.matches ? 0 : (now / (stable ? 48 : 38)) % 100;
      const beats = stable ? [8, 33, 58, 83] : [9, 29, 58, 74, 91];
      const peaks = [];
      const strengths = [];
      for (let repeat = -1; repeat <= 1; repeat++) {
        beats.forEach((beat, index) => {
          const position = repeat * 100 + beat - scrolling;
          if (position < -5 || position > 104) return;
          peaks.push(position);
          strengths.push(stable ? .64 : [.56, 1, .73, .9, .49][index]);
        });
      }
      drawTrace(peaks, strengths);
    }

    let ambientFrame = null;

    function animateAmbient(now) {
      if (rhythmScene?.classList.contains("is-active") && !motionPreference.matches) {
        if (!isSweepActive) drawAmbientTrace(now);
        ambientFrame = requestAnimationFrame(animateAmbient);
      } else {
        ambientFrame = null;
      }
    }

    function syncAmbient() {
      const active = rhythmScene?.classList.contains("is-active");
      if (active && !motionPreference.matches) {
        if (ambientFrame === null) ambientFrame = requestAnimationFrame(animateAmbient);
        return;
      }
      if (ambientFrame !== null) {
        cancelAnimationFrame(ambientFrame);
        ambientFrame = null;
      }
      if (active && !isSweepActive) drawAmbientTrace(0);
    }

    if (rhythmScene) {
      const sceneObserver = new MutationObserver(syncAmbient);
      sceneObserver.observe(rhythmScene, { attributes: true, attributeFilter: ["class"] });
      motionPreference.addEventListener("change", syncAmbient);
      syncAmbient();
    }

    function isInWindow(percent) {
      return percent >= activeZoneStart - HIT_TOLERANCE &&
        percent <= activeZoneStart + activeZoneWidth + HIT_TOLERANCE;
    }

    function positionScan(percent) {
      if (!rhythmEcgCursor || !rhythmEcgDot) return;
      const x = Math.min(995, Math.max(5, percent * 10));
      const right = trace.findIndex(point => point[0] >= x);
      const [x0, y0] = trace[right - 1];
      const [x1, y1] = trace[right];
      const y = y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
      rhythmEcgCursor.setAttribute("transform", `translate(${x} 0)`);
      rhythmEcgDot.setAttribute("y1", y);
      rhythmEcgDot.setAttribute("y2", y);
      rhythmEcg?.classList.toggle("is-in-window", isInWindow(percent));
    }

    function clearStepTimers() {
      stepTimers.forEach((id) => clearTimeout(id));
      stepTimers = [];
    }

    function triggerHeartbeatPulse() {
      playTone(92, 0.13, "sine", 0.24);
    }

    function updateWaveUI() {
      const current = waves[Math.min(waveIndex, waves.length - 1)];
      activeZoneWidth = current.zoneWidth;
      activeZoneStart = current.zoneStart;

      if (rhythmWaveLabel) rhythmWaveLabel.textContent = current.label;
      if (rhythmDialogueText) {
        typewriter.start(rhythmDialogueText, current.dialogue, 32, null, false);
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
      scanPercent = 0;
      const target = activeZoneStart + activeZoneWidth / 2;
      const sidePeaks = [[14, 30, 84], [12, 48, 87], [17, 32, 79], [19, 41, 89]];
      wavePeaks = [...sidePeaks[waveIndex].slice(0, 2), target, sidePeaks[waveIndex][2]];
      pendingPeaks = [...wavePeaks];
      const irregularity = 1 - waveIndex * 0.2;
      waveStrengths = [1 - 0.22 * irregularity, 1 + 0.13 * irregularity,
        1, 1 - 0.34 * irregularity];
      drawTrace(wavePeaks, waveStrengths);
      if (rhythmEcgWindow) {
        rhythmEcgWindow.style.left = `${activeZoneStart - HIT_TOLERANCE}%`;
        rhythmEcgWindow.style.width = `${activeZoneWidth + HIT_TOLERANCE * 2}%`;
      }
      positionScan(0);

      isSweepActive = true;
      sweepStartTime = performance.now();
      triggerHeartbeatPulse();

      function tick(now) {
        if (!isSweepActive || phase !== "rhythm") return;
        const elapsed = now - sweepStartTime;
        const t = Math.max(0, Math.min(1, elapsed / current.duration));

        scanPercent = current.curve(t);
        if (pendingPeaks.length && scanPercent >= pendingPeaks[0]) {
          do {
            pendingPeaks.shift();
          } while (pendingPeaks.length && scanPercent >= pendingPeaks[0]);
          triggerHeartbeatPulse();
        }
        if (!motionPreference.matches) drawTrace(wavePeaks, waveStrengths, now);
        positionScan(scanPercent);

        if (t >= 1) {
          isSweepActive = false;
          handleFail("錯過心跳節拍");
          return;
        }

        rafId = requestAnimationFrame(tick);
      }

      rafId = requestAnimationFrame(tick);
    }

    function finishBranch(isPassed, failReason = "") {
      phase = "outro-dialogue";
      isSweepActive = false;
      clearStepTimers();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      rhythmEcg?.classList.remove("is-hit", "is-in-window");
      rhythmEcg?.classList.add(isPassed ? "is-stable" : "is-missed");
      drawAmbientTrace(performance.now());

      if (isPassed) {
        playTone(659.25, 0.35, "triangle", 0.2, 1.15);
        if (rhythmWaveLabel)
          rhythmWaveLabel.textContent = "檢定成功";

        typewriter.start(
          rhythmDialogueText,
          "「……看來只是我多心了。願主寬恕你的不安。」",
          44,
        );
        if (rhythmInstructionText) {
          typewriter.start(
            rhythmInstructionText,
            "完美通過，成功瞞過神父。",
            32,
            () => {
              if (rhythmActionBtn) {
                rhythmActionBtn.textContent = "繼續告解";
                rhythmActionBtn.dataset.outcome = "success";
                rhythmActionBtn.hidden = false;
              }
            },
            false,
          );
        }
      } else {
        playTone(98, 0.45, "sawtooth", 0.2, 0.5);
        extinguishCandlesFromRight(FAIL_EXTINGUISH_COUNT);
        showJudgment("未通過", false);

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
          rhythmWaveLabel.textContent = `檢定失敗（${failReason}）`;
        }
        typewriter.start(
          rhythmDialogueText,
          "「如果真的無辜，為何如此緊張？」",
          44,
        );
        if (rhythmInstructionText) {
          typewriter.start(
            rhythmInstructionText,
            `檢定失敗（${failReason}），繼續告解。`,
            32,
            () => {
              if (rhythmActionBtn) {
                rhythmActionBtn.textContent = "回到告解";
                rhythmActionBtn.dataset.outcome = "failure";
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

      const isHit = isInWindow(scanPercent);

      if (isHit) {
        playTone(587.33, 0.28, "triangle", 0.18, 1.1);
        rhythmEcg?.classList.add("is-hit");
        stepTimers.push(setTimeout(() => rhythmEcg?.classList.remove("is-hit"), 360));

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
        if (rhythmTrackArea) rhythmTrackArea.classList.remove("is-standby");
        if (rhythmActionBtn) rhythmActionBtn.hidden = true;
        if (rhythmInstructionText) {
          rhythmInstructionText.textContent =
            "心電圖亮點進入較亮區域時，按空白鍵。";
        }

        stepTimers.push(setTimeout(() => startWaveSweep(), 380));
      },
      stop() {
        isSweepActive = false;
        rhythmEcg?.classList.remove("is-stable", "is-missed", "is-hit", "is-in-window");
        wavePeaks = [];
        waveStrengths = [];
        drawAmbientTrace(0);
        positionScan(0);
        if (rhythmEcgWindow) rhythmEcgWindow.style.width = "0";
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
  if (rhythmInstructionBox) {
    rhythmInstructionBox.addEventListener("click", (e) => {
      if (phase !== "intro-dialogue") return;
      e.stopPropagation();
      advanceIntroDialogue();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (!rhythmScene || !rhythmScene.classList.contains("is-active")) return;
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
      const outcome = rhythmActionBtn.dataset.outcome;
      if (outcome !== "success" && outcome !== "failure") return;

      const success = outcome === "success";
      const litCandles =
        TOTAL_CANDLES -
        (success ? PASS_EXTINGUISH_COUNT : FAIL_EXTINGUISH_COUNT);
      phase = "inactive";
      window.dispatchEvent(
        new CustomEvent("rhythmBranchCompleted", {
          detail: { success, litCandles, gender: selectedGender },
        }),
      );
      if (window.parent !== window) {
        window.parent.postMessage(
          {
            type: "rhythmBranchCompleted",
            success,
            litCandles,
          },
          "*",
        );
      }
    });
  }

  window.addEventListener("startRhythmBranch", () => {
    if (!rhythmScene) return;
    selectedGender = rhythmScene.getAttribute("data-gender") || "male";
    configureRhythmAssets();
    rhythmController.stop();
    typewriter.stop();
    introLineIndex = 0;
    phase = "inactive";
    rhythmScene.classList.remove("is-miss-flash");
    alignRhythmCandlesWithInstructionBox();
    rhythmScene.classList.add("is-active");
    resetCandles();
    extinguishCandlesFromRight(PASS_EXTINGUISH_COUNT, true);
    if (rhythmActionBtn) rhythmActionBtn.hidden = true;
    playIntroDialogueLine(0);
  });

  requestAnimationFrame(() => {
    resetCandles();
  });
});

// Integrated excuse branch controller.
document.addEventListener("DOMContentLoaded", () => {
  const excuseScene = document.getElementById("excuseScene");
  const hudTimerCard = document.getElementById("hudTimerCard");
  const timerValueText = document.getElementById("timerValueText");

  const excuseDialogues = document.getElementById("excuseDialogues");
  const dialogueControlHint = document.getElementById("dialogueControlHint");

  const excuseCharacterImg = document.getElementById("excuseCharacterImg");
  const excuseCandlesWrap = document.getElementById("excuseCandlesWrap");
  const excuseCandlesImg = document.getElementById("excuseCandlesImg");
  const excuseFeedbackBanner = document.getElementById("excuseFeedbackBanner");

  const excuseTypingBox = document.getElementById("excuseTypingBox");
  const typingTimerFill = document.getElementById("typingTimerFill");
  const typingStatusBadge = document.getElementById("typingStatusBadge");
  const excuseActionBtn = document.getElementById("excuseActionBtn");
  const typingLettersGrid = document.getElementById("typingLettersGrid");

  // 素材副檔名自動備援
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

  setupImageFallback(excuseCandlesImg, [
    `${excuseScene.dataset.assetBase || "./images/"}Candle_0.png`,
    `${excuseScene.dataset.assetBase || "./images/"}Candle_0.jpg`,
  ]);

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
    endFreqRatio = 0.6,
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
    let onUpdateCallback = null;

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
        if (onUpdateCallback) onUpdateCallback();
      }
      const cb = onDoneCallback;
      onDoneCallback = null;
      if (typeof cb === "function") cb();
      return true;
    }

    function start(el, text, speed = 42, onDone = null, withSound = true, onUpdate = null) {
      stop();
      if (!el) return;
      targetEl = el;
      fullText = text;
      onDoneCallback = onDone;
      onUpdateCallback = onUpdate;
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
        if (onUpdateCallback) onUpdateCallback();
        if (withSound && ch.trim() !== "" && idx % 2 === 1) {
          playTone(540, 0.028, "triangle", 0.028, 0.85);
        }

        const pauseExtra = "，。！？…、".includes(ch) ? 115 : 0;
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

  // 狡辯計時與本環節的燭火顯示。
  const TOTAL_CANDLES = 7;
  const PASS_EXTINGUISH_COUNT = 5; // 過：五根蠟燭熄滅
  const FAIL_EXTINGUISH_COUNT = 6; // 沒過：六根蠟燭熄滅
  const ROUND_TIME_LIMIT = 5.0; // 每題限時 5 秒

  let remainingTime = ROUND_TIME_LIMIT;
  let phase = "inactive";
  let currentRoundIndex = 0;
  let dialogueStepIndex = 0;
  let activeDialogueList = [];
  let activeWord = "";
  let typedCount = 0;
  let countdownRafId = null;
  let lastFrameTime = 0;
  let transitionTimers = [];

  // 四題為共用題庫，每次狡辯從中隨機抽取兩題。
  /* =========================================
   【新增】狡辯環節固定開場對話

   功能：
   1. 只在進入狡辯環節時播放一次
   2. 不受第一題抽到的英文關鍵字影響
   3. 第二題開始不再重複播放

   left：神父
   center：玩家角色
   ========================================= */

const commonDialoguesRounds = [
  { side: "left", text: "我親愛的教徒。" },
  { side: "left", text: "在開始之前，我還有些問題想問您。" },
  { side: "center", text: "當然，神父。" },
  { side: "center", text: "只要是我知道的，必定知無不言。" },
];
  const originalRounds = [
    {
      word: "killer",
      dialogues: [
        { side: "left", text: "我親愛的教徒。" },
        { side: "left", text: "您確定對我沒有任何隱瞞？" },
        { side: "center", text: "當然，我的神父。" },
        { side: "center", text: "我怎麼能對您說謊？" },
        { side: "center", text: "殺手怎麼可能是我呢？" },
        { side: "center", text: "請您不要聽信那些胡言亂語。" },
      ],
    },
    {
      word: "weapon",
      dialogues: [
        {side: "left",text: "那麼，現場遺留的兇器又該作何解釋？"},
        {side: "center",text: "那不過是祈禱儀式用的器具罷了。"},
        {side: "center",text: "請不要聽信那些胡言亂語。",},
      ],
    },
  ];
  const additionalRounds = [
    {
      word: "corpse",
      dialogues: [
        { side: "left", text: "那麼地窖裡的氣味該怎麼解釋？" },
        { side: "left", text: "有人看見你深夜獨自進出。" },
        { side: "left", text: "那具屍體究竟是怎麼回事？" },
        { side: "center", text: "神父，您誤會了！" },
        { side: "center", text: "我只是去整理陳年的酒桶。" },
        { side: "center", text: "根本沒有您說的任何屍體。" },
        { side: "left", text: "在主面前，謊言無所遁形。" },
        {
          side: "center",
          text: "請相信我，那只是腐壞的木屑味！",
        },
      ],
    },
    {
      word: "enigma",
      dialogues: [
        {side: "left",text: "你的說辭處處充滿矛盾的謎團。",},
        {side: "center",text: "一切都只是巧合，我對主發誓！",},
      ],
    },
  ];
  const availableRounds = [...originalRounds, ...additionalRounds];
  let rounds = [];

  function chooseRandomRounds() {
    const shuffledRounds = [...availableRounds];
    for (let index = shuffledRounds.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffledRounds[index], shuffledRounds[randomIndex]] = [
        shuffledRounds[randomIndex],
        shuffledRounds[index],
      ];
    }
    return shuffledRounds.slice(0, 2);
  }

  function clearTransitionTimers() {
    transitionTimers.forEach((id) => clearTimeout(id));
    transitionTimers = [];
  }

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
    if (!excuseCandlesWrap) return;
    excuseCandlesWrap.querySelectorAll(".candle-flame-slot").forEach((slot) => {
      slot.classList.remove("is-extinguished");
    });
  }

  function extinguishCandlesFromRight(count) {
    clearCandleTimers();
    if (!excuseCandlesWrap) return;
    const clamped = Math.min(TOTAL_CANDLES, Math.max(0, count));
    for (let i = 0; i < clamped; i += 1) {
      const targetIndex = TOTAL_CANDLES - 1 - i;
      const slot = excuseCandlesWrap.querySelector(
        `.candle-flame-slot[data-candle-index="${targetIndex}"]`,
      );
      if (slot && !slot.classList.contains("is-extinguished")) {
        const timerId = setTimeout(() => {
          slot.classList.add("is-extinguished");
          playTone(185, 0.18, "sine", 0.06, 0.4);
        }, i * 180);
        candleTimers.push(timerId);
      }
    }
  }

  function updateTimerUI() {
    const clamped = Math.max(0, remainingTime);
    if (timerValueText) {
      timerValueText.textContent = `${clamped.toFixed(1)}s`;
    }
    if (typingTimerFill) {
      const ratio = clamped / ROUND_TIME_LIMIT;
      typingTimerFill.style.transform = `scaleX(${ratio})`;
      typingTimerFill.classList.toggle(
        "is-warning",
        clamped <= 3.0 && clamped > 1.8,
      );
      typingTimerFill.classList.toggle("is-urgent", clamped <= 1.8);
    }
    if (hudTimerCard) {
      hudTimerCard.classList.toggle("is-urgent", clamped <= 1.8);
    }
  }

  function stopCountdown() {
    if (countdownRafId !== null) {
      cancelAnimationFrame(countdownRafId);
      countdownRafId = null;
    }
  }

  function startCountdown() {
    stopCountdown();
    remainingTime = ROUND_TIME_LIMIT;
    updateTimerUI();
    lastFrameTime = performance.now();

    function tick(now) {
      if (phase !== "typing") return;
      const dt = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      remainingTime = Math.max(0, remainingTime - dt);
      updateTimerUI();

      if (remainingTime <= 0) {
        finishBranch(false);
        return;
      }
      countdownRafId = requestAnimationFrame(tick);
    }

    countdownRafId = requestAnimationFrame(tick);
  }

  // =========================================
  // 狡辯結果回饋橫幅
  // =========================================
  function showFeedbackBanner(text, isSuccess) {
    if (!excuseFeedbackBanner) return;
    excuseFeedbackBanner.textContent = text;
    excuseFeedbackBanner.classList.remove("is-success", "is-fail");
    void excuseFeedbackBanner.offsetWidth;
    excuseFeedbackBanner.classList.add(isSuccess ? "is-success" : "is-fail");
  }

  function hideFeedbackBanner() {
    if (!excuseFeedbackBanner) return;
    excuseFeedbackBanner.classList.remove("is-success", "is-fail");
    excuseFeedbackBanner.textContent = "";
  }

  // =========================================
  // 氣泡對話生成與打字機推進
  // =========================================
  function appendSpeechBubble(item, onComplete) {
    if (!excuseDialogues) return;
    const isLeft = item.side === "left";
    const bubbleEl = document.createElement("div");
    bubbleEl.className = `speech-bubble ${isLeft ? "is-left" : "is-right"}`;
    bubbleEl.setAttribute("role", "group");
    bubbleEl.setAttribute("aria-label", isLeft ? "神父" : "教徒");
    const textEl = document.createElement("span");
    textEl.className = "speech-bubble-text";
    bubbleEl.appendChild(textEl);
    excuseDialogues.appendChild(bubbleEl);
    const scrollToLatest = () => {
      excuseDialogues.scrollTop = excuseDialogues.scrollHeight;
    };
    typewriter.start(textEl, item.text, 40, onComplete, true, scrollToLatest);
  }

  function playDialogueStep(idx) {
    phase = "dialogue";
    if (excuseScene) excuseScene.classList.add("is-dialogue-clickable");
    if (excuseTypingBox) {
      excuseTypingBox.classList.add("is-standby");
      excuseTypingBox.classList.remove("is-active-round");
    }
    if (typingStatusBadge) {
      typingStatusBadge.textContent = "聆聽對話中…";
    }
    if (dialogueControlHint) {
      dialogueControlHint.classList.remove("is-visible");
    }

    const item = activeDialogueList[idx];
    appendSpeechBubble(item, () => {
      if (dialogueControlHint) {
        dialogueControlHint.textContent =
          idx < activeDialogueList.length - 1
            ? "點擊畫面或按空白鍵繼續 ▾"
            : "點擊畫面或按空白鍵開始 5 秒快速狡辯 ▸";
        dialogueControlHint.classList.add("is-visible");
      }
    });
  }

  function advanceDialogue() {
    if (phase !== "dialogue") return;
    ensureAudio();

    if (typewriter.finishImmediately()) {
      return;
    }

    dialogueStepIndex += 1;
    if (dialogueStepIndex < activeDialogueList.length) {
      playDialogueStep(dialogueStepIndex);
    } else {
      if (dialogueControlHint)
        dialogueControlHint.classList.remove("is-visible");
      if (excuseScene) excuseScene.classList.remove("is-dialogue-clickable");
      startTypingRound(currentRoundIndex);
    }
  }

  // =========================================
  // 字母格渲染與快速打字檢定
  // =========================================
  function renderWordSlots(word) {
    if (!typingLettersGrid) return;
    typingLettersGrid.innerHTML = "";
    Array.from(word).forEach((ch, idx) => {
      const slot = document.createElement("div");
      slot.className = "letter-slot";
      if (idx === 0) slot.classList.add("is-current");
      slot.dataset.index = String(idx);

      const svgNamespace = "http://www.w3.org/2000/svg";
      const charEl = document.createElementNS(svgNamespace, "svg");
      charEl.setAttribute("class", "letter-char");
      charEl.setAttribute("viewBox", "0 0 56 72");
      charEl.setAttribute("role", "img");
      charEl.setAttribute("aria-label", ch);
      const glyph = document.createElementNS(svgNamespace, "text");
      glyph.setAttribute("class", "letter-glyph");
      glyph.setAttribute("x", "28");
      glyph.setAttribute("y", "56");
      glyph.setAttribute("text-anchor", "middle");
      glyph.setAttribute("aria-hidden", "true");
      glyph.textContent = ch;
      charEl.appendChild(glyph);

      const lineEl = document.createElement("span");
      lineEl.className = "letter-underline";

      slot.appendChild(charEl);
      slot.appendChild(lineEl);
      typingLettersGrid.appendChild(slot);
    });
  }

  function startTypingRound(roundIdx) {
    const roundData = rounds[roundIdx];
    phase = "typing";
    activeWord = roundData.word.toLowerCase();
    typedCount = 0;

    renderWordSlots(activeWord);
    if (excuseTypingBox) {
      excuseTypingBox.classList.remove("is-standby");
      excuseTypingBox.classList.add("is-active-round");
    }
    if (typingStatusBadge) {
      typingStatusBadge.textContent =
        `第 ${roundIdx + 1} 題狡辯（限時 5 秒打出 ${activeWord}）` +
        " — 請直接用鍵盤輸入字母！";
    }

    startCountdown();
  }

  function handleTypingKey(keyChar) {
    if (phase !== "typing") return;
    ensureAudio();

    const expectedChar = activeWord[typedCount];
    const currentSlot = typingLettersGrid
      ? typingLettersGrid.querySelector(
          `.letter-slot[data-index="${typedCount}"]`,
        )
      : null;

    if (keyChar === expectedChar) {
      // 成功輸入當前字母
      playTone(520 + typedCount * 55, 0.14, "triangle", 0.16, 1.08);
      if (currentSlot) {
        currentSlot.classList.remove("is-current", "is-error");
        currentSlot.classList.add("is-typed");
      }

      typedCount += 1;
      if (typedCount < activeWord.length) {
        const nextSlot = typingLettersGrid
          ? typingLettersGrid.querySelector(
              `.letter-slot[data-index="${typedCount}"]`,
            )
          : null;
        if (nextSlot) nextSlot.classList.add("is-current");
      } else {
        // 本題單字全部打出
        stopCountdown();
        if (currentRoundIndex < rounds.length - 1) {
          // 進入下一題狡辯對話。
          phase = "transition";
          playTone(659.25, 0.25, "triangle", 0.18, 1.12);
          showFeedbackBanner("完美通過，準備下一句狡辯！", true);
          if (typingStatusBadge) {
            typingStatusBadge.textContent = "成功完成本句狡辯！";
          }

          transitionTimers.push(
            setTimeout(() => {
              hideFeedbackBanner();
              currentRoundIndex += 1;
              activeDialogueList = rounds[currentRoundIndex].dialogues;
              dialogueStepIndex = 0;
              renderWordSlots(rounds[currentRoundIndex].word);
              playDialogueStep(0);
            }, 950),
          );
        } else {
          // 全部完成 -> 觸發「過」分支
          finishBranch(true);
        }
      }
    } else {
      // 按錯字母給予短暫視覺與音效警示（不中斷計時，玩家需在 5 秒內修正）
      playTone(130, 0.16, "sawtooth", 0.14, 0.55);
      if (currentSlot) {
        currentSlot.classList.remove("is-error");
        void currentSlot.offsetWidth;
        currentSlot.classList.add("is-error");
      }
      if (excuseTypingBox) {
        excuseTypingBox.classList.remove("is-wrong-shake");
        void excuseTypingBox.offsetWidth;
        excuseTypingBox.classList.add("is-wrong-shake");
      }
    }
  }

  // 通過不扣分，失敗扣一根燭火。
  function finishBranch(isPassed) {
    phase = "result";
    stopCountdown();
    clearTransitionTimers();
    if (excuseScene) excuseScene.classList.remove("is-dialogue-clickable");
    if (excuseTypingBox) excuseTypingBox.classList.remove("is-active-round");

    if (isPassed) {
      playTone(659.25, 0.36, "triangle", 0.2, 1.15);
      showFeedbackBanner("完美通過，不扣分", true);

      appendSpeechBubble({
        side: "left",
        text: "……願你的言辭在主面前毫無虛假。進入下一階段吧。",
      });

      if (typingStatusBadge) {
        typingStatusBadge.textContent = "狡辯成功：不扣分。";
      }
      if (excuseActionBtn) {
        excuseActionBtn.textContent = "繼續告解";
        excuseActionBtn.dataset.success = "true";
        excuseActionBtn.hidden = false;
      }
    } else {
      playTone(96, 0.45, "sawtooth", 0.2, 0.5);
      extinguishCandlesFromRight(FAIL_EXTINGUISH_COUNT);
      showFeedbackBanner("狡辯失敗，扣一分", false);

      if (excuseScene) {
        excuseScene.classList.add("is-miss-flash");
        transitionTimers.push(
          setTimeout(() => excuseScene.classList.remove("is-miss-flash"), 380),
        );
      }

      appendSpeechBubble({
        side: "left",
        text: "支吾其詞、破綻百出……你根本無法為自己辯解！",
      });

      if (typingStatusBadge) {
        typingStatusBadge.textContent = "狡辯失敗：扣一分。";
      }
      if (excuseActionBtn) {
        excuseActionBtn.textContent = "繼續告解";
        excuseActionBtn.dataset.success = "false";
        excuseActionBtn.hidden = false;
      }
    }
  }

  // =========================================
  // 初始化與事件綁定
  // =========================================
  function initGame() {
    stopCountdown();
    clearTransitionTimers();
    typewriter.stop();
    hideFeedbackBanner();
    resetCandles();

    currentRoundIndex = 0;
    dialogueStepIndex = 0;
    activeDialogueList = [...commonDialoguesRounds, ...rounds[0].dialogues];
    remainingTime = ROUND_TIME_LIMIT;
    updateTimerUI();

    if (excuseDialogues) excuseDialogues.replaceChildren();
    if (excuseActionBtn) {
      excuseActionBtn.hidden = true;
      excuseActionBtn.disabled = false;
    }

    renderWordSlots(rounds[0].word);
    playDialogueStep(0);
  }

  if (excuseScene) {
    excuseScene.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      if (phase === "dialogue") {
        advanceDialogue();
      }
    });
  }

  window.addEventListener("keydown", (e) => {
    if (phase === "dialogue") {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        advanceDialogue();
      }
      return;
    }

    if (phase === "typing") {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        handleTypingKey(e.key.toLowerCase());
      }
    }
  });

  if (excuseActionBtn) {
    excuseActionBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typewriter.finishImmediately()) return;
      excuseActionBtn.disabled = true;
      const success = excuseActionBtn.dataset.success === "true";
      phase = "inactive";
      window.dispatchEvent(
        new CustomEvent("excuseBranchCompleted", { detail: { success } }),
      );
    });
  }

  window.addEventListener("startExcuseBranch", () => {
    const selectedGender = excuseScene.getAttribute("data-gender") || "male";
    const isFemaleCharacter = selectedGender === "female";
    rounds = chooseRandomRounds();
    if (excuseScene) {
      excuseScene.classList.add("is-active");
      excuseScene.classList.remove("is-miss-flash");
    }
    if (excuseCharacterImg) {
      excuseCharacterImg.src = isFemaleCharacter
        ? "./images/PC_G/PC_talk.PNG"
        : "./images/PC_B/PC_talk.PNG";
      excuseCharacterImg.alt = isFemaleCharacter ? "女角色神情" : "男角色神情";
    }
    initGame();
    extinguishCandlesFromRight(PASS_EXTINGUISH_COUNT);
  });
});
(() => {
  'use strict';
  const endingScene = document.getElementById('endingScene');
  const scenes = [...endingScene.querySelectorAll('[data-ending]')];
  const controllers = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let active = null;
  const soundButton = document.getElementById('soundControl');
  const escapeDurations = {
    travel: 2300,
    shadow: 420,
    emptyCar: 1100,
    verdictDelay: 720
  };

  const endingDetails = {
    prison: { result: '結局一：信任崩解。' },
    escape: { result: '結局二：逃離告解室。' },
    concealed: { result: '結局三：無人識破。' }
  };

  for (const root of scenes) {
    const name = root.dataset.ending;
    const find = id => root.querySelector('#' + name + '-' + id);
    const lines = [...root.querySelectorAll('.dialogue')];
    const verdict = root.querySelector('.verdict');
    const status = find('status');
    // 修改三個 .dialogue 的 data-text 即可更換對話。
    let index = -1, state = 'ready', chars = [], cursor = 0;
    let typingTimer, nextTimer, closeTimer, verdictTimer, departTimer, railTimer;
    const voice = () => {
      const audio = gameAudio.context;
      if (!audio || audio.state !== 'running') return;
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = 220 + Math.random() * 80;
      gain.gain.setValueAtTime(.018, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .035);
      oscillator.connect(gain).connect(gameAudio.output);
      oscillator.start(); oscillator.stop(audio.currentTime + .04);
    };
    function finishLine() {
      clearTimeout(typingTimer);
      const line = lines[index];
      line.querySelector('span').textContent = line.dataset.text;
      line.classList.remove('is-speaking'); state = 'waiting';
      status.textContent = line.dataset.text;
      const delay = index === lines.length - 1
        ? Math.max(2500, chars.length * 140)
        : Math.max(1500, chars.length * 100);
      nextTimer = setTimeout(next, delay);
    }
    function typeNext() {
      if (state !== 'typing') return;
      const ch = chars[cursor++];
      lines[index].querySelector('span').textContent += ch;
      if (!/[，。！？、\s]/u.test(ch)) voice();
      if (cursor >= chars.length) { finishLine(); return; }
      typingTimer = setTimeout(typeNext, /[，。！？]/u.test(ch) ? 320 : 65);
    }
    function railSound() {
      const audio = gameAudio.context;
      if (!audio || audio.state !== 'running') return;
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
      o.type = 'triangle'; o.frequency.setValueAtTime(100, t);
      o.frequency.exponentialRampToValueAtTime(35, t + .11);
      g.gain.setValueAtTime(.09, t); g.gain.exponentialRampToValueAtTime(.001, t + .14);
      o.connect(g).connect(gameAudio.output); o.start(); o.stop(t + .15);
    }
    function showVerdict() {
      state = 'ended';
      verdict.inert = false;
      verdict.classList.add('is-visible');
      find('replay').focus({preventScroll: true});
      status.textContent = endingDetails[name].result;
      root.dispatchEvent(new CustomEvent('ending:complete', {
        bubbles: true,
        detail: { id: name }
      }));
    }

    function finishPrison() {
      root.classList.add('is-closing');
      verdictTimer = setTimeout(showVerdict, reduced.matches ? 0 : 1400);
    }

    function playEscape() {
      const calm = reduced.matches;
      root.classList.add('is-traveling');
      status.textContent = '列車載著你和行李繼續向前。';
      if (!calm) railTimer = setInterval(railSound, 345);

      closeTimer = setTimeout(() => {
        root.classList.add('is-passing-shadow');

        closeTimer = setTimeout(() => {
          root.classList.replace('is-passing-shadow', 'is-empty');
          status.textContent = '暗影掠過，車廂裡已經沒有人和行李。';

          departTimer = setTimeout(() => {
            clearInterval(railTimer);
            root.classList.remove('is-traveling');
            root.classList.add('is-departed');
            verdictTimer = setTimeout(showVerdict, calm ? 0 : escapeDurations.verdictDelay);
          }, calm ? 650 : escapeDurations.emptyCar);
        }, calm ? 0 : escapeDurations.shadow);
      }, calm ? 750 : escapeDurations.travel);
    }

    function leaveConfession() {
      root.classList.add('is-concealed');
      status.textContent = '神父沒有起疑，你帶著祕密離開。';
      verdictTimer = setTimeout(showVerdict, reduced.matches ? 0 : 1450);
    }

    function next() {
      if (state === 'closing' || state === 'ended') return;
      if (state === 'typing') return;
      if (index === lines.length - 1) {
        state = 'closing';
        if (name === 'prison') finishPrison();
        else if (name === 'escape') playEscape();
        else leaveConfession();
        return;
      }
      index++; cursor = 0; state = 'typing';
      if (name === 'concealed') root.dataset.dialogueStep = String(index + 1);
      const line = lines[index]; chars = Array.from(line.dataset.text);
      line.classList.add('is-visible', 'is-speaking');
      if (reduced.matches || !chars.length) finishLine(); else typeNext();
    }
    function reset() {
      [typingTimer, nextTimer, closeTimer, verdictTimer, departTimer].forEach(clearTimeout);
      clearInterval(railTimer);
      index = -1; state = 'ready';
      delete root.dataset.dialogueStep;
      root.classList.remove('is-concealed', 'is-traveling', 'is-passing-shadow', 'is-empty', 'is-departed', 'is-closing');
      verdict.classList.remove('is-visible'); verdict.inert = true;
      lines.forEach(line => {line.classList.remove('is-visible', 'is-speaking');line.querySelector('span').textContent = '';});
      status.textContent = '';
    }
    function start() {
      reset();
      soundButton.focus({preventScroll: true});
      next();
    }
    find('replay').addEventListener('click', start);
    root.querySelector('.back-to-intro').addEventListener('click', () => window.location.reload());
    controllers.set(name, { start, reset });
    const dust = root.querySelector('.dust');
    for (let i = 0; i < 22; i++) {
      const speck = document.createElement('i');
      speck.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*100}%;--duration:${8+Math.random()*10}s;--delay:${-Math.random()*18}s`;
      dust.append(speck);
    }
  }

  window.addEventListener('questionnaireCompleted', event => {
    const remaining = event.detail.remainingCandles;
    if (!Number.isInteger(remaining) || remaining < 0 || remaining > 7) {
      throw new RangeError('Invalid remaining candle count: ' + remaining);
    }
    const gender = event.detail.gender;
    if (gender !== 'male' && gender !== 'female') {
      throw new Error('Invalid selected gender: ' + gender);
    }
    const characterFolder = gender === 'female' ? 'PC_G' : 'PC_B';
    endingScene.querySelector('#escape-character-art').setAttribute('href', `./images/${characterFolder}/PC_sit.PNG`);
    endingScene.querySelector('.concealed-reveal').src = `./images/${characterFolder}/PC_left.PNG`;
    endingScene.querySelector('.concealed-prayer').src = `./images/${characterFolder}/PC_right.PNG`;
    if (active !== null) controllers.get(active).reset();
    active = remaining <= 1 ? 'prison' : remaining < 7 ? 'escape' : 'concealed';
    for (const scene of scenes) scene.hidden = scene.dataset.ending !== active;
    endingScene.classList.add('is-active');
    controllers.get(active).start();
  });
})();
/* =========================================
   【新增】蠟燭游標與光線軌跡系統
   功能：
   1. 自訂游標跟隨滑鼠
   2. 點擊時增強燭火亮度
   3. 保留半秒內的移動光線
   4. 光線隨時間逐漸消失
   ========================================= */

(() => {
    const cursor = document.getElementById("candleCursor");
    const canvas = document.getElementById("candleTrail");

    // 若 HTML 沒有對應元素，停止初始化
    if (!cursor || !canvas) return;

    const flameGlow = cursor.querySelector(".candle-cursor-glow");
    if (!flameGlow) {
        console.error("找不到蠟燭游標的燭火光暈");
        return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    /* 【設定】可自行調整的參數 */
    const TRAIL_DURATION = 500;
    const TRAIL_WIDTH = 18;
    const CLICK_DURATION = 280;  // 點擊增亮持續時間

    const CURSOR_OFFSET_X = 22;
    const CURSOR_OFFSET_Y = 38;
    const TRAIL_OFFSET_Y = 4;
    let clickTimer = null;

    // 儲存軌跡點：x、y、產生時間
    const trailPoints = [];
    const sparkles = [];

    /* 【功能一】調整 Canvas 解析度 */
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;

        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    /* 【功能二】讓蠟燭跟隨滑鼠 */
    document.addEventListener("pointermove", (event) => {
        if (event.pointerType === "touch") return;

        cursor.style.opacity = "1";

        // 將游標定位至滑鼠位置
        cursor.style.transform =
            `translate3d(${event.clientX - CURSOR_OFFSET_X}px, ${event.clientY - CURSOR_OFFSET_Y}px, 0)`;

        const now = performance.now();
        if (trailPoints.length && now - trailPoints[trailPoints.length - 1].time > TRAIL_DURATION) {
            trailPoints.length = 0;
            sparkles.length = 0;
        }

        const point = {
            x: event.clientX - CURSOR_OFFSET_X + flameGlow.offsetLeft,
            y: event.clientY - CURSOR_OFFSET_Y + flameGlow.offsetTop + TRAIL_OFFSET_Y,
            time: now
        };
        trailPoints.push(point);

        const lastSparkle = sparkles[sparkles.length - 1];
        if (!lastSparkle || Math.hypot(point.x - lastSparkle.originX, point.y - lastSparkle.originY) >= 18) {
            sparkles.push({
                originX: point.x,
                originY: point.y,
                x: point.x + (Math.random() - 0.5) * 35,
                y: point.y + (Math.random() - 0.5) * 35,
                radius: 1 + Math.random() * 1.5,
                time: now
            });
        }
    });

    /* 【功能三】點擊時增強燭火亮度 */
    document.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "touch") return;

        cursor.classList.add("is-clicking");

        clearTimeout(clickTimer);

        clickTimer = setTimeout(() => {
            cursor.classList.remove("is-clicking");
        }, CLICK_DURATION);
    });

    /* 【功能四】繪製半秒內的光線軌跡 */
    function drawTrail(now) {
        ctx.clearRect(
            0,
            0,
            window.innerWidth,
            window.innerHeight
        );

        // 移除超過半秒的舊軌跡
        while (
            trailPoints.length &&
            now - trailPoints[0].time > TRAIL_DURATION
        ) {
            trailPoints.shift();
        }
        while (sparkles.length && now - sparkles[0].time > TRAIL_DURATION) {
            sparkles.shift();
        }

        // 逐段繪製光線
        for (let i = 1; i < trailPoints.length; i++) {
            const previous = trailPoints[i - 1];
            const current = trailPoints[i];

            // 依據軌跡年齡計算透明度
            const age = now - current.time;
            const alpha = Math.min(1, Math.max(0, 1 - age / TRAIL_DURATION));

            ctx.beginPath();
            const beforePrevious = trailPoints[i - 2];
            const startX = beforePrevious ? (beforePrevious.x + previous.x) / 2 : previous.x;
            const startY = beforePrevious ? (beforePrevious.y + previous.y) / 2 : previous.y;
            const endX = i === trailPoints.length - 1 ? current.x : (previous.x + current.x) / 2;
            const endY = i === trailPoints.length - 1 ? current.y : (previous.y + current.y) / 2;
            if (startX === endX && startY === endY) continue;
            ctx.moveTo(startX, startY);
            ctx.quadraticCurveTo(previous.x, previous.y, endX, endY);

            const startAlpha = alpha * (i - 1) / (trailPoints.length - 1);
            const endAlpha = alpha * i / (trailPoints.length - 1);
            const glowGradient = ctx.createLinearGradient(startX, startY, endX, endY);
            glowGradient.addColorStop(0, `rgba(255, 190, 90, ${startAlpha})`);
            glowGradient.addColorStop(1, `rgba(255, 190, 90, ${endAlpha})`);
            ctx.strokeStyle = glowGradient;

            ctx.lineWidth = TRAIL_WIDTH;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            // 金黃色柔光
            ctx.shadowColor = "rgba(255, 170, 50, 0.9)";
            ctx.shadowBlur = 12 * alpha;

            ctx.stroke();
            const coreGradient = ctx.createLinearGradient(startX, startY, endX, endY);
            coreGradient.addColorStop(0, `rgba(255, 241, 190, ${startAlpha * 0.8})`);
            coreGradient.addColorStop(1, `rgba(255, 241, 190, ${endAlpha * 0.8})`);
            ctx.strokeStyle = coreGradient;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        sparkles.forEach((sparkle) => {
            const alpha = Math.min(1, Math.max(0, 1 - (now - sparkle.time) / TRAIL_DURATION));
            ctx.beginPath();
            ctx.arc(sparkle.x, sparkle.y, sparkle.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 226, 159, ${alpha})`;
            ctx.shadowColor = "rgba(255, 174, 64, 0.9)";
            ctx.shadowBlur = 8;
            ctx.fill();
        });

        ctx.shadowBlur = 0;

        requestAnimationFrame(drawTrail);
    }

    /* 【功能五】滑鼠離開視窗時隱藏蠟燭 */
    document.addEventListener("pointerout", (event) => {
        if (!event.relatedTarget) {
            cursor.style.opacity = "0";
            trailPoints.length = 0;
            sparkles.length = 0;
        }
    });

    /* 啟動光線繪製 */
    requestAnimationFrame(drawTrail);
})();