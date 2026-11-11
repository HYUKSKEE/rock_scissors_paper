import { useState } from 'react'
import { Button } from './Button'

export function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // 클립보드 API 불가 시 구형 방식
      const ta = document.createElement('textarea')
      ta.value = value
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div className="grid gap-2">
      <label className="text-ice">{label}</label>
      <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="input-jelly text-sm" />
      <Button size="sm" variant={copied ? 'royal' : 'sky'} onClick={copy} block>
        {copied ? '복사됐어요! ✓' : '링크 복사'}
      </Button>
      {hint && <p className="m-0 text-sm text-ice/60">{hint}</p>}
    </div>
  )
}
