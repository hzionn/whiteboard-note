import type { Metadata } from 'next';
import React from 'react';
import { Analytics } from '@vercel/analytics/next';

import '@/styles/index.css';
import 'katex/dist/katex.min.css';

export const metadata: Metadata = {
  title: 'whiteboard-note',
  description: 'Markdown whiteboard notes with AI assistance.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
