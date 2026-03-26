import path from "node:path";

import type { HomeBannerSeed } from "./types.ts";

export const HOST = process.env.HOST ?? "0.0.0.0";
export const PORT = Number(process.env.PORT ?? 8787);
export const APPS_FILE =
  process.env.APPS_FILE ??
  path.resolve(import.meta.dir, "./data/apps.generated.ts");
export const USERS_DB_FILE =
  process.env.USERS_DB_FILE ??
  path.resolve(import.meta.dir, "./data/users.db.ts");
export const REVIEWS_FILE =
  process.env.REVIEWS_FILE ??
  path.resolve(import.meta.dir, "./data/reviews.json");
export const UNSUPPORTED_APPS_DIR = path.resolve(import.meta.dir, "./data");
export const UNSUPPORTED_APPS_FILE = path.join(
  UNSUPPORTED_APPS_DIR,
  "unsupported_apps_api.json",
);
export const ICONS_DIR = path.resolve(import.meta.dir, "./data/icons");
export const APK_DIR = path.resolve(import.meta.dir, "./data/apk");
export const MEDIA_PROXY_ENABLED =
  (process.env.MEDIA_PROXY_ENABLED ?? "1").trim() !== "0";
export const MEDIA_PROXY_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.MEDIA_PROXY_TIMEOUT_MS ?? "15000") || 15000,
);
export const APPS_PAGE_SIZE = 20;
export const PACKAGE_ID_RE = /^[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)+$/;
export const REALTIME_CACHE_SYNC_ENABLED =
  (process.env.REALTIME_CACHE_SYNC_ENABLED ?? "1").trim() !== "0";
export const ALLOWED_MEDIA_HOST_SUFFIXES = [
  "googleusercontent.com",
  "ggpht.com",
  "ytimg.com",
  "gstatic.com",
  "googlevideo.com",
];


export const HISTORICAL_HOME_BANNERS: HomeBannerSeed[] = [
  {
    id: "com.mobiata.flighttrack",
    title: "FlightTrack",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh6.ggpht.com/Pwpjm-P-aj30sKGXHEjxwB8jPhFoOOP8x3P2VQNjA-de_7I5ZNShjz8IEVM8_ZUzdrHX=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.com2us.deadcity.normal.freefull.google.global.android.common",
    title: "Dead City",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh3.ggpht.com/7t2-L6WQjBYoU1o06U2MbtPgypZQYTo6-ZQgzbEg288iER_KNe8PWGjnW0VHVhQa2eI9=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.liquable.nemo",
    title: "Cubie Messenger",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh5.ggpht.com/Y2zFkklcg8KGR4b8_fhtqdrYK1hXGzisH-iU5Enp5dFk2f8L_HJMQVbiW7Qz-phfpg=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.distractionware.superhexagon",
    title: "Super Hexagon",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh4.ggpht.com/lJ1f0zVcAuQGQLNQSyuJpyjYCfeuyhk1VxdYalct48CSXQLTmNqef33XrlHkBygKQwA=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.disney.ToyStorySmashIt.goo",
    title: "Toy Story: Smash It!",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh4.ggpht.com/EbophPRx71MratD8CueiDfocB3H8LWzLRFBddGaf74pb6sM4jxBSQMzA486BIAnJVfY=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.touchten.trainlegend",
    title: "Train Legend",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh4.ggpht.com/3zMxcWbp-RBQwxffVQUiE4DBlBRMivyG0vXH6sbA8bmktkFQCZsS-nsH5yrK23cy2D0=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.mobilesrepublic.appy",
    title: "News Republic",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh3.ggpht.com/czmjvJiSpcLzulj4YGsDgea2D02nuDhObYjN1wFa6KRhIPpaEYd6eYuhVoNNTScJS0Q=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.fgol.HungrySharkEvolution",
    title: "Hungry Shark Evolution",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh4.ggpht.com/080ctL04m5ztxOVZAhtNU_t9fROnk-vLLy1nUaUckMTXAzE3yJcvSQiyTULyPUiqvCV3=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.otakumode.otakucamera",
    title: "Otaku Camera",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh3.ggpht.com/lrjoOADn32a4XHbocp4ZvJOo1ZAk_7FFBiN37IhP9EfpboCua77yNAzFAq0Jgl0bSS7O=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.square_enix.android_googleplay.ffl_gp",
    title: "FINAL FANTASY DIMENSIONS",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh4.ggpht.com/5eP1j6Y_nmUEo6sdtu1D8rmh_qEX695exA_I7hyOv8fPzTSO1pWjbQAu9PjsuCfG97P5=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
];

