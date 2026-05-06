export interface BlueskyList {
  uri: string;
  name: string;
  purpose: string;
  itemCount: number;
  avatar?: string;
  description?: string;
}

export interface Follower {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  isMutual?: boolean;
}

export interface Credentials {
  handle: string;
  password: string;
}

export interface Subscription {
  id: string;
  target_handle: string;
  mode: 'block' | 'mute';
  sub_type: 'follower' | 'reblock' | 'postinteraction' | 'list';
  include_followers: boolean;
  config: Record<string, unknown>;
  last_updated: string | null;
  created_at: string;
  paused_reason: string | null;
}

export interface User {
  id: string;
  handle: string;
  created_at: string;
}

export type Language = 'en' | 'de';
export type Theme = 'dark' | 'light';
export type Mode = 'block' | 'mute';
