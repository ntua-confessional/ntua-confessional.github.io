// 新增 Web Audio 音效時，請使用 context 並將音源連接至 output。
const gameAudio = (() => {
  const slider = document.getElementById("sfxVolume");
  const status = document.getElementById("soundStatus");
  let context = null;
  let output = null;
  let volume = Number(slider.value) / 100;
  let failed = false;
  let interacted = false;

  function createAudio() {
    if (context) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Web Audio is not supported");
    const newContext = new AudioContextClass();
    const newOutput = newContext.createGain();
    newOutput.gain.value = volume;
    newOutput.connect(newContext.destination);
    context = newContext;
    output = newOutput;
  }

  // 瀏覽器通常要求先有使用者操作，才能啟動音訊。
  function startDefaultAudio() {
    window.removeEventListener("pointerdown", startDefaultAudio, true);
    window.removeEventListener("keydown", startDefaultAudio, true);
    interacted = true;
    activateAudio();
  }

  function activateAudio() {
    if (volume === 0) return;
    try {
      createAudio();
      context.resume().then(() => {
        if (context.state !== "running") throw new Error("Audio context did not resume");
        failed = false;
        status.hidden = true;
      }).catch(reportStartError);
    } catch (error) {
      reportStartError(error);
    }
  }

  function reportStartError(error) {
    console.error("無法啟用音效", error);
    if (volume === 0) return;
    failed = true;
    status.textContent = "無法啟用音效，請調整音量重試。";
    status.hidden = false;
  }

  window.addEventListener("pointerdown", startDefaultAudio, true);
  window.addEventListener("keydown", startDefaultAudio, true);

  return {
    get context() { return volume > 0 && !failed ? context : null; },
    get output() { return output; },
    setVolume(value) {
      volume = value;
      if (output) output.gain.setValueAtTime(volume, context.currentTime);
      if (volume === 0) {
        status.hidden = true;
      } else if (interacted && (!context || context.state !== "running" || failed)) {
        activateAudio();
      }
    },
    resume() {
      if (volume > 0 && context && context.state === "suspended") {
        activateAudio();
      }
    },
  };
})();

(() => {
  const controls = document.getElementById("audioControls");
  const music = document.getElementById("backgroundMusic");
  const musicStatus = document.getElementById("musicStatus");
  const storageStatus = document.getElementById("audioStorageStatus");
  const trigger = document.getElementById("audioSettingsTrigger");
  const panel = document.getElementById("audioSettingsPanel");
  const backdrop = document.getElementById("audioSettingsBackdrop");
  const bgmSlider = document.getElementById("bgmVolume");
  const sfxSlider = document.getElementById("sfxVolume");
  const bgmValue = document.getElementById("bgmVolumeValue");
  const sfxValue = document.getElementById("sfxVolumeValue");
  const bgmMute = document.getElementById("bgmMute");
  const sfxMute = document.getElementById("sfxMute");
  let musicStarting = false;
  let musicRequested = false;
  let localFallbackAttempted = false;
  let localFallbackLoading = false;
  let storageAvailable = true;

  function reportStorageError(error) {
    console.warn("無法讀取或儲存音量設定", error);
    storageAvailable = false;
    storageStatus.textContent = "無法儲存音量設定，本次遊戲仍可調整音量。";
    storageStatus.hidden = false;
  }

  function readSetting(key) {
    if (!storageAvailable) return null;
    try {
      return localStorage.getItem(key);
    } catch (error) {
      reportStorageError(error);
      return null;
    }
  }

  function saveSetting(key, value) {
    if (!storageAvailable) return;
    try {
      localStorage.setItem(key, String(value));
    } catch (error) {
      reportStorageError(error);
    }
  }

  function readVolume(key, fallback) {
    const saved = readSetting(key);
    if (saved === null) return fallback;
    const value = Number(saved);
    if (!saved.trim() || !Number.isFinite(value)) {
      console.warn("無效的音量設定", key, saved);
      return fallback;
    }
    if (value < 0 || value > 100) {
      console.warn("音量設定超出範圍", key, saved);
    }
    return Math.round(Math.max(0, Math.min(100, value)));
  }

  function readMuted(key) {
    const saved = readSetting(key);
    if (saved === null || saved === "false") return false;
    if (saved === "true") return true;
    console.warn("無效的靜音設定", key, saved);
    return false;
  }

  const settings = {
    bgm: readVolume("gameBgmVolume", 10),
    sfx: readVolume("gameSfxVolume", 80),
    bgmMuted: readMuted("gameBgmMuted"),
    sfxMuted: readMuted("gameSfxMuted"),
  };
  const bgmTracks = new Set([music]);
  const sfxTracks = new Set();

  function getVolume(type) {
    if (type !== "bgm" && type !== "sfx") throw new Error("未知音訊類型：" + type);
    return settings[type + "Muted"] ? 0 : settings[type] / 100;
  }

  function applyVolumes() {
    bgmTracks.forEach((audio) => { audio.volume = getVolume("bgm") * 0.5; });
    sfxTracks.forEach((audio) => { audio.volume = getVolume("sfx"); });
    gameAudio.setVolume(getVolume("sfx") * 1.5);
  }

  function updateUI() {
    bgmSlider.value = settings.bgm;
    sfxSlider.value = settings.sfx;
    bgmValue.textContent = `${settings.bgmMuted ? 0 : settings.bgm}%`;
    sfxValue.textContent = `${settings.sfxMuted ? 0 : settings.sfx}%`;
    bgmSlider.disabled = settings.bgmMuted;
    sfxSlider.disabled = settings.sfxMuted;
    bgmMute.classList.toggle("is-muted", settings.bgmMuted);
    sfxMute.classList.toggle("is-muted", settings.sfxMuted);
    bgmMute.setAttribute("aria-pressed", String(settings.bgmMuted));
    sfxMute.setAttribute("aria-pressed", String(settings.sfxMuted));
    bgmMute.setAttribute("aria-label", settings.bgmMuted ? "取消背景音樂靜音" : "背景音樂靜音");
    sfxMute.setAttribute("aria-label", settings.sfxMuted ? "取消遊戲音效靜音" : "遊戲音效靜音");
    bgmMute.textContent = settings.bgmMuted ? "×" : "♪";
    sfxMute.textContent = settings.sfxMuted ? "×" : "♫";
    applyVolumes();
  }

  window.gameAudioSettings = {
    registerBGM(audio) {
      bgmTracks.add(audio);
      audio.volume = getVolume("bgm") * 0.5;
      return audio;
    },
    registerSFX(audio) {
      sfxTracks.add(audio);
      audio.volume = getVolume("sfx");
      return audio;
    },
    getVolume,
    applyVolumes,
  };
  updateUI();

  function reportMusicError(error) {
    console.error("無法播放背景音樂", error);
    musicStatus.textContent = "無法播放背景音樂，請點擊畫面重試。";
    musicStatus.hidden = false;
  }

  function startMusic() {
    musicRequested = true;
    if (!music.paused || musicStarting || localFallbackLoading) return;
    musicStarting = true;
    if (music.error) music.load();
    music.play().then(() => {
      musicStarting = false;
      musicStatus.hidden = true;
    }).catch((error) => {
      musicStarting = false;
      if (localFallbackLoading) {
        console.warn("本機背景音樂無法直接播放，正在重新載入", error);
      } else {
        reportMusicError(error);
      }
    });
  }

  music.addEventListener("error", () => {
    if (location.protocol !== "file:" || localFallbackAttempted) {
      reportMusicError(music.error);
      return;
    }

    localFallbackAttempted = true;
    localFallbackLoading = true;
    console.warn("本機背景音樂無法直接載入，正在重新載入", music.error);
    fetch(music.currentSrc || music.src).then((response) => {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.blob();
    }).then((blob) => {
      music.src = URL.createObjectURL(new Blob([blob], { type: "audio/wav" }));
      music.load();
      localFallbackLoading = false;
      if (musicRequested) startMusic();
    }).catch((error) => {
      localFallbackLoading = false;
      reportMusicError(error);
    });
  });
  window.addEventListener("pointerdown", startMusic, true);
  window.addEventListener("keydown", startMusic, true);

  function setPanelOpen(open) {
    panel.hidden = !open;
    backdrop.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    trigger.setAttribute("aria-label", open ? "關閉音量設定" : "開啟音量設定");
  }

  bgmSlider.addEventListener("input", () => {
    settings.bgm = Number(bgmSlider.value);
    saveSetting("gameBgmVolume", settings.bgm);
    updateUI();
  });
  sfxSlider.addEventListener("input", () => {
    settings.sfx = Number(sfxSlider.value);
    saveSetting("gameSfxVolume", settings.sfx);
    updateUI();
  });
  bgmMute.addEventListener("click", () => {
    settings.bgmMuted = !settings.bgmMuted;
    saveSetting("gameBgmMuted", settings.bgmMuted);
    updateUI();
  });
  sfxMute.addEventListener("click", () => {
    settings.sfxMuted = !settings.sfxMuted;
    saveSetting("gameSfxMuted", settings.sfxMuted);
    updateUI();
  });
  trigger.addEventListener("click", () => setPanelOpen(panel.hidden));
  backdrop.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  backdrop.addEventListener("click", (event) => {
    event.stopPropagation();
    if (panel.contains(document.activeElement)) document.activeElement.blur();
    setPanelOpen(false);
  });

  controls.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape" && !panel.hidden) {
      event.preventDefault();
      setPanelOpen(false);
      trigger.focus();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      event.preventDefault();
      setPanelOpen(false);
      trigger.focus();
    }
  });
})();

