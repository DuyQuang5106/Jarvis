import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Personal AI Workspace',
    short_name: 'Personal AI',
    description: 'Không gian làm việc cá nhân có AI.',
    display: 'standalone',
    start_url: '/chat',
    scope: '/',
    background_color: '#111827',
    theme_color: '#111827',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
