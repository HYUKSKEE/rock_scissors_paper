export type Choice = 'rock' | 'scissors' | 'paper'
export type RoundResult = 'win' | 'lose' | 'draw'

export const CHOICES: Choice[] = ['scissors', 'rock', 'paper']

export const CHOICE_LABEL: Record<Choice, string> = { rock: '바위', scissors: '가위', paper: '보' }
export const CHOICE_EMOJI: Record<Choice, string> = { rock: '✊', scissors: '✌️', paper: '🖐️' }
export const RESULT_LABEL: Record<RoundResult, string> = { win: '이겼다!', lose: '졌다...', draw: '비겼다! 다시!' }
