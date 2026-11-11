import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Layout, Card } from '../components/Layout'
import { LinkButton } from '../components/Button'
import { HandStage } from '../components/Hand3D'
import { listAdminGames } from '../lib/adminStore'

const STEPS = [
  ['1', '게임 만들기', '제목, 당첨 인원, 판수를 정하고 기프티콘 이미지를 올려요.'],
  ['2', '링크 공유', '카톡으로 링크를 보내면 친구들이 컴퓨터와 가위바위보!'],
  ['3', '게임 종료', '승률 높은 순서로 상위 N명이 기프티콘을 받아요.'],
]

export default function Home() {
  const mine = useMemo(() => listAdminGames().slice(0, 5), [])
  return (
    <Layout>
      <HandStage
        height={230}
        items={[
          { choice: 'scissors', tone: 'player', x: -2.3, scale: 0.72 },
          { choice: 'rock', tone: 'royal', x: 0, scale: 0.78 },
          { choice: 'paper', tone: 'cpu', x: 2.3, scale: 0.72 },
        ]}
      />
      <div className="mt-2 mb-6 text-center">
        <h1 className="m-0 text-4xl leading-tight text-white drop-shadow-[0_4px_0_rgba(31,127,208,.9)]">
          가위바위보
          <br />
          <span className="text-sky">경품 게임</span>
        </h1>
        <p className="mt-3 mb-0 text-lg text-ice/75">링크 하나로 시작해요.<br />승률이 높을수록 기프티콘에 가까워져요!</p>
      </div>
      <LinkButton to="/create" block>🎁 게임 만들기</LinkButton>

      <Card className="mt-10">
        <h2 className="m-0 mb-4 text-center text-xl text-white">이렇게 진행돼요</h2>
        <ol className="m-0 grid list-none gap-4 p-0">
          {STEPS.map(([n, t, d]) => (
            <li key={n} className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-b from-ice to-sky text-ink shadow-[0_3px_0_#1f7fd0]">{n}</span>
              <div>
                <p className="m-0 text-white">{t}</p>
                <p className="m-0 text-sm text-ice/70">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {mine.length > 0 && (
        <Card className="mt-8">
          <h2 className="m-0 mb-3 text-lg text-white">내가 만든 게임</h2>
          <ul className="m-0 grid list-none gap-2 p-0">
            {mine.map((g) => (
              <li key={g.id}>
                <Link to={`/g/${g.id}/admin`} className="block truncate rounded-2xl bg-navy/70 px-4 py-3 text-ice no-underline">
                  {g.title || '이름 없는 게임'} <span className="text-sm text-sky">관리하기 →</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Layout>
  )
}
