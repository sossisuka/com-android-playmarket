export type RawApp = {
  id?: string;
  name?: string;
  publisher?: string;
  subtitle?: string;
  category?: string;
  price?: string;
  installs?: string;
  color?: string;
  icon?: string;
  image?: string;
  trailerImage?: string;
  trailerUrl?: string;
  screenshots?: string[];
  reviews?: number;
  [key: string]: unknown;
};

export type SummaryApp = {
  id: string;
  name: string;
  publisher: string;
  subtitle: string;
  category: string;
  price: string;
  installs: string;
  color: string;
  icon: string;
  trailerImage: string;
  trailerUrl: string;
  reviews: number;
  ratingValue: number;
  ratingCountText: string;
};

export type ReviewRecord = {
  id: string;
  packageId: string;
  userId: string;
  authorName: string;
  title: string;
  text: string;
  rating: number;
  createdAt: string;
  updatedAt: string;
  appVersion?: string;
  deviceLabel?: string;
};

export type ReviewsDb = {
  reviews: ReviewRecord[];
};

export type Cache = {
  mtimeMs: number;
  size: number;
  apps: RawApp[];
  byId: Map<string, RawApp>;
  summaries: SummaryApp[];
};

export type HomeBannerSeed = {
  id: string;
  title: string;
  imageUrl: string;
  sourceUrl: string;
  sourceDate: string;
};

export type HomeSection = {
  key: string;
  title: string;
  rationale: string;
  items: SummaryApp[];
};

export type UserRecord = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  country: string;
  createdAt: string;
  passwordHash: string;
  favoriteAppIds: string[];
  libraryAppIds: string[];
};

export type SessionRecord = {
  token: string;
  userId: string;
  createdAt: string;
};

export type UsersDb = {
  users: UserRecord[];
  sessions: SessionRecord[];
};

