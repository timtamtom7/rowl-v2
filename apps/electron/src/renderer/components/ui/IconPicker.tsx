/**
 * IconPicker
 *
 * Direct icon editor for sources and skills — no LLM, no chat. Click an
 * avatar, get a small popover with three options:
 *   - Emoji: type or paste any emoji / single grapheme
 *   - URL:   paste an image URL
 *   - File:  upload a local image (resized + persisted into the entity folder)
 *
 * On commit, calls `setSourceIcon` / `setSkillIcon` on the ElectronAPI which
 * writes the new value to config.json (sources) or SKILL.md frontmatter
 * (skills).
 */

import * as React from 'react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Link as LinkIcon, Smile, Loader2 } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from './popover'
import { Input } from './input'
import { Button } from './button'
import { useAppShellContext } from '@/context/AppShellContext'

export type IconPickerKind = 'source' | 'skill'

export interface IconPickerProps {
  kind: IconPickerKind
  /** Source slug or skill slug */
  slug: string
  /** Element that opens the popover when clicked (the avatar itself) */
  trigger: React.ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Optional callback fired after a successful save with the new icon value */
  onChange?: (icon: string) => void
}

type Tab = 'emoji' | 'url' | 'file'

export function IconPicker({
  kind,
  slug,
  trigger,
  align = 'start',
  side = 'bottom',
  onChange,
}: IconPickerProps) {
  const { t } = useTranslation()
  const { activeWorkspaceId } = useAppShellContext()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('emoji')
  const [emoji, setEmoji] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const callSetIcon = useCallback(
    async (payload: {
      type: 'emoji' | 'url' | 'file'
      value?: string
      fileBase64?: string
      fileExt?: string
    }) => {
      if (!activeWorkspaceId) {
        setError(t('iconPicker.errorNoWorkspace', 'No active workspace'))
        return
      }
      setBusy(true)
      setError(null)
      try {
        const api = window.electronAPI
        const result =
          kind === 'source'
            ? await api.setSourceIcon(activeWorkspaceId, slug, payload)
            : await api.setSkillIcon(activeWorkspaceId, slug, payload)
        onChange?.(result.icon)
        setOpen(false)
        setEmoji('')
        setUrl('')
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [activeWorkspaceId, kind, slug, onChange, t]
  )

  const handleEmojiSubmit = () => {
    const trimmed = emoji.trim()
    if (!trimmed) return
    void callSetIcon({ type: 'emoji', value: trimmed })
  }

  const handleUrlSubmit = () => {
    const trimmed = url.trim()
    if (!trimmed) return
    void callSetIcon({ type: 'url', value: trimmed })
  }

  const handleFileSelect = useCallback(
    async (file: File) => {
      const ALLOWED = new Set(['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'])
      const dot = file.name.lastIndexOf('.')
      const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : ''
      if (!ALLOWED.has(ext)) {
        setError(t('iconPicker.errorBadExt', 'Use PNG, JPG, SVG, WEBP, or GIF'))
        return
      }
      const buf = await file.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)
      void callSetIcon({ type: 'file', fileBase64: base64, fileExt: `.${ext}` })
    },
    [callSetIcon, t]
  )

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFileSelect(file)
    e.target.value = ''
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={8}
        className="w-[280px] p-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tab strip */}
        <div className="flex border-b border-border">
          {(
            [
              { key: 'emoji' as const, icon: Smile, label: t('iconPicker.tabEmoji', 'Emoji') },
              { key: 'url' as const, icon: LinkIcon, label: t('iconPicker.tabUrl', 'URL') },
              { key: 'file' as const, icon: Upload, label: t('iconPicker.tabFile', 'Upload') },
            ] as const
          ).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors ${
                tab === key
                  ? 'bg-accent/10 text-foreground border-b-2 border-accent'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-3 space-y-2">
          {tab === 'emoji' && (
            <>
              <Input
                autoFocus
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder={t('iconPicker.emojiPlaceholder', '🦝')}
                className="text-center text-2xl h-12"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleEmojiSubmit()
                  if (e.key === 'Escape') setOpen(false)
                }}
                disabled={busy}
              />
              <p className="text-[11px] text-muted-foreground">
                {t('iconPicker.emojiHint', 'Type or paste any emoji')}
              </p>
              <Button
                size="sm"
                className="w-full"
                onClick={handleEmojiSubmit}
                disabled={busy || !emoji.trim()}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('iconPicker.save', 'Save')}
              </Button>
            </>
          )}

          {tab === 'url' && (
            <>
              <Input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/icon.png"
                className="h-9 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUrlSubmit()
                  if (e.key === 'Escape') setOpen(false)
                }}
                disabled={busy}
              />
              <p className="text-[11px] text-muted-foreground">
                {t('iconPicker.urlHint', 'Paste an image URL')}
              </p>
              <Button
                size="sm"
                className="w-full"
                onClick={handleUrlSubmit}
                disabled={busy || !url.trim()}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('iconPicker.save', 'Save')}
              </Button>
            </>
          )}

          {tab === 'file' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                onChange={onFileInputChange}
                className="hidden"
                disabled={busy}
              />
              <Button
                size="sm"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-2" />
                )}
                {t('iconPicker.chooseFile', 'Choose file…')}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                {t('iconPicker.fileHint', 'PNG · JPG · SVG · WEBP · GIF')}
              </p>
            </>
          )}

          {error && (
            <p className="text-xs text-destructive break-words">{error}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
