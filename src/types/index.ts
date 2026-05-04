export interface Follower {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
}

export interface Credentials {
  handle: string;
  password: string;
}

export interface Subscription {
  id: string;
  target_handle: string;
  mode: 'block' | 'mute';
  include_followers: boolean;
  last_updated: string | null;
  created_at: string;
}

export interface User {
  id: string;
  handle: string;
  created_at: string;
}

export type Language = 'en' | 'de';
export type Theme = 'dark' | 'light';
export type Mode = 'block' | 'mute';
