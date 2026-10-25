import { StoryStore } from './store.mjs'
import { createStoryServer } from './app.mjs'

const port = Number(process.env.PORT ?? 8787)
const store = new StoryStore({ filename: process.env.DATABASE_PATH ?? 'server/data/zavod.db' })
const server = createStoryServer(store)
const councilTimer = setInterval(() => store.resolveDueCouncil(), 30_000)
server.listen(port, '0.0.0.0', () => console.log(`ZAVOD story API listening on http://0.0.0.0:${port}`))

const shutdown = () => {
  clearInterval(councilTimer)
  server.close(() => { store.close(); process.exit(0) })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

