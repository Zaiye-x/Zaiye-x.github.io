const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const header = document.querySelector("[data-header]");
const story = document.querySelector("[data-scroll-story]");
const storyVideo = document.querySelector("[data-story-video]");
const storyPanels = [...document.querySelectorAll("[data-story-panel]")];
const storySteps = [...document.querySelectorAll("[data-story-step]")];
const storyStatus = document.querySelector("[data-story-status]");
const navLinks = [...document.querySelectorAll(".desktop-nav a")];
const sceneBreakpoints = [0, 0.24, 0.49, 0.72];
const storyIntroEndTime = 3.1;
const storyTimeline = [
  { progress: 0, time: storyIntroEndTime },
  { progress: 0.25, time: 4.6 },
  { progress: 0.5, time: 8.6 },
  { progress: 0.75, time: 13.8 },
  { progress: 1, time: 16.6 },
];
const storyCameraTimeline = [
  { progress: 0, x: 5 },
  { progress: 0.25, x: -10 },
  { progress: 0.72, x: -10 },
  { progress: 0.75, x: 8.5 },
  { progress: 1, x: 8.5 },
];
const storyModuleProgress = new Map([
  ["#about", 0],
  ["#experience", 0.25],
  ["#tools", 0.5],
  ["#life", 0.75],
]);
const storyModuleHashes = [...storyModuleProgress.keys()];
const sceneLabels = [
  "正面，关于我",
  "向右，过往经历",
  "向上，工具开发",
  "向下，生活切片",
];

let storyTargetProgress = 0;
let storyRenderedProgress = 0;
let storyAnimationFrame = 0;
let activeStoryScene = -1;
let storyVideoReady = false;
let storyIntroState = "pending";
let pendingStorySeekTime = null;
let storySeekInFlight = false;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function getStoryScrollTop(progress) {
  const distance = Math.max(0, story.offsetHeight - window.innerHeight);
  return story.offsetTop + clamp(progress) * distance;
}

function revealHashTarget() {
  if (!window.location.hash) return;
  const storyProgress = storyModuleProgress.get(window.location.hash);

  if (!reduceMotion && storyProgress !== undefined) {
    window.scrollTo({ top: getStoryScrollTop(storyProgress), behavior: "auto" });
    storyTargetProgress = storyProgress;
    storyRenderedProgress = storyProgress;
    paintStory(storyProgress);
    setHeaderState();
    return;
  }

  const target = document.querySelector(window.location.hash);
  if (!target) return;

  target.querySelectorAll(".reveal").forEach((item) => item.classList.add("is-visible"));
  target.scrollIntoView({ behavior: "auto" });
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const hash = link.getAttribute("href");
    const storyProgress = storyModuleProgress.get(hash);

    if (!reduceMotion && storyProgress !== undefined) {
      event.preventDefault();
      window.scrollTo({
        top: getStoryScrollTop(storyProgress),
        behavior: "smooth",
      });
      window.history.pushState(null, "", hash);
      return;
    }

    const target = document.querySelector(hash);
    if (!target) return;

    event.preventDefault();
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    window.history.pushState(null, "", hash);
  });
});

window.requestAnimationFrame(revealHashTarget);
window.addEventListener("load", revealHashTarget, { once: true });

function isPastStory() {
  const storyEnd = story.offsetTop + story.offsetHeight - window.innerHeight * 0.35;
  return window.scrollY > storyEnd;
}

function setHeaderState() {
  const hasLeftStory = isPastStory();
  header.classList.toggle("is-scrolled", hasLeftStory);

  navLinks.forEach((link) => {
    link.classList.toggle(
      "is-active",
      !hasLeftStory && link.getAttribute("href") === storyModuleHashes[activeStoryScene],
    );
  });
}

function measureStoryProgress() {
  const bounds = story.getBoundingClientRect();
  const distance = Math.max(1, story.offsetHeight - window.innerHeight);
  return clamp(-bounds.top / distance);
}

function getStoryScene(progress) {
  for (let index = sceneBreakpoints.length - 1; index >= 0; index -= 1) {
    if (progress >= sceneBreakpoints[index]) return index;
  }
  return 0;
}

