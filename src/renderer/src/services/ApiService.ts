/**
 * 鑱岃矗锛氭彁渚涘師瀛愬寲鐨勩€佹棤鐘舵€佺殑API璋冪敤鍑芥暟
 */
import { loggerService } from '@logger'
import { buildStreamTextParams } from '@renderer/aiCore/prepareParams'
import type { AiSdkMiddlewareConfig } from '@renderer/aiCore/types/middlewareConfig'
import { buildProviderOptions } from '@renderer/aiCore/utils/options'
import { isDedicatedImageGenerationModel, isEmbeddingModel, isFunctionCallingModel } from '@renderer/config/models'
import { getStoreSetting } from '@renderer/hooks/useSettings'
import i18n from '@renderer/i18n'
import store from '@renderer/store'
import { hubMCPServer } from '@renderer/store/mcp'
import type { Assistant, FileMetadata, MCPServer, MCPTool, Model, Provider } from '@renderer/types'
import { type FetchChatCompletionParams, getEffectiveMcpMode, isSystemProvider } from '@renderer/types'
import type { StreamTextParams } from '@renderer/types/aiCoreTypes'
import { type Chunk, ChunkType } from '@renderer/types/chunk'
import type { Message, ResponseError } from '@renderer/types/newMessage'
import { removeSpecialCharactersForTopicName, uuid } from '@renderer/utils'
import { abortCompletion, readyToAbort } from '@renderer/utils/abortController'
import { trackTokenUsage } from '@renderer/utils/analytics'
import { isToolUseModeFunction } from '@renderer/utils/assistant'
import { isPromptToolUse, isSupportedToolUse } from '@renderer/utils/assistant'
import { getErrorMessage, isAbortError } from '@renderer/utils/error'
import { purifyMarkdownImages } from '@renderer/utils/markdown'
import { findFileBlocks, findImageBlocks, getMainTextContent } from '@renderer/utils/messageUtils/find'
import { containsSupportedVariables, replacePromptVariables } from '@renderer/utils/prompt'
import { NOT_SUPPORT_API_KEY_PROVIDER_TYPES, NOT_SUPPORT_API_KEY_PROVIDERS } from '@renderer/utils/provider'
import { isEmpty, takeRight } from 'lodash'
import mime from 'mime'

import type { AiProviderConfig } from '../aiCore'
import { AiProvider } from '../aiCore'
import {
  // getAssistantProvider,
  // getAssistantSettings,
  getDefaultAssistant,
  getDefaultModel,
  getProviderByModel,
  getQuickModel
} from './AssistantService'
import { ConversationService } from './ConversationService'
import FileManager from './FileManager'
import { injectUserMessageWithKnowledgeSearchPrompt } from './KnowledgeService'
import type { BlockManager } from './messageStreaming'
import type { StreamProcessorCallbacks } from './StreamProcessingService'
// import { processKnowledgeSearch } from './KnowledgeService'
// import {
//   filterContextMessages,
//   filterEmptyMessages,
//   filterUsefulMessages,
//   filterUserRoleStartMessages
// } from './MessagesService'
// import WebSearchService from './WebSearchService'

// FIXME: 杩欓噷澶閲嶅閫昏緫锛岄渶瑕侀噸鏋?
const logger = loggerService.withContext('ApiService')
const SUMMARY_REQUEST_TIMEOUT_MS = 15_000

/**
 * Get the MCP servers to use based on the assistant's MCP mode.
 */
export function getMcpServersForAssistant(assistant: Assistant): MCPServer[] {
  const mode = getEffectiveMcpMode(assistant)
  const allMcpServers = store.getState().mcp.servers || []
  const activedMcpServers = allMcpServers.filter((s) => s.isActive)

  switch (mode) {
    case 'disabled':
      return []
    case 'auto':
      return [hubMCPServer]
    case 'manual': {
      const assistantMcpServers = assistant.mcpServers || []
      return activedMcpServers.filter((server) => assistantMcpServers.some((s) => s.id === server.id))
    }
    default:
      return []
  }
}

