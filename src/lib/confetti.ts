import confetti from 'canvas-confetti'

const COLORS = ['#5ec8ff', '#cdeeff', '#3f6bff', '#ffffff', '#ffd76a', '#ff8fb8']

/** 컨페티 연출. 동작 줄이기 설정이면 생략한다. */
export function fireConfetti(big = true) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const base = { colors: COLORS, disableForReducedMotion: true, zIndex: 100 }
  confetti({ ...base, particleCount: big ? 120 : 50, spread: 80, origin: { y: 0.6 } })
  if (!big) return
  const end = Date.now() + 1800
  const frame = () => {
    confetti({ ...base, particleCount: 4, angle: 60, spread: 55, origin: { x: 0, y: 0.7 } })
    confetti({ ...base, particleCount: 4, angle: 120, spread: 55, origin: { x: 1, y: 0.7 } })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  frame()
}
