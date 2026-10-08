/**
 * The Octen section on the bundle's Plugins page: the API key, written through
 * the credentials domain, and the endpoint.
 */

import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { SettingsForm, SettingsSecretField, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { formLabels } from './locales.ts'
import type { OctenCardFace } from './card-controller.ts'

/** Props the renderer binds for the Octen section. */
export type OctenCardProps =
  PropsRuntime<'plugins.bundle.config'>
  & PropsLocale<'dsh-octen'>
  & InjectFace<OctenCardFace>

/**
 * Render the Octen settings form.
 * @param props - the view asked for, locale copy, the form snapshot, and its actions.
 * @returns the form, or nothing for a summary view.
 */
export function OctenCard(props: OctenCardProps) {
  const { t } = props
  const state = props.useOctenCard(snapshot => snapshot)
  if (props.view === 'summary') return null
  return (
    <SettingsForm labels={formLabels(t)} state={state} onSave={props.save} onDiscard={props.discard}>
      <SettingsSecretField
        id="plugin-config-dsh-octen-key"
        label={t('apiKey')}
        hint={t('apiKeyHint')}
        // The credentials store has its own writability, separate from the settings document.
        disabled={!state.apiKeyWritable}
        text={state.apiKey.text}
        configured={state.apiKeyConfigured}
        stateLabel={state.apiKeyConfigured ? t('apiKeySet') : t('apiKeyUnset')}
        onEdit={(text) => { props.edit('apiKey', text) }}
      />
      <SettingsValueField
        id="plugin-config-dsh-octen-endpoint"
        label={t('baseUrl')}
        hint={t('baseUrlHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidValue')}
        disabled={!state.writable}
        {...state.baseURL}
        onEdit={(text) => { props.edit('baseURL', text) }}
        onReset={() => { props.resetField('baseURL') }}
      />
    </SettingsForm>
  )
}
