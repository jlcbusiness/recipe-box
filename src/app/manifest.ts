import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Recipe Box',
    short_name: 'Recipe Box',
    description: 'A private library for the recipes you keep.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#faf7eb',
    theme_color: '#386044',
    icons: [
      { src: '/icons/recipe-box-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/recipe-box-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
