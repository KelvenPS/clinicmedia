import { Router } from 'express'
import { getAppVersion, getBuildDate } from '../lib/app-version'

const router = Router()

router.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
  res.json({
    version: getAppVersion(),
    buildDate: getBuildDate(),
    environment: process.env.NODE_ENV || 'development',
  })
})

export default router