function setStoryScene(index) {
  if (index === activeStoryScene) return;
  activeStoryScene = index;
  story.dataset.scene = String(index);

  storyPanels.forEach((panel, panelIndex) => {
    const isActive = panelIndex === index;
    panel.classList.toggle("is-active", isActive);
    panel.setAttribute("aria-hidden", String(!isActive));
    panel.inert = !isActive;
  });

  storySteps.forEach((step, stepIndex) => {
    step.classList.toggle("is-active", stepIndex === index);
  });

  navLinks.forEach((link) => {
    link.classList.toggle(
      "is-active",
      !isPastStory() && link.getAttribute("href") === storyModuleHashes[index],
    );
  });

  storyStatus.textContent = `当前章节：${sceneLabels[index]}`;
}

function setStoryIntroState(state) {
  storyIntroState = state;
  story.dataset.introState = state;
}

function flushStorySeek() {
  if (
    !storyVideoReady ||
    storyIntroState === "playing" ||
    storySeekInFlight ||
    pendingStorySeekTime === null
  ) {
    return;
  }

  const targetTime = pendingStorySeekTime;
  pendingStorySeekTime = null;

  if (Math.abs(storyVideo.currentTime - targetTime) <= 1 / 48) {
    return;
  }

  storySeekInFlight = true;
  storyVideo.currentTime = targetTime;
}

function queueStorySeek(targetTime) {
  pendingStorySeekTime = targetTime;
  flushStorySeek();
}

storyVideo.addEventListener("seeked", () => {
  storySeekInFlight = false;
  if (pendingStorySeekTime !== null) {
    window.requestAnimationFrame(flushStorySeek);
  }
});

function getStoryTime(progress) {
  for (let index = 0; index < storyTimeline.length - 1; index += 1) {
    const current = storyTimeline[index];
    const next = storyTimeline[index + 1];

    if (progress <= next.progress) {
      const segmentProgress = clamp(
        (progress - current.progress) / (next.progress - current.progress),
      );
      return current.time + segmentProgress * (next.time - current.time);
    }
  }

  return storyTimeline.at(-1).time;
}

function getStoryCameraX(progress) {
  for (let index = 0; index < storyCameraTimeline.length - 1; index += 1) {
    const current = storyCameraTimeline[index];
    const next = storyCameraTimeline[index + 1];

    if (progress <= next.progress) {
      const segmentProgress = clamp(
        (progress - current.progress) / (next.progress - current.progress),
      );
      return current.x + segmentProgress * (next.x - current.x);
    }
  }

  return storyCameraTimeline.at(-1).x;
}

function paintStory(progress) {
  story.style.setProperty("--story-progress", `${(progress * 100).toFixed(2)}%`);
  const mobileCameraMultiplier = window.innerWidth <= 760 ? 1.4 : 1;
  const cameraX = getStoryCameraX(progress) * mobileCameraMultiplier;
  story.style.setProperty("--camera-x", `${cameraX.toFixed(3)}vw`);
  setStoryScene(getStoryScene(progress));

  if (!storyVideoReady || reduceMotion) return;

  queueStorySeek(getStoryTime(progress));
}

function renderStory() {
  storyAnimationFrame = 0;
  const distance = storyTargetProgress - storyRenderedProgress;

  if (Math.abs(distance) < 0.0006) {
    storyRenderedProgress = storyTargetProgress;
  } else {
    storyRenderedProgress += distance * 0.22;
  }

  paintStory(storyRenderedProgress);

  if (Math.abs(storyTargetProgress - storyRenderedProgress) >= 0.0006) {
    storyAnimationFrame = window.requestAnimationFrame(renderStory);
  }
}

function requestStoryUpdate() {
  if (reduceMotion) return;
  storyTargetProgress = measureStoryProgress();

  if (storyIntroState === "playing" && storyTargetProgress > 0.002) {
    storyVideo.pause();
    setStoryIntroState("interrupted");
  }

  if (!storyAnimationFrame) {
    storyAnimationFrame = window.requestAnimationFrame(renderStory);
  }
}

