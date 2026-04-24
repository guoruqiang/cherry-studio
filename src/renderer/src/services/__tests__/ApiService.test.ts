import type { Assistant } from '@renderer/types'
import { ChunkType } from '@renderer/types/chunk'
import { findImageBlocks } from '@renderer/utils/messageUtils/find'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGenerateImage, mockEditImage } = vi.hoisted(() => ({
  mockGenerateImage: vi.fn(),
  mockEditImage: vi.fn()
}))

vi.mock('@logger', () => ({
  loggerService: {
    withContext: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      silly: vi.fn()
    }))
  }
}))

vi.mock('@renderer/aiCore/prepareParams', () => ({
  buildStreamTextParams: vi.fn()
}))

vi.mock('@renderer/aiCore/utils/options', () => ({
  buildProviderOptions: vi.fn(() => ({}))
}))

vi.mock('@renderer/config/models', () => ({
  isDedicatedImageGenerationModel: vi.fn(() => true),
  isEmbeddingModel: vi.fn(() => false),
  isFunctionCallingModel: vi.fn(() => false)
}))

vi.mock('@renderer/hooks/useSettings', () => ({
  getStoreSetting: vi.fn()
}))

vi.mock('@renderer/i18n', () => ({
  default: {
    t: vi.fn((key: string) => key)
  }
}))

vi.mock('@renderer/store', () => ({
  default: {
    getState: vi.fn(() => ({
      llm: { providers: [] },
      mcp: { servers: [] },
      settings: {}
    }))
  }
}))

vi.mock('@renderer/store/mcp', () => ({
  hubMCPServer: {}
}))

vi.mock('@renderer/types', () => ({
  getEffectiveMcpMode: vi.fn(() => 'disabled'),
  isSystemProvider: vi.fn(() => false)
}))

vi.mock('@renderer/utils', () => ({
  removeSpecialCharactersForTopicName: vi.fn((value: string) => value),
  uuid: vi.fn(() => 'mock-uuid')
}))

vi.mock('@renderer/utils/abortController', () => ({
  abortCompletion: vi.fn(),
  readyToAbort: vi.fn()
}))

vi.mock('@renderer/utils/analytics', () => ({
  trackTokenUsage: vi.fn()
}))

vi.mock('@renderer/utils/assistant', () => ({
  isToolUseModeFunction: vi.fn(() => false),
  isPromptToolUse: vi.fn(() => false),
  isSupportedToolUse: vi.fn(() => false)
}))

vi.mock('@renderer/utils/error', () => ({
  getErrorMessage: vi.fn((error: Error) => error.message),
  isAbortError: vi.fn(() => false)
}))

vi.mock('@renderer/utils/markdown', () => ({
  purifyMarkdownImages: vi.fn((value: string) => value)
}))

vi.mock('@renderer/utils/messageUtils/find', () => ({
  findFileBlocks: vi.fn(() => []),
  findImageBlocks: vi.fn(() => []),
  getMainTextContent: vi.fn(() => 'draw a dog')
}))

vi.mock('@renderer/utils/prompt', () => ({
  containsSupportedVariables: vi.fn(() => false),
  replacePromptVariables: vi.fn(async (value: string) => value)
}))

vi.mock('@renderer/utils/provider', () => ({
  NOT_SUPPORT_API_KEY_PROVIDER_TYPES: [],
  NOT_SUPPORT_API_KEY_PROVIDERS: []
}))

vi.mock('../../aiCore', () => ({
  AiProvider: vi.fn().mockImplementation(() => ({
    generateImage: mockGenerateImage,
    editImage: mockEditImage
  }))
}))

vi.mock('../AssistantService', () => ({
  getDefaultAssistant: vi.fn(),
  getDefaultModel: vi.fn(() => ({
    id: 'gpt-image-2',
    name: 'gpt-image-2',
    provider: 'nwafuer',
    group: 'images'
  })),
  getProviderByModel: vi.fn(() => ({
    id: 'nwafuer',
    type: 'openai',
    apiKey: 'test-key',
    apiHost: 'https://api.nwafu-ai.cn',
    name: 'NWAFUER',
    models: []
  })),
  getQuickModel: vi.fn()
}))

