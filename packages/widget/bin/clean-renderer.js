const { rmSync } = require('node:fs')
const { join } = require('node:path')

// Only generated renderer output, resolved relative to this package.
rmSync(join(__dirname, '..', 'dist', 'renderer'), { recursive: true, force: true })
