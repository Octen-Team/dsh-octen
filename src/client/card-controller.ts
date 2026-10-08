/**
 * The Octen settings section's staged form over the `dsh-octen` settings
 * namespace.
 *
 * The key never lives in the section: its literal must not ride a response, so
 * the page learns only whether one is configured and writes it through the
 * credentials domain, under the reference the section's `apiKeyEnv` names. It
 * is staged with the endpoint, so one save covers everything the section shows.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel, settingsTextField,
  type SettingsFieldState, type SettingsFormActions, type SettingsFormShell, type SettingsFormScope, type SettingsFormScopeSnapshot,
} from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * Settings namespace of the host plugin (its row id). Spelled here rather than
 * imported: the browser bundle must not import the host half.
 */
export const OCTEN_NS = 'dsh-octen'

/** Credential reference the host plugin resolves when the section names none. */
const DEFAULT_API_KEY_REF = 'OCTEN_API_KEY'

/** Form field the credential control stages under. */
const API_KEY_FIELD = 'apiKey'

/** The section fields this page edits. */
export interface OctenSettings {
  /** Credential reference naming the key. */
  apiKeyEnv?: string
  /** API base; blank inherits the default. */
  baseURL?: string
}

/** What the credentials domain last reported, and for which reference. */
interface CredentialState {
  /** Reference this answer describes; a stale answer for another one is dropped. */
  ref: string
  /** Whether any layer supplies a value for it. */
  configured: boolean
  /** Whether `credentials/set` can affect it; false disables the control. */
  writable: boolean
}

/** What the Octen section renders. */
export interface OctenCardState extends SettingsFormShell {
  /** API base. */
  baseURL: SettingsFieldState
  /** The staged credential, which starts blank on every load. */
  apiKey: SettingsFieldState
  /** Whether the Host reports a credential configured for the referenced key. */
  apiKeyConfigured: boolean
  /** Whether the credentials domain accepts a write for it. */
  apiKeyWritable: boolean
}

/** The face the section's slot entry injects. */
export interface OctenCardFace extends SettingsFormActions {
  hooks: {
    /** Section snapshot, bound by the renderer as `useOctenCard`. */
    octenCard: SnapshotStore<OctenCardState>
  }
}

/** Bridges the `dsh-octen` scope and the credentials domain onto the section. */
export class OctenCardController {
  private readonly form: SettingsFormModel<OctenSettings>
  private readonly store: SnapshotStore<OctenCardState>
  private readonly unsubscribe: () => void
  private credential: CredentialState = { ref: '', configured: false, writable: true }

  /**
   * @param scope - the bound settings scope for the `dsh-octen` namespace.
   * @param ctx - the page plugin's context, whose `remote.credentials` answers for the key.
   */
  constructor(
    private readonly scope: SettingsFormScope<OctenSettings>,
    private readonly ctx: ClientContext,
  ) {
    this.form = new SettingsFormModel(
      scope,
      [settingsTextField('baseURL')],
      [{ field: API_KEY_FIELD, write: text => this.writeKey(text) }],
    )
    this.store = this.form.bind(() => this.projection())
    this.unsubscribe = scope.subscribe(() => { void this.readCredential() })
    void this.readCredential()
  }

  private projection(): OctenCardState {
    return {
      ...this.form.shell(),
      baseURL: this.form.field('baseURL'),
      apiKey: this.form.field(API_KEY_FIELD),
      apiKeyConfigured: this.credential.configured,
      apiKeyWritable: this.credential.writable,
    }
  }

  /** Ask the credentials domain about the reference the section currently names; drop answers for a stale reference. */
  private async readCredential(): Promise<void> {
    const ref = refOf(this.scope.getSnapshot())
    if (ref !== this.credential.ref) {
      this.credential = { ref, configured: false, writable: true }
      this.store.set(this.projection())
    }
    const response = await this.ctx.remote.credentials.describe([ref])
    if (!response.ok || ref !== refOf(this.scope.getSnapshot())) return
    const view = response.value[ref]
    const next: CredentialState = {
      ref,
      configured: view?.configured ?? false,
      // Unknown means writable: the Host refuses, rather than the page guessing a refusal.
      writable: view?.writable ?? true,
    }
    if (next.configured === this.credential.configured && next.writable === this.credential.writable) return
    this.credential = next
    this.store.set(this.projection())
  }

  /**
   * Re-read after the Host reports a change to the watched reference; a key
   * written elsewhere does not change the settings section.
   * @param ref - the reference the Host reports as changed.
   */
  refreshCredential(ref: string): void {
    if (ref !== this.credential.ref) return
    void this.readCredential()
  }

  /**
   * Build the face the section's slot registration injects.
   * @returns the section's snapshot and its form actions.
   */
  inject(): OctenCardFace {
    return { hooks: { octenCard: this.store }, ...this.form.actions() }
  }

  /** Write the staged key, then report whether the Host now holds one. */
  private async writeKey(value: string): Promise<boolean> {
    await this.ctx.remote.credentials.set(refOf(this.scope.getSnapshot()), value)
    await this.readCredential()
    return this.credential.configured
  }

  /** Release configuration subscriptions. */
  dispose(): void { this.unsubscribe(); this.form.dispose() }
}

/** The credential reference the section names, or the host plugin's default. */
function refOf(snapshot: SettingsFormScopeSnapshot<OctenSettings>): string {
  const declared = snapshot.value?.apiKeyEnv
  return declared !== undefined && declared.length > 0 ? declared : DEFAULT_API_KEY_REF
}
