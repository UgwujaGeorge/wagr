import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'

loadDotenv({ path: fileURLToPath(new URL('../../.env', import.meta.url)) })
loadDotenv()