function finishStoryIntro() {
  if (storyIntroState !== "playing") return;
  storyVideo.pause();
  setStoryIntroState("complete");
  storyTargetProgress = measureStoryProgress();
  storyRenderedProgress = storyTargetProgress;
  paintStory(storyRenderedProgress);
}

function monitorStoryIntro() {
  if (storyIntroState !== "playing") return;
  if (storyVideo.currentTime >= storyIntroEndTime) {
    finishStoryIntro();
    return;
  }

  if ("requestVideoFrameCallback" in storyVideo) {
    storyVideo.requestVideoFrameCallback(monitorStoryIntro);
  } else {
    window.requestAnimationFrame(monitorStoryIntro);
  }
}

function startStoryIntro() {
  setStoryIntroState("playing");
  storyVideo.currentTime = 0;

  const playback = storyVideo.play();
  if (playback) {
    playback.then(monitorStoryIntro).catch(() => {
      setStoryIntroState("complete");
      queueStorySeek(storyIntroEndTime);
    });
  } else {
    monitorStoryIntro();
  }
}

function initializeStoryVideo() {
  storyVideoReady = true;
  storyVideo.pause();

  if (reduceMotion) {
    setStoryIntroState("skipped");
    storyPanels.forEach((panel) => {
      panel.setAttribute("aria-hidden", "false");
      panel.inert = false;
    });
    return;
  }

  const initialModuleProgress = storyModuleProgress.get(window.location.hash);
  const shouldPlayIntro =
    measureStoryProgress() <= 0.002 &&
    (initialModuleProgress === undefined || initialModuleProgress === 0);

  if (shouldPlayIntro) {
    startStoryIntro();
  } else {
    setStoryIntroState("skipped");
    paintStory(storyRenderedProgress);
  }
}

if (storyVideo.readyState >= 2) {
  initializeStoryVideo();
} else {
  storyVideo.addEventListener("loadeddata", initializeStoryVideo, { once: true });
}

if (reduceMotion) {
  storyPanels.forEach((panel) => {
    panel.setAttribute("aria-hidden", "false");
    panel.inert = false;
  });
} else {
  storyTargetProgress = measureStoryProgress();
  storyRenderedProgress = storyTargetProgress;
  paintStory(storyRenderedProgress);
}

const menuToggle = document.querySelector("[data-menu-toggle]");
const mobileMenu = document.querySelector("[data-mobile-menu]");

function closeMenu() {
  menuToggle.setAttribute("aria-expanded", "false");
  mobileMenu.hidden = true;
  document.body.classList.remove("menu-open");
}

menuToggle.addEventListener("click", () => {
  const willOpen = menuToggle.getAttribute("aria-expanded") !== "true";
  menuToggle.setAttribute("aria-expanded", String(willOpen));
  mobileMenu.hidden = !willOpen;
  document.body.classList.toggle("menu-open", willOpen);
});

mobileMenu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !mobileMenu.hidden) closeMenu();
});

