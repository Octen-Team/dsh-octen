/**
 * Browser half of `@octen.ai/dsh-octen`: the Octen settings section on the
 * bundle's own Plugins page. It registers into the keyed
 * `plugins.bundle.config` slot under the package name while the Host serves
 * the `dsh-octen` namespace, so a profile without the host plugin shows nothing.
 */

// Type-only imports pull in the Context and SlotMap merges; the browser bundle
// reaches other plugins through services, never value imports.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { OctenCard } from './OctenCard.tsx'
import { OCTEN_NS, OctenCardController } from './card-controller.ts'
import { en, zh, type OctenSettingsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Octen settings section copy. */
    'dsh-octen': OctenSettingsLocaleKey
  }
}

/** The npm package name: the client module id and the bundle page's slot key. */
export const PACKAGE_NAME = '@octen.ai/dsh-octen'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'remote', 'remote.credentials', 'configForms']

/**
 * Mount the Octen settings section while the Host serves its namespace.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(OCTEN_NS, { zh, en }), 'dsh-octen: dictionaries')
  const card = new OctenCardController(ctx.configForms.get(OCTEN_NS), ctx)
  ctx.effect(() => () => { card.dispose() }, 'dsh-octen: form subscription')
  ctx.effect(
    () => ctx.remote.$on('credentials/reference-updated', (ref: string) => { card.refreshCredential(ref) }),
    'dsh-octen: credential invalidations',
  )
  ctx.effect(() => ctx.configForms.whileServed([OCTEN_NS], () => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config', key: PACKAGE_NAME, locale: OCTEN_NS, inject: () => card.inject(),
  }, OctenCard))), 'dsh-octen: settings section')
}