export async function fetchAllActiveServerTools(): Promise<MCPTool[]> {
  const allMcpServers = store.getState().mcp.servers || []
  const activedMcpServers = allMcpServers.filter((s) => s.isActive)

  if (activedMcpServers.length === 0) {
    return []
  }

  try {
    const toolPromises = activedMcpServers.map(async (mcpServer: MCPServer) => {
      try {
        const tools = await window.api.mcp.listTools(mcpServer)
        return tools.filter((tool: any) => !mcpServer.disabledTools?.includes(tool.name))
      } catch (error) {
        logger.error(`Error fetching tools from MCP server ${mcpServer.name}:`, error as Error)
        return []
      }
    })
    const results = await Promise.allSettled(toolPromises)
    return results
      .filter((result): result is PromiseFulfilledResult<MCPTool[]> => result.status === 'fulfilled')
      .map((result) => result.value)
      .flat()
  } catch (toolError) {
    logger.error('Error fetching all active server tools:', toolError as Error)
    return []
  }
}

export async function fetchMcpTools(assistant: Assistant) {
  let mcpTools: MCPTool[] = []
  const enabledMCPs = getMcpServersForAssistant(assistant)

  if (enabledMCPs && enabledMCPs.length > 0) {
    try {
      const toolPromises = enabledMCPs.map(async (mcpServer: MCPServer) => {
        try {
          const tools = await window.api.mcp.listTools(mcpServer)
          return tools.filter((tool: any) => !mcpServer.disabledTools?.includes(tool.name))
        } catch (error) {
          logger.error(`Error fetching tools from MCP server ${mcpServer.name}:`, error as Error)
          return []
        }
      })
      const results = await Promise.allSettled(toolPromises)
      mcpTools = results
        .filter((result): result is PromiseFulfilledResult<MCPTool[]> => result.status === 'fulfilled')
        .map((result) => result.value)
        .flat()
    } catch (toolError) {
      logger.error('Error fetching MCP tools:', toolError as Error)
    }
  }
  return mcpTools
}

/**
 * 灏嗙敤鎴锋秷鎭浆鎹负LLM鍙互鐞嗚В鐨勬牸寮忓苟鍙戦€佽姹? * @param request - 鍖呭惈娑堟伅鍐呭鍜屽姪鎵嬩俊鎭殑璇锋眰瀵硅薄
 * @param onChunkReceived - 鎺ユ敹娴佸紡鍝嶅簲鏁版嵁鐨勫洖璋冨嚱鏁? */
// 鐩墠鍏堟寜鐓у嚱鏁版潵鍐?鍚庣画濡傛灉鏈夐渶瑕佸埌class鐨勫湴鏂瑰氨鏀瑰洖鏉?export async function transformMessagesAndFetch(
export async function transformMessagesAndFetch(
  request: {
    messages: Message[]
    assistant: Assistant
    blockManager: BlockManager
    assistantMsgId: string
    callbacks: StreamProcessorCallbacks
    topicId?: string // 娣诲姞 topicId 鐢ㄤ簬 trace
    allowedTools?: string[]
    options: {
      signal?: AbortSignal
      timeout?: number
      headers?: Record<string, string>
    }
  },
  onChunkReceived: (chunk: Chunk) => void
) {
  const { messages, assistant } = request

  try {
    const { modelMessages, uiMessages } = await ConversationService.prepareMessagesForModel(messages, assistant)

    // replace prompt variables
    assistant.prompt = await replacePromptVariables(assistant.prompt, assistant.model?.name)

    // 涓撶敤鍥惧儚鐢熸垚妯″瀷鐩存帴璧?fetchImageGeneration
    const model = assistant.model || getDefaultModel()
    if (isDedicatedImageGenerationModel(model)) {
      await fetchImageGeneration({
        messages: uiMessages,
        assistant,
        onChunkReceived
      })
      return
    }

    // inject knowledge search prompt into model messages
    await injectUserMessageWithKnowledgeSearchPrompt({
      modelMessages,
      assistant,
      assistantMsgId: request.assistantMsgId,
      topicId: request.topicId,
      blockManager: request.blockManager,
      setCitationBlockId: request.callbacks.setCitationBlockId!
    })

    await fetchChatCompletion({
      messages: modelMessages,
      assistant: assistant,
      topicId: request.topicId,
      allowedTools: request.allowedTools,
      requestOptions: request.options,
      uiMessages,
      onChunkReceived
    })
  } catch (error: any) {
    onChunkReceived({ type: ChunkType.ERROR, error })
  }
}

/**
 * Note: This path always uses AI SDK streaming under the hood via `streamText`.
 * There is no `generateText` (non-stream) branch inside this function.
 */
