import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/site/config';

export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => `${siteConfig.url}${path}`;
  return [
    { url: url('/'), changeFrequency: 'weekly', priority: 1 },
    { url: url('/privacy'), changeFrequency: 'yearly', priority: 0.2 },
    { url: url('/terms'), changeFrequency: 'yearly', priority: 0.2 },
  ];
}
