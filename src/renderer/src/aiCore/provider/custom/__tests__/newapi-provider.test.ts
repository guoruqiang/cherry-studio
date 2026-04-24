import { beforeEach, describe, expect, it, vi } from 'vitest'

const { imageModelCtor, chatModelCtor } = vi.hoisted(() => ({
  imageModelCtor: vi.fn(),
  chatModelCtor: vi.fn()
}))

vi.mock('@ai-sdk/anthropic/internal', () => ({
  AnthropicMessagesLanguageModel: class {}
}))

vi.mock('@ai-sdk/google/internal', () => ({
  GoogleGenerativeAILanguageModel: class {}
}))

vi.mock('@ai-sdk/openai/internal', () => ({
  OpenAIResponsesLanguageModel: class {
    constructor(modelId: string, config: unknown) {
      chatModelCtor(modelId, config)
    }
  }
}))

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: class {
    constructor(modelId: string, config: unknown) {
      chatModelCtor(modelId, config)
    }
  },
  OpenAICompatibleEmbeddingModel: class {},
  OpenAICompatibleImageModel: class {
    constructor(modelId: string, config: unknown) {
      imageModelCtor(modelId, config)
    }
  }
}))

vi.mock('@ai-sdk/provider-utils', () => ({
  loadApiKey: ({ apiKey }: { apiKey?: string }) => apiKey || '',
  withoutTrailingSlash: (value: string) => value.replace(/\/+$/, '')
}))

import { createNewApi } from '../newapi-provider'

describe('createNewApi image headers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not force application/json for image edits', () => {
    const provider = createNewApi({
      apiKey: 'test-key',
      baseURL: 'https://api.nwafu-ai.cn/v1',
      headers: { 'X-Test': '1' }
    })

    provider.imageModel('gpt-image-2')

    expect(imageModelCtor).toHaveBeenCalledTimes(1)
    const [, config] = imageModelCtor.mock.calls[0] as [string, { headers: () => Record<string, string> }]
    const headers = config.headers()

    expect(headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'X-Test': '1'
    })
    expect(headers).not.toHaveProperty('Content-Type')
  })

  it('keeps JSON content-type for chat-compatible requests', () => {
    const provider = createNewApi({
      apiKey: 'test-key',
      baseURL: 'https://api.nwafu-ai.cn/v1',
      endpointType: 'openai'
    })

    provider.languageModel('gpt-4o')

    expect(chatModelCtor).toHaveBeenCalledTimes(1)
    const [, config] = chatModelCtor.mock.calls[0] as [string, { headers: () => Record<string, string> }]
    expect(config.headers()['Content-Type']).toBe('application/json')
  })
})
