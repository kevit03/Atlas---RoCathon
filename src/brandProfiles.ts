import type { BrandProfile } from './types';

export interface BrandProfileDetail {
  id: string;
  label: string;
  tagline: string;
  defaultQuery: string;
  profile: BrandProfile;
}

export const brandProfileCatalog: BrandProfileDetail[] = [
  {
    id: 'brand_smart_home',
    label: 'Smart Home',
    tagline: 'Affordable, design-conscious home tech for small spaces.',
    defaultQuery: 'Affordable home decor for small apartments',
    profile: {
      id: 'brand_smart_home',
      industries: ['Home', 'Phones & Electronics'],
      target_audience: {
        gender: 'FEMALE',
        age_ranges: ['25-34', '35-44'],
      },
      gmv: 425000,
    },
  },
  {
    id: 'brand_mobile_ecosystem',
    label: 'Mobile Ecosystem',
    tagline: 'Premium phone accessories, ecosystem loyalty, and upgrade culture.',
    defaultQuery: 'Premium iPhone accessories and ecosystem lifestyle creators',
    profile: {
      id: 'brand_mobile_ecosystem',
      industries: ['Phones & Electronics'],
      target_audience: {
        gender: 'FEMALE',
        age_ranges: ['18-24', '25-34'],
      },
      gmv: 950000,
    },
  },
  {
    id: 'brand_outdoor_gear',
    label: 'Outdoor Gear',
    tagline: 'Performance-led gear for trails, camping, and rugged adventure.',
    defaultQuery: 'Outdoor creators who drive performance gear purchases',
    profile: {
      id: 'brand_outdoor_gear',
      industries: ['Sports & Outdoors', 'Tools & Hardware'],
      target_audience: {
        gender: 'MALE',
        age_ranges: ['25-34', '35-44'],
      },
      gmv: 380000,
    },
  },
  {
    id: 'brand_beauty_studio',
    label: 'Beauty Studio',
    tagline: 'Premium beauty education with strong conversion potential.',
    defaultQuery: 'Beauty creators with tutorial authority and premium product fit',
    profile: {
      id: 'brand_beauty_studio',
      industries: ['Beauty'],
      target_audience: {
        gender: 'FEMALE',
        age_ranges: ['18-24', '25-34', '35-44'],
      },
      gmv: 510000,
    },
  },
  {
    id: 'brand_pet_wellness',
    label: 'Pet Wellness',
    tagline: 'Trusted pet-first creators with education and loyalty potential.',
    defaultQuery: 'Pet creators who build trust and repeat purchase behavior',
    profile: {
      id: 'brand_pet_wellness',
      industries: ['Pet'],
      target_audience: {
        gender: 'FEMALE',
        age_ranges: ['25-34', '35-44'],
      },
      gmv: 270000,
    },
  },
  {
    id: 'brand_family_play',
    label: 'Family Play',
    tagline: 'Toy and hobby creators for family-safe, commerce-driven storytelling.',
    defaultQuery: 'Toy and hobby creators for family-focused product launches',
    profile: {
      id: 'brand_family_play',
      industries: ['Toys & Hobbies', 'Baby & Maternity'],
      target_audience: {
        gender: 'FEMALE',
        age_ranges: ['25-34', '35-44'],
      },
      gmv: 300000,
    },
  },
  {
    id: 'brand_wellness_kitchen',
    label: 'Wellness Kitchen',
    tagline: 'Healthy food and lifestyle creators who convert with utility.',
    defaultQuery: 'Healthy kitchen and wellness creators with strong purchase intent',
    profile: {
      id: 'brand_wellness_kitchen',
      industries: ['Food & Beverage', 'Health'],
      target_audience: {
        gender: 'FEMALE',
        age_ranges: ['25-34', '35-44'],
      },
      gmv: 460000,
    },
  },
  {
    id: 'brand_modern_workspace',
    label: 'Modern Workspace',
    tagline: 'Productivity and office-tech creators for design-led work setups.',
    defaultQuery: 'Office and productivity creators for modern workspace products',
    profile: {
      id: 'brand_modern_workspace',
      industries: ['Computer & Office Equipment', 'Home'],
      target_audience: {
        gender: 'MALE',
        age_ranges: ['25-34', '35-44', '45-54'],
      },
      gmv: 540000,
    },
  },
];

export const brandProfiles: Record<string, BrandProfile> = Object.fromEntries(
  brandProfileCatalog.map((entry) => [entry.id, entry.profile])
) as Record<string, BrandProfile>;

export function getBrandProfile(id: string): BrandProfile {
  const profile = brandProfiles[id];
  if (!profile) {
    throw new Error(`Unknown brand profile "${id}".`);
  }

  return profile;
}

export function getBrandProfileDetail(id: string): BrandProfileDetail {
  const detail = brandProfileCatalog.find((entry) => entry.id === id);
  if (!detail) {
    throw new Error(`Unknown brand profile "${id}".`);
  }

  return detail;
}
