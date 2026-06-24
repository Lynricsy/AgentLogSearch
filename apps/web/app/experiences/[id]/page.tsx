import { ExperienceDetailWorkspace } from "../../../components/experience-detail-workspace"

type ExperiencePageProps = {
  readonly params: Promise<{
    readonly id: string
  }>
}

export default async function ExperiencePage({ params }: ExperiencePageProps) {
  const { id } = await params

  return <ExperienceDetailWorkspace experienceId={id} />
}