export async function fetchChatCompletion({
  messages,
  prompt,
  assistant,
  requestOptions,
  onChunkReceived,
  topicId,
  uiMessages,
  allowedTools
}: FetchChatCompletionParams) {
  logger.info('fetchChatCompletion called with detailed context', {
    messageCount: messages?.length || 0,
    prompt: prompt,
    assistantId: assistant.id,
    topicId,
    hasTopicId: !!topicId,
    modelId: assistant.model?.id,
    modelName: assistant.model?.name
  })

  // Get base provider and apply API key rotation
  // NOTE: Shallow copy is intentional. Provider objects are not mutated by downstream code.
  // Nested properties (if any) are never modified after creation.
  const baseProvider = getProviderByModel(assistant.model || getDefaultModel())
  const providerWithRotatedKey = {
    ...baseProvider,
    apiKey: getRotatedApiKey(baseProvider)
  }

  const AI = new AiProvider(assistant.model || getDefaultModel(), providerWithRotatedKey)
  const provider = AI.getActualProvider()

  const mcpTools: MCPTool[] = []
  onChunkReceived({ type: ChunkType.LLM_RESPONSE_CREATED })

  if (isPromptToolUse(assistant) || isSupportedToolUse(assistant)) {
    mcpTools.push(...(await fetchMcpTools(assistant)))
  }
  if (prompt) {
    messages = [
      {
        role: 'user',
        content: prompt
      }
    ]
  }

  // 浣跨敤 transformParameters 妯″潡鏋勫缓鍙傛暟
  const {
    params: aiSdkParams,
    modelId,
    capabilities,
    webSearchPluginConfig
  } = await buildStreamTextParams(messages, assistant, provider, {
    mcpTools: mcpTools,
    allowedTools,
    webSearchProviderId: assistant.webSearchProviderId,
    requestOptions
  })

  // Safely fallback to prompt tool use when function calling is not supported by model.
  const usePromptToolUse =
    isPromptToolUse(assistant) || (isToolUseModeFunction(assistant) && !isFunctionCallingModel(assistant.model))

  const mcpMode = getEffectiveMcpMode(assistant)
  const middlewareConfig: AiSdkMiddlewareConfig = {
    streamOutput: assistant.settings?.streamOutput ?? true,
    onChunk: onChunkReceived,
    enableReasoning: capabilities.enableReasoning,
    isPromptToolUse: usePromptToolUse,
    isSupportedToolUse: isSupportedToolUse(assistant),
    webSearchPluginConfig: webSearchPluginConfig,
    enableWebSearch: capabilities.enableWebSearch,
    enableGenerateImage: capabilities.enableGenerateImage,
    enableUrlContext: capabilities.enableUrlContext,
    mcpMode,
    mcpTools,
    uiMessages,
    knowledgeRecognition: assistant.knowledgeRecognition
  }

  // Wrap onChunkReceived to automatically track token usage on completion
  const originalOnChunk = middlewareConfig.onChunk
  middlewareConfig.onChunk = (chunk: Chunk) => {
    if (chunk.type === ChunkType.BLOCK_COMPLETE) {
      trackTokenUsage({ usage: chunk.response?.usage, model: assistant?.model, source: 'chat' })
    }
    originalOnChunk?.(chunk)
  }

  // --- Call AI Completions ---
  await AI.completions(modelId, aiSdkParams, {
    ...middlewareConfig,
    assistant,
    topicId,
    callType: 'chat',
    uiMessages
  })
}

/**
 * Collect input images for image edits from the latest user and assistant messages.
 */
async function collectImagesFromMessages(userMessage: Message, assistantMessage?: Message): Promise<string[]> {
  const images: string[] = []

  const userImageBlocks = findImageBlocks(userMessage)
  for (const block of userImageBlocks) {
    if (!block.file) {
      continue
    }

    const base64 = await FileManager.readBase64File(block.file)
    images.push(toBase64ImageDataUrl(block.file, base64))
  }

  if (assistantMessage) {
    const assistantImageBlocks = findImageBlocks(assistantMessage)
    for (const block of assistantImageBlocks) {
      if (block.file) {
        const base64 = await FileManager.readBase64File(block.file)
        images.push(toBase64ImageDataUrl(block.file, base64))
        continue
      }

      if (block.url && isDirectImageInput(block.url)) {
        images.push(block.url)
      }
    }
  }

  return images
}

function toBase64ImageDataUrl(file: FileMetadata, base64: string): string {
  const mimeType = mime.getType(file.path || file.name || `${file.id}${file.ext}`) || 'image/png'
  return `data:${mimeType};base64,${base64}`
}

