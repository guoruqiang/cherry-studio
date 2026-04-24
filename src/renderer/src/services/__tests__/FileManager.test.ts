import db from '@renderer/databases'
import type { FileMetadata } from '@renderer/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@logger', () => ({
  loggerService: {
    withContext: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    }))
  }
}))

vi.mock('@renderer/databases', () => ({
  default: {
    files: {
      get: vi.fn(),
      update: vi.fn(),
      add: vi.fn(),
      delete: vi.fn()
    }
  }
}))

vi.mock('@renderer/i18n', () => ({
  default: {
    t: vi.fn((key: string) => key)
  }
}))

vi.mock('@renderer/store', () => ({
  default: {
    getState: vi.fn(() => ({
      runtime: {
        filesPath: '/mock/files'
      }
    }))
  }
}))

vi.mock('@renderer/utils', () => ({
  getFileDirectory: vi.fn((path: string) => path)
}))

import FileManager from '../FileManager'

describe('FileManager', () => {
  const file = {
    id: 'image-id',
    name: 'image-id.png',
    origin_name: 'image-id.png',
    path: '/mock/files/image-id.png',
    created_at: new Date().toISOString(),
    size: 100,
    ext: 'png',
    type: 'image',
    count: 1
  } as FileMetadata

  beforeEach(() => {
    vi.clearAllMocks()

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        file: {
          base64File: vi.fn().mockResolvedValue({ data: 'AAAABBBB' }),
          binaryImage: vi.fn().mockResolvedValue({ data: Buffer.from('image') }),
          delete: vi.fn().mockResolvedValue(undefined)
        }
      }
    })
  })

  it('normalizes ext without a leading dot when reading base64 files', async () => {
    await FileManager.readBase64File(file)

    expect(window.api.file.base64File).toHaveBeenCalledWith('image-id.png')
  })

  it('normalizes ext without a leading dot when building stored file paths', () => {
    expect(FileManager.getFilePath(file)).toBe('/mock/files/image-id.png')
  })

  it('normalizes ext without a leading dot when deleting files', async () => {
    vi.mocked(db.files.get).mockResolvedValue(file)

    await FileManager.deleteFile(file.id)

    expect(window.api.file.delete).toHaveBeenCalledWith('image-id.png')
  })
})
