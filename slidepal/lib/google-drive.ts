import { google } from 'googleapis'

export type DriveFile = {
  id: string
  name: string
  modifiedTime: string
  size: string
}

export async function listPdfFiles(accessToken: string, folderId?: string): Promise<DriveFile[]> {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  const drive = google.drive({ version: 'v3', auth })

  const query = folderId
    ? `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`
    : `mimeType='application/pdf' and trashed=false`

  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name, modifiedTime, size)',
    orderBy: 'modifiedTime desc',
    pageSize: 50,
  })

  return (res.data.files ?? []) as DriveFile[]
}

export async function getPdfStream(accessToken: string, fileId: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  const drive = google.drive({ version: 'v3', auth })

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  )
  return res.data
}