function isDirectImageInput(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')
}

/**
 * 鐙珛鐨勫浘鍍忕敓鎴愬嚱鏁? * 涓撶敤浜?DALL-E銆丟PT-Image-1 绛変笓鐢ㄥ浘鍍忕敓鎴愭ā鍨? */
export async function fetchImageGeneration({
  messages,
  assistant,
  onChunkReceived
}: {
  messages: Message[]
  assistant: Assistant
  onChunkReceived: (chunk: Chunk) => void
}) {
  // 鍒涘缓 AI provider
  const baseProvider = getProviderByModel(assistant.model || getDefaultModel())
  const providerWithRotatedKey = {
    ...baseProvider,
    apiKey: getRotatedApiKey(baseProvider)
  }
  const aiProvider = new AiProvider(assistant.model || getDefaultModel(), providerWithRotatedKey)

  onChunkReceived({ type: ChunkType.LLM_RESPONSE_CREATED })
  onChunkReceived({ type: ChunkType.IMAGE_CREATED })

  const startTime = Date.now()

  try {
    // 鎻愬彇 prompt 鍜屽浘鍍?    const lastUserMessage = messages.findLast((m) => m.role === 'user')
    const lastUserMessage = messages.findLast((m) => m.role === 'user')
    const lastAssistantMessage = messages.findLast((m) => m.role === 'assistant')

    if (!lastUserMessage) {
      throw new Error('No user message found for image generation.')
    }

    const prompt = getMainTextContent(lastUserMessage)
    const inputImages = await collectImagesFromMessages(lastUserMessage, lastAssistantMessage)

    // 璋冪敤 generateImage 鎴?editImage
    // 浣跨敤榛樿鍥惧儚鐢熸垚閰嶇疆
    const imageSize = '1024x1024'
    const batchSize = 1

    let images: string[]
    if (inputImages.length > 0) {
      images = await aiProvider.editImage({
        model: assistant.model!.id,
        prompt: prompt || '',
        inputImages,
        imageSize
      })
    } else {
      images = await aiProvider.generateImage({
        model: assistant.model!.id,
        prompt: prompt || '',
        imageSize,
        batchSize
      })
    }

    // 鍙戦€佺粨鏋?chunks
    const imageType = images[0]?.startsWith('data:') ? 'base64' : 'url'
    onChunkReceived({
      type: ChunkType.IMAGE_COMPLETE,
      image: { type: imageType, images }
    })

    const response = {
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      metrics: {
        completion_tokens: 0,
        time_first_token_millsec: 0,
        time_completion_millsec: Date.now() - startTime
      }
    }

    // Dedicated image generation should follow the same completion contract as
    // streamed chat so the assistant message can transition out of loading.
    onChunkReceived({
      type: ChunkType.BLOCK_COMPLETE,
      response
    })

    onChunkReceived({
      type: ChunkType.LLM_RESPONSE_COMPLETE,
      response
    })
  } catch (error) {
    onChunkReceived({ type: ChunkType.ERROR, error: error as Error })
    throw error
  }
}

