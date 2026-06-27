import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/ts/**/*.test.ts']
  },
  resolve: {
    alias: {
      types: path.resolve(__dirname, 'types')
    }
  }
})
