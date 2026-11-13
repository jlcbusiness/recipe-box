import '@fontsource-variable/dm-sans';
import 'react-advanced-cropper/dist/style.css';
import './globals.css';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata } from 'next';
import { appVersion } from '../lib/app-version';
import { PwaRegistration } from './pwa-registration';

export const metadata: Metadata = {
  title: 'Recipe Box',
  description: 'A local workspace for the recipes you keep.',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PwaRegistration />
        {children}
        <SpeedInsights />
        <footer aria-label="Application version" className="app-version-footer" role="contentinfo">
          Recipe Box v{appVersion}
        </footer>
      </body>
    </html>
  );
}
