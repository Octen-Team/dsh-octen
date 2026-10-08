/** Locale bundles for the Octen settings section on the bundle's Plugins page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the section renders. */
export type OctenSettingsLocaleKey =
  | 'apiKey' | 'apiKeyHint' | 'apiKeySet' | 'apiKeyUnset'
  | 'baseUrl' | 'baseUrlHint'
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed' | 'invalidValue'

/** English copy. */
export const en: Record<OctenSettingsLocaleKey, string> = {
  apiKey: 'Octen API key',
  apiKeyHint: 'Stored outside the settings file. Leave blank to keep the current key. Get one at octen.ai.',
  apiKeySet: 'A key is configured.',
  apiKeyUnset: 'No key is configured; web search and fetch through Octen will fail until one is saved.',
  baseUrl: 'Endpoint',
  baseUrlHint: 'Leave blank to use https://api.octen.ai.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'The Octen plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidValue: 'Enter a valid value, or leave blank to use the default.',
}

/** Simplified Chinese copy. */
export const zh: Record<OctenSettingsLocaleKey, string> = {
  apiKey: 'Octen API Key',
  apiKeyHint: '不写入设置文件。留空表示保持当前密钥。可在 octen.ai 获取。',
  apiKeySet: '已配置密钥。',
  apiKeyUnset: '未配置密钥；保存密钥前，通过 Octen 的网页搜索和抓取都会失败。',
  baseUrl: '接口地址',
  baseUrlHint: '留空则使用 https://api.octen.ai。',
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  unavailable: 'Octen 插件当前未加载，暂时无法配置。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
  invalidValue: '请填写有效值；留空表示使用默认值。',
}

/**
 * The form frame's copy, read from this section's dictionary.
 * @param t - the section's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: OctenSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
