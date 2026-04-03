import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

async function refreshAccessToken(token: any) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type:    'refresh_token',
      refresh_token: token.refreshToken,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'refresh failed')
  return {
    ...token,
    accessToken:          data.access_token,
    accessTokenExpiresAt: Date.now() + data.expires_in * 1000,
    refreshToken:         data.refresh_token ?? token.refreshToken,
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/drive.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // 初回ログイン時にトークンを保存
      if (account) {
        return {
          ...token,
          accessToken:          account.access_token,
          accessTokenExpiresAt: account.expires_at ? account.expires_at * 1000 : Date.now() + 3600_000,
          refreshToken:         account.refresh_token,
        }
      }
      // アクセストークンがまだ有効なら何もしない（5分余裕を持たせる）
      if (Date.now() < (token.accessTokenExpiresAt as number) - 300_000) {
        return token
      }
      // 期限切れ → リフレッシュ
      try {
        return await refreshAccessToken(token)
      } catch {
        return { ...token, error: 'RefreshAccessTokenError' }
      }
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken
      ;(session as any).error      = token.error
      return session
    },
  },
}
