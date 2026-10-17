import '@fontsource-variable/dm-sans';
import './globals.css';
import type { Metadata } from 'next';
import { PwaRegistration } from './pwa-registration';

export const metadata: Metadata = {
  title: 'Recipe Box',
  description: 'A local workspace for the recipes you keep.',
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
      </body>
    </html>
  );
}