export async function fetchMessagesSummary({
  messages
}: {
  messages: Message[]
}): Promise<{ text: string | null; error?: string }> {
  let prompt = getStoreSetting('topicNamingPrompt') || i18n.t('prompts.title')
  const model = getQuickModel()

  if (prompt && containsSupportedVariables(prompt)) {
    prompt = await replacePromptVariables(prompt, model.name)
  }

  // 鎬荤粨涓婁笅鏂囨€绘槸鍙栨渶鍚?鏉℃秷鎭?  const contextMessages = takeRight(messages, 5)
  const contextMessages = takeRight(messages, 5)
  const provider = getProviderByModel(model)

  if (!hasApiKey(provider)) {
    return { text: null, error: i18n.t('error.no_api_key') }
  }

  // Apply API key rotation
  // NOTE: Shallow copy is intentional. Provider objects are not mutated by downstream code.
  // Nested properties (if any) are never modified after creation.
  const providerWithRotatedKey = {
    ...provider,
    apiKey: getRotatedApiKey(provider)
  }

  const AI = new AiProvider(model, providerWithRotatedKey)
  const actualProvider = AI.getActualProvider()

  const topicId = messages?.find((message) => message.topicId)?.topicId || ''

  // LLM瀵瑰鏉℃秷鎭殑鎬荤粨鏈夐棶棰橈紝鐢ㄥ崟鏉＄粨鏋勫寲鐨勬秷鎭〃绀轰細璇濆唴瀹逛細鏇村ソ
  const structredMessages = contextMessages.map((message) => {
    const structredMessage = {
      role: message.role,
      mainText: purifyMarkdownImages(getMainTextContent(message))
    }

    // 璁㎜LM鐭ラ亾娑堟伅涓寘鍚殑鏂囦欢锛屼絾鍙彁渚涙枃浠跺悕
    // 瀵瑰姪鎵嬫秷鎭€岃█锛屾病鏈夋彁渚涘伐鍏疯皟鐢ㄧ粨鏋滅瓑鏇村淇℃伅锛屼粎鎻愪緵鏂囨湰涓婁笅鏂囥€?    const fileBlocks = findFileBlocks(message)
    const fileBlocks = findFileBlocks(message)
    let fileList: Array<string> = []
    if (fileBlocks.length && fileBlocks.length > 0) {
      fileList = fileBlocks.map((fileBlock) => fileBlock.file.origin_name)
    }
    return {
      ...structredMessage,
      files: fileList.length > 0 ? fileList : undefined
    }
  })
  const conversation = JSON.stringify(structredMessages)

  const defaultAssistant = getDefaultAssistant()
  const summaryAssistant = {
    ...defaultAssistant,
    settings: {
      ...defaultAssistant.settings,
      reasoning_effort: 'none',
      qwenThinkMode: false
    },
    prompt,
    model
  } satisfies Assistant

  const { providerOptions, standardParams } = buildProviderOptions(summaryAssistant, model, actualProvider, {
    enableReasoning: false,
    enableWebSearch: false,
    enableGenerateImage: false
  })

  const llmMessages = {
    system: prompt,
    prompt: conversation,
    providerOptions,
    ...standardParams,
    abortSignal: AbortSignal.timeout(SUMMARY_REQUEST_TIMEOUT_MS),
    maxRetries: 0
  }

  const middlewareConfig: AiSdkMiddlewareConfig = {
    streamOutput: false,
    enableReasoning: false,
    isPromptToolUse: false,
    isSupportedToolUse: false,
    enableWebSearch: false,
    enableGenerateImage: false,
    enableUrlContext: false,
    mcpTools: []
  }
  try {
    // 浠?messages 涓壘鍒版湁 traceId 鐨勫姪鎵嬫秷鎭紝鐢ㄤ簬缁戝畾鐜版湁 trace
    const messageWithTrace = messages.find((m) => m.role === 'assistant' && m.traceId)

    if (messageWithTrace && messageWithTrace.traceId) {
      // 瀵煎叆骞惰皟鐢?appendTrace 鏉ョ粦瀹氱幇鏈?trace锛屼紶鍏ummary浣跨敤鐨勬ā鍨嬪悕
      const { appendTrace } = await import('@renderer/services/SpanManagerService')
      await appendTrace({ topicId, traceId: messageWithTrace.traceId, model })
    }

    const { getText, usage } = await AI.completions(model.id, llmMessages, {
      ...middlewareConfig,
      assistant: summaryAssistant,
      topicId,
      callType: 'summary'
    })

    trackTokenUsage({ usage, model })

    const text = getText()
    const result = removeSpecialCharactersForTopicName(text)
    return result ? { text: result } : { text: null, error: i18n.t('error.no_response') }
  } catch (error: unknown) {
    return { text: null, error: getErrorMessage(error) }
  }
}

