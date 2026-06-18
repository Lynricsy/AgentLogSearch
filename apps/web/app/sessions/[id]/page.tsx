import { SessionDetailWorkspace } from "../../../components/session-detail-workspace"

type SessionPageProps = {
  readonly params: Promise<{
    readonly id: string
  }>
}

export default async function SessionPage({ params }: SessionPageProps) {
  const { id } = await params

  return <SessionDetailWorkspace sessionId={id} />
}
