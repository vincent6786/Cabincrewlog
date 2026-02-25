// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                     crewData.js — EVA Air Edition                           ║
// ║  Initial crew seed data loaded on first boot if Firestore is empty.         ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

/**
 * INITIAL_CREW — sample EVA Air crew members.
 * Positions: CP (座艙長) · DP (副座艙長) · AP (副事務長) · CA (客艙組員) · TA (訓練組員)
 * Aircraft:  B777 · B787 · A321 · A330
 */

export const INITIAL_CREW = [
  // ── Chief Pursers (CP) ────────────────────────────────────────────────────
  {
    id:        "BR10001",
    nickname:  "Helen",
    name:      "陳美玲",
    seniority: "BR15A",
    status:    "green",
    tags:      ["#好咖", "#專業", "#準時"],
    notes:     "非常專業的座艙長，執行長程航班經驗豐富。",
  },
  {
    id:        "BR10002",
    nickname:  "Jason",
    name:      "林建宏",
    seniority: "BR14B",
    status:    "yellow",
    tags:      ["#準時"],
    notes:     "",
  },
  // ── Deputy Pursers (DP) ───────────────────────────────────────────────────
  {
    id:        "BR20001",
    nickname:  "Vivian",
    name:      "王雅婷",
    seniority: "BR18A",
    status:    "green",
    tags:      ["#細心", "#好咖"],
    notes:     "服務細心，旅客評價極高。",
  },
  {
    id:        "BR20002",
    nickname:  "Kevin",
    name:      "吳志遠",
    seniority: "BR17C",
    status:    null,
    tags:      [],
    notes:     "",
  },
  // ── Assistant Pursers (AP) ────────────────────────────────────────────────
  {
    id:        "BR30001",
    nickname:  "Amy",
    name:      "黃佳欣",
    seniority: "BR20A",
    status:    "green",
    tags:      ["#好笑", "#細心"],
    notes:     "飛起來很開心的組員！",
  },
  {
    id:        "BR30002",
    nickname:  "Mark",
    name:      "張哲維",
    seniority: "BR19B",
    status:    "red",
    tags:      ["#難搞"],
    notes:     "需要注意，態度較強硬。",
  },
  // ── Cabin Attendants (CA) ─────────────────────────────────────────────────
  {
    id:        "BR40001",
    nickname:  "Sophie",
    name:      "劉思琪",
    seniority: "BR22A",
    status:    "green",
    tags:      ["#新人", "#細心"],
    notes:     "新人但非常認真學習。",
  },
  {
    id:        "BR40002",
    nickname:  "Eric",
    name:      "許宏偉",
    seniority: "BR21C",
    status:    "yellow",
    tags:      ["#八卦"],
    notes:     "",
  },
  {
    id:        "BR40003",
    nickname:  "Coco",
    name:      "鄭可心",
    seniority: "BR23A",
    status:    null,
    tags:      ["#新人"],
    notes:     "",
  },
  // ── Trainee Attendants (TA) ───────────────────────────────────────────────
  {
    id:        "BR50001",
    nickname:  "Leo",
    name:      "陳俊廷",
    seniority: "BR24A",
    status:    null,
    tags:      ["#新人"],
    notes:     "訓練中，第一次執行國際線。",
  },
];
