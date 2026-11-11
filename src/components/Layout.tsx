import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function Layout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-dvh pb-16">
      <header className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
        <Link to="/" className="flex items-center gap-2 text-lg text-sky no-underline">
          <span className="grid size-9 place-items-center rounded-full bg-gradient-to-b from-ice to-sky text-base shadow-[0_3px_0_#1f7fd0]">✌️</span>
          <span>가위바위보 경품</span>
        </Link>
      </header>
      <main className={`mx-auto px-4 ${wide ? 'max-w-2xl' : 'max-w-md'}`}>{children}</main>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card-jelly p-5 ${className}`}>{children}</section>
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 text-center">
      <h1 className="m-0 break-words text-3xl leading-tight text-white drop-shadow-[0_3px_0_rgba(31,127,208,.8)]">{children}</h1>
      {sub && <p className="mt-2 mb-0 text-ice/70">{sub}</p>}
    </div>
  )
}
