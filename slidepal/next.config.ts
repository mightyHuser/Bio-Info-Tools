// slidepal/next.config.ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'pdfjs-dist'],
}

export default config
