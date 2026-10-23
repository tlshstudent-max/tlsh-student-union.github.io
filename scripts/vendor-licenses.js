import { readFile, writeFile } from 'node:fs/promises';
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const licenses = [];
for (const [path, metadata] of Object.entries(lock.packages)) {
    if (!path || metadata.dev) continue;
    const pkg = JSON.parse(await readFile(`${path}/package.json`, 'utf8'));
    let license;
    for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE-MIT', 'license', 'license.md']) {
        try { license = await readFile(`${path}/${name}`, 'utf8'); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (!license) throw new Error(`Missing license for ${pkg.name}; inspect it before distributing the bundle.`);
    licenses.push(`${pkg.name} ${pkg.version}\n${'='.repeat(60)}\n${license.trim()}\n`);
}
await writeFile('vendor/THIRD_PARTY_LICENSES.txt', licenses.join('\n'));