const detailContent = {
  fadada: {
    counter: "01 / 03",
    kicker: "EXPERIENCE / 过往经历",
    title: "法大大",
    role: "AI 产品经理 · 法律科技",
    summary:
      "围绕法律科技 AI 产品与商业化基础能力，参与智能法律产品与计费中台两条产品线。",
    status: "2 PRODUCT CASES",
    footer: "LEGAL TECH / PRODUCT",
    media: {
      src: "./图片素材/richeeAI.png",
      alt: "RicheeAI 法律科技 AI 产品界面",
      caption: "RicheeAI · 法律科技 AI 产品",
    },
    fields: [
      ["RicheeAI", "面向法律科技场景的 AI 产品"],
      ["FDD-Billing", "支撑产品商业化的计费中台系统"],
    ],
  },
  creator: {
    counter: "02 / 03",
    kicker: "EXPERIENCE / 过往经历",
    title: "在野在也",
    role: "AI 领域自媒体博主 · Bilibili / YouTube",
    summary:
      "分享 AI 产品实操教程与AI技术解析，同时记录音乐和创作工具带来的新可能。",
    status: "50 POSTS / 3 SERIES",
    footer: "CONTENT / CREATION",
    media: {
      src: "./图片素材/B站站内截图.png",
      alt: "在野在也的 Bilibili 个人主页与代表视频",
      caption: "BILIBILI / 在野在也 · AI 产品实操与技术分享",
    },
    link: {
      href: "https://space.bilibili.com/3823944?spm_id_from=333.337.0.0",
      label: "访问 Bilibili 主页",
    },
    fields: [
      ["发布平台", "Bilibili、YouTube"],
      ["内容方向", "AI 产品实操、工作流与技术解析"],
      ["代表主题", "Suno AI 音乐、Coze AI 工作流、自动化内容创作"],
      ["创作主张", "如果能够帮助到你，我会感到很快乐"],
    ],
  },
  lbp: {
    counter: "03 / 03",
    kicker: "EXPERIENCE / 过往经历",
    title: "飞书",
    role: "LBP 深度服务 · 企业数字化",
    summary:
      "将业务问题拆解为可落地的洞察系统与 Agent 解决方案。",
    status: "2 SERVICE CASES",
    footer: "ENTERPRISE / DELIVERY",
    media: {
      src: "./图片素材/高管巡店图片.png",
      alt: "高管巡店项目的数据洞察界面",
      caption: "高管巡店 · 企业一线经营洞察",
    },
    fields: [
      ["巡店 Agent", "永辉CEO决赛项目，同时落地“名创优品、SKIN79、福满家等消费企业”"],
      ["VOC 洞察系统", "SKG客户案例，该华南区半决赛第二、先进制造全国十强"],
    ],
  },
  "tool-01": {
    counter: "01 / 03",
    kicker: "TOOLS / 工具开发",
    title: "obsidian-rich-table",
    role: "Obsidian 富文本表格插件",
    summary:
      "让 Markdown 表格在 Obsidian 中拥有更直观的可视化编辑体验。",
    status: "OPEN SOURCE / GITHUB",
    footer: "PLUGIN / PRODUCTIVITY",
    media: {
      src: "./图片素材/obsidian富文本插件.png",
      alt: "obsidian-rich-table 富文本表格编辑界面",
      caption: "可视化编辑、合并拆分、图片插入与表格导出",
    },
    link: {
      href: "https://github.com/Zaiye-x/obsidian-rich-table",
      label: "查看 GitHub",
    },
    fields: [
      ["核心能力", "可视化编辑、行列操作、合并拆分与图片插入"],
      ["使用场景", "Obsidian 笔记中的复杂 Markdown 表格"],
      ["设计目标", "保留文本可迁移性，同时提升编辑效率"],
    ],
  },
  "tool-02": {
    counter: "02 / 03",
    kicker: "TOOLS / 工具开发",
    title: "wechat-info-push",
    role: "微信群消息定时归档工具",
    summary:
      "每天抓取指定微信群中指定发言人的消息，去重后写入飞书多维表格。",
    status: "OPEN SOURCE / GITHUB",
    footer: "AUTOMATION / INFORMATION",
    media: {
      src: "./图片素材/微信群消息抓取.png",
      alt: "wechat-info-push 自动生成的微信群消息归档日报",
      caption: "屏蔽群聊杂音，只留下真正关心的人说了什么",
    },
    link: {
      href: "https://github.com/Zaiye-x/wechat-info-push",
      label: "查看 GitHub",
    },
    fields: [
      ["采集", "按微信群与发言人定向抓取当天消息"],
      ["处理", "自动去重并整理为结构化摘要"],
      ["沉淀", "定时写入飞书多维表格，形成可检索档案"],
    ],
  },
  "tool-03": {
    counter: "03 / 03",
    kicker: "TOOLS / 工具开发",
    title: "trae-task-folder-manager",
    role: "TRAE SOLO 任务文件夹扩展",
    summary:
      "为分散的 SOLO 会话增加独立文件夹视图，让任务可以被归档、组织并快速找回。",
    status: "OPEN SOURCE / GITHUB",
    footer: "EXTENSION / WORKFLOW",
    media: {
      src: "./图片素材/trae-integration.png",
      alt: "trae-task-folder-manager 在 TRAE 编辑器中的任务文件夹视图",
      caption: "独立文件夹视图 · 会话归档 · 快速返回任务",
    },
    link: {
      href: "https://github.com/Zaiye-x/trae-task-folder-manager",
      label: "查看 GitHub",
    },
    fields: [
      ["组织", "按文件夹归档分散的 SOLO 任务"],
      ["导航", "从文件夹快速返回对应任务对话"],
      ["边界", "仅管理本地任务引用，不读取对话正文"],
    ],
  },
};

