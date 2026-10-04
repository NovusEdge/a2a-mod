import { DefaultNotFound } from 'fumadocs-ui/layouts/home/not-found'
import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { baseOptions } from '../lib/layout.shared'

export default function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <DefaultNotFound />
    </HomeLayout>
  )
}
