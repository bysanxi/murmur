const LINES = {
  morning: {
    "zh-CN": ["慢慢醒过来，也很好。", "今天可以从轻一点开始。"],
    en: ["Waking slowly is allowed.", "Today can start a little lighter."],
  },
  lateMorning: {
    "zh-CN": ["手头的事可以先放一会儿。", "呼吸还在，就够用了。"],
    en: [
      "The task can wait a moment.",
      "The breath is still here. That is enough.",
    ],
  },
  lunch: {
    "zh-CN": ["先吃一口，再想下一件。", "中午的光，不赶人。"],
    en: ["Eat a bite before the next thing.", "Noon light is not in a hurry."],
  },
  afternoon: {
    "zh-CN": ["累了就靠一会儿，没有人催。", "做到这里，已经可以。"],
    en: [
      "If you are tired, lean here. No one is rushing you.",
      "Getting this far is already enough.",
    ],
  },
  evening: {
    "zh-CN": ["今天可以在这里收一收。", "剩下的，明天也还在。"],
    en: [
      "Today can fold up here.",
      "What is left will still be there tomorrow.",
    ],
  },
  lateNight: {
    "zh-CN": ["夜很静，你可以先不回答。", "睡不着也没关系，水还在。"],
    en: [
      "The night is quiet. You do not have to answer.",
      "If sleep does not come, the water is still here.",
    ],
  },
  weekend: {
    "zh-CN": ["今天不必有用。", "就这样看着，也算过了一会儿。"],
    en: [
      "Today does not have to be useful.",
      "Watching like this still counts as a while.",
    ],
  },
};

function readLanguage() {
  try {
    const saved = localStorage.getItem("deskulpt.language");
    if (saved === "en" || saved === "zh-CN") return saved;
  } catch {
    /* ignore */
  }
  return "zh-CN";
}

export function periodOf(date) {
  const hour = date.getHours();
  const weekend = date.getDay() === 0 || date.getDay() === 6;
  if (hour >= 21 || hour < 6) return "lateNight";
  if (weekend) return "weekend";
  if (hour < 9) return "morning";
  if (hour < 12) return "lateMorning";
  if (hour < 14) return "lunch";
  if (hour < 18) return "afternoon";
  return "evening";
}

export function atmosphereOf(date) {
  const period = periodOf(date);
  const looks = {
    morning: { weather: "sunny", night: false },
    lateMorning: { weather: "sunny", night: false },
    lunch: { weather: "sunny", night: false },
    afternoon: { weather: "cloudy", night: false },
    evening: { weather: "cloudy", night: false },
    lateNight: { weather: "cloudy", night: true },
    weekend: { weather: "sunny", night: false },
  };
  return looks[period];
}

export function lineOf(date, language = readLanguage()) {
  const list = LINES[periodOf(date)][language] ?? LINES[periodOf(date)].en;
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date - start) / 86400000);
  return list[day % list.length];
}

export function subscribeLanguage(listener) {
  const onChange = () => listener();
  window.addEventListener("deskulpt:language-changed", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("deskulpt:language-changed", onChange);
    window.removeEventListener("storage", onChange);
  };
}