export async function fetchNoteSummary({ content, assistant }: { content: string; assistant?: Assistant }) {
  let prompt = getStoreSetting('topicNamingPrompt') || i18n.t('prompts.title')
  const resolvedAssistant = assistant || getDefaultAssistant()
  const model = getQuickModel() || resolvedAssistant.model || getDefaultModel()

  if (prompt && containsSupportedVariables(prompt)) {
    prompt = await replacePromptVariables(prompt, model.name)
  }

  const provider = getProviderByModel(model)

  if (!hasApiKey(provider)) {
    return null
  }

  // Apply API key rotation
  // NOTE: Shallow copy is intentional. Provider objects are not mutated by downstream code.
  // Nested properties (if any) are never modified after creation.
  const providerWithRotatedKey = {
    ...provider,
    apiKey: getRotatedApiKey(provider)
  }

  const AI = new AiProvider(model, providerWithRotatedKey)

  // only 2000 char and no images
  const truncatedContent = content.substring(0, 2000)
  const purifiedContent = purifyMarkdownImages(truncatedContent)

  const summaryAssistant = {
    ...resolvedAssistant,
    settings: {
      ...resolvedAssistant.settings,
      reasoning_effort: undefined,
      qwenThinkMode: false
    },
    prompt,
    model
  }

  const llmMessages = {
    system: prompt,
    prompt: purifiedContent,
    abortSignal: AbortSignal.timeout(SUMMARY_REQUEST_TIMEOUT_MS),
    maxRetries: 0
  }

  const middlewareConfig: AiSdkMiddlewareConfig = {
    streamOutput: false,
    enableReasoning: false,
    isPromptToolUse: false,
    isSupportedToolUse: false,
    enableWebSearch: false,
    enableGenerateImage: false,
    enableUrlContext: false,
    mcpTools: []
  }

  try {
    const { getText, usage } = await AI.completions(model.id, llmMessages, {
      ...middlewareConfig,
      assistant: summaryAssistant,
      callType: 'summary'
    })

    trackTokenUsage({ usage, model })

    const text = getText()
    return removeSpecialCharactersForTopicName(text) || null
  } catch (error: any) {
    return null
  }
}

// export async function fetchSearchSummary({ messages, assistant }: { messages: Message[]; assistant: Assistant }) {
//   const model = getQuickModel() || assistant.model || getDefaultModel()
//   const provider = getProviderByModel(model)

//   if (!hasApiKey(provider)) {
//     return null
//   }

//   const topicId = messages?.find((message) => message.topicId)?.topicId || undefined

//   const AI = new AiProvider(provider)

//   const params: CompletionsParams = {
//     callType: 'search',
//     messages: messages,
//     assistant,
//     streamOutput: false,
//     topicId
//   }

//   return await AI.completionsForTrace(params)
// }

export async function fetchGenerate({
  prompt,
  content,
  model
}: {
  prompt: string
  content: string
  model?: Model
}): Promise<string> {
  if (!model) {
    model = getDefaultModel()
  }
  const provider = getProviderByModel(model)

  if (!hasApiKey(provider)) {
    return ''
  }

  // Apply API key rotation
  // NOTE: Shallow copy is intentional. Provider objects are not mutated by downstream code.
  // Nested properties (if any) are never modified after creation.
  const providerWithRotatedKey = {
    ...provider,
    apiKey: getRotatedApiKey(provider)
  }

  const AI = new AiProvider(model, providerWithRotatedKey)

  const assistant = getDefaultAssistant()
  assistant.model = model
  assistant.prompt = prompt

  // const params: CompletionsParams = {
  //   callType: 'generate',
  //   messages: content,
  //   assistant,
  //   streamOutput: false
  // }

  const middlewareConfig: AiSdkMiddlewareConfig = {
    streamOutput: assistant.settings?.streamOutput ?? false,
    enableReasoning: false,
    isPromptToolUse: false,
    isSupportedToolUse: false,
    enableWebSearch: false,
    enableGenerateImage: false,
    enableUrlContext: false
  }

  try {
    const result = await AI.completions(
      model.id,
      {
        system: prompt,
        prompt: content
      },
      {
        ...middlewareConfig,
        assistant,
        callType: 'generate'
      }
    )

    trackTokenUsage({ usage: result.usage, model })

    return result.getText() || ''
  } catch (error: any) {
    return ''
  }
}

export function hasApiKey(provider: Provider) {
  if (!provider) return false
  if (provider.id === 'cherryai') return true
  if (
    (isSystemProvider(provider) && NOT_SUPPORT_API_KEY_PROVIDERS.includes(provider.id)) ||
    NOT_SUPPORT_API_KEY_PROVIDER_TYPES.includes(provider.type)
  )
    return true
  return !isEmpty(provider.apiKey)
}

/**
 * Get rotated API key for providers that support multiple keys
 * Returns empty string for providers that don't require API keys
 */