const sfxTargetRms = 0.01;

function normalizedToneScale(peak, tail, wave) {
  // Web Audio 的鋸齒波與方波會經過週期波峰值正規化。
  const waveRms = wave === "sine" ? Math.SQRT1_2 : wave === "square" ? 0.85 :
    wave === "sawtooth" ? Math.sqrt(1 / 3) * 0.85 : Math.sqrt(1 / 3);
  const envelopeRms = Math.sqrt((peak * peak - tail * tail) / (2 * Math.log(peak / tail)));
  return sfxTargetRms / (waveRms * envelopeRms);
}

function playTypingSound(character, index) {
  if (!character.trim() || index % 2 !== 1) return;
  const audio = gameAudio.context;
  if (!audio || audio.state !== "running") return;

  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const scale = normalizedToneScale(0.03, 0.001, "triangle");
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(520, now);
  oscillator.frequency.exponentialRampToValueAtTime(442, now + 0.03);
  gain.gain.setValueAtTime(0.03 * scale, now);
  gain.gain.exponentialRampToValueAtTime(0.001 * scale, now + 0.03);
  oscillator.connect(gain);
  gain.connect(gameAudio.output);
  oscillator.start(now);
  oscillator.stop(now + 0.03);
}

const gameSfx = (() => {
  // 頻率以 Hz、時間以秒表示；可直接調整各音效的音高、長度、音量和延遲。
  const tone = (frequency, endFrequency, duration, gain, delay = 0, wave = "sine", attack = 0.005) =>
    ({ kind: "tone", frequency, endFrequency, duration, gain, delay, wave, attack });
  const noise = (frequency, endFrequency, duration, gain, delay = 0, filter = "bandpass", attack = 0.005) =>
    ({ kind: "noise", frequency, endFrequency, duration, gain, delay, filter, attack });

  const sounds = {
    "match-ignite": [
      noise(5000, 1700, 0.16, 0.16, 0, "highpass"),
      noise(2400, 700, 0.45, 0.08, 0.06, "lowpass", 0.025),
      tone(420, 120, 0.12, 0.035, 0.04, "triangle"),
    ],
    "character-lock": [
      tone(700, 540, 0.08, 0.06, 0, "triangle"),
      tone(1050, 860, 0.17, 0.04, 0.035),
    ],
    "confession-door": [
      noise(750, 230, 0.95, 0.08, 0, "lowpass", 0.08),
      tone(110, 63, 1.05, 0.055, 0.06, "triangle", 0.08),
      noise(1200, 400, 0.17, 0.09, 0.95, "lowpass"),
    ],
    "room-step": [
      noise(1600, 500, 0.16, 0.08, 0, "lowpass"),
      tone(120, 60, 0.13, 0.055, 0, "triangle"),
      noise(1400, 450, 0.16, 0.065, 0.22, "lowpass"),
      tone(110, 55, 0.14, 0.05, 0.22, "triangle"),
    ],
    "briefing-pencil": [
      noise(4200, 2800, 0.08, 0.05, 0, "bandpass"),
      noise(3600, 2200, 0.08, 0.04, 0.10, "bandpass"),
      noise(4100, 2500, 0.07, 0.035, 0.19, "bandpass"),
    ],
    "paper-unfold": [
      noise(3800, 1400, 0.24, 0.08, 0, "bandpass"),
      noise(2600, 1000, 0.28, 0.065, 0.15, "bandpass"),
      noise(4800, 1800, 0.16, 0.045, 0.35, "bandpass"),
    ],
    "tutorial-page": [
      noise(3300, 900, 0.36, 0.07, 0, "bandpass", 0.02),
      noise(4500, 1700, 0.18, 0.04, 0.12, "bandpass"),
    ],
    "candle-relight": [
      noise(5000, 2200, 0.12, 0.075, 0, "highpass"),
      tone(700, 1250, 0.20, 0.04, 0.04, "sine", 0.02),
      noise(1800, 500, 0.19, 0.035, 0.08, "lowpass"),
    ],
    "warning-bell": [
      tone(175, 172, 1.8, 0.095, 0, "sine", 0.012),
      tone(350, 344, 1.4, 0.045, 0, "sine", 0.008),
      tone(525, 515, 0.9, 0.025, 0, "sine"),
      noise(1500, 500, 0.09, 0.04, 0, "bandpass"),
    ],
    "dialogue-priest": [
      tone(520, 430, 0.16, 0.05, 0, "triangle"),
      tone(780, 650, 0.10, 0.018, 0.01),
    ],
    "dialogue-player": [
      tone(690, 590, 0.13, 0.055, 0, "triangle"),
      tone(1035, 885, 0.09, 0.018, 0.01),
    ],
    "options-reveal": [
      tone(700, 800, 0.10, 0.04, 0, "sine"),
      tone(1050, 1250, 0.18, 0.045, 0.05, "sine"),
    ],
    "answer-confirm": [
      noise(1800, 1800, 0.035, 0.075),
      tone(880, 880, 0.065, 0.075, 0, "triangle"),
      noise(1800, 1800, 0.035, 0.05, 0.055),
      tone(1720, 1720, 0.27, 0.09, 0.055),
      tone(2540, 2540, 0.19, 0.028, 0.058),
      tone(3400, 3400, 0.12, 0.009, 0.06),
    ],
    "candle-out": [
      noise(1600, 380, 0.32, 0.12, 0, "lowpass", 0.015),
      tone(180, 65, 0.18, 0.035, 0, "sine"),
    ],
    "ecg-start": [
      tone(620, 620, 0.12, 0.065, 0, "sine"),
      tone(880, 880, 0.18, 0.065, 0.16, "sine"),
    ],
    "ecg-window": [
      tone(1400, 1400, 0.15, 0.06, 0, "sine"),
    ],
    "excuse-start": [
      tone(620, 880, 0.10, 0.07, 0, "triangle"),
      tone(880, 1100, 0.13, 0.065, 0.10, "triangle"),
    ],
    "excuse-urgent": [
      tone(720, 580, 0.09, 0.085, 0, "square"),
      tone(720, 580, 0.09, 0.085, 0.14, "square"),
    ],
    "prison-lock": [
      noise(1200, 400, 0.26, 0.12, 0, "bandpass"),
      tone(220, 100, 0.45, 0.08, 0, "triangle"),
      noise(2600, 700, 0.23, 0.10, 0.35, "bandpass"),
      tone(360, 180, 0.38, 0.055, 0.38, "triangle"),
    ],
    "train-shadow": [
      noise(1700, 350, 0.65, 0.09, 0, "lowpass", 0.07),
      tone(260, 100, 0.60, 0.045, 0, "sine", 0.08),
    ],
    "train-fade": [
      noise(650, 120, 1.2, 0.08, 0, "lowpass", 0.08),
      tone(135, 55, 1.15, 0.055, 0, "triangle", 0.05),
    ],
    "concealed-wolf": [
      tone(180, 280, 0.70, 0.055, 0, "sine", 0.12),
      tone(280, 160, 0.85, 0.055, 0.70, "sine", 0.08),
      tone(360, 560, 0.65, 0.018, 0.03, "triangle", 0.12),
      tone(560, 320, 0.80, 0.018, 0.72, "triangle", 0.08),
      noise(500, 300, 1.45, 0.025, 0.05, "lowpass", 0.15),
    ],
  };
  // 各音效完整播放期間的 RMS；修改聲音組成後需重新測量。
  const soundRms = {
    "match-ignite": 0.01527,
    "character-lock": 0.01021,
    "confession-door": 0.01047,
    "room-step": 0.00817,
    "briefing-pencil": 0.00317,
    "paper-unfold": 0.00527,
    "tutorial-page": 0.00535,
    "candle-relight": 0.01166,
    "warning-bell": 0.02042,
    "dialogue-priest": 0.00923,
    "dialogue-player": 0.01016,
    "options-reveal": 0.01019,
    "answer-confirm": 0.01806,
    "candle-out": 0.00861,
    "ecg-start": 0.01264,
    "ecg-window": 0.01249,
    "excuse-start": 0.01152,
    "excuse-urgent": 0.01882,
    "prison-lock": 0.01256,
    "train-shadow": 0.01158,
    "train-fade": 0.01001,
    "concealed-wolf": 0.01357,
  };
  const noiseBuffers = new WeakMap();

  function getNoiseBuffer(context) {
    if (!noiseBuffers.has(context)) {
      const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.random() * 2 - 1;
      }
      noiseBuffers.set(context, buffer);
    }
    return noiseBuffers.get(context);
  }

  function playPart(context, part, start, volume) {
    const source = part.kind === "tone"
      ? context.createOscillator()
      : context.createBufferSource();
    const level = context.createGain();
    const end = start + part.duration;
    level.gain.setValueAtTime(0.0001, start);
    level.gain.linearRampToValueAtTime(part.gain * volume, start + part.attack);
    level.gain.exponentialRampToValueAtTime(0.0001, end);

    if (part.kind === "tone") {
      source.type = part.wave;
      source.frequency.setValueAtTime(part.frequency, start);
      source.frequency.exponentialRampToValueAtTime(part.endFrequency, end);
      source.connect(level);
    } else {
      source.buffer = getNoiseBuffer(context);
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = part.filter;
      filter.frequency.setValueAtTime(part.frequency, start);
      filter.frequency.exponentialRampToValueAtTime(part.endFrequency, end);
      source.connect(filter);
      filter.connect(level);
    }

    level.connect(gameAudio.output);
    source.start(start);
    source.stop(end);
  }

  async function play(name, volume = 1) {
    const context = gameAudio.context;
    if (!context) return;

    const requestedAt = performance.now();
    try {
      if (!Object.prototype.hasOwnProperty.call(sounds, name)) {
        throw new Error("未知音效：" + name);
      }
      if (!Number.isFinite(soundRms[name]) || soundRms[name] <= 0) {
        throw new Error("缺少音效響度資料：" + name);
      }
      if (!Number.isFinite(volume) || volume < 0) {
        throw new RangeError("音效音量必須是非負數");
      }
      if (volume === 0) return;
      if (context.state === "suspended") await context.resume();
      if (context !== gameAudio.context || context.state !== "running") return;
      if (performance.now() - requestedAt > 220) return;

      const start = context.currentTime;
      const normalizedVolume = volume * sfxTargetRms / soundRms[name];
      sounds[name].forEach((part) => playPart(context, part, start + part.delay, normalizedVolume));
    } catch (error) {
      console.warn("無法播放音效", name, error);
    }
  }

  return { play };
})();

