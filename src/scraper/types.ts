export interface ScrapeResult {
  participants: string[];
  hostUsername: string;
  hostAvatarUrl?: string;
}

export interface VerificationResult {
  avatarUrl: string;
  passedPfp: boolean;
  passedBio: boolean;
  passedAge: boolean;
  passedActivity: boolean;
  passedComment: boolean;
  actualAgeMonths?: number;
  actualPosts?: number;
}

export interface VerificationConfig {
  mustPfp?: boolean;
  mustBio?: boolean;
  mustAge?: boolean;
  minMonths?: number;
  mustActivity?: boolean;
  minPosts?: number;
  mustComment?: boolean;
}

export interface XGraphQLUserData {
  profile_image_url_https?: string;
  default_profile_image?: boolean;
  profile_banner_url?: string;
  description?: string;
  created_at?: string;
  statuses_count?: number;
}