export function getRotatedApiKey(provider: Provider): string {
  // Handle providers that don't require API keys
  if (!provider.apiKey || provider.apiKey.trim() === '') {
    return ''
  }

  const keys = provider.apiKey
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)

  if (keys.length === 0) {
    return ''
  }

  const keyName = `provider:${provider.id}:last_used_key`

  // If only one key, return it directly
  if (keys.length === 1) {
    return keys[0]
  }

  const lastUsedKey = window.keyv.get(keyName)
  if (!lastUsedKey) {
    window.keyv.set(keyName, keys[0])
    return keys[0]
  }

  const currentIndex = keys.indexOf(lastUsedKey)

  // Log when the last used key is no longer in the list
  if (currentIndex === -1) {
    logger.debug('Last used API key no longer found in provider keys, falling back to first key', {
      providerId: provider.id,
      lastUsedKey: lastUsedKey.substring(0, 8) + '...' // Only log first 8 chars for security
    })
  }

  const nextIndex = (currentIndex + 1) % keys.length
  const nextKey = keys[nextIndex]
  window.keyv.set(keyName, nextKey)

  return nextKey
}

export async function fetchModels(provider: Provider): Promise<Model[]> {
  // Apply API key rotation
  // NOTE: Shallow copy is intentional. Provider objects are not mutated by downstream code.
  // Nested properties (if any) are never modified after creation.
  const providerWithRotatedKey = {
    ...provider,
    apiKey: getRotatedApiKey(provider)
  }

  const AI = new AiProvider(providerWithRotatedKey)

  try {
    return await AI.models()
  } catch (error) {
    logger.error('Failed to fetch models from provider', {
      providerId: provider.id,
      providerName: provider.name,
      error: error as Error
    })
    return []
  }
}

export function checkApiProvider(provider: Provider): void {
  const isExcludedProvider =
    (isSystemProvider(provider) && NOT_SUPPORT_API_KEY_PROVIDERS.includes(provider.id)) ||
    NOT_SUPPORT_API_KEY_PROVIDER_TYPES.includes(provider.type)

  if (!isExcludedProvider) {
    if (!provider.apiKey) {
      window.toast.error(i18n.t('message.error.enter.api.label'))
      throw new Error(i18n.t('message.error.enter.api.label'))
    }
  }

  if (!provider.apiHost && provider.type !== 'vertexai') {
    window.toast.error(i18n.t('message.error.enter.api.host'))
    throw new Error(i18n.t('message.error.enter.api.host'))
  }

  if (isEmpty(provider.models)) {
    window.toast.error(i18n.t('message.error.enter.model'))
    throw new Error(i18n.t('message.error.enter.model'))
  }
}

/**
 * Validates that a provider/model pair is working by sending a minimal request.
 * @param provider - The provider configuration to test.
 * @param model - The model to use for the validation request (chat or embeddings).
 * @param timeout - Maximum time (ms) to wait for the request to complete. Defaults to 15000 ms.
 * @throws {Error} If the request fails or times out, indicating the API is not usable.
 */
export async function checkApi(provider: Provider, model: Model, timeout = 15000): Promise<void> {
  checkApiProvider(provider)

  const ai = new AiProvider(model, provider)

  const assistant = getDefaultAssistant()
  assistant.model = model
  assistant.prompt = 'test' // 閬垮厤閮ㄥ垎 provider 绌虹郴缁熸彁绀鸿瘝浼氭姤閿?
  if (isEmbeddingModel(model)) {
    logger.info('checkApi: embedding model detected, calling getEmbeddingDimensions', { modelId: model.id })
    const timerPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
    await Promise.race([ai.getEmbeddingDimensions(model), timerPromise])
  } else {
    const abortId = uuid()
    const signal = readyToAbort(abortId)
    let streamError: ResponseError | undefined
    const params: StreamTextParams = {
      system: assistant.prompt,
      prompt: 'hi',
      abortSignal: signal
    }
    const config: AiProviderConfig = {
      streamOutput: true,
      enableReasoning: false,
      isSupportedToolUse: false,
      enableWebSearch: false,
      enableGenerateImage: false,
      isPromptToolUse: false,
      enableUrlContext: false,
      assistant,
      callType: 'check',
      onChunk: (chunk: Chunk) => {
        if (chunk.type === ChunkType.ERROR) {
          streamError = chunk.error
        } else {
          abortCompletion(abortId)
        }
      }
    }

    try {
      await ai.completions(model.id, params, config)
    } catch (e) {
      if (!isAbortError(e) && !isAbortError(streamError)) {
        throw streamError ?? e
      }
    }
  }
}

export async function checkModel(provider: Provider, model: Model, timeout = 15000): Promise<{ latency: number }> {
  const startTime = performance.now()
  await checkApi(provider, model, timeout)
  return { latency: performance.now() - startTime }
}