vi.mock('../ConversationService', () => ({
  ConversationService: {
    prepareMessagesForModel: vi.fn()
  }
}))

vi.mock('../FileManager', () => ({
  default: {
    readBase64File: vi.fn()
  }
}))

vi.mock('../KnowledgeService', () => ({
  injectUserMessageWithKnowledgeSearchPrompt: vi.fn()
}))

import { fetchImageGeneration } from '../ApiService'
import FileManager from '../FileManager'

describe('ApiService.fetchImageGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateImage.mockResolvedValue(['https://example.com/dog.png'])
    mockEditImage.mockResolvedValue(['https://example.com/edited-dog.png'])
    vi.mocked(findImageBlocks).mockReturnValue([])
  })

  it('emits BLOCK_COMPLETE so dedicated image generations can leave loading state', async () => {
    const assistant = {
      id: 'assistant-1',
      name: 'NWAFUER',
      prompt: '',
      topics: [],
      type: 'assistant',
      model: {
        id: 'gpt-image-2',
        name: 'gpt-image-2',
        provider: 'nwafuer',
        group: 'images'
      }
    } as Assistant

    const chunks: { type: ChunkType; response?: any; image?: any }[] = []

    await fetchImageGeneration({
      messages: [{ id: 'user-1', role: 'user' } as any],
      assistant,
      onChunkReceived: (chunk) => chunks.push(chunk as { type: ChunkType; response?: any; image?: any })
    })

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      ChunkType.LLM_RESPONSE_CREATED,
      ChunkType.IMAGE_CREATED,
      ChunkType.IMAGE_COMPLETE,
      ChunkType.BLOCK_COMPLETE,
      ChunkType.LLM_RESPONSE_COMPLETE
    ])

    expect(chunks[2]?.image).toEqual({
      type: 'url',
      images: ['https://example.com/dog.png']
    })
    expect(chunks[3]?.response).toMatchObject({
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    })
    expect(chunks[4]?.response).toEqual(chunks[3]?.response)
  })

  it('prefers assistant image files over file URLs when editing generated images', async () => {
    const assistant = {
      id: 'assistant-1',
      name: 'NWAFUER',
      prompt: '',
      topics: [],
      type: 'assistant',
      model: {
        id: 'gpt-image-2',
        name: 'gpt-image-2',
        provider: 'nwafuer',
        group: 'images'
      }
    } as Assistant

    const savedImageFile = {
      id: 'generated-image',
      name: 'generated-image.png',
      origin_name: 'generated-image.png',
      path: '/mock/path/generated-image.png',
      size: 100,
      ext: '.png',
      type: 'image',
      created_at: new Date().toISOString(),
      count: 1
    } as const

    vi.mocked(findImageBlocks).mockImplementation((message: any) => {
      if (message.id === 'assistant-previous') {
        return [{ file: savedImageFile, url: 'file:///mock/path/generated-image.png' }] as any
      }
      return []
    })
    vi.mocked(FileManager.readBase64File).mockResolvedValue('AAAABBBB')

    await fetchImageGeneration({
      messages: [{ id: 'assistant-previous', role: 'assistant' } as any, { id: 'user-1', role: 'user' } as any],
      assistant,
      onChunkReceived: vi.fn()
    })

    expect(FileManager.readBase64File).toHaveBeenCalledWith(savedImageFile)
    expect(mockEditImage).toHaveBeenCalledWith({
      model: 'gpt-image-2',
      prompt: 'draw a dog',
      inputImages: ['data:image/png;base64,AAAABBBB'],
      imageSize: '1024x1024'
    })
    expect(mockGenerateImage).not.toHaveBeenCalled()
  })
})
