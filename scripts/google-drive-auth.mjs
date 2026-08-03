import crypto from 'node:crypto'
import http from 'node:http'

import { google } from 'googleapis'

const PORT = 53682
const REDIRECT_URI =
  `http://localhost:${PORT}/oauth2callback`

const CLIENT_ID =
  process.env.GOOGLE_DRIVE_CLIENT_ID

const CLIENT_SECRET =
  process.env.GOOGLE_DRIVE_CLIENT_SECRET

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    [
      'Missing Google OAuth environment variables.',
      '',
      'Add these values to .env.local:',
      'GOOGLE_DRIVE_CLIENT_ID=...',
      'GOOGLE_DRIVE_CLIENT_SECRET=...',
    ].join('\n'),
  )

  process.exit(1)
}

const oauth2Client =
  new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI,
  )

const state =
  crypto.randomBytes(32).toString('hex')

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
]

const authorizationUrl =
  oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    include_granted_scopes: true,
    prompt: 'consent',
    state,
  })

function sendHtml(
  response,
  statusCode,
  title,
  message,
) {
  response.writeHead(statusCode, {
    'Content-Type':
      'text/html; charset=utf-8',
    'Cache-Control':
      'no-store, max-age=0',
  })

  response.end(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />

        <title>${title}</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
            color: #f5f5f5;
            background:
              radial-gradient(
                circle at top,
                #262626,
                #090909 55%
              );
            font-family:
              Inter,
              system-ui,
              sans-serif;
          }

          main {
            width: min(560px, 100%);
            padding: 32px;
            border: 1px solid #3f3f46;
            border-radius: 20px;
            background: rgba(15, 15, 15, 0.92);
            box-shadow:
              0 30px 80px rgba(0, 0, 0, 0.5);
          }

          h1 {
            margin: 0 0 12px;
            font-size: 28px;
          }

          p {
            margin: 0;
            color: #b8b8b8;
            line-height: 1.7;
          }
        </style>
      </head>

      <body>
        <main>
          <h1>${title}</h1>
          <p>${message}</p>
        </main>
      </body>
    </html>
  `)
}

async function findOrCreateRootFolder(
  drive,
) {
  const existing =
    await drive.files.list({
      q: [
        "mimeType = 'application/vnd.google-apps.folder'",
        'trashed = false',
        "appProperties has { key='muscleFitnessRoot' and value='true' }",
      ].join(' and '),

      spaces: 'drive',

      fields:
        'files(id, name, webViewLink)',

      pageSize: 1,
    })

  const existingFolder =
    existing.data.files?.[0]

  if (existingFolder?.id) {
    return existingFolder
  }

  const created =
    await drive.files.create({
      requestBody: {
        name: 'Muscle Fitness Clients',

        mimeType:
          'application/vnd.google-apps.folder',

        appProperties: {
          muscleFitnessRoot: 'true',
          application:
            'muscle-fitness',
        },
      },

      fields:
        'id, name, webViewLink',
    })

  if (!created.data.id) {
    throw new Error(
      'Google Drive did not return a folder ID.',
    )
  }

  return created.data
}

const server =
  http.createServer(
    async (request, response) => {
      try {
        const requestUrl =
          new URL(
            request.url ?? '/',
            `http://localhost:${PORT}`,
          )

        if (
          requestUrl.pathname !==
          '/oauth2callback'
        ) {
          sendHtml(
            response,
            404,
            'Not found',
            'This endpoint only handles the Google OAuth callback.',
          )

          return
        }

        const returnedState =
          requestUrl.searchParams.get(
            'state',
          )

        const code =
          requestUrl.searchParams.get(
            'code',
          )

        const oauthError =
          requestUrl.searchParams.get(
            'error',
          )

        if (oauthError) {
          throw new Error(
            `Google authorization failed: ${oauthError}`,
          )
        }

        if (
          !returnedState ||
          returnedState !== state
        ) {
          throw new Error(
            'OAuth state validation failed.',
          )
        }

        if (!code) {
          throw new Error(
            'Google did not return an authorization code.',
          )
        }

        const { tokens } =
          await oauth2Client.getToken(
            code,
          )

        oauth2Client.setCredentials(
          tokens,
        )

        if (!tokens.refresh_token) {
          throw new Error(
            [
              'Google did not return a refresh token.',
              'Remove the app from your Google Account permissions,',
              'then run this script again.',
            ].join(' '),
          )
        }

        const drive =
          google.drive({
            version: 'v3',
            auth: oauth2Client,
          })

        const folder =
          await findOrCreateRootFolder(
            drive,
          )

        console.log('')
        console.log(
          '========================================',
        )
        console.log(
          'GOOGLE DRIVE CONNECTED SUCCESSFULLY',
        )
        console.log(
          '========================================',
        )
        console.log('')
        console.log(
          'Add these values to .env.local:',
        )
        console.log('')

        console.log(
          `GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`,
        )

        console.log(
          `GOOGLE_DRIVE_FOLDER_ID=${folder.id}`,
        )

        console.log('')
        console.log(
          `Folder: ${folder.name}`,
        )

        if (folder.webViewLink) {
          console.log(
            `Drive link: ${folder.webViewLink}`,
          )
        }

        console.log('')
        console.log(
          'Keep the refresh token private.',
        )
        console.log('')

        sendHtml(
          response,
          200,
          'Google Drive connected',
          'Return to the VS Code terminal and copy the generated environment variables into .env.local.',
        )
      } catch (error) {
        console.error(
          'Google Drive OAuth error:',
          error,
        )

        sendHtml(
          response,
          500,
          'Connection failed',
          error instanceof Error
            ? error.message
            : 'Unknown Google Drive OAuth error.',
        )
      } finally {
        setTimeout(() => {
          server.close()
        }, 1000)
      }
    },
  )

server.listen(
  PORT,
  '127.0.0.1',
  () => {
    console.log('')
    console.log(
      'Open this URL in your browser:',
    )
    console.log('')
    console.log(authorizationUrl)
    console.log('')
    console.log(
      'Waiting for Google authorization...',
    )
  },
)