import { createCherryIn } from '@cherrystudio/ai-sdk-provider'
import { describe, expect, it } from 'vitest'

describe('createCherryIn image headers', () => {
  it('does not force application/json for image edits', () => {
    const provider = createCherryIn({
      apiKey: 'test-key',
      baseURL: 'https://api.nwafu-ai.cn/v1',
      headers: { 'X-Test': '1' }
    })

    const imageModel = provider.imageModel('gpt-image-2') as any
    const headers = imageModel.config.headers()

    expect(headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'X-Test': '1'
    })
    expect(headers).not.toHaveProperty('Content-Type')
  })

  it('keeps JSON content-type for chat requests', () => {
    const provider = createCherryIn({
      apiKey: 'test-key',
      baseURL: 'https://api.nwafu-ai.cn/v1'
    })

    const chatModel = provider.chat('gpt-4o') as any
    expect(chatModel.config.headers()['Content-Type']).toBe('application/json')
  })
})
