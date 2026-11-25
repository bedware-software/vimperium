// electron-builder afterPack hook: gives a `--dir` mac build (scripts/prod-iter.sh) its app-update.yml.
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// electron-builder writes app-update.yml on mac only when a dmg or zip target is built.
// Without the file every update check dies with ENOENT before it reaches GitHub.
// Must stay an afterPack hook: a file added after signing breaks the bundle's seal.
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const file = join(context.packager.getResourcesDir(context.appOutDir), 'app-update.yml')
  if (existsSync(file)) return
  const publish = [context.packager.config.publish].flat()[0]
  if (publish?.provider !== 'github') throw new Error('after-pack: expected a github publish config')
  writeFileSync(
    file,
    `owner: ${publish.owner}\nrepo: ${publish.repo}\nprovider: github\n` +
      `updaterCacheDirName: ${context.packager.appInfo.updaterCacheDirName}\n`
  )
}