const detailDialog = document.querySelector("[data-detail-dialog]");
const detailFields = document.querySelector("[data-detail-fields]");
const detailCounter = document.querySelector("[data-detail-counter]");
const detailKicker = document.querySelector("[data-detail-kicker]");
const detailTitle = document.querySelector("[data-detail-title]");
const detailRole = document.querySelector("[data-detail-role]");
const detailSummary = document.querySelector("[data-detail-summary]");
const detailStatus = document.querySelector("[data-detail-status]");
const detailFooter = document.querySelector("[data-detail-footer]");
const detailMedia = document.querySelector("[data-detail-media]");
const detailImage = document.querySelector("[data-detail-image]");
const detailMediaCaption = document.querySelector("[data-detail-media-caption]");
const detailLink = document.querySelector("[data-detail-link]");
const detailLinkLabel = document.querySelector("[data-detail-link-label]");
const detailBody = document.querySelector(".detail-drawer-body");
const detailPrevious = document.querySelector("[data-detail-previous]");
const detailNext = document.querySelector("[data-detail-next]");
const detailGroups = {
  experience: ["fadada", "creator", "lbp"],
  tools: ["tool-01", "tool-02", "tool-03"],
};
let detailTrigger = null;
let activeDetailKey = null;

function openDetail(key, trigger) {
  const content = detailContent[key];
  if (!content) return;

  if (trigger) detailTrigger = trigger;
  activeDetailKey = key;
  detailCounter.textContent = content.counter;
  detailKicker.textContent = content.kicker;
  detailTitle.textContent = content.title;
  detailRole.textContent = content.role;
  detailSummary.textContent = content.summary;
  detailStatus.textContent = content.status;
  detailFooter.textContent = content.footer;
  detailFields.replaceChildren();

  detailMedia.hidden = !content.media;
  if (content.media) {
    detailImage.src = content.media.src;
    detailImage.alt = content.media.alt;
    detailMediaCaption.textContent = content.media.caption;
  } else {
    detailImage.removeAttribute("src");
    detailImage.alt = "";
    detailMediaCaption.textContent = "";
  }

  detailLink.hidden = !content.link;
  if (content.link) {
    detailLink.href = content.link.href;
    detailLinkLabel.textContent = content.link.label;
  } else {
    detailLink.removeAttribute("href");
    detailLinkLabel.textContent = "";
  }

  content.fields.forEach(([label, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    detailFields.append(row);
  });

  const group = Object.values(detailGroups).find((keys) => keys.includes(key));
  if (group) {
    const currentIndex = group.indexOf(key);
    const previousContent = detailContent[group[(currentIndex - 1 + group.length) % group.length]];
    const nextContent = detailContent[group[(currentIndex + 1) % group.length]];
    detailPrevious.setAttribute("aria-label", `上一个：${previousContent.title}`);
    detailPrevious.title = `上一个：${previousContent.title}`;
    detailNext.setAttribute("aria-label", `下一个：${nextContent.title}`);
    detailNext.title = `下一个：${nextContent.title}`;
  }

  detailBody.scrollTo({ top: 0, behavior: "auto" });
  document.body.classList.add("dialog-open");
  if (!detailDialog.open) detailDialog.showModal();
}

function navigateDetail(direction) {
  const group = Object.values(detailGroups).find((keys) => keys.includes(activeDetailKey));
  if (!group) return;

  const currentIndex = group.indexOf(activeDetailKey);
  const nextIndex = (currentIndex + direction + group.length) % group.length;
  openDetail(group[nextIndex]);
}

document.querySelectorAll("[data-detail-key]").forEach((button) => {
  button.addEventListener("click", () => openDetail(button.dataset.detailKey, button));
});

detailPrevious.addEventListener("click", () => navigateDetail(-1));
detailNext.addEventListener("click", () => navigateDetail(1));

document.querySelector("[data-detail-close]").addEventListener("click", () => {
  detailDialog.close();
});

detailDialog.addEventListener("click", (event) => {
  if (event.target === detailDialog) detailDialog.close();
});

detailDialog.addEventListener("close", () => {
  document.body.classList.remove("dialog-open");
  activeDetailKey = null;
  const returnTarget = detailTrigger;
  window.requestAnimationFrame(() => returnTarget?.focus());
});

const lifeItems = [
  {
    type: "video",
    src: "./视频素材/love-yourself.mp4",
    poster: "./media/love-yourself-poster.png",
    title: "Love Yourself",
    description: "",
  },
  {
    type: "video",
    src: "./视频素材/city-of-stars.mp4",
    poster: "./media/city-of-stars-poster.png",
    title: "City of Stars",
    description: "",
  },
  {
    type: "image",
    src: "./图片素材/画画001.jpg",
    title: "人物速写",
    description: "",
  },
  {
    type: "image",
    src: "./图片素材/冲浪.jpg",
    title: "冲浪记录",
    description: "",
  },
];

const lifeDialog = document.querySelector("[data-life-dialog]");
const lifeImage = document.querySelector("[data-life-image]");
const lifeVideo = document.querySelector("[data-life-video]");
const lifeCounter = document.querySelector("[data-life-counter]");
const lifeTitle = document.querySelector("[data-life-title]");
const lifeDescription = document.querySelector("[data-life-description]");
let activeLifeIndex = 0;
let lifeTrigger = null;
let lifeVideoSuspendsBackground = false;

const backgroundAudio = document.querySelector("[data-background-audio]");
const musicToggle = document.querySelector("[data-music-toggle]");
let backgroundMusicEnabled = true;

try {
  backgroundMusicEnabled = window.localStorage.getItem("background-music") !== "off";
} catch {
  backgroundMusicEnabled = true;
}

backgroundAudio.volume = 0.28;

function updateMusicToggle() {
  const actionLabel = backgroundMusicEnabled ? "关闭背景音乐" : "播放背景音乐";
  musicToggle.setAttribute("aria-pressed", String(backgroundMusicEnabled));
  musicToggle.setAttribute("aria-label", actionLabel);
  musicToggle.title = actionLabel;
  musicToggle.classList.toggle(
    "is-playing",
    backgroundMusicEnabled && !backgroundAudio.paused && !lifeVideoSuspendsBackground,
  );
}

function syncBackgroundAudio() {
  updateMusicToggle();

  if (!backgroundMusicEnabled || lifeVideoSuspendsBackground) {
    backgroundAudio.pause();
    updateMusicToggle();
    return;
  }

  const playback = backgroundAudio.play();
  if (playback) {
    playback.then(updateMusicToggle).catch(updateMusicToggle);
  }
}

function setBackgroundMusicEnabled(isEnabled) {
  backgroundMusicEnabled = isEnabled;
  try {
    window.localStorage.setItem("background-music", isEnabled ? "on" : "off");
  } catch {
    // Playback still works when storage is unavailable.
  }
  syncBackgroundAudio();
}

function renderLifeItem(index) {
  activeLifeIndex = (index + lifeItems.length) % lifeItems.length;
  const item = lifeItems[activeLifeIndex];

  lifeVideo.pause();
  const isVideo = item.type === "video";
  lifeVideoSuspendsBackground = isVideo;
  lifeImage.hidden = isVideo;
  lifeVideo.hidden = !isVideo;

  if (isVideo) {
    lifeImage.removeAttribute("src");
    lifeImage.alt = "";
    lifeVideo.src = item.src;
    lifeVideo.poster = item.poster;
    lifeVideo.setAttribute("aria-label", item.title);
    lifeVideo.load();
    window.requestAnimationFrame(() => {
      const playback = lifeVideo.play();
      if (playback) {
        playback.catch(() => {
          lifeVideoSuspendsBackground = false;
          syncBackgroundAudio();
        });
      }
    });
  } else {
    lifeVideo.removeAttribute("src");
    lifeVideo.removeAttribute("poster");
    lifeVideo.removeAttribute("aria-label");
    lifeVideo.load();
    lifeImage.src = item.src;
    lifeImage.alt = item.title;
  }

  lifeCounter.textContent = `${String(activeLifeIndex + 1).padStart(2, "0")} / ${String(
    lifeItems.length,
  ).padStart(2, "0")}`;
  lifeTitle.textContent = item.title;
  lifeDescription.textContent = item.description;
  syncBackgroundAudio();
}

document.querySelectorAll("[data-life-index]").forEach((button) => {
  button.addEventListener("click", () => {
    lifeTrigger = button;
    renderLifeItem(Number(button.dataset.lifeIndex));
    document.body.classList.add("dialog-open");
    if (!lifeDialog.open) lifeDialog.showModal();
    syncBackgroundAudio();
  });
});

document.querySelector("[data-life-previous]").addEventListener("click", () => {
  renderLifeItem(activeLifeIndex - 1);
});

document.querySelector("[data-life-next]").addEventListener("click", () => {
  renderLifeItem(activeLifeIndex + 1);
});

document.querySelector("[data-life-close]").addEventListener("click", () => {
  lifeDialog.close();
});

lifeDialog.addEventListener("click", (event) => {
  if (event.target === lifeDialog) lifeDialog.close();
});

lifeDialog.addEventListener("close", () => {
  lifeVideo.pause();
  lifeVideoSuspendsBackground = false;
  syncBackgroundAudio();
  document.body.classList.remove("dialog-open");
  const returnTarget = lifeTrigger;
  window.requestAnimationFrame(() => returnTarget?.focus());
});

lifeVideo.addEventListener("play", () => {
  lifeVideoSuspendsBackground = true;
  syncBackgroundAudio();
});

lifeVideo.addEventListener("ended", () => {
  lifeVideoSuspendsBackground = false;
  syncBackgroundAudio();
});

musicToggle.addEventListener("click", () => {
  setBackgroundMusicEnabled(!backgroundMusicEnabled);
});

backgroundAudio.addEventListener("play", updateMusicToggle);
backgroundAudio.addEventListener("pause", updateMusicToggle);

function unlockBackgroundAudio(event) {
  if (
    !backgroundMusicEnabled ||
    lifeVideoSuspendsBackground ||
    event.target.closest("[data-life-index]")
  ) {
    return;
  }

  syncBackgroundAudio();
}

function stopListeningForAudioUnlock() {
  document.removeEventListener("click", unlockBackgroundAudio);
  document.removeEventListener("keydown", unlockBackgroundAudio);
}

document.addEventListener("click", unlockBackgroundAudio);
document.addEventListener("keydown", unlockBackgroundAudio);
backgroundAudio.addEventListener("play", stopListeningForAudioUnlock, { once: true });
syncBackgroundAudio();

document.addEventListener("keydown", (event) => {
  if (detailDialog.open) {
    if (event.key === "ArrowLeft") navigateDetail(-1);
    if (event.key === "ArrowRight") navigateDetail(1);
    return;
  }

  if (lifeDialog.open) {
    if (event.key === "ArrowLeft") renderLifeItem(activeLifeIndex - 1);
    if (event.key === "ArrowRight") renderLifeItem(activeLifeIndex + 1);
  }
});

const revealItems = document.querySelectorAll(".reveal");

if (reduceMotion || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
}

window.addEventListener(
  "scroll",
  () => {
    setHeaderState();
    requestStoryUpdate();
  },
  { passive: true },
);

window.addEventListener("resize", () => {
  setHeaderState();
  requestStoryUpdate();
});

setHeaderState();
