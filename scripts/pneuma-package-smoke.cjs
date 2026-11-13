// Launch a packaged app against disposable settings; never use an operator's library.
const { _electron: electron } = require('playwright')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
async function main() {
    const executablePath = process.argv[2]
    if (!executablePath) throw new Error('Pass the packaged Pneuma executable path')
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pneuma-package-'))
    const data = path.join(root, 'data'); fs.mkdirSync(data)
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ loaded: true, dataPath: data }))
    fs.writeFileSync(path.join(root, 'settings.json'), JSON.stringify({ initialized: true, alertUpdates: false, language: 'en' }))
    let app
    try {
        app = await electron.launch({ executablePath, args: [`--user-data-dir=${path.join(root, 'chromium')}`], env: { ...process.env, NODE_ENV: 'production', FS_MOCK_STORE_PATH: root } })
        let page
        for (let i = 0; i < 60 && !page; i++) {
            page = app.windows().find(w => w.url().includes('index.html'))
            if (!page) await new Promise(resolve => setTimeout(resolve, 500))
        }
        if (!page) throw new Error('Packaged app did not open its main window')
        await page.locator('.top').first().waitFor({ timeout: 30000 })
        const title = await page.title()
        if (title !== 'Pneuma') throw new Error(`Unexpected title: ${title}`)
        await page.screenshot({ path: 'test-output/screenshots/pneuma-packaged.png' })
        console.log('Packaged Pneuma launched successfully with isolated settings')
    } finally {
        if (app) {
            await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
            await app.close().catch(() => {})
        }
        fs.rmSync(root, { recursive: true, force: true })
    }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