function createTypewriter(defaultSpeed, punctuationPause) {
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
    if (targetEl) targetEl.classList.remove("is-typing");
  }

  function finishImmediately() {
    if (!isTyping) return false;
    stop();
    if (targetEl) {
      targetEl.textContent = fullText;
      if (onUpdateCallback) onUpdateCallback();
    }
    const callback = onDoneCallback;
    onDoneCallback = null;
    if (typeof callback === "function") callback();
    return true;
  }

  function start(el, text, speed = defaultSpeed, onDone = null, withSound = true, onUpdate = null) {
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
    let index = 0;

    function step() {
      if (!isTyping) return;
      if (index >= chars.length) {
        stop();
        const callback = onDoneCallback;
        onDoneCallback = null;
        if (typeof callback === "function") callback();
        return;
      }

      const character = chars[index++];
      el.textContent += character;
      if (onUpdateCallback) onUpdateCallback();
      if (withSound) playTypingSound(character, index);
      const pause = "，。！？…、".includes(character) ? punctuationPause : 0;
      timerId = setTimeout(step, speed + pause);
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
}

function createCandleController(container, total, interval) {
  let timers = [];

  function clearTimers() {
    timers.forEach((id) => clearTimeout(id));
    timers = [];
  }

  function reset() {
    clearTimers();
    if (!container) return;
    container.querySelectorAll(".candle-flame-slot").forEach((slot) => {
      slot.classList.remove("is-extinguished");
    });
  }

  function extinguish(count, immediate = false) {
    clearTimers();
    if (!container) return;
    const clampedCount = Math.min(total, Math.max(0, count));
    for (let i = 0; i < clampedCount; i += 1) {
      const targetIndex = total - 1 - i;
      const slot = container.querySelector(
        `.candle-flame-slot[data-candle-index="${targetIndex}"]`,
      );
      if (slot && !slot.classList.contains("is-extinguished")) {
        if (immediate) {
          slot.classList.add("is-extinguished");
          continue;
        }
        timers.push(setTimeout(() => {
          slot.classList.add("is-extinguished");
          gameSfx.play("candle-out");
        }, i * interval));
      }
    }
  }

  return { reset, extinguish };
}

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

  const storyIntroScene = document.getElementById("storyIntroScene");
  const storyIntroContent = document.getElementById("storyIntroContent");
  const storyIntroText = document.getElementById("storyIntroText");
  const storyIntroTemplate = storyIntroText.cloneNode(true);
  const storyIntroTextNodes = document.createTreeWalker(storyIntroTemplate, NodeFilter.SHOW_TEXT);
  while (storyIntroTextNodes.nextNode()) {
    const node = storyIntroTextNodes.currentNode;
    node.textContent = node.textContent.replace(/\r?\n\s*/g, "");
  }

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
  let isTypingStory = false;
  let storyTimer = null;

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
      playTypingSound(currentSpan.textContent, idx);

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
    clearTimeout(storyTimer);
    storyTimer = null;
    isTypingStory = false;
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

    storyIntroScene.classList.remove("is-active");
    storyIntroText.textContent = "";
    storyIntroContent.scrollTop = 0;

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
    gameSfx.play("match-ignite");
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
    gameSfx.play("character-lock");

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

  function finishStoryIntro() {
    clearTimeout(storyTimer);
    storyTimer = null;
    isTypingStory = false;
    storyIntroText.replaceChildren(
      ...Array.from(storyIntroTemplate.childNodes, (node) => node.cloneNode(true)),
    );
  }

  function* storyIntroCharacters(source, target) {
    for (const node of source.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        for (const character of Array.from(node.textContent)) {
          yield { character, target };
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node.cloneNode(false);
        target.appendChild(element);
        yield* storyIntroCharacters(node, element);
      }
    }
  }

  function startStoryIntro() {
    storyIntroScene.classList.add("is-active");
    storyIntroText.textContent = "";
    storyIntroContent.scrollTop = 0;
    isTypingStory = true;

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishStoryIntro();
      return;
    }

    const characters = storyIntroCharacters(storyIntroTemplate, storyIntroText);
    const characterDelay = 150;
    const inkDuration = 500;
    let index = 0;
    function typeNextCharacter() {
      if (!isTypingStory) return;
      const atBottom = storyIntroContent.scrollTop + storyIntroContent.clientHeight >=
        storyIntroContent.scrollHeight - 2;
      const next = characters.next();
      if (next.done) {
        storyTimer = setTimeout(finishStoryIntro, inkDuration - characterDelay);
        return;
      }
      const { character, target } = next.value;
      if (/\s/.test(character)) {
        target.appendChild(document.createTextNode(character));
      } else {
        const stroke = document.createElement("span");
        stroke.className = "story-intro-char";
        stroke.textContent = character;
        target.appendChild(stroke);
      }
      index += 1;
      if (character.trim() && index % 2 === 1) {
        gameSfx.play("briefing-pencil");
      }
      if (atBottom) storyIntroContent.scrollTop = storyIntroContent.scrollHeight;
      storyTimer = setTimeout(typeNextCharacter, characterDelay);
    }
    typeNextCharacter();
  }

  function enterBriefingPage() {
    if (!storyIntroScene.classList.contains("is-active") || isTypingStory) return;
    storyIntroScene.classList.remove("is-active");
    timers.push(setTimeout(() => {
      if (confessionRoomScene) {
        syncSceneGender(confessionRoomScene);
        confessionRoomScene.classList.add("is-active");

        if (memoParallaxInstance) {
          memoParallaxInstance.enable();
          memoParallaxInstance.updateDimensions();
        }

        startBriefingTypewriter();
      }
    }, 450));
  }

  // 第三頁：開始告解，切到故事背景頁
  function enterConfessionRoom() {
    if (isStartingConfession) return;
    if (!nextScene || !nextScene.classList.contains("is-active")) return;

    isStartingConfession = true;

    if (startConfessionBtn) {
      startConfessionBtn.classList.add("is-clicked");
      gameSfx.play("confession-door");
    }

    timers.push(
      setTimeout(() => {
        nextScene.classList.remove("is-active");

        timers.push(
          setTimeout(startStoryIntro, 450),
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
    gameSfx.play("character-lock");
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
          gameSfx.play("warning-bell");
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

  function advanceStoryIntro() {
    if (!storyIntroScene.classList.contains("is-active")) return;
    if (isTypingStory) {
      finishStoryIntro();
    } else {
      enterBriefingPage();
    }
  }

  storyIntroScene.addEventListener("click", (e) => {
    if (e.button === 0) advanceStoryIntro();
  });

  storyIntroContent.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.repeat) return;
    e.preventDefault();
    advanceStoryIntro();
  });

  // 打字過程中點擊右側文字區塊可立即顯示完整句子與 next 按鈕
  if (briefingPanel) {
    briefingPanel.addEventListener("click", (e) => {
      if (isTypingBriefing && !isBriefingDone) {
        e.stopPropagation();
        finishBriefingTypewriter();
        gameSfx.play("paper-unfold");
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
  function bindTutorialScene(scene, prompt, advance) {
    if (!scene) return;
    scene.addEventListener("click", (e) => {
      if (e.button !== 0 || !scene.classList.contains("is-active")) return;
      if (!scene.classList.contains("is-revealed")) {
        scene.classList.add("is-revealed");
      } else if (prompt && prompt.contains(e.target)) {
        gameSfx.play("tutorial-page");
        advance();
      }
    });
  }

  bindTutorialScene(howToPlayScene, howtoStartPrompt, enterSpecialHowToPage);
  bindTutorialScene(specialHowToScene, specialHowtoPrompt, enterWarningPage);

  // 第六頁：點擊「開始遊戲」按鈕進入正式告解對話
  if (startGameBtn) {
    startGameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startGameBtn.classList.add("is-pressed");
      gameSfx.play("character-lock");
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

  function bindIntroAdvance(scene, hint, eventName) {
    scene.addEventListener("click", (event) => {
      if (hint.classList.contains("is-visible") && !hint.contains(event.target)) return;
      window.dispatchEvent(new Event(eventName));
    });
  }

  bindIntroAdvance(rhythmIntroScene, rhythmIntroHint, "advanceRhythmIntroDialogue");
  bindIntroAdvance(excuseIntroScene, excuseIntroHint, "advanceExcuseIntroDialogue");

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

  function syncQuestionDialogueBounds() {
    const stageBounds = questionStage.getBoundingClientRect();
    const choiceBounds = questionChoicePanel.getBoundingClientRect();
    questionDialogues.style.bottom = `${stageBounds.bottom - choiceBounds.top}px`;
  }

  window.addEventListener("resize", syncQuestionDialogueBounds);

  // 題目流程：保存題目索引、對話進度、答案、扣分與防重複點擊狀態。

  // 目前題目索引，0 代表第一題
  let questionIndex = 0;
  let questionDialogueIndex = 0;
  let questionPhase = "prompt";
  let questionFeedback = [];
  let questionTyping = false;

  // 防止玩家連續點擊造成重複選擇
  let questionLocked = false;

  // 儲存對話動畫的計時器
  let questionTimers = [];
  const QUESTION_CANDLE_EXTINGUISH_MS = 350;

  // 記錄玩家選擇的答案
  // 0 = 第一個選項
  // 1 = 第二個選項
  // 2 = 第三個選項
  // 3 = 第四個選項
  const questionAnswers = [];
  let extinguishedCandleCount = 0;
  let hasTriggeredRhythmEvent = false;
  let hasTriggeredExcuseEvent = false;

  // safeChoiceIndex 為唯一不扣分的選項（從 0 開始）；choiceKeywords 可指定填入空格的文字。
  // choiceHints 依選項順序填寫；空字串不顯示提示。
  // 答案、新增題目、獨白與答題後文案皆為暫定內容。

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
          side: "left",
          text: "不必拘謹，若不知從何說起，便談談近日發生的事吧。",
        },
        {
          side: "right",
          text: "請原諒我的生疏，這是我第一次來此傾訴。",
        },
         {
          side: "right",
          text: "昨日，我赴了奈克的邀約。",
        },
        {
          side:"right",
          text:"我們約在鎮中央見面，打算邊吃邊談些買賣。"

        },
        {
          side: "left",
          text: "那是甚麼時候的事呢？",
        },
        {
          side: "right",
          type: "thought",
          text: "「昨晚六點，我確實與奈克見過面」",
        },
        {
          side: "right",
          type: "thought",
          text: "「不過，還是別讓神父太清楚我的行程」",
        },
        {
          side: "right",
          text: "我們在＿＿＿＿時，於鎮中央見面。",
        },
      ],

      choices: ["我記得是18:00", "大約是18:00", "18:00左右吧", "應該是18:00"],
      choiceHints: ["奈克那時已經到了", "湯姆那時似乎還在店裡", "得趕在打烊前完成交易", "我沒有特別留意鐘聲"],
      choiceKeywords: ["18:00", "18:00", "18:00", "18:00"],
      safeChoiceIndex: 3,
      feedback: {
        safe: [{ side: "left", text: "傍晚時分啊，街上應該還有不少行人。" },
          { side: "right", text: "是的，還有些店尚未關門呢。" }
        ],
        penalty: [{ side: "left", text: "你似乎記得相當清楚。" },
          { side: "right", text: "畢竟是事先約好的事情。"}],
        common: [{ side: "right", text: "如今鎮上人人自危，誰都不願成為下一個目標。" },
          { side: "left", text: "畢竟接連發生了數起命案。"},
          { side: "right", text: "是啊。"},
          { side: "right", text: "不過，那些死者似乎都不是甚麼值得同情的人。"},
          { side: "left", text: "死亡不應該成為衡量一個人是否值得同情的標準"},
          { side: "right", text: "您說的對。"}
        ],
      },
    },

    //  第二題
    {
      dialogues: [
        {
          side: "left",
          text: "那麼，就說說你的生意吧。",
        },
        {
          side: "right",
          text: "您也對這些感興趣嗎？",
        },
         {
          side: "right",
          text: "好的，不過請先容我說完這部分。",
        },
        {
          side: "right",
          text: "我跟奈克相談甚歡，後來便去了酒吧",
        },
        {
          side: "right",
          text: "也許是因為命案的緣故，店裡實在冷清的很。",
        },
        {
          side: "left",
          text: "你們在哪裡談生意呢？",
        },
        {
          side: "right",
          type: "thought",
          text: "「那個位置……很適合觀察店裡人們的舉動」",
        },
         {
          side: "right",
          type: "thought",
          text: "「沒必要告訴神父這些」",
        },
        {
          side: "right",
          text: "我們在酒吧的＿＿＿＿，談了一些買賣。",
        },
      ],

      choices: ["吧檯旁", "包廂裡", "靠窗位置", "後門附近"],
      choiceHints: ["能看見酒保工作", "靠近酒窖入口", "適合欣賞窗外景色", "方便觀察出入的人"],
      choiceKeywords: ["吧檯旁", "包廂裡", "靠窗位置", "後門附近"],
      safeChoiceIndex: 2,
      feedback: {
        safe: [{ side: "left", text: "靠窗的位置——那裡確實適合談話。" },
          { side: "right", text: "是的，景色也不錯。" }
        ],
        penalty: [{ side: "left", text: "你似乎很在意酒吧內的動靜。" },
          { side: "right", text: "那只是隨意挑選的位置。"}
        ],
        common: [{ side: "left", text: "看來你們談得相當愉快。" },
        { side: "right", text: "是的，我很滿意這筆交易。" },
        { side: "left", text: "最近鎮上加強了管制，許多東西已經不容易買到。" },
         { side: "right", text: " 看來您也很了解鎮上的情況。" },
      ],
      },
    },

    //  第三題
    {
      dialogues: [
        {
          side: "left",
          text: "你買了甚麼呢？",
        },
         {
          side: "right",
          text: "不是些太貴重的東西。",
        },
        {
          side: "right",
          text: "我主要向他購買了日常用品。",
        },
        {
          side: "right",
          text: "另外、他也說有一些工具可以送給我。",
        },
        {
          side: "left",
          text: "例如呢？",
        },
        {
          side: "right",
          type: "thought",
          text: "「奈克賣給我的那把斧頭，確實十分趁手」",
        },
         {
          side: "right",
          type: "thought",
          text: "「只是它的用途……最好永遠別讓其他人知道」",
        },
        {
          side: "right",
          text: "比如說，他很慷慨地將他用不到的＿＿＿＿給了我。"
        },
      ],

      choices: ["重量適中的斧頭", "有些鈍的舊斧頭", "重新磨過的斧頭", "小巧的手斧"],
      choiceHints: ["便於揮砍", "用來整理庭院", "刃口十分鋒利", "適合在狹窄空間使用"],
      choiceKeywords: ["斧頭", "斧頭", "斧頭", "斧頭"],
      safeChoiceIndex: 1,
      feedback: {
        safe: [{ side: "left", text: "只是日常用的器具嗎？" },
          { side: "right", text: "是的，我的庭院已經許久沒有打理。" }
        ],
        penalty: [{ side: "left", text: "那不像是隨手會買的東西。" },
          { side: "right", text: "最近鎮上不太平，總得有些防身的東西。" }
        ],
        common: [{ side: "right", text: "我想，我應該說明得更仔細一些。" },
          { side: "right", text: "畢竟您似乎不太滿意我的回答。" },
          { side: "left", text: "我只是在想，現在的鎮民究竟有多麼不安。" },
          { side: "left", text: "但願長夜能庇護所有無辜之人。" },
          { side: "right", text: "……無辜之人。" },
          { side: "right", text: "…真是個有趣的說法。" },
        ],
      },
    },

    //  第四題
    {
      dialogues: [
        {
          side: "left",
          text: " 那麼，除了奈克，你還與其他人交談過嗎？",
        },
        {
          side: "right",
          text: "……神父，您這是在懷疑我嗎？",
        },
          {
          side: "left",
          text: "並非如此。",
        },
        {
          side: "right",
          text: "……罷了，我會回答您的。",
        },
        {
          side: "right",
          text: " 昨晚奈克離開後，店裡還剩下一些人。",
        },
        {
          side: "right",
          type: "thought",
          text: "「酒保……那個滿口謊言的傢伙」",
        },
         {
          side: "right",
          type: "thought",
          text: "「昨夜還向我炫耀那些見不得光的勾當」",
        },
        {
          side: "right",
          text: "我記得，我還曾與酒吧內的＿＿＿＿交談過幾句。",
        },
      ],

      choices: ["學徒", "酒保", "旅客", "侍者"],
      choiceHints: ["(似乎正準備離開)", "(正在吧檯整理帳目)", "(知道昨夜的巡邏路線)", "(曾提起酒窖的後門)"],
      choiceKeywords: ["學徒", "酒保", "旅客", "侍者"],
      safeChoiceIndex: 0,
      feedback: {
        safe: [{ side: "left", text: "看來只是些閒談。" },
          { side: "right", text: "確實沒什麼值得在意的。" }
        ],
        penalty: [{ side: "left", text: " 你似乎對湯姆相當熟悉。" },
          { side: "right", text: "不過是偶爾聽他說些閒話罷了。" }
        ],
        common: [{ side: "left", text: " 說到酒吧，酒保湯姆昨夜失蹤了。" },
         { side: "right", text: "……失蹤？" },
         { side: "left", text: " 你認識他嗎？" },
         { side: "right", text: " 見過幾面，談不上熟悉。" },
         { side: "left", text: " 他曾來教堂祈禱。" },
        { side: "right", text: "  是嗎？ 看來他也有想要尋求寬恕的事情。" },
      ],
      },
    },

    //  第五題
    {
      dialogues: [
        {
          side: "left",
          text: " 我聽說，警方正在調查昨晚出入酒吧的客人。",
        },
        {
          side: "right",
          text: " ……神父，您這是在警告我嗎？",
        },
        {
          side: "left",
          text: "只是希望你能小心。",
        },
        {
          side: "right",
          text: "感謝您的關心。",
        },
        {
          side: "left",
          text: "那麼，你離開酒吧後去了哪裡？",
        },
        {
          side: "right",
          type: "thought",
          text: "「昨晚的事情，現在回想起來還真有些混亂」",
        },
        {
          side: "right",
          type: "thought",
          text: "「離開後直接回家，是最不容易惹人懷疑的說法」",
        },
        {
          side: "right",
          text: "我之後去了＿＿＿＿。",
        },
      ],

      choices: ["酒吧後的巷弄", "酒窖附近", "僻靜的街道", "自己的住處"],
      choiceHints: ["稍微停留了一會兒", "有些事情尚未完成", "", "之後便休息了"],
      choiceKeywords: ["巷弄", "酒窖", "街道", "住處"],
      safeChoiceIndex: 3,
      feedback: {
        safe: [{ side: "left", text: "想必昨晚也讓你疲憊不堪。" },
          { side: "right", text: "是啊，回去之後便早早休息了。" }
        ],
        penalty: [{ side: "left", text: "那附近正是警方調查的範圍。" },
          { side: "right", text: "是嗎？我並不清楚。" }
        ],
        common: [{ side: "right", text: "神父，您似乎仍有疑慮。" },
          { side: "left", text: "你不覺得，這些命案實在太過巧合了嗎？" },
          { side: "right", text: "巧合？" },
          { side: "left", text: "那些死者，都曾涉及一些不光彩的事情。" },
          { side: "right", text: "似乎是這樣沒錯。" },
          { side: "left", text: "你似乎並不驚訝。" },
           { side: "right", text: "小鎮的傳聞總是這樣的，一傳十、十傳百，很快的，大家都知道了。" },
        ],
      },
    },

    // 第六至第九題的題目、答案與文案可依最終劇情調整。
    //第六題
    {
      dialogues: [
        { 
          side: "right",
          text: "說起湯姆，鎮上一直流傳著一些關於他的傳聞。" 
        },
        { 
          side: "right",
          text: "有人說，他曾替某些有權勢的人做事。"
        },
        { 
          side: "right",
          text: "這倒不令人意外。"
        },
        { 
          side: "left",
          text: "你似乎知道些什麼？"
        },
        { 
          side: "right", 
          text: "我聽到了一些流言。"
        },
        { 
          side: "right",
          type: "thought", 
         text: "「湯姆知道得太多，也因此得意忘形」" 
        },
        { 
          side: "right",
          type: "thought", 
         text: "「他以為那些秘密能保護自己……真是愚蠢」" 
        },
        { side: "right", 
          text: "我聽說，他曾向別人提起＿＿＿＿。" },
      ],

      choices: ["私人帳本", "私人信件", "交易紀錄", "舊文件"],
      choiceHints: ["資金流通不明", "與鎮上權貴往來", "尚未結清的酒吧進貨單", "鎮上權貴簽署，早該焚燒銷毀"],
      safeChoiceIndex: 2,
      feedback: {
        safe: [{ side: "left", text: "看起來只是一些生意上的煩惱。"},
         { side: "right", text: "畢竟最近鎮上不太平，難免讓人多想。" }
        ],
        penalty: [{ side: "left", text: "這些聽起來，似乎不是應該聲張的東西" },
         { side: "right", text: "都是些聽來的、空穴來風的傳聞。" }
        ],
        common: [{ side: "left", text: "流言終究只是流言。" },
          { side: "right", text: "是啊。" },
          { side: "right", text: "不過，倘若那些事情都是真的呢？" },
          { side: "left", text: "即便如此，也應交由法律裁決。" },
          { side: "right", text: "法律———真是個方便的詞。" }
        ],
      },
    },

    //第七題
    {
      dialogues: [
        {
           side: "left",
            text: "今早警方在酒窖發現了湯姆的屍體。" 
          },
        { 
          side: "right",
           text: "我感到很遺憾，但這真是令人不安。"
           },
        { 
          side: "left",
           text: "有人說，昨夜曾看見一名陌生人進出酒窖。"
           },
        { 
          side: "right",
          text: "但酒吧裡本來就有不少陌生客人。"
        },
        { 
          side: "left",
          text: "你昨夜是否也曾靠近那裡？"
        },
        { 
          side: "right",
          text: "只是經過。"
        },
        { 
          side: "left",
          text: "那你有注意到什麼異常嗎？"
        },
        { 
          side: "right",
          type: "thought",
          text: "「那個酒窖……現在想來，還真是個令人難忘的地方」"
        },
        { 
          side: "right",
          text: " 異常的話，我倒是記得＿＿＿＿。"
        },
      ],
      choices: ["特別陰冷潮濕", "酒桶似乎被移動過", "幾塊地磚顏色特別白", "深處似乎有摩擦聲"],
      choiceHints: ["", "", "", ""],
      safeChoiceIndex: 0,
      feedback: {
        safe: [{ side: "left", text: "那地方向來陰冷。" },
          { side: "right", text: "那就沒什麼特別的了。" }
        ],
        penalty: [{ side: "left", text: "你連這些細節都注意到了？" },
          { side: "right", text: "也許是因為與平常不同，才偶然留下了些印象。" }
        ],
        common: [{ side: "right", text: "您似乎對這件事特別在意。" },
          { side: "left", text: "畢竟一條生命就這麼消逝了。" },
          { side: "right", text: "生命…… 您認為所有人的生命，都具有相同的價值嗎？" },
          { side: "left", text: "在長夜面前，所有人都應得到公平的審視。" },
          { side: "right", text: " ……即使那個人曾經犯下罪行？" },
          { side: "left", text: " 是的。" },
        ],
      },
    },

     //第八題
    {    
      dialogues: [
        {
           side: "right", 
           text: " 神父，容我問您一個問題。"
        },
        { 
          side: "left",
          text: " 請說。" 
        },
        { 
          side: "right",
          text: " 如果有人犯下不可饒恕的罪行，卻因為金錢與權勢而逃過審判……。"
        },
        { 
          side: "right",
          text: " 您認為，長夜仍會寬恕他嗎？" 
        },
        { 
          side: "left",
          text: " 寬恕並不代表罪行不曾發生。"
        },
        { 
          side: "right", 
          text: " 多麼美妙的回答。"
        },
        { 
          side: "right", 
          text: " 那麼，如果是一位神職者呢？" 
        },
        { 
          side: "right",
          type: "thought",
          text: "「幾年前的那件事……您真的已經忘記了嗎？」"
        },
        { 
          side: "right", 
          text: "如果一位神職者選擇＿＿＿＿，您認為長夜會原諒他嗎？"
        },
      ],
      choices: ["保持緘默", "保持憐憫", "接受捐贈", "並未公正"],
      choiceHints: ["在應該發聲時辜負信眾", "對一位曾犯下過錯的人", "接受捐贈，並替他保管「舊物」", "在審判中，聽信有聲望的人"],
      safeChoiceIndex: 1,
      feedback: {
        safe: [{ side: "left", text: "沉默有時是慈悲，有時是逃避。" },
          { side: "right", text: " 那麼，該如何分辨呢？" },
          { side: "left", text: "或許只有當事人自己知道。" }
        ],
        penalty: [{ side: "left", text: "……你為何會想到這樣的事情？" },
          { side: "right", text: " 只是些突發奇想的假設" },
          { side: "left", text: "有些假設，未免太過具體。" },
        ],
        common: [{ side: "left", text: "為何突然問起這些？" },
         { side: "right", text: "只是好奇長夜眼中的我們。" },
         { side: "right", text: "畢竟神職者也是人，不是嗎？" },
         { side: "left", text: "當然是的。" },
         { side: "right", text: "既然如此，自然也可能犯錯。" },
         { side: "left", text: "你似乎對某件事情耿耿於懷。" },
         { side: "right", text: "或許吧。" },
         { side: "right", text: "畢竟有些事情，是連時間也無法抹去傷痕的。" },
        ],
      },
    },

    //第九題
    {
      dialogues: [
        { 
          side: "left",
          text: " 你似乎對法律抱有很深的不滿。" 
        },
        { 
          side: "right",
          text: " 不滿？"
        },
        { 
          side: "right",
          text: " 我只是認為，有些罪人實在太過幸運。" 
        },
        { 
          side: "right",
          text: " 他們犯下罪行，卻依然能過著安穩的生活。" 
        },
        { 
          side: "left",
           text: " 法律並不完美，但任何人都不應擅自取代審判。"
        },
        { 
          side: "right", 
          text: " 真是高尚的想法。"
        },
        { 
          side: "left", 
          text: " 那麼，你認為那些逃過制裁的人應該如何？" 
        },
        { 
          side: "right",
          type: "thought",
          text: "「「那些傢伙……沒有一個是無辜的」」"
        },
        { side: "right", 
          type: "thought",
         text: "法律既然無法制裁他們，自然得由其他人動手」" },
        { 
          side: "right",
         text: "我認為，他們應當＿＿＿＿。" },
      ],
      choices: ["受到同等的懲罰", "受知曉的人制裁", "重新接受調查", "由受害者決定"],
      choiceHints: ["", "由知曉內情的人親自給予", "並未自己的行為承擔責任", "由受害者決定他們應當付的代價"],
      safeChoiceIndex: 2,
      feedback: {
        safe: [{ side: "left", text: "所謂真相應當經過查證。" },
          { side: "right", text: "我明白，任何人都可能被誤解。" }
        ],
        penalty: [{ side: "left", text: "你似乎認為，只要罪行成立，便可以不計手段地施加懲罰。" },
          { side: "right", text: "我只是覺得，犯錯的人不應輕易逃脫。" }
        ],
        common: [{ side: "left", text: " 你究竟是來尋求寬恕，還是想向我證明什麼？" },
          { side: "right", text: "您想得太多了。" },
          { side: "right", text: "我不過是個普通的告解者。" }],
      },
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
    gameSfx.play("options-reveal");
    questionButtons.forEach((button) => {
      button.disabled = button.hidden;
    });
  }

  function typeQuestionFillIn(textElement, text, bubble, onComplete) {
    const characters = Array.from(text);
    let index = 0;
    bubble.classList.add("is-typing");
    bubble.setAttribute("aria-live", "off");

    const finish = () => {
      bubble.classList.remove("is-typing");
      bubble.setAttribute("aria-live", "polite");
      onComplete();
    };

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      textElement.textContent = text;
      finish();
      return;
    }

    const typeNextCharacter = () => {
      textElement.textContent += characters[index];
      index += 1;
      questionDialogues.scrollTop = questionDialogues.scrollHeight;

      if (index === characters.length) {
        finish();
        return;
      }

      questionTimers.push(setTimeout(typeNextCharacter, 38));
    };

    typeNextCharacter();
  }

  function showNextQuestionDialogue() {
    const dialogues = questionPhase === "prompt"
      ? questionData[questionIndex].dialogues
      : questionFeedback;
    const dialogue = dialogues[questionDialogueIndex];
    if (!dialogue) return;

    questionDialogueIndex++;
    const isLastDialogue = questionDialogueIndex === dialogues.length;

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
    if (dialogue.type === "thought") {
      bubble.classList.add("is-thought");
    }
    const isFillIn = /[＿_]{2,}/.test(dialogue.text);
    let fillInText = null;
    if (isFillIn) {
      bubble.classList.add("is-fill-in");
      fillInText = document.createElement("span");
      fillInText.className = "question-bubble-text";
      bubble.appendChild(fillInText);
    } else {
      bubble.textContent = dialogue.text;
    }

    questionDialogues.appendChild(bubble);
    gameSfx.play(isRightSpeaking ? "dialogue-player" : "dialogue-priest");
    questionDialogues.scrollTop = questionDialogues.scrollHeight;

    if (isFillIn) {
      questionTyping = true;
      typeQuestionFillIn(fillInText, dialogue.text, bubble, () => {
        questionTyping = false;
        if (questionPhase === "prompt" && isLastDialogue) showQuestionChoices();
      });
    } else if (questionPhase === "prompt" && isLastDialogue) {
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
    questionPhase = "prompt";
    questionFeedback = [];
    questionTyping = false;
    questionScene.classList.remove("is-answering");

    // 清空上一題的 NPC 對話
    questionDialogues.replaceChildren();

    // 先隱藏選項
    questionChoicePanel.classList.remove("is-ready");

    // 更新四個選項按鈕
    questionButtons.forEach((button, index) => {
      // 更換按鈕文字
      button.querySelector(".question-choice-text").textContent = data.choices[index] || "";
      const hint = data.choiceHints?.[index] || "";
      const hintElement = button.querySelector(".question-choice-hint");
      hintElement.textContent = hint;
      hintElement.hidden = !hint.trim();

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

  // 從警告頁初始化並進入題目互動。
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
    questionScene.classList.remove("is-complete");
    questionScene.classList.add("is-active", "is-entering");
    syncSceneGender(rhythmScene);

    // 從第一題開始
    questionIndex = 0;
    hasTriggeredRhythmEvent = false;
    hasTriggeredExcuseEvent = false;

    // 清空上一次的答案
    questionAnswers.length = 0;
    resetQuestionScore();

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
    gameSfx.play("room-step");
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
  function finishQuestionnaire() {
    clearQuestionTimers();
    questionLocked = true;
    questionScene.classList.remove("is-answering");
    questionScene.classList.add("is-complete");
    questionChoicePanel.classList.remove("is-ready");
    questionDialogues.replaceChildren();
    window.dispatchEvent(
      new CustomEvent("questionnaireCompleted", {
        detail: {
          remainingCandles: scoreboardFlames.length - extinguishedCandleCount,
          gender: selectedGender === "female" ? "female" : "male",
        },
      }),
    );
    console.log("題目選擇紀錄：", questionAnswers);
  }

  function continueQuestionnaire() {
    if (extinguishedCandleCount >= scoreboardFlames.length) {
      finishQuestionnaire();
    } else if (questionIndex < questionData.length) {
      renderQuestion();
    } else {
      finishQuestionnaire();
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
    if (extinguishedCandleCount >= scoreboardFlames.length) {
      finishQuestionnaire();
      return;
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

  function playQuestionConfirmSound() {
    if (!gameAudio.context) return 0;
    gameSfx.play("answer-confirm");
    return 325;
  }

  function chooseQuestion(index) {
    // 防止重複點擊
    if (questionLocked || questionButtons[index].disabled) {
      return;
    }

    // 鎖定目前題目
    questionLocked = true;
    const soundDuration = playQuestionConfirmSound();

    const data = questionData[questionIndex];
    const isPenaltyChoice = index !== data.safeChoiceIndex;
    const fillInTexts = questionDialogues.querySelectorAll(
      ".question-bubble.is-fill-in .question-bubble-text",
    );
    const fillInText = fillInTexts[fillInTexts.length - 1];
    if (fillInText) {
      const keyword = data.choiceKeywords
        ? data.choiceKeywords[index]
        : data.choices[index];
      const text = fillInText.textContent;
      const blank = /[＿_]{2,}/.exec(text);
      if (blank) {
        const keywordElement = document.createElement("span");
        keywordElement.textContent = keyword;
        if (isPenaltyChoice) keywordElement.classList.add("is-incorrect");
        fillInText.replaceChildren(
          text.slice(0, blank.index),
          keywordElement,
          text.slice(blank.index + blank[0].length),
        );
      }
      questionDialogues.scrollTop = questionDialogues.scrollHeight;
    }
    questionFeedback = [
      ...(isPenaltyChoice ? data.feedback.penalty : data.feedback.safe),
      ...data.feedback.common,
    ];

    // 儲存玩家選擇的答案
    questionAnswers.push(index);

    // 暫時停用所有按鈕
    questionButtons.forEach((button) => {
      button.disabled = true;
    });

    // 被選擇的按鈕變色
    questionButtons[index].classList.add("is-selected");
    questionScene.classList.add("is-answering");

    const closeChoices = () => {
      questionButtons[index].classList.remove("is-selected");
      if (extinguishedCandleCount >= scoreboardFlames.length) {
        finishQuestionnaire();
        return;
      }
      questionChoicePanel.classList.remove("is-ready");
      questionTimers.push(setTimeout(() => {
        questionPhase = "feedback";
        questionDialogueIndex = 0;
        questionScene.classList.remove("is-answering");
        questionLocked = false;
      }, 350));
    };

    if (isPenaltyChoice) {
      questionTimers.push(
        setTimeout(() => {
          extinguishNextCandle();
          gameSfx.play("candle-out");
          questionTimers.push(
            setTimeout(closeChoices, QUESTION_CANDLE_EXTINGUISH_MS),
          );
        }, soundDuration),
      );
    } else {
      questionTimers.push(setTimeout(closeChoices, 450));
    }
  }

  // 題目與對話推進的事件綁定。
  questionButtons.forEach((button, index) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      chooseQuestion(index);
    });
  });

  questionStage.addEventListener("click", () => {
    if (!questionScene.classList.contains("is-active") || questionLocked || questionTyping) {
      return;
    }

    const dialogues = questionPhase === "prompt"
      ? questionData[questionIndex].dialogues
      : questionFeedback;
    if (questionDialogueIndex < dialogues.length) {
      showNextQuestionDialogue();
    } else if (questionPhase === "feedback") {
      questionLocked = true;
      questionIndex++;
      if (!hasTriggeredRhythmEvent && extinguishedCandleCount === 2) {
        hasTriggeredRhythmEvent = true;
        syncSceneGender(rhythmScene);
        rhythmIntroScene.classList.add("is-active");
        window.dispatchEvent(new Event("startRhythmIntroDialogue"));
      } else if (!startExcuseBranchIfReady()) {
        continueQuestionnaire();
      }
    }
  });

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
      rhythmCandlesImg.src = "./images/bg/7candle.PNG";
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

    const scale = normalizedToneScale(gainVal, 0.001, type);
    gain.gain.setValueAtTime(gainVal * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001 * scale, now + duration);

    osc.connect(gain);
    gain.connect(gameAudio.output);
    osc.start(now);
    osc.stop(now + duration);
  }

  const typewriter = createTypewriter(46, 130);

  // =========================================
  // 遊戲數值與流程圖分支設定
  // 過：兩根蠟燭熄滅（7 -> 5 根燃燒）
  // 沒過：三根蠟燭熄滅（7 -> 4 根燃燒）
  // =========================================
  const TOTAL_CANDLES = 7;
  const PASS_EXTINGUISH_COUNT = 2;
  const FAIL_EXTINGUISH_COUNT = 3;
  const HIT_TOLERANCE = 1.2;

  let phase = "inactive";

  const introScript = [
    "看來你對告解確實十分生疏。",
    "不必緊張，長夜會聆聽每一位告解者。",
  ];
  const rhythmIntroDialogueScript = [
    "稍等。",
    "你的呼吸似乎有些急促。",
  ];
  const excuseIntroDialogueScript = rhythmIntroDialogueScript;
  let rhythmIntroDialogueIndex = 0;
  let excuseIntroDialogueIndex = 0;
  let introLineIndex = 0;

  const waves = [
    {
      label: "第 1 階段心律",
      dialogue: "「你的呼吸似乎比剛才急促了些。」",
      zoneStart: 48,
      zoneWidth: 11,
      duration: 1750,
      cueTimes: [0.18, 0.36],
      curve(t) {
        return (0.45 * t + 0.55 * Math.pow(t, 2.2)) * 100;
      },
    },
    {
      label: "第 2 階段心律",
      dialogue: "「……你的眼神為甚麼在閃躲？」",
      zoneStart: 60,
      zoneWidth: 10,
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
      dialogue: "「別急著回答，平復你可疑的心跳，別讓它成為誤判的證據。」",
      zoneStart: 42,
      zoneWidth: 9,
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
      dialogue: "「在長夜面前，你真的沒有隱瞞任何事情嗎？」",
      zoneStart: 66,
      zoneWidth: 8,
      duration: 1480,
      cueTimes: [0.14, 0.28, 0.42],
      curve(t) {
        const jitter = Math.sin(t * Math.PI * 3) * 0.025;
        return Math.min(100, Math.max(0, (t + jitter) * 100));
      },
    },
  ];

  const {
    reset: resetCandles,
    extinguish: extinguishCandlesFromRight,
  } = createCandleController(rhythmCandlesWrap, TOTAL_CANDLES, 220);

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
    if (rhythmTrackArea) rhythmTrackArea.classList.add("is-standby");

    if (index === 0 && rhythmInstructionText) {
      rhythmInstructionText.textContent =
        "請先聆聽神父的對話（按空白鍵繼續）。";
    }

    typewriter.start(rhythmDialogueText, introScript[index], 46, () => {
      if (dialogueNextHint) {
        dialogueNextHint.textContent =
          index < introScript.length - 1
            ? "按空白鍵繼續 ▾"
            : "按空白鍵開始檢定 ▸";
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
      const wasInWindow = rhythmEcg?.classList.contains("is-in-window");
      const inWindow = rhythmEcg?.classList.toggle("is-in-window", isInWindow(percent));
      if (isSweepActive && !wasInWindow && inWindow) {
        gameSfx.play("ecg-window");
      }
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
            "瞞過神父。",
            32,
            () => {
              if (rhythmActionBtn) {
                rhythmActionBtn.textContent = "點擊繼續";
                rhythmActionBtn.dataset.outcome = "success";
                rhythmActionBtn.disabled = false;
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
          "「你的心跳還是沒有平復，既然問心無愧，又為何如此不安？」",
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
                rhythmActionBtn.disabled = false;
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
        gameSfx.play("ecg-start");
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
  window.addEventListener("keydown", (e) => {
    if (!rhythmScene || !rhythmScene.classList.contains("is-active")) return;
    if (e.code !== "Space" || e.repeat) return;

    if (phase === "intro-dialogue") {
      e.preventDefault();
      advanceIntroDialogue();
    } else if (phase === "rhythm") {
      e.preventDefault();
      rhythmController.triggerHit();
    }
  });

  if (rhythmActionBtn) {
    rhythmActionBtn.addEventListener("click", () => {
      if (
        phase !== "outro-dialogue" ||
        rhythmActionBtn.hidden ||
        rhythmActionBtn.disabled
      ) {
        return;
      }
      completeRhythmBranch();
    });
  }

  function completeRhythmBranch() {
    const outcome = rhythmActionBtn?.dataset.outcome;
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
    if (rhythmActionBtn) {
      rhythmActionBtn.hidden = true;
      rhythmActionBtn.disabled = true;
    }
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
  function ensureAudio() {
    gameAudio.resume();
  }

  function playTone(
    freq,
    duration,
    type = "sine",
    gainVal = 0.14,
    endFreqRatio = 0.6,
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

    const scale = normalizedToneScale(gainVal, 0.001, type);
    gain.gain.setValueAtTime(gainVal * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001 * scale, now + duration);

    osc.connect(gain);
    gain.connect(gameAudio.output);
    osc.start(now);
    osc.stop(now + duration);
  }

  const typewriter = createTypewriter(42, 115);

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
  { side: "left", text: "我親愛的教徒，我還有些疑問。" },
  { side: "center", text: "當然，神父，我將知無不言。" }
];
  const originalRounds = [
    {
      word: "killer",
      dialogues: [
        { side: "left", text: "你似乎對鎮上的命案十分感興趣。" },
        { side: "left", text: "又比一般人更加在意死者的過去。" },
        { side: "center", text: "神父，這座鎮上有誰不在談論命案呢？" },
        { side: "center", text: "難道關心這些事情，也是一種罪過？" },
        { side: "left", text: "長夜會希望你沒有隱瞞。" },
      ],
    },
    {
      word: "weapon",
      dialogues: [
        {side: "left",text: "你先前提起的那筆交易，似乎有些可疑。"},
        { side: "left", text: "尤其是你對某些物品的用途，描述得過於詳細。" },
        {side: "center",text: "神父，難道買賣日用品也需要接受審問嗎？"},
        {side: "center",text: "我可不認為自己做了什麼違法的事情。",},
        {side: "left",text: "但願如此。"},
      ],
    },
  ];
  const additionalRounds = [
    {
      word: "corpse",
      dialogues: [
        { side: "left", text: "湯姆的死，似乎與你昨夜的行蹤有些關聯。" },
        { side: "left", text: "你能解釋這些巧合嗎？" },
        { side: "center", text: "我甚至並不清楚案發細節，又該怎麼確認我的行蹤與其有關？" },
        { side: "center", text: "難道您已經認定我是兇手？" },
        { side: "left", text: "希望你真心想得到長夜的寬恕。" },
      ],
    },
    {
      word: "enigma",
      dialogues: [
        {side: "left",text: " 你似乎不只是來告解的。",},
        {side: "left",text: " 你究竟想從我這裡知道什麼？",},
        {side: "center",text: "神父，您想得太多了。",},
        {side: "center",text: "我只是對長夜的教誨有些疑問。",},
        {side: "left",text: " 那麼，希望你尋到答案。",},
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

  const {
    reset: resetCandles,
    extinguish: extinguishCandlesFromRight,
  } = createCandleController(excuseCandlesWrap, TOTAL_CANDLES, 180);

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
      const previousTime = remainingTime;
      remainingTime = Math.max(0, remainingTime - dt);
      updateTimerUI();
      if (previousTime > 1.8 && remainingTime <= 1.8 && remainingTime > 0) {
        gameSfx.play("excuse-urgent");
      }

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
    gameSfx.play("excuse-start");
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
        text: "願你的言辭在長夜面前毫無虛假。",
      });

      if (typingStatusBadge) {
        typingStatusBadge.textContent = "狡辯成功。";
      }
      if (excuseActionBtn) {
        excuseActionBtn.textContent = "繼續告解";
        excuseActionBtn.dataset.success = "true";
        excuseActionBtn.hidden = false;
      }
    } else {
      playTone(96, 0.45, "sawtooth", 0.2, 0.5);
      extinguishCandlesFromRight(FAIL_EXTINGUISH_COUNT);
      showFeedbackBanner("狡辯失敗", false);

      if (excuseScene) {
        excuseScene.classList.add("is-miss-flash");
        transitionTimers.push(
          setTimeout(() => excuseScene.classList.remove("is-miss-flash"), 380),
        );
      }

      appendSpeechBubble({
        side: "left",
        text: "你的解釋無法消除我的疑慮。",
      },
      {
        side: "left",
        text: "我會記住今日你所說的一切。",
      }
    );

      if (typingStatusBadge) {
        typingStatusBadge.textContent = "狡辯失敗。";
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
  const audioSettingsTrigger = document.getElementById('audioSettingsTrigger');
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
      playTypingSound(ch, cursor);
      if (cursor >= chars.length) { finishLine(); return; }
      typingTimer = setTimeout(typeNext, /[，。！？]/u.test(ch) ? 320 : 65);
    }
    function railSound() {
      const audio = gameAudio.context;
      if (!audio || audio.state !== 'running') return;
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
      const underShadow = root.classList.contains('is-passing-shadow');
      const peak = underShadow ? .045 : .09;
      const scale = normalizedToneScale(peak, .001, 'triangle');
      o.type = 'triangle'; o.frequency.setValueAtTime(underShadow ? 65 : 100, t);
      o.frequency.exponentialRampToValueAtTime(35, t + .11);
      g.gain.setValueAtTime(peak * scale, t);
      g.gain.exponentialRampToValueAtTime(.001 * scale, t + .14);
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
      verdictTimer = setTimeout(() => {
        gameSfx.play("prison-lock");
        showVerdict();
      }, reduced.matches ? 0 : 1400);
    }

    function playEscape() {
      const calm = reduced.matches;
      root.classList.add('is-traveling');
      status.textContent = '列車載著你和行李繼續向前。';
      if (!calm) railTimer = setInterval(railSound, 345);

      closeTimer = setTimeout(() => {
        root.classList.add('is-passing-shadow');
        gameSfx.play("train-shadow");

        closeTimer = setTimeout(() => {
          root.classList.replace('is-passing-shadow', 'is-empty');
          status.textContent = '暗影掠過，車廂裡已經沒有人和行李。';

          departTimer = setTimeout(() => {
            clearInterval(railTimer);
            root.classList.remove('is-traveling');
            root.classList.add('is-departed');
            gameSfx.play("train-fade");
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
      if (name === 'concealed') {
        root.dataset.dialogueStep = String(index + 1);
        if (index === 0) gameSfx.play("concealed-wolf");
      }
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
      audioSettingsTrigger.focus({preventScroll: true});
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
    active = remaining === 0 ? 'prison' : remaining < 7 ? 'escape' : 'concealed';
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