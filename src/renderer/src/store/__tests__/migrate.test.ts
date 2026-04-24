import { describe, expect, it } from 'vitest'

import { resetStateButKeepChatHistory } from '../migrate'

describe('resetStateButKeepChatHistory', () => {
  it('resets settings-like state while preserving assistant topic history shells', () => {
    const migrated = resetStateButKeepChatHistory({
      assistants: {
        defaultAssistant: {
          id: 'default',
          name: 'Old Default',
          prompt: 'old prompt',
          topics: [
            {
              id: 'topic-default',
              assistantId: 'default',
              name: 'Default Topic',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
              messages: [{ id: 'message-1' }]
            }
          ],
          type: 'assistant',
          settings: {
            contextCount: 99,
            temperature: 0.9,
            topP: 0.8,
            streamOutput: false,
            reasoning_effort: 'high'
          }
        },
        assistants: [
          {
            id: 'legacy-assistant',
            name: 'Legacy Assistant',
            prompt: 'legacy prompt',
            model: {
              id: 'legacy-model',
              provider: 'legacy-provider',
              name: 'Legacy Model',
              group: 'legacy'
            },
            topics: [
              {
                id: 'topic-1',
                assistantId: 'legacy-assistant',
                name: 'Keep Me',
                createdAt: '2026-01-03T00:00:00.000Z',
                updatedAt: '2026-01-04T00:00:00.000Z',
                messages: [{ id: 'message-2' }],
                pinned: true
              }
            ],
            type: 'assistant',
            settings: {
              contextCount: 99,
              temperature: 0.9,
              topP: 0.8,
              streamOutput: false,
              reasoning_effort: 'high'
            },
            regularPhrases: [{ id: 'phrase-1', content: 'old' }]
          }
        ],
        tagsOrder: ['legacy'],
        collapsedTags: { legacy: true },
        presets: [{ id: 'preset-1' }],
        unifiedListOrder: [{ type: 'assistant', id: 'legacy-assistant' }]
      },
      settings: {
        userName: 'legacy',
        language: 'en-US',
        showAssistants: false
      },
      llm: {
        providers: [undefined],
        defaultModel: {
          id: 'legacy-model',
          provider: 'legacy-provider',
          name: 'Legacy Model',
          group: 'legacy'
        }
      },
      memory: {
        currentUserId: 'legacy-user',
        globalMemoryEnabled: true,
        memoryConfig: {
          embeddingModel: {
            id: 'legacy-embedding',
            provider: 'legacy-provider'
          }
        }
      }
    } as any)

    expect(migrated.settings.showAssistants).toBe(true)
    expect(migrated.settings.userName).not.toBe('legacy')
    expect(migrated.llm.providers.length).toBeGreaterThan(0)
    expect(migrated.memory.currentUserId).toBe('default-user')
    expect(migrated.memory.globalMemoryEnabled).toBe(false)
    expect(migrated.assistants.tagsOrder).toEqual([])
    expect(migrated.assistants.presets).toEqual([])
    expect(migrated.assistants.assistants).toHaveLength(2)
    const preservedLegacyAssistant = migrated.assistants.assistants.find(
      (assistant) => assistant.id === 'legacy-assistant'
    )
    expect(preservedLegacyAssistant).toBeDefined()
    expect(preservedLegacyAssistant?.prompt).toBe('')
    expect(preservedLegacyAssistant?.model).toBeUndefined()
    expect(preservedLegacyAssistant?.topics[0]).toMatchObject({
      id: 'topic-1',
      assistantId: 'legacy-assistant',
      name: 'Keep Me',
      pinned: true
    })
    expect(preservedLegacyAssistant?.topics[0].messages).toEqual([])
  })

  it('prefers the persisted default assistant entry when duplicate default ids exist', () => {
    const migrated = resetStateButKeepChatHistory({
      assistants: {
        defaultAssistant: {
          id: 'default',
          name: 'Default Assistant',
          topics: [
            {
              id: 'temp-topic',
              assistantId: 'default',
              name: 'Temp Topic',
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-01T00:00:00.000Z',
              messages: []
            }
          ],
          type: 'assistant'
        },
        assistants: [
          {
            id: 'default',
            name: 'Default Assistant',
            topics: [
              {
                id: 'history-topic',
                assistantId: 'default',
                name: 'Keep History',
                createdAt: '2026-04-02T00:00:00.000Z',
                updatedAt: '2026-04-03T00:00:00.000Z',
                messages: [{ id: 'message-1' }],
                pinned: true
              }
            ],
            type: 'assistant'
          }
        ]
      }
    } as any)

    expect(migrated.assistants.assistants).toHaveLength(1)
    expect(migrated.assistants.assistants[0].id).toBe('default')
    expect(migrated.assistants.assistants[0].topics).toHaveLength(1)
    expect(migrated.assistants.assistants[0].topics[0]).toMatchObject({
      id: 'history-topic',
      assistantId: 'default',
      name: 'Keep History',
      pinned: true
    })
    expect(migrated.assistants.assistants[0].topics[0].messages).toEqual([])
  })
})
